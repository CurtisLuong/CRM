#!/usr/bin/env node
// AI Factory — chạy MỘT task bằng worker OpenCode/DeepSeek trong worktree riêng. Không merge, không push.
// Dùng: node scripts/factory-run.mjs tasks/queue/<ID>.md [--base factory]
// Đạt → commit trong worktree ../wt-<ID>, nhánh agent/<ID>. Lead đọc diff rồi merge vào `factory` bằng cách của repo.
// Mã thoát: 0 ĐẠT · 1 TRƯỢT · 2 LỖI · 3 BLOCKED (worker hỏi Lead — không tăng mức suy luận, không tính trượt).
// Chỉ dùng deepseek-flash; mức suy luận qua variant của OpenCode (`provider/model#variant`, đã kiểm 2026-10-22):
//   lần 1–2 = #high, lần 3 = #max; task ghi "Khó: có" → #max từ lần 1.
// Task "Loại: test-only": test mới chạy trên code base PHẢI trượt (chứng minh nó kiểm hành vi chưa có).
// Biến môi trường (tuỳ chọn): FACTORY_MODEL=deepseek/deepseek-flash · FACTORY_MODELS="m#high,m#high,m#max" (ghi đè cả kế hoạch)
//   · FACTORY_ATTEMPT_TIMEOUT_MIN=10
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DENY_CONFIG = join(ROOT, 'scripts', 'opencode.worker.json');
const LOG_DIR = join(ROOT, 'logs');
const ATTEMPT_TIMEOUT_MS = (Number(process.env.FACTORY_ATTEMPT_TIMEOUT_MIN) || 10) * 60 * 1000;
export const TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.(py|go)$/;
const IGNORED = new Set(['opencode.json']);

export function sh(cmd, args, opts = {}) {
  // OpenCode 2.x lấy thư mục dự án từ $PWD, không từ cwd: phải đặt PWD = cwd, nếu không worker sửa nhầm repo chính.
  const env = opts.cwd ? { ...process.env, PWD: opts.cwd } : process.env;
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env, ...opts });
  return { code: r.status ?? (r.error ? 1 : 0), out: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: r.stdout ?? '', error: r.error };
}
export function must(cmd, args, opts) {
  const r = sh(cmd, args, opts);
  if (r.code !== 0) throw new Error(`${cmd} ${args.join(' ')} thất bại:\n${r.out}`);
  return r.stdout.trim();
}
function tail(text, lines = 40, chars = 4000) {
  return text.trim().split('\n').slice(-lines).join('\n').slice(-chars);
}

