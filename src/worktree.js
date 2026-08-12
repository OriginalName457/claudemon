'use strict';
// Git worktree isolation. Each write-capable Claudemon (or pair) works in its OWN
// branch + checkout, so several can run at once without stepping on each other's
// files. The changes land on a `claudemon/<id>` branch you review and merge.

const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const WT_ROOT = path.join(os.tmpdir(), 'claudemon-worktrees');

function git(cwd, args) {
  try { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }; }
  catch (e) { return { ok: false, out: '', err: e.message }; }
}

function isGitRepo(cwd) {
  return git(cwd, ['rev-parse', '--is-inside-work-tree']).out === 'true';
}

// Make an isolated worktree on a fresh branch off the current HEAD.
function createWorktree(cwd, id) {
  try {
    fs.mkdirSync(WT_ROOT, { recursive: true });
    const base = (path.basename(cwd.replace(/[\\/]+$/, '')) || 'repo');
    const wt = path.join(WT_ROOT, `${base}-${id}`);
    const branch = `claudemon/${id}`;
    const r = git(cwd, ['worktree', 'add', wt, '-b', branch]);
    if (!r.ok) return null;
    return { path: wt, branch, base: cwd };
  } catch { return null; }
}

function removeWorktree(cwd, wtPath) {
  const r = git(cwd, ['worktree', 'remove', wtPath, '--force']);
  return r.ok;
}

// Did this worktree actually get any changes written to it? (used to catch an agent
// that reported "done" but delivered nothing.)
function hasChanges(wtPath) {
  const r = git(wtPath, ['status', '--porcelain']);
  return r.ok && r.out.trim().length > 0;
}

// Commit everything the agent wrote in its worktree onto its branch, so the delivery
// is real: `git diff <base>..<branch>` shows it and it can be merged. A committer
// identity is passed inline in case the repo has none configured. Returns true on a
// landed commit (false if there was nothing to commit or git refused).
function commitAll(wtPath, message) {
  const add = git(wtPath, ['add', '-A']);
  if (!add.ok) return false;
  const r = git(wtPath, ['-c', 'user.name=Claudemon', '-c', 'user.email=crew@claudemon.local', 'commit', '-m', message || 'claudemon: crew delivery']);
  return r.ok;
}

// Merge a delivered branch back into the base repo's working tree (so the files land
// in the human's folder). Returns { ok, conflict } — on conflict the merge is aborted
// and the branch is left intact for manual review.
function mergeBranch(cwd, branch) {
  const r = git(cwd, ['merge', '--no-edit', branch]);
  if (r.ok) return { ok: true, conflict: false };
  const conflict = /conflict/i.test(r.err + r.out);
  if (conflict) git(cwd, ['merge', '--abort']);
  return { ok: false, conflict };
}

// Force-delete a branch (after its work has been merged into the base).
function deleteBranch(cwd, branch) { return git(cwd, ['branch', '-D', branch]).ok; }

// List only the worktrees Claudemon created for this repo.
function listWorktrees(cwd) {
  const r = git(cwd, ['worktree', 'list', '--porcelain']);
  if (!r.ok) return [];
  const out = []; let cur = {};
  for (const line of r.out.split('\n')) {
    if (line.startsWith('worktree ')) { if (cur.path) out.push(cur); cur = { path: line.slice(9).trim() }; }
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).trim().replace('refs/heads/', '');
  }
  if (cur.path) out.push(cur);
  return out.filter((w) => (w.branch || '').startsWith('claudemon/'));
}

module.exports = { isGitRepo, createWorktree, removeWorktree, hasChanges, commitAll, mergeBranch, deleteBranch, listWorktrees, WT_ROOT };
