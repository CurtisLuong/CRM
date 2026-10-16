#!/usr/bin/env node
// scripts/agents/merge-to-v2.mjs — CỔNG MERGE TỰ ĐỘNG cho agent làm task v2 song song.
//
//   node scripts/agents/merge-to-v2.mjs <T-ID> --changelog <file.md> [--e2e] [--no-push]
//
// Agent chạy lệnh này trên nhánh task/<T-ID>-<slug> khi đã commit xong việc. Cổng tự:
//   1. lấy origin/v2 mới nhất, rebase nhánh task lên trên (xung đột → dừng, KHÔNG tự sửa);
//   2. kiểm tra task phụ thuộc đã ☑ trong docs/tasks.md;
//   3. kiểm tra phạm vi file theo scripts/agents/ownership.json (sai phạm vi → dừng);
//   4. luật bảo toàn: không sửa/xoá code v1 trong legacy/, không sửa migration cũ, SQL mới không
//      drop/rename/đổi kiểu/xoá dữ liệu, không lộ khoá bí mật;
//   5. chạy kiểm tra: npm run check + npm run build (+ e2e nếu --e2e), golden v1 --check;
//   6. tự ghi trạng thái ☑ vào docs/tasks.md + mục CHANGELOG trên bản v2 MỚI NHẤT (tránh xung đột);
//   7. push fast-forward lên origin/v2 (không bao giờ force). Bị agent khác chen trước → lặp lại từ 1.
// Exit 0 = đã merge. Khác 0 = chưa merge, đọc thông báo.
'use strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_ATTEMPTS = 5;
const ALWAYS_GATE = ['docs/tasks.md', 'docs/CHANGELOG.md']; // chỉ cổng được ghi
const args = process.argv.slice(2);
const TID = args.find((a) => /^T\d+\.\w+$/.test(a));
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const REMOTE = opt('--remote') || 'origin';
const BASE = 'v2';

const die = (code, msg) => { console.error(`\n✗ CHƯA MERGE (${code}): ${msg}`); process.exit(code); };
const ok = (msg) => console.log(`  ✓ ${msg}`);
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gitTry = (...a) => spawnSync('git', a, { encoding: 'utf8' });

if (!TID) die(2, 'Thiếu mã task. Dùng: node scripts/agents/merge-to-v2.mjs T2.B1 --changelog /tmp/T2.B1.md');
const changelogFile = opt('--changelog');
if (!changelogFile || !fs.existsSync(changelogFile)) die(2, 'Thiếu --changelog <file>: dòng 1 = tiêu đề ngắn, các dòng sau = gạch đầu dòng đã đổi gì / đã kiểm tra gì.');
const changelog = fs.readFileSync(changelogFile, 'utf8').trim();

const ROOT = git('rev-parse', '--show-toplevel');
process.chdir(ROOT);
const ownership = JSON.parse(fs.readFileSync('scripts/agents/ownership.json', 'utf8')).tasks;
const own = ownership[TID];
if (!own) die(2, `${TID} chưa có trong scripts/agents/ownership.json — người điều phối phải thêm phạm vi trước khi giao task.`);

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (!branch.startsWith(`task/${TID}-`)) die(2, `Nhánh hiện tại "${branch}" phải tên task/${TID}-<slug> (không dùng v2/…: Git cấm vì đã có nhánh v2).`);
if (git('status', '--porcelain')) die(2, 'Còn thay đổi chưa commit. Commit hết việc của task trước khi chạy cổng.');

// Glob đơn giản: ** = mọi ký tự, * = trong 1 tầng, ? = 1 ký tự, [..] giữ nguyên.
const globRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*')
  .replace(/\?/g, '[^/]').replace(/\u0000/g, '.*') + '$');
const matchAny = (p, globs = []) => globs.some((g) => globRe(g).test(p));
const allowed = (p) => matchAny(p, own.allow) && !matchAny(p, own.deny);

// ── Phụ thuộc trong bảng trạng thái docs/tasks.md ─────────────────────────
function taskRows(md) {
  const rows = {};
  for (const line of md.split('\n')) {
    const m = line.match(/^\| (T\d+\.\w+) \|/);
    if (!m) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    rows[m[1]] = { line, deps: cells[4] || '', status: cells[cells.length - 1] || '' };
  }
  return rows;
}
function checkDeps() {
  const rows = taskRows(fs.readFileSync('docs/tasks.md', 'utf8'));
  if (!rows[TID]) die(4, `Không thấy dòng ${TID} trong bảng trạng thái docs/tasks.md.`);
  if (rows[TID].status.startsWith('☑')) die(4, `${TID} đã ☑ trong tasks.md — không merge lần hai.`);
  const ids = [];
  let wave = false;
  for (const tok of rows[TID].deps.split(/[,\s]+/).filter(Boolean)) {
    if (/^Sóng$/i.test(tok)) { wave = true; continue; }
    if (/^\d+$/.test(tok) && wave) { ids.push(...Object.keys(rows).filter((k) => k.startsWith(`T${tok}.`))); continue; }
    if (/^T\d+\.\w+$/.test(tok)) ids.push(tok);
  }
  const missing = ids.filter((d) => !rows[d] || !rows[d].status.startsWith('☑'));
  if (missing.length) die(4, `Task phụ thuộc chưa xong trên v2: ${missing.join(', ')}.`);
  ok(`Phụ thuộc đã xong (${ids.join(', ') || 'không có'})`);
}

