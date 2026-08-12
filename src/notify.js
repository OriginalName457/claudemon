'use strict';
// Cross-platform desktop notification — the pet's "shoulder tap" when a task
// finishes or Claude needs you. Best-effort and fully fire-and-forget: it never
// throws, never blocks, and silently no-ops if the OS has no notifier.
// Title/message are passed to the child via ENV (never argv/shell) so nothing
// in them can be interpreted as a command.

const { spawn } = require('child_process');

function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

function winToast(title, message) {
  // Windows 10/11 toast via the built-in WinRT API — no extra modules needed.
  const ps = [
    "$ErrorActionPreference='SilentlyContinue'",
    'try {',
    '  $null=[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]',
    '  $x=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
    "  $t=$x.GetElementsByTagName('text')",
    '  $null=$t.Item(0).AppendChild($x.CreateTextNode($env:CLAUDEMON_NT))',
    '  $null=$t.Item(1).AppendChild($x.CreateTextNode($env:CLAUDEMON_NM))',
    '  $toast=[Windows.UI.Notifications.ToastNotification]::new($x)',
    "  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claudemon').Show($toast)",
    '} catch {}',
  ].join('\n');
  const child = spawn('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps],
    { stdio: 'ignore', detached: true, windowsHide: true,
      env: Object.assign({}, process.env, { CLAUDEMON_NT: title, CLAUDEMON_NM: message }) });
  child.unref();
}

function notify(title, message) {
  try {
    const t = String(title || 'Claudemon').slice(0, 120);
    const m = String(message || '').slice(0, 240);
    if (process.platform === 'win32') return winToast(t, m);
    if (process.platform === 'darwin') {
      const c = spawn('osascript', ['-e', `display notification ${shq(m)} with title ${shq(t)}`],
        { stdio: 'ignore', detached: true });
      return c.unref();
    }
    const c = spawn('notify-send', ['-a', 'Claudemon', t, m], { stdio: 'ignore', detached: true });
    c.unref();
  } catch { /* best effort — a pet tap is never worth crashing over */ }
}

module.exports = { notify };
