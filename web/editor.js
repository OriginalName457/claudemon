/* Claudeboy editor — activate with ?edit=1.
   Resize the Claudeboy with the sliders (this alone won't disturb the layout).
   Optional "Move buttons" toggle lets you drag the d-pad / A-B / action cluster.
   Save writes to /api/layout; the shell applies it. */
(function () {
  if (new URLSearchParams(location.search).get('edit') !== '1') return;

  function start() {
    const cb = window.CLAUDEBOY;
    if (!cb || !cb.device) { setTimeout(start, 120); return; }
    const device = cb.device;
    let scale = parseFloat(device.style.zoom || getComputedStyle(device).zoom) || 1.3;
    let dh = Math.round((cb.device.getBoundingClientRect().height || 620) / scale);   // orange case height
    let sy = parseFloat(cb.screen.style.marginTop) || 0;                              // screen vertical offset
    let repos = false;

    const p = document.createElement('div'); p.id = 'cb-editor';
    p.innerHTML =
      '<div class="t">✎ CLAUDEBOY EDITOR</div>' +
      '<label>Case&nbsp;↕ <input id="cbH" type="range" min="360" max="820" value="' + dh + '"><b id="cbHv">' + dh + '</b></label>' +
      '<label>Screen&nbsp;↕ <input id="cbY" type="range" min="0" max="440" value="' + sy + '"><b id="cbYv">' + sy + '</b></label>' +
      '<label>Scale <input id="cbS" type="range" min="80" max="220" value="' + Math.round(scale * 100) + '"><b id="cbSv">' + scale.toFixed(2) + '</b></label>' +
      '<button id="cbMove">✎ Move buttons</button>' +
      '<div class="row"><button id="cbSave">✓ Save</button><button id="cbReset">↺ Reset</button></div>' +
      '<div id="cbMsg"></div>';
    document.body.appendChild(p);
    const style = document.createElement('style');
    style.textContent = '#cb-editor{position:fixed;top:12px;right:12px;z-index:9999;background:#fff;color:#3a2617;border:3px solid #c25e2a;box-shadow:4px 4px 0 #a34a18;padding:12px 14px;font-family:"Silk",monospace;font-size:12px;width:216px}#cb-editor .t{font-family:"PressStart",monospace;font-size:9px;color:#f5793b;margin-bottom:10px;line-height:1.4}#cb-editor label{display:flex;align-items:center;gap:6px;margin:7px 0;font-size:11px}#cb-editor input[type=range]{flex:1;accent-color:#f5793b}#cb-editor b{min-width:34px;text-align:right}#cb-editor .row{display:flex;gap:8px;margin-top:6px}#cb-editor button{font-family:"Silk",monospace;font-weight:700;font-size:11px;cursor:pointer;color:#fff;background:#f5793b;border:3px solid #c25e2a;box-shadow:2px 2px 0 #a34a18;padding:7px}#cb-editor .row button{flex:1}#cb-editor #cbMove{width:100%;margin:6px 0 2px;background:#fff;color:#c25e2a}#cb-editor #cbMove.on{background:#2a9d5a;color:#fff}#cb-editor #cbReset{background:#fff;color:#c25e2a}#cb-editor button:active{transform:translate(2px,2px);box-shadow:0 0 0}#cb-editor #cbMsg{color:#2a9d5a;font-size:10px;margin-top:7px;min-height:12px}';
    document.head.appendChild(style);

    const $ = (id) => document.getElementById(id);
    $('cbH').addEventListener('input', (e) => { dh = +e.target.value; device.style.height = dh + 'px'; $('cbHv').textContent = dh; });
    $('cbY').addEventListener('input', (e) => { sy = +e.target.value; cb.screen.style.marginTop = sy + 'px'; $('cbYv').textContent = sy; });
    $('cbS').addEventListener('input', (e) => { scale = e.target.value / 100; device.style.zoom = scale; $('cbSv').textContent = scale.toFixed(2); });

    // opt-in: lift the clusters to absolute and let them be dragged
    function enableMove() {
      document.body.classList.add('cb-editing');
      const drect = device.getBoundingClientRect();
      for (const elm of [cb.dpad, cb.ab, cb.actions]) {
        if (!elm) continue;
        const r = elm.getBoundingClientRect();
        const x = (r.left - drect.left) / scale, y = (r.top - drect.top) / scale;
        device.appendChild(elm);
        Object.assign(elm.style, { position: 'absolute', left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto', height: 'auto', margin: '0', outline: '2px dashed #f5793b', outlineOffset: '2px', cursor: 'move', zIndex: '60' });
        elm.querySelectorAll('*').forEach(c => c.style.pointerEvents = 'none');
        elm.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          const sx = e.clientX, sy = e.clientY, sl = parseFloat(elm.style.left) || 0, st = parseFloat(elm.style.top) || 0;
          const mv = (ev) => { elm.style.left = (sl + (ev.clientX - sx) / scale) + 'px'; elm.style.top = (st + (ev.clientY - sy) / scale) + 'px'; };
          const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
          document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
        });
      }
    }
    $('cbMove').addEventListener('click', () => {
      if (repos) { location.reload(); return; }   // toggle off = reload to restore
      repos = true; $('cbMove').classList.add('on'); $('cbMove').textContent = '✓ moving — drag them';
      enableMove();
    });

    let TOKEN = null;
    async function tok() { if (!TOKEN) TOKEN = (await (await fetch('/api/lab/token')).json()).token; return TOKEN; }
    $('cbSave').addEventListener('click', async () => {
      const layout = { deviceH: Math.round(dh), screenY: Math.round(sy), scale: +scale.toFixed(3) };
      if (repos) {
        // store as fractions of the device (local px ÷ device local size) so they're window-width-proof
        const dr = device.getBoundingClientRect(), dw = dr.width / scale, dhh = dr.height / scale;
        const pos = (e) => ({ x: +((parseFloat(e.style.left) || 0) / dw).toFixed(4), y: +((parseFloat(e.style.top) || 0) / dhh).toFixed(4) });
        layout.dpad = pos(cb.dpad); layout.ab = pos(cb.ab); layout.actions = pos(cb.actions);
      }
      try { await fetch('/api/layout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lab-Token': await tok() }, body: JSON.stringify(layout) }); $('cbMsg').textContent = '✓ saved — reload without ?edit'; }
      catch { $('cbMsg').textContent = 'save error'; }
    });
    $('cbReset').addEventListener('click', async () => {
      try { await fetch('/api/layout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lab-Token': await tok() }, body: '{}' }); location.reload(); } catch {}
    });
  }
  start();
})();
