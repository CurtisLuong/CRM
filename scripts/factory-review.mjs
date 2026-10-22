#!/usr/bin/env node
// AI Factory — review tự động 1 nhánh worker (chỉ đọc, không sửa, không merge). Reviewer luôn KHÁC worker:
//   worker deepseek → luna (gpt-6-luna@xhigh; hết hạn mức → haiku@max) · worker haiku/luna → deepseek-flash#max.
// Dùng: node scripts/factory-review.mjs tasks/<thư mục>/<ID>.md [--branch agent/<ID>] [--base factory] [--worker <mã>]
//   --worker thiếu → đọc dòng "Worker: <mã>" trong commit của nhánh (factory-run ghi).
// Đầu vào cho reviewer: diff (base...nhánh) + file task + AGENTS.md + docs/ARCHITECTURE.md + báo cáo cuối của worker.
// Đầu ra: logs/<ID>-review.json = {verdict, flags:[{point, severity, file, detail}], summary, cost}; in 1 dòng + JSON.
//   verdict: "ok" (không cờ) · "flag" (có điểm cần Lead xem) · "block" (vi phạm xương sống).
// Mã thoát: 0 ok · 1 flag/block · 2 lỗi. Biến môi trường: FACTORY_REVIEW_MODEL (model reviewer deepseek, mặc định deepseek/deepseek-flash#max).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { must, parseTask } from './factory-run.mjs';
import { isQuotaError, reviewersFor, workerFromCommit, workerOf } from './factory-workers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = join(ROOT, 'logs');
const TIMEOUT_MS = (Number(process.env.FACTORY_REVIEW_TIMEOUT_MIN) || 10) * 60 * 1000;
const POINTS = [
  'Luật nghiệp vụ + số chuẩn của task có làm đúng không; worker có tự bịa luật mới, hoặc che lỗi bằng điều kiện/chuỗi đặc biệt chỉ để test xanh không.',
  'Hợp đồng (mục "Hợp đồng" của task + docs/ARCHITECTURE.md), phạm vi (mục "Phạm vi"), hàng rào PHẢI/CẤM (AGENTS.md + task) có bị phá không.',
  'Test mới có kiểm thật hành vi không (không pass rỗng, không assert hằng, không mock luôn thứ cần kiểm, có đúng số chuẩn trong task).',
  'Đọc "quyết định thiết kế" trong báo cáo worker: có quyết định nào trái mục tiêu/luật/hợp đồng không. Khác phong cách hoặc khác cách Lead sẽ làm KHÔNG phải lỗi.',
];

/** Lấy JSON cuối cùng trong câu trả lời (khối ```json``` hoặc object trần). Chuẩn hoá verdict theo cờ (lấy mức nghiêm hơn). */
export function parseReview(text) {
  const candidates = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]).reverse();
  const end = text.lastIndexOf('}');
  // Mọi vị trí '{' trước '}' cuối, từ gần nhất ra xa (object ngoài cùng nằm xa nhất).
  for (let i = end; i > 0; ) {
    i = text.lastIndexOf('{', i - 1);
    if (i < 0) break;
    candidates.push(text.slice(i, end + 1));
  }
  let raw = null;
  for (const c of candidates) {
    try {
      const v = JSON.parse(c);
      if (v && typeof v === 'object' && ('verdict' in v || 'flags' in v)) {
        raw = v;
        break;
      }
    } catch {}
  }
  if (!raw)
    return {
      verdict: 'flag',
      flags: [{ point: 0, severity: 'warn', file: '', detail: 'Reviewer không trả JSON đọc được — Lead review tay.' }],
      summary: '',
    };
  const flags = (Array.isArray(raw.flags) ? raw.flags : [])
    .filter((f) => f && typeof f === 'object')
    .map((f) => ({
      point: Number(f.point) || 0,
      severity: f.severity === 'block' ? 'block' : 'warn',
      file: String(f.file ?? ''),
      detail: String(f.detail ?? f.message ?? '').trim(),
    }))
    .filter((f) => f.detail);
  const fromFlags = flags.some((f) => f.severity === 'block') ? 'block' : flags.length ? 'flag' : 'ok';
  const rank = { ok: 0, flag: 1, block: 2 };
  const said = raw.verdict in rank ? raw.verdict : 'ok';
  const verdict = rank[said] > rank[fromFlags] ? said : fromFlags;
  // Reviewer nói "flag/block" mà không nêu cờ nào → vẫn giữ để Lead xem, thêm cờ giải thích.
  if (verdict !== 'ok' && !flags.length)
    flags.push({ point: 0, severity: verdict === 'block' ? 'block' : 'warn', file: '', detail: String(raw.summary || 'Reviewer báo có vấn đề nhưng không nêu cụ thể.') });
  return { verdict, flags, summary: String(raw.summary ?? '').trim() };
}

