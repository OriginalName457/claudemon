'use strict';
// Minimal zero-dependency WebSocket server (RFC 6455) — just enough for the game:
// handshake, masked client text frames (reassembled across TCP chunks), ping/pong, close.
const crypto = require('crypto');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const accept = (key) => crypto.createHash('sha1').update(key + GUID).digest('base64');

class Conn {
  constructor(socket) {
    this.s = socket; this.buf = Buffer.alloc(0); this.alive = true; this._msg = null; this._close = null;
    socket.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); try { this._parse(); } catch (e) { this.close(); } });
    socket.on('close', () => { if (this.alive) { this.alive = false; this._close && this._close(); } });
    socket.on('error', () => { this.alive = false; try { socket.destroy(); } catch {} });
  }
  onMessage(fn) { this._msg = fn; }
  onClose(fn) { this._close = fn; }
  _parse() {
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1], op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) return;                                  // wait for the rest of the frame
      let mask = null; if (masked) { mask = this.buf.slice(off, off + 4); off += 4; }
      let payload = this.buf.slice(off, off + len);
      if (masked) { const o = Buffer.allocUnsafe(len); for (let i = 0; i < len; i++) o[i] = payload[i] ^ mask[i & 3]; payload = o; }
      this.buf = this.buf.slice(need);
      if (op === 0x8) { this.close(); return; }                            // close
      else if (op === 0x9) { this._frame(0xA, payload); }                  // ping -> pong
      else if (op === 0x1 || op === 0x2) { this._msg && this._msg(payload.toString('utf8')); }  // text/binary
    }
  }
  _frame(op, data) {
    if (!this.alive) return; const buf = Buffer.isBuffer(data) ? data : Buffer.from(data), len = buf.length; let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { head = Buffer.allocUnsafe(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.allocUnsafe(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    try { this.s.write(Buffer.concat([head, buf])); } catch { this.alive = false; }
  }
  send(str) { this._frame(0x1, Buffer.from(str, 'utf8')); }
  close() { if (!this.alive) return; this.alive = false; try { this.s.end(); } catch {} this._close && this._close(); }
}

// Attach to a Node http server: call inside server.on('upgrade', ...)
function handleUpgrade(req, socket, onOpen) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { try { socket.destroy(); } catch {} return; }
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept(key) + '\r\n\r\n');
  socket.setNoDelay(true);
  onOpen(new Conn(socket));
}
module.exports = { handleUpgrade };