// ── Phạm vi file + luật bảo toàn ─────────────────────────────────────────
const SQL_FORBIDDEN = /\b(drop\s+(table|column|schema)|rename\s+(to|column)\b|alter\s+column\s+\w+\s+(set\s+data\s+)?type|truncate\b|delete\s+from\s+public\.customers|update\s+public\.customers\s+set)/i;
const SECRET = /(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{10,}|postgres(ql)?:\/\/[^\s'"]*:[^\s'"@[\]]+@)/;
// File v1 chuyển vào legacy/ nhưng chỗ cũ có file v2 mới cùng tên (vd. index.html) → git không thấy rename,
// báo "A legacy/<p>". Vẫn hợp lệ nếu nội dung giống hệt byte (cùng blob) với <p> trên v2.
const blob = (ref) => { const r = gitTry('rev-parse', '--verify', '-q', ref); return r.status === 0 ? r.stdout.trim() : null; };
function sameAsV1(st, p, base) {
  if (st !== 'A' || !p.startsWith('legacy/')) return false;
  const v1 = blob(`${base}:${p.slice('legacy/'.length)}`);
  return !!v1 && v1 === blob(`HEAD:${p}`);
}
function checkScope() {
  const base = `${REMOTE}/${BASE}`;
  const lines = git('diff', '--name-status', '-M', `${base}...HEAD`).split('\n').filter(Boolean);
  if (!lines.length) die(5, 'Nhánh không có thay đổi nào so với v2.');
  const bad = [];
  for (const l of lines) {
    const [st, a, b] = l.split('\t');
    const paths = b ? [a, b] : [a];
    for (const p of paths) {
      if (ALWAYS_GATE.includes(p)) bad.push(`${p}: cổng tự ghi file này — bỏ thay đổi của agent`);
      else if (!allowed(p)) bad.push(`${p}: ngoài phạm vi ${TID}`);
      if (/(^|\/)\.env(\.|$)/.test(p) && !p.endsWith('.example')) bad.push(`${p}: không commit file .env`);
    }
    const isLegacy = paths.some((p) => p.startsWith('legacy/'));
    if (isLegacy) {
      if (!own.legacyMove) bad.push(`${l}: chỉ T1.1 được đụng legacy/ (code v1 giữ nguyên để đối chiếu)`);
      else if (!(st === 'R100' && b && b.startsWith('legacy/')) && !sameAsV1(st, a, base)) bad.push(`${l}: legacy/ chỉ nhận file v1 chuyển nguyên vẹn (rename 100%)`);
    }
    if (a.startsWith('SQL/') && !(st === 'A' && a.startsWith('SQL/v2/')) && a !== 'SQL/schema.sql') bad.push(`${l}: không sửa/xoá migration đã có — chỉ thêm file mới trong SQL/v2/`);
    if (st === 'D' && (a.startsWith('SQL/') || a.startsWith('tests/golden/') || a.startsWith('tests/fixtures/'))) bad.push(`${a}: không xoá SQL / golden / fixture`);
  }
  // Nội dung thêm vào: SQL nguy hiểm + khoá bí mật.
  const added = git('diff', '-U0', `${base}...HEAD`).split('\n');
  let file = '';
  for (const l of added) {
    if (l.startsWith('+++ ')) { file = l.slice(6); continue; }
    if (!l.startsWith('+') || l.startsWith('+++')) continue;
    const text = l.slice(1);
    if (SECRET.test(text)) bad.push(`${file}: có chuỗi giống khoá bí mật / mật khẩu`);
    if (file.endsWith('.sql') && !/^\s*--/.test(text) && SQL_FORBIDDEN.test(text)) bad.push(`${file}: lệnh SQL phá dữ liệu "${text.trim().slice(0, 80)}" — cần chủ dự án duyệt riêng (D-012)`);
  }
  if (bad.length) die(5, 'Vi phạm phạm vi / luật dữ liệu:\n   - ' + [...new Set(bad)].join('\n   - '));
  ok(`Phạm vi file đúng ${TID} (${lines.length} thay đổi)`);
}

// ── Kiểm tra tự động ───────────────────────────────────────────────────────
function run(label, cmd, cmdArgs) {
  process.stdout.write(`  … ${label}\n`);
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', env: { ...process.env, CI: '1' } });
  if (r.status !== 0) die(6, `${label} thất bại — sửa rồi commit, chạy lại cổng.`);
  ok(label);
}
function checks() {
  if (fs.existsSync('package.json')) {
    const lockHash = fs.existsSync('package-lock.json') ? createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex') : 'none';
    const stamp = path.join('node_modules', '.gate-lock-hash');
    if (!fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8') !== lockHash) {
      run('npm ci (thư viện đổi trên v2)', 'npm', ['ci']);
      fs.writeFileSync(stamp, lockHash);
    }
    const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts || {};
    if (!scripts.check || !scripts.build) die(6, 'package.json thiếu script "check" hoặc "build".');
    run('npm run check', 'npm', ['run', 'check']);
    run('npm run build', 'npm', ['run', 'build']);
    if (flag('--e2e')) run('npm run e2e', 'npm', ['run', 'e2e']);
  }
  if (fs.existsSync('tests/legacy-harness/run.js')) run('golden v1 (--check)', 'node', ['tests/legacy-harness/run.js', '--check']);
}

// ── Commit trạng thái + CHANGELOG trên bản v2 mới nhất ────────────────────
function gateCommit() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  const sha = git('rev-parse', '--short', 'HEAD');
  let tasks = fs.readFileSync('docs/tasks.md', 'utf8');
  const row = taskRows(tasks)[TID].line;
  const cells = row.split('|');
  cells[cells.length - 2] = ` ☑ ${today} (tự merge ${sha}) `;
  tasks = tasks.replace(row, cells.join('|'));
  fs.writeFileSync('docs/tasks.md', tasks);
  const [title, ...body] = changelog.split('\n');
  const files = git('diff', '--name-only', `${REMOTE}/${BASE}...HEAD`).split('\n').filter(Boolean);
  const entry = `## ${today} — ${TID}: ${title.replace(/^#+\s*/, '')}\n\n${body.join('\n').trim()}\n- File: ${files.slice(0, 12).map((f) => '`' + f + '`').join(', ')}${files.length > 12 ? ` … (+${files.length - 12})` : ''}\n\n`;
  let cl = fs.readFileSync('docs/CHANGELOG.md', 'utf8');
  const at = cl.indexOf('---\n\n');
  cl = at >= 0 ? cl.slice(0, at + 5) + entry + cl.slice(at + 5) : cl + '\n' + entry;
  fs.writeFileSync('docs/CHANGELOG.md', cl);
  git('add', 'docs/tasks.md', 'docs/CHANGELOG.md');
  git('commit', '-q', '-m', `chore(${TID}): ☑ trạng thái + CHANGELOG (cổng merge)`);
  ok('Ghi ☑ vào tasks.md + CHANGELOG');
}

// ── Vòng merge ─────────────────────────────────────────────────────────────
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  console.log(`\nCổng merge ${TID} → ${BASE} (lần ${attempt})`);
  const f = gitTry('fetch', '-q', REMOTE, BASE);
  if (f.status !== 0) die(3, `Không fetch được ${REMOTE}/${BASE}: ${f.stderr.trim()}`);
  const rb = gitTry('rebase', '-q', `${REMOTE}/${BASE}`);
  if (rb.status !== 0) {
    const conflicts = git('diff', '--name-only', '--diff-filter=U');
    gitTry('rebase', '--abort');
    die(3, `Xung đột khi đặt lên v2 mới nhất: ${conflicts.replace(/\n/g, ', ') || rb.stderr.trim()}. Task song song đang đụng cùng file → báo người điều phối, KHÔNG tự sửa file của task khác.`);
  }
  ok(`Đã đặt lên ${REMOTE}/${BASE} mới nhất`);
  checkDeps();
  checkScope();
  checks();
  gateCommit();
  if (flag('--no-push')) { console.log('\n(--no-push) Dừng trước khi push. Bỏ commit cổng: git reset --hard HEAD~1'); process.exit(0); }
  const p = gitTry('push', REMOTE, `HEAD:refs/heads/${BASE}`);
  if (p.status === 0) {
    gitTry('push', '-q', '--force-with-lease', REMOTE, `HEAD:refs/heads/${branch}`); // lưu nhánh task (lịch sử)
    console.log(`\n✓ ĐÃ MERGE ${TID} vào ${BASE} (${git('rev-parse', '--short', 'HEAD')}).`);
    // Dọn worktree của các task KHÁC đã merge (worktree này giữ lại — agent còn đang đứng trong đó).
    // Lỗi khi dọn không ảnh hưởng kết quả merge.
    if (fs.existsSync('scripts/agents/cleanup-worktrees.mjs')) spawnSync('node', ['scripts/agents/cleanup-worktrees.mjs'], { stdio: 'inherit' });
    process.exit(0);
  }
  if (!/rejected|non-fast-forward|fetch first/i.test(p.stderr)) die(7, `Push lỗi: ${p.stderr.trim()}`);
  console.log('  ↻ v2 vừa có merge khác chen trước — bỏ commit cổng, làm lại.');
  git('reset', '-q', '--hard', 'HEAD~1');
}
die(7, `v2 thay đổi liên tục, thử ${MAX_ATTEMPTS} lần chưa merge được. Chạy lại sau ít phút.`);
