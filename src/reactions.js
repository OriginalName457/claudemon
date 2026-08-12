'use strict';
// The pet reacts to your REAL work — at zero token cost. Claude Code fires
// lifecycle hooks; this maps each one to a little change in the pet's state,
// with NO LLM call. Your coding literally sustains your companion: commits are
// food, green tests are joy, edits keep it fed, and away-time lets it decay.
//
// Design rules learned from the research:
//   • Non-intrusive: reactions only change state (mood/stats) + record a "pulse"
//     the statusline can surface. They never print into your flow.
//   • Aligned, not anxious: productive work keeps the pet healthy. No punishment.
//   • Fast + safe: every path is throttled where needed and can never throw.

const state = require('./state');

const clamp = (n) => Math.max(0, Math.min(100, n));

// Apply stat deltas and record the latest "pulse" (what the pet just felt).
function apply(deltas, pulse) {
  state.mutate((s) => {
    for (const [k, v] of Object.entries(deltas)) s.stats[k] = clamp((s.stats[k] || 0) + v);
    if (pulse) s.pulse = Object.assign({ at: Date.now() }, pulse);
  });
}

// Same, but only once per `ms` for a given reaction key (stored in state so it
// survives across the separate short-lived hook processes).
function applyThrottled(key, ms, deltas, pulse) {
  state.mutate((s) => {
    s.react = s.react || {};
    if (Date.now() - (s.react[key] || 0) < ms) return;
    s.react[key] = Date.now();
    for (const [k, v] of Object.entries(deltas)) s.stats[k] = clamp((s.stats[k] || 0) + v);
    if (pulse) s.pulse = Object.assign({ at: Date.now() }, pulse);
  });
}

const TEST_RE = /\b(pytest|jest|vitest|mocha|go\s+test|cargo\s+test|(npm|pnpm|yarn|bun)\s+(run\s+)?test|rspec|phpunit|dotnet\s+test|gradle\s+test|mvn\s+test)\b/;

// The repo we're working in (for the relationship memory) — cwd's basename.
function repoOf(evt) {
  const cwd = String(evt.cwd || evt.workingDirectory || evt.project_dir || '');
  if (!cwd) return '';
  return cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
}
// Your Main is the partner that remembers you (its own personality, its own history).
function mainNow() { try { return state.CURRENT_MAIN(); } catch { return null; } }
// Fold a real-work signal into the Main's cross-repo memory (never throws).
function remember(kind, repo) { try { state.noteSignal(mainNow(), kind, repo); } catch {} }

// Entry point: an already-parsed Claude Code hook payload.
function onEvent(evt) {
  const kind = evt.hook_event_name || evt.hookEventName || evt.event || '';

  if (kind === 'SessionStart') {
    // Greet you where we left off — in this creature's own voice, zero tokens.
    const id = mainNow(); const repo = repoOf(evt);
    let greet = null; try { greet = state.greetingFor(id); } catch {}
    try { state.beginSession(id, repo); } catch {}
    if (greet) return apply({ energy: 3, happiness: 3 }, { kind: 'greet', emoji: '👋', note: greet });
    return apply({ energy: 3, happiness: 3 }, { kind: 'wake', emoji: '👀', note: 'back at it with you' });
  }

  if (kind === 'SessionEnd')
    return apply({ energy: 6 }, { kind: 'sleep', emoji: '😴', note: 'clocked out — see you soon' });

  if (kind === 'Notification') {
    apply({}, { kind: 'attn', emoji: '🔔', note: 'needs your input' });
    try { require('./notify').notify('Claudemon 🦀', evt.message || 'Claude needs your input.'); } catch {}
    return;
  }

  // A chunk of work just wrapped — the pet worked alongside you.
  if (kind === 'Stop' || kind === 'SubagentStop')
    return applyThrottled('workAt', 30000, { happiness: 4 }, { kind: 'work', emoji: '💪', note: 'wrapped a task with you' });

  if (kind === 'PostToolUse') {
    const tool = evt.tool_name || evt.toolName || '';
    const repo = repoOf(evt);
    if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) {
      remember('edit', repo);
      return applyThrottled('softAt', 25000, { fullness: 3, happiness: 2 }, { kind: 'edit', emoji: '✏️', note: 'working alongside you' });
    }
    if (tool === 'Bash') {
      const cmd = String((evt.tool_input && (evt.tool_input.command || evt.tool_input.cmd)) || '');
      if (/\bgit\s+commit\b/.test(cmd)) {
        remember('commit', repo);
        return apply({ fullness: 12, happiness: 5 }, { kind: 'commit', emoji: '🍖', note: 'fed on your commit' });
      }
      if (/\bgit\s+push\b/.test(cmd))
        return apply({ happiness: 8, energy: 3 }, { kind: 'push', emoji: '🚀', note: 'cheered your push' });
      if (TEST_RE.test(cmd)) {
        remember('tests', repo);
        return apply({ happiness: 8, energy: 4 }, { kind: 'tests', emoji: '✅', note: 'loves that you ran tests' });
      }
    }
    return;
  }
}

module.exports = { onEvent };
