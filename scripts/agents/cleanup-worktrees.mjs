#!/usr/bin/env node
// scripts/agents/cleanup-worktrees.mjs — DỌN WORKTREE của task đã merge vào v2.
//
//   node scripts/agents/cleanup-worktrees.mjs            → dọn
//   node scripts/agents/cleanup-worktrees.mjs --dry-run  → chỉ in sẽ dọn gì
//
// Chỉ xoá worktree khi đạt ĐỦ: (1) nhánh task/… đã nằm trọn trong origin/v2; (2) không còn thay đổi
// chưa commit (kể cả file mới chưa track); (3) không phải thư mục chính của repo, không phải worktree
// đang chạy lệnh này; (4) không do app Claude quản lý (…/.claude/worktrees/…) và không bị khoá.
// Sau đó xoá luôn nhánh task/… cục bộ đã merge (bản trên GitHub vẫn còn). Cổng merge tự gọi file này
// sau mỗi lần merge thành công. Không bao giờ dùng --force với worktree còn thay đổi.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry-run');
const REMOTE = 'origin', BASE = 'v2';
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
const out = (r) => (r.status === 0 ? r.stdout.trim() : null);

const here = out(git(process.cwd(), 'rev-parse', '--show-toplevel'));
if (!here) { console.error('Không ở trong repo Git.'); process.exit(1); }
const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const current = real(here);

// Cập nhật origin/v2 (không được thì dùng bản đã có — vẫn an toàn vì chỉ xoá cái đã nằm trong đó).
git(here, 'fetch', '-q', REMOTE, BASE);
const baseRef = `${REMOTE}/${BASE}`;
if (!out(git(here, 'rev-parse', '--verify', '-q', baseRef))) { console.error(`Chưa có ${baseRef} — bỏ qua dọn.`); process.exit(0); }

git(here, 'worktree', 'prune'); // bỏ mục của thư mục đã bị xoá tay
const entries = [];
let cur = null;
for (const line of (out(git(here, 'worktree', 'list', '--porcelain')) || '').split('\n')) {
  if (line.startsWith('worktree ')) { cur = { path: line.slice(9) }; entries.push(cur); }
  else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '');
  else if (cur && line.startsWith('HEAD ')) cur.head = line.slice(5);
  else if (cur && line.startsWith('locked')) cur.locked = true;
}
const mainPath = entries[0] && real(entries[0].path);
const merged = (rev) => git(here, 'merge-base', '--is-ancestor', rev, baseRef).status === 0;

const removed = [], kept = [];
for (const w of entries.slice(1)) {
  const p = real(w.path);
  const keep = (why) => kept.push(`${w.path} [${w.branch || 'detached'}] — ${why}`);
  if (p === mainPath) continue;
  if (p === current) { keep('đang chạy lệnh trong worktree này'); continue; }
  if (p.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`)) { keep('do app Claude quản lý — app tự dọn'); continue; }
  if (w.locked) { keep('đang bị khoá'); continue; }
  if (!w.branch || !w.branch.startsWith('task/')) { keep('không phải nhánh task/…'); continue; }
  if (!merged(w.head)) { keep(`chưa merge vào ${baseRef}`); continue; }
  const dirty = out(git(w.path, 'status', '--porcelain'));
  if (dirty === null) { keep('không đọc được trạng thái'); continue; }
  if (dirty) { keep('còn thay đổi chưa commit'); continue; }
  if (DRY) { removed.push(`${w.path} [${w.branch}] (dry-run)`); continue; }
  // Sạch theo git status (file bị .gitignore như node_modules/dist không tính) → --force chỉ để bỏ các file bị ignore.
  const r = git(here, 'worktree', 'remove', '--force', w.path);
  if (r.status !== 0) { keep(`git worktree remove lỗi: ${r.stderr.trim()}`); continue; }
  git(here, 'branch', '-D', w.branch);
  removed.push(`${w.path} [${w.branch}]`);
}

// Nhánh task/… cục bộ không còn worktree và đã merge → xoá (GitHub vẫn giữ bản đã push).
const inUse = new Set(entries.map((e) => e.branch).filter(Boolean));
for (const b of (out(git(here, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/task/')) || '').split('\n').filter(Boolean)) {
  if (inUse.has(b) || !merged(b)) continue;
  if (!DRY) git(here, 'branch', '-D', b);
  removed.push(`nhánh ${b}${DRY ? ' (dry-run)' : ''}`);
}

console.log(`Dọn worktree: xoá ${removed.length}, giữ ${kept.length}`);
for (const r of removed) console.log(`  − ${r}`);
for (const k of kept) console.log(`  · giữ ${k}`);