function prompt(task) {
  return [
    'Bạn là REVIEWER của AI Factory. Chỉ đọc, không sửa file, không chạy lệnh. Các file trong thư mục hiện tại:',
    '- task.md: đặc tả task (mục tiêu, luật nghiệp vụ + số chuẩn, hợp đồng, phạm vi, PHẢI/CẤM, nghiệm thu).',
    '- AGENTS.md: hàng rào chung cho mọi task. ARCHITECTURE.md (nếu có): module, hợp đồng, vùng cấm.',
    '- diff.patch: toàn bộ thay đổi của worker so với base.',
    '- worker-report.md: báo cáo cuối của worker (có mục "quyết định thiết kế").',
    '',
    'Đọc HẾT các file rồi kiểm đúng 4 điểm:',
    ...POINTS.map((p, i) => `${i + 1}. ${p}`),
    '',
    'Script đã kiểm máy móc: file ngoài phạm vi glob, sửa/xoá test có sẵn, lệnh nghiệm thu xanh. Đừng lặp các điểm đó trừ khi thấy bằng chứng trong diff.',
    'Chỉ nêu vấn đề THẬT có bằng chứng trong diff (tên file + mô tả ngắn). Không nêu góp ý phong cách, đặt tên, định dạng.',
    'severity "block" = vi phạm xương sống (sai luật/số chuẩn, bịa luật, phá hợp đồng/hàng rào, test rỗng). "warn" = đáng Lead xem nhưng không chắc là lỗi.',
    '',
    'Câu trả lời cuối: CHỈ một khối ```json theo đúng dạng (viết tiếng Việt trong detail/summary):',
    '```json',
    '{"verdict": "ok | flag | block", "flags": [{"point": 1, "severity": "block | warn", "file": "đường/dẫn", "detail": "vấn đề + bằng chứng"}], "summary": "1–2 câu"}',
    '```',
    'Không có vấn đề → {"verdict": "ok", "flags": [], "summary": "..."}.',
    `Task: ${task.id} — ${task.title}`,
  ].join('\n');
}

function latestWorkerReport(id) {
  if (!existsSync(LOG_DIR)) return '';
  const reports = readdirSync(LOG_DIR)
    .filter((f) => f.startsWith(`${id}-`) && f.endsWith('.report.md'))
    .sort((a, b) => Number(b.match(/-(\d+)\.report/)?.[1] ?? 0) - Number(a.match(/-(\d+)\.report/)?.[1] ?? 0));
  return reports.length ? readFileSync(join(LOG_DIR, reports[0]), 'utf8') : '';
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const taskFile = args.find((a, i) => !a.startsWith('--') && !['--branch', '--base', '--worker'].includes(args[i - 1]));
  if (!taskFile) {
    console.error('Dùng: node scripts/factory-review.mjs tasks/<thư mục>/<ID>.md [--branch agent/<ID>] [--base factory]');
    return 2;
  }
  const task = parseTask(resolve(taskFile));
  const branch = opt('--branch') ?? `agent/${task.id}`;
  const base = opt('--base') ?? 'factory';
  const diff = must('git', ['diff', '-U10', `${base}...${branch}`], { cwd: ROOT });
  const worker = opt('--worker') || workerFromCommit(must('git', ['log', '-1', '--format=%B', branch], { cwd: ROOT })) || 'deepseek';
  if (!diff.trim()) throw new Error(`Không có diff giữa ${base} và ${branch}.`);

  // Thư mục tạm, quyền chỉ đọc: reviewer không thể sửa repo hay chạy lệnh.
  const dir = mkdtempSync(join(tmpdir(), `review-${task.id}-`));
  try {
    writeFileSync(join(dir, 'task.md'), task.md);
    writeFileSync(join(dir, 'diff.patch'), diff);
    writeFileSync(join(dir, 'worker-report.md'), latestWorkerReport(task.id) || '(không có báo cáo worker)');
    for (const [src, dest] of [
      ['AGENTS.md', 'AGENTS.md'],
      ['docs/ARCHITECTURE.md', 'ARCHITECTURE.md'],
    ])
      if (existsSync(join(ROOT, src))) writeFileSync(join(dir, dest), readFileSync(join(ROOT, src)));
    // Thử lần lượt reviewer khác worker; hết hạn mức → reviewer kế tiếp. Lỗi khác → dừng (Lead review tay).
    let r = null;
    let reviewer = '';
    const tried = [];
    for (const name of reviewersFor(worker)) {
      reviewer = name;
      r = workerOf(name).review({ dir, prompt: prompt(task), title: `${task.id} review`, timeoutMs: TIMEOUT_MS });
      mkdirSync(LOG_DIR, { recursive: true });
      writeFileSync(join(LOG_DIR, `${task.id}-review.jsonl`), r.stdout);
      if (!isQuotaError(name, { ...r, timedOut: r.error?.code === 'ETIMEDOUT' })) break;
      tried.push(`${name} hết hạn mức`);
      r = null;
    }
    if (!r) throw new Error(`Không còn reviewer: ${tried.join(', ')}.`);
    if (r.error?.code === 'ETIMEDOUT') throw new Error(`Reviewer ${reviewer} hết giờ (${TIMEOUT_MS / 60000} phút).`);
    if (!r.text) throw new Error(`Reviewer ${reviewer} không có câu trả lời (exit ${r.code}).\n${r.out.slice(-2000)}`);
    const review = {
      task: task.id,
      branch,
      base,
      worker,
      reviewer,
      model: r.model,
      ...parseReview(r.text),
      cost: r.cost || 0,
      tokens: r.tokens ?? { input: 0, output: 0 },
      ...(tried.length ? { skipped: tried } : {}),
    };
    writeFileSync(join(LOG_DIR, `${task.id}-review.json`), `${JSON.stringify(review, null, 2)}\n`);
    console.log(`REVIEW ${task.id} (worker ${worker} → reviewer ${reviewer}): ${review.verdict} · ${review.flags.length} cờ · $${review.cost.toFixed(4)}`);
    console.log(JSON.stringify(review));
    return review.verdict === 'ok' ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error(`LỖI: ${e.message}`);
    process.exit(2);
  }
}
