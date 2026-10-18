#!/usr/bin/env node
// AI Factory — chạy LẦN LƯỢT mọi tasks/queue/*.md bằng scripts/factory-run.mjs (qua đêm). KHÔNG merge, KHÔNG push.
// Dùng: node scripts/factory-batch.mjs [--base factory] [--max-cost 5] [--task-timeout 30] [--dry-run]
// - Mỗi task tối đa --task-timeout phút (cả 3 lần thử). Tổng chi phí > --max-cost → dừng hẳn.
// - Task trượt / lỗi / hết giờ → ghi log, chạy task tiếp. Chỉ dừng cả batch khi chốt chặn repo chính kích hoạt
//   (worker đã ghi vào repo chính — chạy tiếp là để nó sửa repo thật cả đêm).
// - Task xong: tasks/queue/X.md → tasks/done/ (ĐẠT) hoặc tasks/failed/ (còn lại).
// - Báo cáo reports/overnight-<ngày>.md, ghi lại sau MỖI task. Output từng task: logs/batch-<ID>.out.txt
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTask } from './factory-run.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUN = join(ROOT, 'scripts', 'factory-run.mjs');
const DIRS = Object.fromEntries(['queue', 'done', 'failed'].map((d) => [d, join(ROOT, 'tasks', d)]));
const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const base = opt('--base', 'factory');
const maxCost = Number(opt('--max-cost', '5')) || 5;
const taskTimeoutMs = (Number(opt('--task-timeout', '30')) || 30) * 60 * 1000;
const dryRun = args.includes('--dry-run');
const now = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 16);

for (const d of [...Object.values(DIRS), join(ROOT, 'logs'), join(ROOT, 'reports')]) mkdirSync(d, { recursive: true });
if (spawnSync('git', ['rev-parse', '--verify', '-q', base], { cwd: ROOT }).status !== 0) {
  console.error(`LỖI: không có nhánh base "${base}" (tạo: git branch ${base} <nhánh production>).`);
  process.exit(2);
}
const files = readdirSync(DIRS.queue)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => join(DIRS.queue, f));

// Kiểm trước (chưa tốn tiền worker). Task hỏng không chặn cả batch: chuyển sang failed/ khi chạy thật.
function inspect(file) {
  try {
    const t = parseTask(file);
    const problems = [];
    if (/CHƯA CHẠY|CHỜ CHỐT/i.test(t.md)) problems.push('đặc tả còn ghi CHƯA CHẠY / CHỜ CHỐT');
    if (existsSync(resolve(ROOT, '..', `wt-${t.id}`))) problems.push(`worktree ../wt-${t.id} đã có`);
    return { file, id: t.id, title: t.title, problems };
  } catch (e) {
    return { file, id: basename(file, '.md'), title: '', problems: [e.message] };
  }
}
const tasks = files.map(inspect);
console.log(`Batch: ${tasks.length} task · base ${base} · trần $${maxCost} · ${taskTimeoutMs / 60000} phút/task`);
for (const t of tasks) console.log(`  ${t.problems.length ? '✗' : '✓'} ${t.id} ${t.problems.join('; ')}`);
if (dryRun) process.exit(tasks.some((t) => t.problems.length) ? 1 : 0);

// --- Báo cáo (ghi lại sau mỗi task) -------------------------------------------
const day = now().slice(0, 10);
let reportPath = join(ROOT, 'reports', `overnight-${day}.md`);
for (let n = 2; existsSync(reportPath); n++) reportPath = join(ROOT, 'reports', `overnight-${day}-${n}.md`);
const started = now();
const rows = [];
let cost = 0;
let stopped = '';
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
function writeReport(final) {
  const pending = tasks.filter((t) => !rows.some((r) => r.id === t.id)).map((t) => t.id);
  const lines = [
    `# Overnight ${day} — base \`${base}\``,
    '',
    `Bắt đầu ${started} · ${final ? `xong ${now()}` : `**đang chạy** (cập nhật ${now()})`} · tổng chi phí worker **$${cost.toFixed(4)}** / trần $${maxCost}`,
    '',
    'Không merge, không push. Lead đọc diff từng task ĐẠT trước khi merge vào `factory`.',
    stopped ? `\n**DỪNG:** ${stopped}.` : '',
    pending.length ? `\nChưa chạy: ${pending.join(', ')}` : '',
    '',
    '| Task | Kết quả | Số lần thử | Model | Chi phí | Nhánh | File đổi | Log | Phút |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${cell(r.id)} | ${r.status} | ${r.attempts} | ${cell(r.model)} | $${r.cost.toFixed(4)} | ${cell(r.branch)} | ${cell(r.files)} | ${cell(r.log)} | ${r.minutes} |`,
    ),
    '',
    ...rows.filter((r) => r.status !== 'ĐẠT').flatMap((r) => [`## ${r.id} — ${r.status}`, '```', r.tail, '```', '']),
  ];
  writeFileSync(reportPath, lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n'));
}
function moveTask(t, ok) {
  const dest = join(ok ? DIRS.done : DIRS.failed, basename(t.file));
  try {
    renameSync(t.file, dest);
  } catch (e) {
    console.error(`  (không chuyển được ${basename(t.file)}: ${e.message})`);
  }
}

