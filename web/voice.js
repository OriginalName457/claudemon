/* Tap-to-talk voice input for Claudemon.
   Prefers the BROWSER's built-in SpeechRecognition (accurate + real-time, streams words
   straight into the box as you speak) and falls back to recording a WAV + on-device
   server transcription if that API isn't available. Lets you PICK which microphone to use.
   Exposes window.CMVoice.attach(micButton, inputBox, note?, deviceSelect?). */
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let TOKEN = null;
  async function tok() { if (!TOKEN) { try { TOKEN = (await (await fetch('/api/lab/token')).json()).token; } catch {} } return TOKEN || ''; }

  // ---- microphone device list ----
  function chosenDevice() { return localStorage.getItem('cm_mic') || ''; }
  async function listDevices(sel, note) {
    if (!sel || !(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices)) return;
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      const saved = chosenDevice();
      sel.innerHTML = '<option value="">Default microphone</option>' +
        devs.map((d, i) => `<option value="${d.deviceId}">${(d.label || ('Microphone ' + (i + 1))).replace(/[<>"]/g, '')}</option>`).join('');
      if (saved && [...sel.options].some((o) => o.value === saved)) sel.value = saved;
      sel.onchange = () => { localStorage.setItem('cm_mic', sel.value); if (note) note('🎙 microphone set — tap 🎤 to talk'); };
    } catch {}
  }

  // ---- WAV encode (fallback path) ----
  function encodeWav(samples, rate) {
    const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    ws(36, 'data'); v.setUint32(40, samples.length * 2, true);
    let o = 44; for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return new Blob([buf], { type: 'audio/wav' });
  }
  async function toWav(blob) {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await ac.decodeAudioData(await blob.arrayBuffer());
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
    const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
    const rendered = await off.startRendering(); try { ac.close(); } catch {}
    return encodeWav(rendered.getChannelData(0), 16000);
  }

  function attach(mic, box, note, sel) {
    note = note || function () {};
    if (!mic || !box) return;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { mic.style.display = 'none'; return; }
    listDevices(sel, note);
    try { navigator.mediaDevices.addEventListener('devicechange', () => listDevices(sel, note)); } catch {}

    const useSR = !!SR;
    let listening = false, primeSt = null;
    const setState = (s) => { mic.classList.toggle('rec', s === 'rec'); mic.classList.toggle('busy', s === 'busy'); };

    // getUserMedia on the CHOSEN device — grants permission, reveals device labels, and
    // (best effort) keeps that mic live so recognition uses it rather than the default.
    async function primeStream() {
      const dev = chosenDevice();
      try {
        const st = await navigator.mediaDevices.getUserMedia({ audio: dev ? { deviceId: { exact: dev } } : true });
        listDevices(sel, note); return st;
      } catch (e) {
        if (dev) { try { return await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {} }   // chosen device gone → default
        note('🎤 microphone is blocked — click Allow (or enable mic for this window), then tap 🎤 again');
        return null;
      }
    }

    // ---- primary: browser SpeechRecognition ----
    let rec = null;
    async function startSR() {
      primeSt = await primeStream(); if (!primeSt) return;
      try { rec = new SR(); } catch { return startWav(); }
      rec.lang = navigator.language || 'en-US'; rec.interimResults = true; rec.continuous = true;
      const base = box.value ? box.value.replace(/\s+$/, '') + ' ' : '';
      let finalText = '';
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finalText += r[0].transcript + ' '; else interim += r[0].transcript; }
        box.value = (base + finalText + interim).replace(/\s+/g, ' ');
      };
      rec.onerror = (e) => { if (e.error === 'no-speech') return; note('🎤 ' + (e.error === 'not-allowed' ? 'mic blocked — allow it, then tap again' : 'didn’t catch that — try again')); if (e.error === 'not-allowed') stopSR(); };
      rec.onend = () => { if (listening) { try { rec.start(); } catch {} } };   // Chrome stops on pauses; keep going until they tap stop
      try { rec.start(); listening = true; setState('rec'); note('🎤 listening… tap 🎤 to stop'); box.focus(); } catch { startWav(); }
    }
    function stopSR() { listening = false; setState(''); try { rec && rec.stop(); } catch {} try { primeSt && primeSt.getTracks().forEach((t) => t.stop()); } catch {} primeSt = null; }

    // ---- fallback: record → on-device server transcription ----
    let mr = null, chunks = [];
    async function startWav() {
      primeSt = await primeStream(); if (!primeSt) return;
      chunks = [];
      try { mr = new MediaRecorder(primeSt); } catch { note('🎤 recording isn’t supported here'); return; }
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = sendWav;
      mr.start(); listening = true; setState('rec'); note('🎤 listening… tap 🎤 to stop');
    }
    function stopWav() { if (!listening) return; listening = false; try { mr && mr.stop(); } catch {} }
    async function sendWav() {
      setState('busy');
      try {
        const blob = new Blob(chunks, { type: chunks[0] ? chunks[0].type : 'audio/webm' });
        if (!blob.size) { setState(''); note('🎤 didn’t catch anything'); return; }
        const wav = await toWav(blob);
        const r = await fetch('/api/voice/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav', 'X-Lab-Token': await tok() }, body: wav });
        const j = await r.json();
        if (j && (j.text || '').trim()) { box.value = (box.value ? box.value.replace(/\s+$/, '') + ' ' : '') + j.text.trim(); box.focus(); }
        else note('🎤 couldn’t make that out — try again');
      } catch { note('🎤 transcription failed'); }
      finally { setState(''); try { primeSt && primeSt.getTracks().forEach((t) => t.stop()); } catch {} primeSt = null; }
    }

    mic.addEventListener('click', () => {
      if (useSR) { listening ? stopSR() : startSR(); }
      else { listening ? stopWav() : startWav(); }
    });
  }

  window.CMVoice = { attach };
})();