// --- Đọc file task -------------------------------------------------------
// Mẫu mới (tasks/TEMPLATE.md): "## Phạm vi" chứa glob/thư mục bọc `...` (vd. `src/features/profile/**`, `tests/e2e/`);
// "## Nghiệm thu" chứa code block lệnh kiểm tra (hoặc dòng "Lệnh kiểm tra: `lệnh`").
// Mẫu cũ vẫn đọc được: "## File được phép sửa" (gạch đầu dòng) + "## Lệnh kiểm tra". Lệnh lấy NGUYÊN từ task.
export function parseTask(file) {
  const md = readFileSync(file, 'utf8').normalize('NFC');
  const sections = {};
  let current = '_head';
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) current = h[1].toLowerCase();
    else (sections[current] ??= []).push(line);
  }
  const find = (re) => Object.entries(sections).find(([k]) => re.test(k))?.[1] ?? [];
  const items = (lines) => lines.map((l) => l.match(/^\s*[-*]\s+`?([^`\s]+)`?/)?.[1]).filter(Boolean);
  const patterns = (lines) => {
    const ticked = lines.flatMap((l) => [...l.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]));
    const paths = ticked.filter((t) => /[/*.]/.test(t));
    return paths.length ? [...new Set(paths)] : items(lines);
  };
  const commands = (lines) => {
    const inBlock = [];
    let on = false;
    for (const l of lines) {
      if (/^\s*```/.test(l)) on = !on;
      else if (on && l.trim() && !l.trim().startsWith('#')) inBlock.push(l.trim());
    }
    if (inBlock.length) return inBlock;
    const labelled = lines.flatMap((l) => (/lệnh kiểm tra/i.test(l) ? [...l.matchAll(/`([^`]+)`/g)].map((m) => m[1]) : []));
    return labelled.length ? labelled : lines.map((l) => l.match(/^\s*[-*]\s+`(.+)`/)?.[1]).filter(Boolean);
  };
  const head = md.match(/^#\s+([A-Za-z0-9._-]+)\s*(?:[—–-]\s*(.+))?$/m);
  const id = head?.[1] ?? basename(file, '.md');
  const title = head?.[2]?.trim() || id;
  const allowed = patterns(find(/phạm vi|được phép|allowed/));
  const checks = commands(find(/nghiệm thu|kiểm tra|check/));
  if (!allowed.length) throw new Error('Task thiếu phạm vi ("## Phạm vi" với glob/thư mục bọc `...`).');
  if (!checks.length) throw new Error('Task thiếu lệnh kiểm tra (code block trong "## Nghiệm thu").');
  return { id, title, md, allowed, checks, ...taskMeta((sections._head ?? []).join('\n')) };
}

/**
 * Dòng đầu task: "Loại: code | test-only. Rủi ro: thấp | vừa | cao. Khó: có | không."
 * Thiếu → an toàn: code, rủi ro "vừa" (không tự merge), không khó. Mẫu chưa sửa ("thấp | vừa") → giá trị đầu.
 */
export function taskMeta(head) {
  const pick = (label, values, def) =>
    head.match(new RegExp(`${label}\\s*:\\s*[*_]*\\s*(${values.join('|')})`, 'iu'))?.[1]?.toLowerCase() ?? def;
  return {
    kind: pick('Loại', ['test-only', 'code'], 'code'),
    risk: pick('Rủi ro', ['thấp', 'vừa', 'cao'], 'vừa'),
    hard: pick('Khó', ['có', 'không'], 'không') === 'có',
  };
}

/** Kế hoạch các lần thử: chỉ deepseek-flash, mức suy luận high → high → max; task khó: max cả 3 lần. */
export function attemptPlan(task, env = process.env) {
  if (env.FACTORY_MODELS)
    return env.FACTORY_MODELS.split(',')
      .map((m) => m.trim())
      .filter(Boolean);
  const model = env.FACTORY_MODEL || 'deepseek/deepseek-flash';
  return (task.hard ? ['max', 'max', 'max'] : ['high', 'high', 'max']).map((e) => `${model}#${e}`);
}

/** "deepseek/deepseek-flash#max" → "max" (không có variant → "mặc định"). */
export const effortOf = (model) => model.split('#')[1] ?? 'mặc định';

/** Glob → RegExp. Thư mục ("a/b/" hoặc "a/b") = mọi file bên trong; `**` = nhiều cấp; `*`, `?` = trong 1 cấp. */
export function globToRegExp(pattern) {
  let p = pattern.replace(/^\.\//, '');
  if (p.endsWith('/')) p += '**';
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*' && p[i + 1] === '*') {
      if (p[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  // Không ký tự đại diện và không phải file có đuôi rõ ràng → coi là thư mục.
  const plainDir = !/[*?]/.test(pattern) && !/\.[A-Za-z0-9]+$/.test(pattern.replace(/\/$/, ''));
  return new RegExp(`^${re}${plainDir && !pattern.endsWith('/') ? '(?:/.*)?' : ''}$`);
}

/** File có nằm trong phạm vi task không. */
export function inScope(path, patterns) {
  return patterns.some((p) => globToRegExp(p).test(path));
}

/**
 * Danh sách deny cho worker, mở đúng phần task cho phép: vùng cấm (vd. `worker/**`) mà Phạm vi của task nằm trong
 * → bỏ dòng deny đó, chỉ cho phép các glob của task. Phạm vi vẫn bị verify() kiểm lại sau mỗi lần thử.
 */
export function workerPermissions(config, allowed) {
  const edit = { ...(config.permission?.edit ?? {}) };
  for (const [key, rule] of Object.entries(edit)) {
    if (rule !== 'deny' || !key.endsWith('/**')) continue;
    const prefix = key.slice(0, -2);
    const opened = allowed.filter((p) => p.replace(/^\.\//, '').startsWith(prefix));
    if (!opened.length) continue;
    delete edit[key];
    for (const p of opened) edit[p.endsWith('/') ? `${p}**` : p] = 'allow';
  }
  return { ...config, permission: { ...config.permission, edit } };
}

/** Câu trả lời cuối của worker = phần "text" cuối cùng trong log JSON của OpenCode. */
export function finalText(jsonl) {
  let last = '';
  for (const line of jsonl.split('\n')) {
    if (!line.includes('"text"')) continue;
    try {
      const e = JSON.parse(line);
      if (e.type === 'text' && typeof e.part?.text === 'string' && e.part.text.trim()) last = e.part.text;
    } catch {}
  }
  return last;
}

/** Dòng "BLOCKED: <câu hỏi>" trong câu trả lời cuối (cho phép bọc **, `, >, -). Không có → ''. */
export function blockedQuestion(text) {
  return text.match(/^[\s*`>-]*BLOCKED[*`]*\s*:[*`]*\s*(.+)$/m)?.[1]?.trim() ?? '';
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
  const outside = files.filter((f) => !inScope(f.path, task.allowed));
  if (outside.length)
    problems.push(`Sửa file ngoài phạm vi (${task.allowed.join(', ')}): ${outside.map((f) => f.path).join(', ')}`);
  const touchedTests = files.filter((f) => TEST_FILE.test(f.path) && f.status !== 'A');
  if (touchedTests.length) problems.push(`Sửa/xoá file test có sẵn: ${touchedTests.map((f) => f.path).join(', ')}`);
  const newTests = files.filter((f) => TEST_FILE.test(f.path) && f.status === 'A').map((f) => f.path);
  if (task.kind === 'test-only') {
    const code = files.filter((f) => !TEST_FILE.test(f.path));
    if (code.length) problems.push(`Task test-only chỉ được thêm test, không sửa code: ${code.map((f) => f.path).join(', ')}`);
    if (!newTests.length) problems.push('Task test-only nhưng không có file test mới.');
  }
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
  if (task.kind === 'test-only' && newTests.length && !problems.length) {
    // Worktree = code base + test mới → chạy test mới ở đây chính là "chạy trên base".
    const r = runTests(wt, newTests);
    if (!r.ran) problems.push(r.why);
    else if (r.code === 0)
      problems.push(
        `Test mới XANH trên code hiện tại (${newTests.join(', ')}) — task test-only phải viết test cho hành vi chưa có, chạy trên base phải trượt.`,
      );
    else if (!r.testsFailed)
      problems.push(`Test mới không chạy được (lỗi cú pháp/biên dịch, không phải trượt vì hành vi):\n${tail(r.out)}`);
  }
  return { ok: problems.length === 0, problems, files, flaky, newTests };
}

/** Chạy đúng các file test: e2e (thư mục e2e/) bằng Playwright, còn lại bằng runner unit của repo. */
export function runTests(wt, paths) {
  const e2e = paths.filter((p) => /(^|\/)e2e\//.test(p));
  const unit = paths.filter((p) => !e2e.includes(p));
  const runner = unitRunner(wt);
  if (unit.length && !runner) return { ran: false, why: `Không biết chạy test unit (không thấy vitest/jest): ${unit.join(', ')}` };
  let out = '';
  let code = 0;
  if (e2e.length) {
    const r = sh('npx', ['playwright', 'test', ...e2e], { cwd: wt });
    out += r.out;
    code ||= r.code;
  }
  if (unit.length) {
    const r = sh(runner[0], [...runner[1], ...unit], { cwd: wt });
    out += r.out;
    code ||= r.code;
  }
  // Trượt "thật" = có CA TEST báo failed — vitest: dòng "Tests  1 failed" (không tính "Test Files 1 failed" khi file
  // hỏng cú pháp, lúc đó dòng Tests là "no tests"); playwright: dòng tổng kết "  1 failed".
  const plain = out.replace(/\x1b\[[0-9;]*m/g, '');
  const testsFailed = /^\s*Tests\s+\d+\s+failed/m.test(plain) || /^\s*\d+\s+failed\s*$/m.test(plain);
  return { ran: true, code, out, testsFailed };
}

// Test trượt chỉ ở file worker KHÔNG đụng → chạy lại đúng các file đó 1 lần. Xanh = test chập chờn có sẵn, không tính
// worker trượt (tránh tăng mức suy luận vô ích). Trả danh sách file chập chờn, hoặc null.
function failedTestFiles(out) {
  const plain = out.replace(/\x1b\[[0-9;]*m/g, '');
  const e2e = [...plain.matchAll(/›\s+(\S+\.spec\.[cm]?[jt]sx?):\d+:\d+/g)].map((m) => m[1]);
  const unit = [...plain.matchAll(/^\s*FAIL\s+(\S+\.(?:test|spec)\.[cm]?[jt]sx?)/gm)].map((m) => m[1]);
  return { e2e: [...new Set(e2e)], unit: [...new Set(unit.filter((u) => !e2e.includes(u)))] };
}
export function unitRunner(wt) {
  try {
    const pkg = JSON.parse(readFileSync(join(wt, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.vitest) return ['npx', ['vitest', 'run']];
    if (deps.jest) return ['npx', ['jest']];
  } catch {}
  return null;
}
export function retryUntouched(wt, cmd, out, files, log = console.log) {
  const failed = failedTestFiles(out);
  const all = [...failed.e2e, ...failed.unit];
  if (!all.length) return null;
  const touched = new Set(files.map((f) => f.path));
  if (all.some((p) => touched.has(p))) return null;
  const runner = unitRunner(wt);
  if (failed.unit.length && !runner) return null;
  log(`  ↻ \`${cmd}\` trượt ở file worker không đụng (${all.join(', ')}) — chạy lại 1 lần`);
  if (failed.e2e.length && sh('npx', ['playwright', 'test', ...failed.e2e], { cwd: wt }).code !== 0) return null;
  if (failed.unit.length && sh(runner[0], [...runner[1], ...failed.unit], { cwd: wt }).code !== 0) return null;
  log('  ↻ chạy lại xanh → test chập chờn, không tính worker trượt');
  return all;
}

// --- Worker --------------------------------------------------------------
function prompt(task, feedback) {
  return [
    'Bạn là worker lập trình (coding agent) trong repo này. Đọc AGENTS.md (hàng rào chung) và docs/ARCHITECTURE.md §0 (module, hợp đồng, vùng cấm) trước.',
    'Cách cài đặt trong phạm vi do bạn tự quyết. Luật bắt buộc của Factory:',
    `1. CHỈ được tạo/sửa file nằm trong phạm vi: ${task.allowed.join(', ')}. Không đụng file nào khác.`,
    '2. KHÔNG sửa hay xoá file test có sẵn. Test mới đặt trong phạm vi được giao.',
    '3. Không thêm thư viện, không sửa file khai báo thư viện/lockfile/config build, không ghi dữ liệu thật, không gọi mạng.',
    '4. Không chạy git commit/push/merge/reset/checkout. Script điều phối sẽ tự commit.',
    `5. Trước khi kết thúc, tự chạy và làm cho pass: ${task.checks.join(' && ')}.`,
    '6. Luật nghiệp vụ mâu thuẫn, thiếu, hoặc test bắt buộc trái luật: DỪNG, không tự đặt luật; kết thúc bằng một dòng riêng "BLOCKED: <câu hỏi cụ thể + 1–2 phương án>". BLOCKED không bị tính là trượt.',
    '7. Câu trả lời cuối gồm đúng 4 mục: (1) Đã làm gì; (2) Quyết định thiết kế đã tự đưa ra + lý do; (3) Điều chưa chắc / đề xuất ngoài phạm vi; (4) Checklist nghiệm thu — mỗi mục trong "## Nghiệm thu" một dòng ✓/✗ kèm bằng chứng (lệnh đã chạy + kết quả, hoặc tên test kiểm mục đó).',
    ...(task.kind === 'test-only'
      ? [
          '8. Task test-only: CHỈ thêm file test. Test mới kiểm hành vi CHƯA có nên PHẢI trượt trên code hiện tại (script sẽ chạy để kiểm); các lệnh Nghiệm thu vẫn phải xanh.',
        ]
      : []),
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
  const text = finalText(r.stdout);
  const report = join(LOG_DIR, `${task.id}-${n}.report.md`);
  writeFileSync(report, text || '(worker không có câu trả lời cuối)');
  return { log, report, text, cost: costOf(r.stdout), code: r.code, timedOut: r.error?.code === 'ETIMEDOUT' };
}

export function installDeps(wt) {
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

  // Cổng e2e riêng theo task → nhiều worker chạy song song không dùng nhầm server build của nhau.
  if (!process.env.E2E_PORT) {
    let h = 0;
    for (const ch of task.id) h = (h * 31 + ch.charCodeAt(0)) % 997;
    process.env.E2E_PORT = String(4300 + h);
  }
  // `git config --worktree` bên dưới cần extensions.worktreeConfig (bật 1 lần cho repo, không đổi file nào).
  if (sh('git', ['config', '--get', 'extensions.worktreeConfig'], { cwd: ROOT }).stdout.trim() !== 'true')
    must('git', ['config', 'extensions.worktreeConfig', 'true'], { cwd: ROOT });
  must('git', ['worktree', 'add', wt, '-b', branch, base], { cwd: ROOT });
  // Khoá push chỉ trong worktree worker (cần extensions.worktreeConfig=true); repo chính + merge-to-v2.mjs vẫn push được.
  must('git', ['config', '--worktree', 'remote.origin.pushurl', 'DISABLED'], { cwd: wt });
  const baseSha = must('git', ['rev-parse', 'HEAD'], { cwd: wt });
  installDeps(wt);
  const denyConfig = JSON.parse(readFileSync(DENY_CONFIG, 'utf8'));
  writeFileSync(join(wt, 'opencode.json'), `${JSON.stringify(workerPermissions(denyConfig, task.allowed), null, 2)}\n`);

  // Chốt chặn: repo chính không được đổi trong lúc worker chạy.
  const mainState = () => must('git', ['status', '--porcelain'], { cwd: ROOT });
  const mainBefore = mainState();
  const history = [];
  let feedback = '';
  let result = { ok: false, problems: [], files: [] };
  let blocked = '';
  const MODELS = attemptPlan(task);
  console.log(`[${task.id}] Loại ${task.kind} · rủi ro ${task.risk} · khó ${task.hard ? 'có' : 'không'} · suy luận ${MODELS.map(effortOf).join(' → ')}`);
  for (let i = 0; i < MODELS.length; i++) {
    const n = i + 1;
    const model = MODELS[i];
    console.log(`\n[${task.id}] Lần ${n}/${MODELS.length} — ${model}`);
    const w = runWorker(wt, task, n, model, feedback);
    if (mainState() !== mainBefore) throw new Error(`Worker đã sửa repo chính ${ROOT}! Dừng ngay. Kiểm tra: git -C ${ROOT} status`);
    const question = blockedQuestion(w.text);
    if (question) {
      // Worker hỏi Lead về luật/test: dừng, không tăng mức suy luận, không tính trượt.
      blocked = question;
      history.push({ n, model, cost: w.cost, log: w.log, report: w.report, exit: w.code, timedOut: w.timedOut, ok: false, flaky: [] });
      console.log(`  worker exit=${w.code} · cost=$${w.cost.toFixed(4)} · BLOCKED`);
      break;
    }
    result = verify(wt, baseSha, task);
    history.push({ n, model, cost: w.cost, log: w.log, report: w.report, exit: w.code, timedOut: w.timedOut, ok: result.ok, flaky: result.flaky ?? [] });
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
  console.log(
    `Trạng thái: ${
      blocked
        ? 'BLOCKED — worker cần Lead trả lời (không tính trượt)'
        : result.ok
          ? `ĐẠT — commit ${commit} trên ${branch} (chưa merge, chưa push)`
          : `TRƯỢT — dừng sau ${history.length} lần`
    }`,
  );
  if (blocked) console.log(`Câu hỏi:    ${blocked}`);
  console.log(`Worktree:   ${wt}`);
  console.log(`Loại:       ${task.kind}`);
  console.log(`Rủi ro:     ${task.risk}`);
  console.log(`Khó:        ${task.hard ? 'có' : 'không'}`);
  console.log(`Suy luận:   ${history.map((h) => effortOf(h.model)).join(' → ') || '—'}`);
  console.log(`Số lần thử: ${history.length} (${history.map((h) => `${h.model}${h.ok ? ' ✓' : ' ✗'}`).join(', ')})`);
  console.log(`File đổi:   ${result.files.map((f) => `${f.status} ${f.path}`).join(', ') || '(không)'}`);
  console.log(`Chi phí:    $${total.toFixed(4)}`);
  const flaky = [...new Set(history.flatMap((h) => h.flaky))];
  if (flaky.length) console.log(`Chập chờn:  ${flaky.join(', ')} (trượt rồi xanh khi chạy lại; file worker không đụng)`);
  console.log(`Log:        ${history.map((h) => h.log).join(', ')}`);
  console.log(`Báo cáo:    ${history.map((h) => h.report).join(', ')}`);
  if (!result.ok && !blocked) console.log(`\nLỗi lần cuối:\n${result.problems.join('\n\n')}`);
  process.exit(blocked ? 3 : result.ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`LỖI: ${e.message}`);
    process.exit(2);
  }
}
