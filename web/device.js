/* Wrap the page in the Game Boy device shell. On the tank page the d-pad + A/B
   sit above the stat bars; the action buttons stay on the wood shelf.
   Exposes window.CLAUDEBOY for the layout editor and applies any saved layout. */
(function () {
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  // "bare" mode: drop the desk background so only the Claudeboy shape shows
  // (for a floating desktop-pet window). Needs a transparent-capable window.
  if (new URLSearchParams(location.search).get('bare') === '1') {
    const s = document.createElement('style');
    s.textContent = 'html,body{background:transparent !important;}';
    document.head.appendChild(s);
  }
  // quick "depressed" flash so a button feels clicky even when fired programmatically
  const flash = (elm) => { if (!elm) return; elm.classList.add('cb-press'); setTimeout(() => elm.classList.remove('cb-press'), 130); };
  // the page is hidden (via the inline boot style) until it's wrapped in the shell,
  // so you never see raw un-chassised content flash on navigation.
  const reveal = () => { try { document.body.style.visibility = 'visible'; } catch {} };
  window.addEventListener('load', reveal);
  setTimeout(reveal, 800); // safety net if build() never runs

  function build() {
    if (document.querySelector('body > .device')) { reveal(); return; }
    const body = document.body;
    const device = el('div', 'device');
    const screen = el('div', 'screen');
    for (const n of Array.from(body.childNodes)) {
      if (n.nodeType === 1 && (n.tagName === 'SCRIPT' || n.tagName === 'LINK' || n.tagName === 'STYLE')) continue;
      screen.appendChild(n);
    }
    const cbBrand = el('div', 'cb-brand'); cbBrand.textContent = 'CLAUDEBOY';
    device.appendChild(cbBrand);   // console wordmark on the body, above the screen
    device.appendChild(screen);

    const dpad = el('span', 'dpad');
    const ab = el('span', 'ab');
    ab.innerHTML = '<span class="pbtn2 b" data-nav="prev">B</span><span class="pbtn2 a" data-nav="next">A</span>';
    const brand = el('span', 'brand'); brand.textContent = 'CLAUDEMON';

    // Classic console face: d-pad · CLAUDEMON · A/B in one row below the screen
    const deck = el('div', 'deck');
    deck.appendChild(dpad); deck.appendChild(brand); deck.appendChild(ab);
    device.appendChild(deck);
    body.appendChild(device);

    // A = CONFIRM the screen's action (buy / send / run…); a page consumes it via
    // preventDefault on 'cb-a'. If nothing consumes it, A opens the STATS pop-up.
    // B = MENU pop-up. Both flash on press so they feel clicky.
    const aBtn = device.querySelector('.pbtn2.a'), bBtn = device.querySelector('.pbtn2.b');
    if (aBtn) aBtn.addEventListener('click', () => {
      if (body.classList.contains('cb-editing')) return;
      flash(aBtn);
      const proceed = window.dispatchEvent(new CustomEvent('cb-a', { cancelable: true }));
      if (proceed) { body.classList.remove('menu-open'); body.classList.toggle('stats-open'); }
    });
    if (bBtn) bBtn.addEventListener('click', () => {
      if (body.classList.contains('cb-editing')) return;
      flash(bBtn);
      body.classList.remove('stats-open'); body.classList.toggle('menu-open');
    });
    // d-pad = directional control. Which arm you press becomes a 'cb-nav' event
    // (left/right/up/down); a page can preventDefault() to consume it (e.g. flip a
    // card). If nothing consumes it, it falls through to toggling the menu.
    dpad.addEventListener('click', (e) => {
      if (body.classList.contains('cb-editing')) return;
      flash(dpad);
      const r = dpad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const dir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      const proceed = window.dispatchEvent(new CustomEvent('cb-nav', { detail: dir, cancelable: true }));
      if (proceed) { body.classList.remove('stats-open'); body.classList.toggle('menu-open'); }
    });
    // tap the backdrop (or ✕) to close a pop-up
    const hud = screen.querySelector('#hud'); if (hud) hud.addEventListener('click', (e) => { if (e.target === hud || (e.target.classList && e.target.classList.contains('hud-x'))) body.classList.remove('stats-open'); });
    const navEl = screen.querySelector('#nav'); if (navEl) navEl.addEventListener('click', (e) => { if (e.target === navEl) body.classList.remove('menu-open'); });

    // expose for the editor + apply any saved layout
    window.CLAUDEBOY = { device, screen, deck, dpad, ab, actions: screen.querySelector('#controls'), apply: applyLayout };
    // reveal only AFTER the saved size is applied, so the shell never appears at
    // its default size and then snaps — that snap was the tab-flip glitch.
    fetch('/api/layout', { cache: 'no-store' }).then(r => r.json()).then(applyLayout).catch(() => {}).finally(reveal);
  }

  function place(elm, pos) {
    const device = document.querySelector('.device');
    if (!elm || !device || !pos || typeof pos.x !== 'number') return;
    if (elm.parentElement !== device) device.appendChild(elm);
    elm.style.position = 'absolute';
    // positions are stored as fractions of the device, so they survive any window width
    elm.style.left = (pos.x * 100) + '%'; elm.style.top = (pos.y * 100) + '%';
    elm.style.right = 'auto'; elm.style.bottom = 'auto'; elm.style.height = 'auto'; elm.style.margin = '0';
  }
  function applyLayout(L) {
    if (!L) return;
    const device = document.querySelector('.device'); if (!device) return;
    if (L.width) device.style.width = L.width + 'px';
    if (L.scale) device.style.zoom = L.scale;
    if (L.deviceH) device.style.height = L.deviceH + 'px';   // grow only the orange case
    const cb = window.CLAUDEBOY || {};
    if (L.screenY != null && cb.screen) cb.screen.style.marginTop = L.screenY + 'px';   // slide the screen up/down
    // custom button placement is tank-specific; other pages keep the standard deck
    if (cb.actions) { place(cb.dpad, L.dpad); place(cb.ab, L.ab); place(cb.actions, L.actions); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
