'use strict';
// Open the OS's NATIVE folder picker and return the chosen absolute path.
// Runs server-side (Node) because a browser page can't read a real filesystem
// path from its own directory picker. Cross-platform: Windows / macOS / Linux.

const { spawn } = require('child_process');

function run(cmd, args) {
  return new Promise((resolve) => {
    let out = '', done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let p;
    try { p = spawn(cmd, args, { windowsHide: true }); } catch { return finish(null); }
    p.stdout.on('data', (d) => (out += d));
    p.on('error', () => finish(null));
    p.on('close', () => finish(out.trim() || null));
    setTimeout(() => { try { p.kill(); } catch {} finish(out.trim() || null); }, 180000); // don't hang forever
  });
}

function pickFolder(startDir) {
  if (process.platform === 'win32') {
    const start = startDir ? `$f.SelectedPath = '${String(startDir).replace(/'/g, "''")}';` : '';
    const ps = [
      'Add-Type -AssemblyName System.Windows.Forms | Out-Null',
      '$f = New-Object System.Windows.Forms.FolderBrowserDialog',
      "$f.Description = 'Choose the folder your Claudemon works out of'",
      '$f.ShowNewFolderButton = $true', start,
      // a hidden top-most form as owner so the dialog comes to the front
      '$o = New-Object System.Windows.Forms.Form; $o.TopMost = $true; $o.ShowInTaskbar = $false; $o.Opacity = 0; $o.Show()',
      '$r = $f.ShowDialog($o); $o.Close()',
      'if ($r -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($f.SelectedPath) }',
    ].join('; ');
    return run('powershell.exe', ['-STA', '-NoProfile', '-Command', ps]);
  }
  if (process.platform === 'darwin') {
    return run('osascript', ['-e', 'POSIX path of (choose folder with prompt "Choose the folder your Claudemon works out of")']);
  }
  // Linux: prefer zenity, fall back to kdialog
  return run('zenity', ['--file-selection', '--directory', '--title=Choose the folder your Claudemon works out of'])
    .then((p) => p || run('kdialog', ['--getexistingdirectory', startDir || process.env.HOME || '.']));
}

module.exports = { pickFolder };
