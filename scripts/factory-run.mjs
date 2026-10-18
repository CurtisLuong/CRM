#!/usr/bin/env node
// AI Factory — chạy MỘT task bằng worker OpenCode/DeepSeek trong worktree riêng. Không merge, không push.
// Dùng: node scripts/factory-run.mjs tasks/queue/<ID>.md [--base factory]
// Đạt → commit trong worktree ../wt-<ID>, nhánh agent/<ID>. Lead đọc diff rồi merge vào `factory` bằng cách của repo.
// Biến môi trường (tuỳ chọn): FACTORY_MODELS="m1,m2,m3" · FACTORY_ATTEMPT_TIMEOUT_MIN=10
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DENY_CONFIG = join(ROOT, 'scripts', 'opencode.worker.json');
const LOG_DIR = join(ROOT, 'logs');
const MODELS = (process.env.FACTORY_MODELS || 'deepseek/deepseek-flash,deepseek/deepseek-flash,deepseek/deepseek-v4-pro')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const ATTEMPT_TIMEOUT_MS = (Number(process.env.FACTORY_ATTEMPT_TIMEOUT_MIN) || 10) * 60 * 1000;
const TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.(py|go)$/;
const IGNORED = new Set(['opencode.json']);

function sh(cmd, args, opts = {}) {
  // OpenCode 2.x lấy thư mục dự án từ $PWD, không từ cwd: phải đặt PWD = cwd, nếu không worker sửa nhầm repo chính.
  const env = opts.cwd ? { ...process.env, PWD: opts.cwd } : process.env;
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env, ...opts });
  return { code: r.status ?? (r.error ? 1 : 0), out: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: r.stdout ?? '', error: r.error };
}
function must(cmd, args, opts) {
  const r = sh(cmd, args, opts);
  if (r.code !== 0) throw new Error(`${cmd} ${args.join(' ')} thất bại:\n${r.out}`);
  return r.stdout.trim();
}
function tail(text, lines = 40, chars = 4000) {
  return text.trim().split('\n').slice(-lines).join('\n').slice(-chars);
}

// --- Đọc file task -------------------------------------------------------
// "# <ID> — tiêu đề", "## Mô tả", "## File được phép sửa" (gạch đầu dòng, có thể bọc `...`),
// "## Lệnh kiểm tra" (code block hoặc gạch đầu dòng `lệnh`). Lệnh kiểm tra lấy NGUYÊN từ task.
export function parseTask(file) {
  const md = readFileSync(file, 'utf8');
  const sections = {};
  let current = '_head';
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) current = h[1].toLowerCase();
    else (sections[current] ??= []).push(line);
  }
  const find = (re) => Object.entries(sections).find(([k]) => re.test(k))?.[1] ?? [];
  const items = (lines) => lines.map((l) => l.match(/^\s*[-*]\s+`?([^`\s]+)`?/)?.[1]).filter(Boolean);
  const commands = (lines) => {
    const inBlock = [];
    let on = false;
    for (const l of lines) {
      if (/^\s*```/.test(l)) on = !on;
      else if (on && l.trim() && !l.trim().startsWith('#')) inBlock.push(l.trim());
    }
    return inBlock.length ? inBlock : lines.map((l) => l.match(/^\s*[-*]\s+`(.+)`/)?.[1]).filter(Boolean);
  };
  const head = md.match(/^#\s+([A-Za-z0-9._-]+)\s*(?:[—–-]\s*(.+))?$/m);
  const id = head?.[1] ?? basename(file, '.md');
  const title = head?.[2]?.trim() || id;
  const allowed = items(find(/được phép|allowed/));
  const checks = commands(find(/kiểm tra|check/));
  if (!allowed.length) throw new Error('Task thiếu mục "## File được phép sửa".');
  if (!checks.length) throw new Error('Task thiếu mục "## Lệnh kiểm tra" (cần ít nhất 1 lệnh).');
  return { id, title, md, allowed, checks };
}

