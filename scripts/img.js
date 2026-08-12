'use strict';
// Tiny zero-dependency PNG decode / encode / resize for 8-bit RGBA PNGs.
// Reused by the PixelLab pipeline (make 64px references, build sprite sheets).

const zlib = require('zlib');

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }

function decodePNG(buf) {
  const W = buf.readUInt32BE(16), H = buf.readUInt32BE(20);
  if (buf[24] !== 8 || buf[25] !== 6) throw new Error('expected 8-bit RGBA PNG (colortype 6)');
  let o = 8; const idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o); const type = buf.toString('ascii', o + 4, o + 8); if (type === 'IDAT') idat.push(buf.slice(o + 8, o + 8 + len)); if (type === 'IEND') break; o += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = W * bpp, px = Buffer.alloc(H * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (stride + 1)];
    const cur = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const rec = px.slice(y * stride, y * stride + stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? rec[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += paeth(a, b, c);
      rec[i] = v & 0xff;
    }
    prev = rec;
  }
  return { W, H, px };
}

function encodePNG(W, H, px) {
  const stride = W * 4, raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (stride + 1)] = 0; px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Area-average downscale / nearest upscale to WxH.
function resize(src, W, H) {
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx0 = Math.floor(x * src.W / W), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * src.W / W));
      const sy0 = Math.floor(y * src.H / H), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * src.H / H));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
        const i = (sy * src.W + sx) * 4; const al = src.px[i + 3];
        r += src.px[i] * al; g += src.px[i + 1] * al; b += src.px[i + 2] * al; a += al; n++;
      }
      const o = (y * W + x) * 4;
      out[o] = a ? Math.round(r / a) : 0; out[o + 1] = a ? Math.round(g / a) : 0; out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round(a / n);
    }
  }
  return { W, H, px: out };
}

// Build a horizontal sprite strip from equal-size frame buffers ({W,H,px}).
function hstrip(frames) {
  const W = frames[0].W, H = frames[0].H, out = Buffer.alloc(W * frames.length * H * 4);
  const stripW = W * frames.length;
  frames.forEach((f, fi) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const s = (y * W + x) * 4, d = (y * stripW + (fi * W + x)) * 4;
      out[d] = f.px[s]; out[d + 1] = f.px[s + 1]; out[d + 2] = f.px[s + 2]; out[d + 3] = f.px[s + 3];
    }
  });
  return { W: stripW, H, px: out };
}

// Make the background transparent by flood-filling from the image borders,
// keying out any pixel within `tol` (Chebyshev) of the border color. Only
// removes pixels connected to the edge, so it never eats the character's
// interior even if it shares the background color. Mutates + returns {W,H,px}.
function floodKeyEdges(src, tol = 40) {
  const { W, H, px } = src;
  const bg = [px[0], px[1], px[2]];
  const near = (i) => Math.max(Math.abs(px[i] - bg[0]), Math.abs(px[i + 1] - bg[1]), Math.abs(px[i + 2] - bg[2])) <= tol;
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push([x, 0], [x, H - 1]);
  for (let y = 0; y < H; y++) stack.push([0, y], [W - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const p = y * W + x; if (seen[p]) continue; seen[p] = 1;
    const i = p * 4; if (!near(i)) continue;
    px[i + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return src;
}

module.exports = { decodePNG, encodePNG, resize, hstrip, floodKeyEdges };