// --- Chạy 1 task ----------------------------------------------------------------
const field = (out, label) => out.match(new RegExp(`^${label}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';
function runOne(t) {
  return new Promise((done) => {
    const t0 = Date.now();
    let out = '';
    let timedOut = false;
    let child;
    try {
      // detached: nhóm tiến trình riêng để hết giờ thì dừng được cả opencode con.
      child = spawn('node', [RUN, t.file, '--base', base], { cwd: ROOT, detached: true });
    } catch (e) {
      return done({ code: 2, out: `Không chạy được factory-run: ${e.message}`, timedOut, minutes: 0 });
    }
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
    }, taskTimeoutMs);
    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', (b) => (out += b));
    child.on('error', (e) => (out += `\n${e.message}`));
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, out, timedOut, minutes: ((Date.now() - t0) / 60000).toFixed(1) });
    });
  });
}

async function main() {
  writeReport(false);
  for (const t of tasks) {
    if (stopped) break;
    if (cost > maxCost) {
      stopped = `tổng chi phí $${cost.toFixed(4)} > trần $${maxCost}`;
      break;
    }
    console.log(`▶ ${t.id} (${now()})`);
    let r;
    if (t.problems.length) {
      r = { id: t.id, status: 'BỎ QUA', attempts: '0', model: '—', cost: 0, branch: '—', files: '—', log: '—', minutes: 0, tail: t.problems.join('\n') };
    } else {
      const res = await runOne(t);
      const outFile = join(ROOT, 'logs', `batch-${t.id}.out.txt`);
      try {
        writeFileSync(outFile, res.out);
      } catch {}
      const attemptsField = field(res.out, 'Số lần thử'); // "2 (m1 ✗, m2 ✓)"
      const models = attemptsField.match(/\((.*)\)/)?.[1] ?? '';
      const lastModel = models.split(',').at(-1)?.replace(/[✓✗]/g, '').trim() || '—';
      r = {
        id: t.id,
        status: res.timedOut ? 'HẾT GIỜ' : res.code === 0 ? 'ĐẠT' : res.code === 1 ? 'TRƯỢT' : 'LỖI',
        attempts: attemptsField.split(' ')[0] || '—',
        model: res.code === 0 ? lastModel : models || '—',
        cost: Number(field(res.out, 'Chi phí').replace('$', '')) || 0,
        branch: res.code === 0 ? `agent/${t.id}` : existsSync(resolve(ROOT, '..', `wt-${t.id}`)) ? `agent/${t.id} (chưa commit)` : '—',
        files: field(res.out, 'File đổi') || '—',
        log: relative(ROOT, outFile),
        minutes: res.minutes,
        tail: res.out.trim().split('\n').slice(-15).join('\n'),
      };
      if (res.code === 2 && /repo chính/.test(res.out)) stopped = `chốt chặn repo chính kích hoạt ở ${t.id} — kiểm tra \`git status\` repo chính`;
    }
    cost += r.cost;
    rows.push(r);
    moveTask(t, r.status === 'ĐẠT');
    console.log(`■ ${r.id}: ${r.status} · ${r.attempts} lần · $${r.cost.toFixed(4)} · ${r.minutes} phút`);
    writeReport(false);
  }
  if (!stopped && cost > maxCost) stopped = `tổng chi phí $${cost.toFixed(4)} > trần $${maxCost}`;
  writeReport(true);
  console.log(`\nBáo cáo: ${reportPath}`);
}

main().catch((e) => {
  // Lỗi của chính batch: vẫn để lại báo cáo.
  stopped = `lỗi batch: ${e.message}`;
  try {
    writeReport(true);
  } catch {}
  console.error(`LỖI: ${e.message}`);
  process.exit(2);
});