// --- Kiểm tra sau mỗi lần ------------------------------------------------
function changedFiles(wt, base) {
  const tracked = must('git', ['diff', '--name-status', base], { cwd: wt })
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [status, ...p] = l.split('\t');
      return { status: status[0], path: p.at(-1) };
    });
  const untracked = must('git', ['ls-files', '--others', '--exclude-standard'], { cwd: wt })
    .split('\n')
    .filter(Boolean)
    .map((path) => ({ status: 'A', path }));
  return [...tracked, ...untracked].filter((f) => !IGNORED.has(f.path));
}

function verify(wt, base, task) {
  const problems = [];
  const files = changedFiles(wt, base);
  if (!files.length) problems.push('Worker không thay đổi file nào.');
  const outside = files.filter((f) => !task.allowed.includes(f.path));
  if (outside.length) problems.push(`Sửa file ngoài danh sách cho phép: ${outside.map((f) => f.path).join(', ')}`);
  const touchedTests = files.filter((f) => TEST_FILE.test(f.path) && f.status !== 'A');
  if (touchedTests.length) problems.push(`Sửa/xoá file test có sẵn: ${touchedTests.map((f) => f.path).join(', ')}`);
  const flaky = [];
  for (const cmd of task.checks) {
    const r = sh('sh', ['-c', cmd], { cwd: wt });
    if (r.code === 0) continue;
    const retried = retryUntouched(wt, cmd, r.out, files);
    if (retried) {
      flaky.push(...retried);
      continue;
    }
    problems.push(`\`${cmd}\` trượt (exit ${r.code}):\n${tail(r.out)}`);
    break;
  }
  return { ok: problems.length === 0, problems, files, flaky };
}

