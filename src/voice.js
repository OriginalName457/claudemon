'use strict';
// LOCAL voice transcription — no cloud, no browser speech API, works in any packaged
// webview. The page captures the system mic (getUserMedia) and POSTs a WAV here; we
// transcribe it on-device and hand back text. Lightweight by default (uses the OS's
// own speech engine — zero model to ship). Point CLAUDEMON_STT_CMD at a better engine
// (e.g. a bundled whisper.cpp: "main -m model.bin -nt -np -f {wav}") and it slots in.

const { spawnSync } = require('child_process');

// A configured external transcriber (used first if present) — for whisper at packaging.
function viaCmd(wav) {
  const tmpl = process.env.CLAUDEMON_STT_CMD;
  if (!tmpl) return null;
  const parts = tmpl.includes('{wav}') ? tmpl.replace(/\{wav\}/g, wav).split(/\s+/) : tmpl.split(/\s+/).concat([wav]);
  try {
    const r = spawnSync(parts[0], parts.slice(1), { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 22 });
    if (r.status === 0) return (r.stdout || '').replace(/\s+/g, ' ').trim();
  } catch {}
  return null;
}

// The OS's built-in speech engine — zero model, fully offline. Windows: System.Speech
// dictation from the WAV. (mac/linux fall through until CLAUDEMON_STT_CMD is set.)
function viaOS(wav) {
  if (process.platform !== 'win32') return null;
  const safe = wav.replace(/'/g, "''");
  // Recognize() reads the WAV phrase-by-phrase and THROWS at end-of-file (rather
  // than returning null), so wrap each call and break on the EOF exception.
  const ps = "Add-Type -AssemblyName System.Speech; $sb = New-Object System.Text.StringBuilder; " +
    "try { $r = New-Object System.Speech.Recognition.SpeechRecognitionEngine; " +
    "$r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar)); $r.SetInputToWaveFile('" + safe + "'); " +
    "while ($true) { try { $res = $r.Recognize() } catch { break }; if ($res -eq $null) { break }; [void]$sb.Append($res.Text + ' ') } " +
    "$r.Dispose() } catch { }; [Console]::Out.Write($sb.ToString().Trim())";
  try {
    const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 22 });
    return (r.stdout || '').trim() || null;
  } catch { return null; }
}

function transcribe(wav) {
  const c = viaCmd(wav); if (c !== null) return c;
  const o = viaOS(wav); if (o !== null) return o;
  return null;
}

// Which engine is available (for the UI to show/hide the mic).
function engine() {
  if (process.env.CLAUDEMON_STT_CMD) return 'cmd';
  if (process.platform === 'win32') return 'os';
  return 'none';
}

module.exports = { transcribe, engine };