// Test trượt chỉ ở file worker KHÔNG đụng → chạy lại đúng các file đó 1 lần. Xanh = test chập chờn có sẵn, không tính
// worker trượt (tránh leo thang model vô ích). Trả danh sách file chập chờn, hoặc null.
function failedTestFiles(out) {
  const plain = out.replace(/\x1b\[[0-9;]*m/g, '');
  const e2e = [...plain.matchAll(/›\s+(\S+\.spec\.[cm]?[jt]sx?):\d+:\d+/g)].map((m) => m[1]);
  const unit = [...plain.matchAll(/^\s*FAIL\s+(\S+\.(?:test|spec)\.[cm]?[jt]sx?)/gm)].map((m) => m[1]);
  return { e2e: [...new Set(e2e)], unit: [...new Set(unit.filter((u) => !e2e.includes(u)))] };
}
function unitRunner(wt) {
  try {
    const pkg = JSON.parse(readFileSync(join(wt, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.vitest) return ['npx', ['vitest', 'run']];
    if (deps.jest) return ['npx', ['jest']];
  } catch {}
  return null;
}
function retryUntouched(wt, cmd, out, files) {
  const failed = failedTestFiles(out);
  const all = [...failed.e2e, ...failed.unit];
  if (!all.length) return null;
  const touched = new Set(files.map((f) => f.path));
  if (all.some((p) => touched.has(p))) return null;
  const runner = unitRunner(wt);
  if (failed.unit.length && !runner) return null;
  console.log(`  ↻ \`${cmd}\` trượt ở file worker không đụng (${all.join(', ')}) — chạy lại 1 lần`);
  if (failed.e2e.length && sh('npx', ['playwright', 'test', ...failed.e2e], { cwd: wt }).code !== 0) return null;
  if (failed.unit.length && sh(runner[0], [...runner[1], ...failed.unit], { cwd: wt }).code !== 0) return null;
  console.log('  ↻ chạy lại xanh → test chập chờn, không tính worker trượt');
  return all;
}

// --- Worker --------------------------------------------------------------
function prompt(task, feedback) {
  return [
    'Bạn là worker lập trình trong repo này. Đọc AGENTS.md trước (luật của repo). Luật bắt buộc của Factory:',
    `1. CHỈ được tạo/sửa đúng các file sau: ${task.allowed.join(', ')}. Không đụng file nào khác.`,
    '2. KHÔNG sửa hay xoá file test có sẵn. Chỉ được tạo file test MỚI nếu nó nằm trong danh sách trên.',
    '3. Không thêm thư viện, không sửa file khai báo thư viện/lockfile, không ghi dữ liệu thật, không gọi mạng.',
    '4. Không chạy git commit/push/merge/reset/checkout. Script điều phối sẽ tự commit.',
    `5. Trước khi kết thúc, tự chạy và làm cho pass: ${task.checks.join(' && ')}.`,
    '6. Viết code giống phong cách code xung quanh; thay đổi nhỏ nhất có thể.',
    '7. Thấy mâu thuẫn giữa các ca test hoặc với mục Luật: KHÔNG tự đặt luật mới; làm theo Luật và ghi rõ mâu thuẫn trong câu trả lời cuối.',
    '',
    '--- TASK ---',
    task.md.trim(),
    ...(feedback ? ['', '--- LẦN TRƯỚC TRƯỢT — sửa các lỗi sau (giữ phần đã làm đúng) ---', feedback] : []),
  ].join('\n');
}

function costOf(jsonl) {
  let total = 0;
  const sum = (v) => {
    if (Array.isArray(v)) v.forEach(sum);
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if (k === 'cost' && typeof x === 'number') total += x;
        else sum(x);
      }
  };
  for (const line of jsonl.split('\n')) {
    if (!line.includes('step_finish')) continue;
    try {
      sum(JSON.parse(line));
    } catch {}
  }
  return total;
}

function runWorker(wt, task, n, model, feedback) {
  mkdirSync(LOG_DIR, { recursive: true });
  const log = join(LOG_DIR, `${task.id}-${n}.jsonl`);
  // --standalone: server riêng chạy tại worktree (cùng PWD) → chắc chắn nạp opencode.json (danh sách deny) của worktree.
  const r = sh(
    'opencode',
    ['run', '--standalone', '--model', model, '--format', 'json', '--auto', '--title', `${task.id} #${n}`, prompt(task, feedback)],
    { cwd: wt, timeout: ATTEMPT_TIMEOUT_MS },
  );
  writeFileSync(log, r.stdout);
  if (r.code !== 0 || r.error) writeFileSync(`${log}.stderr.txt`, r.out);
  return { log, cost: costOf(r.stdout), code: r.code, timedOut: r.error?.code === 'ETIMEDOUT' };
}

function installDeps(wt) {
  if (existsSync(join(wt, 'node_modules'))) return;
  const has = (f) => existsSync(join(wt, f));
  const plan = has('package-lock.json')
    ? ['npm', ['ci', '--no-audit', '--no-fund']]
    : has('pnpm-lock.yaml')
      ? ['pnpm', ['install', '--frozen-lockfile']]
      : has('yarn.lock')
        ? ['yarn', ['install', '--frozen-lockfile']]
        : null;
  if (!plan) return; // không có lockfile → không cài (cài sẽ tạo lockfile mới, bị tính là sửa ngoài phạm vi)
  console.log(`Cài thư viện (${plan[0]} ${plan[1][0]})...`);
  must(plan[0], plan[1], { cwd: wt });
}

// --- Chính ---------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const taskFile = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--base');
  const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'factory';
  if (!taskFile) {
    console.error('Dùng: node scripts/factory-run.mjs tasks/queue/<ID>.md [--base factory]');
    process.exit(2);
  }
  if (!existsSync(DENY_CONFIG)) throw new Error(`Thiếu ${DENY_CONFIG} (danh sách deny cho worker).`);
  const task = parseTask(resolve(taskFile));
  const wt = resolve(ROOT, '..', `wt-${task.id}`);
  const branch = `agent/${task.id}`;
  if (existsSync(wt)) throw new Error(`Worktree đã tồn tại: ${wt}. Xoá bằng: git worktree remove ${wt} && git branch -D ${branch}`);

  must('git', ['worktree', 'add', wt, '-b', branch, base], { cwd: ROOT });
  // Khoá push chỉ trong worktree worker (cần extensions.worktreeConfig=true); repo chính + merge-to-v2.mjs vẫn push được.
  must('git', ['config', '--worktree', 'remote.origin.pushurl', 'DISABLED'], { cwd: wt });
  const baseSha = must('git', ['rev-parse', 'HEAD'], { cwd: wt });
  installDeps(wt);
  copyFileSync(DENY_CONFIG, join(wt, 'opencode.json'));

  // Chốt chặn: repo chính không được đổi trong lúc worker chạy.
  const mainState = () => must('git', ['status', '--porcelain'], { cwd: ROOT });
  const mainBefore = mainState();
  const history = [];
  let feedback = '';
  let result = { ok: false, problems: [], files: [] };
  for (let i = 0; i < MODELS.length; i++) {
    const n = i + 1;
    const model = MODELS[i];
    console.log(`\n[${task.id}] Lần ${n}/${MODELS.length} — ${model}`);
    const w = runWorker(wt, task, n, model, feedback);
    if (mainState() !== mainBefore) throw new Error(`Worker đã sửa repo chính ${ROOT}! Dừng ngay. Kiểm tra: git -C ${ROOT} status`);
    result = verify(wt, baseSha, task);
    history.push({ n, model, cost: w.cost, log: w.log, exit: w.code, timedOut: w.timedOut, ok: result.ok, flaky: result.flaky ?? [] });
    console.log(`  worker exit=${w.code}${w.timedOut ? ' (hết giờ)' : ''} · cost=$${w.cost.toFixed(4)} · ${result.ok ? 'ĐẠT' : 'TRƯỢT'}`);
    if (result.ok) break;
    result.problems.forEach((p) => console.log(`  - ${p.split('\n')[0]}`));
    feedback = result.problems.join('\n\n');
  }

  const total = history.reduce((s, h) => s + h.cost, 0);
  let commit = '';
  if (result.ok) {
    const last = history.at(-1);
    must('git', ['add', '--', ...result.files.map((f) => f.path)], { cwd: wt });
    const body = `Worker: ${last.model}, lần ${last.n}/${MODELS.length}, chi phí $${total.toFixed(4)}. Task: ${basename(taskFile)}. Chưa merge — Lead đọc diff.`;
    must('git', ['commit', '-q', '-m', `feat(${task.id}): ${task.title}`, '-m', body], { cwd: wt });
    commit = must('git', ['rev-parse', '--short', 'HEAD'], { cwd: wt });
  }

  console.log('\n===== BÁO CÁO =====');
  console.log(`Task:       ${task.id} — ${task.title}`);
  console.log(`Trạng thái: ${result.ok ? `ĐẠT — commit ${commit} trên ${branch} (chưa merge, chưa push)` : `TRƯỢT — dừng sau ${history.length} lần`}`);
  console.log(`Worktree:   ${wt}`);
  console.log(`Số lần thử: ${history.length} (${history.map((h) => `${h.model}${h.ok ? ' ✓' : ' ✗'}`).join(', ')})`);
  console.log(`File đổi:   ${result.files.map((f) => `${f.status} ${f.path}`).join(', ') || '(không)'}`);
  console.log(`Chi phí:    $${total.toFixed(4)}`);
  const flaky = [...new Set(history.flatMap((h) => h.flaky))];
  if (flaky.length) console.log(`Chập chờn:  ${flaky.join(', ')} (trượt rồi xanh khi chạy lại; file worker không đụng)`);
  console.log(`Log:        ${history.map((h) => h.log).join(', ')}`);
  if (!result.ok) console.log(`\nLỗi lần cuối:\n${result.problems.join('\n\n')}`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`LỖI: ${e.message}`);
    process.exit(2);
  }
}
