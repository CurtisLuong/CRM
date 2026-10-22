// node --test scripts/factory-workers.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { taskWorkers, workerPlan } from './factory-run.mjs';
import {
  claudeSettings,
  isQuotaError,
  needsLocalServer,
  reviewersFor,
  WORKERS,
  workerFromCommit,
  workerOf,
} from './factory-workers.mjs';

test('taskWorkers: đọc "Worker:" và "Dự phòng:" ở dòng đầu task; mã lạ/thiếu → rỗng', () => {
  assert.deepEqual(taskWorkers('Loại: code. Rủi ro: thấp. Worker: haiku. Dự phòng: luna.'), { worker: 'haiku', fallback: 'luna' });
  assert.deepEqual(taskWorkers('Worker: **Luna**. Fallback: deepseek'), { worker: 'luna', fallback: 'deepseek' });
  assert.deepEqual(taskWorkers('Worker: sonnet.'), { worker: '', fallback: '' });
  assert.deepEqual(taskWorkers('Loại: code.'), { worker: '', fallback: '' });
});

test('workerPlan: high → high → max (luna: xhigh); khó → mức cao nhất cả 3', () => {
  assert.deepEqual(
    workerPlan(WORKERS.haiku, { hard: false }).map((p) => p.effort),
    ['high', 'high', 'max'],
  );
  assert.deepEqual(
    workerPlan(WORKERS.luna, { hard: true }).map((p) => p.label),
    Array(3).fill('gpt-6-luna@xhigh'),
  );
  assert.deepEqual(
    workerPlan(WORKERS.deepseek, { hard: false }, {}).map((p) => p.label),
    ['deepseek/deepseek-flash#high', 'deepseek/deepseek-flash#high', 'deepseek/deepseek-flash#max'],
  );
  assert.throws(() => workerOf('sonnet'), /không hợp lệ/);
});

test('claudeSettings: deny của opencode.worker.json → luật Claude Code, chỉ sửa trong worktree, sandbox Bash', () => {
  const s = claudeSettings({
    permission: { edit: { '*': 'allow', 'docs/**': 'deny', 'src/x.ts': 'allow' }, bash: { '*': 'allow', 'git commit*': 'deny', 'gh *': 'deny' } },
  });
  assert.ok(s.permissions.allow.includes('Edit(./**)'));
  assert.ok(!s.permissions.allow.includes('Edit'));
  for (const rule of ['Edit(./docs/**)', 'Write(./docs/**)', 'Bash(git commit:*)', 'Bash(gh:*)', 'WebSearch', 'WebFetch'])
    assert.ok(s.permissions.deny.includes(rule), rule);
  assert.ok(!s.permissions.deny.some((r) => r.includes('src/x.ts')));
  assert.equal(s.sandbox.enabled, true);
  assert.equal(s.sandbox.allowUnsandboxedCommands, false);
});

test('isQuotaError: nhận đúng chữ hết hạn mức của từng CLI; lỗi thường / hết giờ / thành công → không', () => {
  assert.equal(isQuotaError('haiku', { code: 1, out: '', text: "You've hit your limit · resets 3pm" }), true);
  assert.equal(isQuotaError('haiku', { code: 0, isError: true, out: '', text: 'Claude AI usage limit reached|1761' }), true);
  assert.equal(isQuotaError('luna', { code: 1, out: '{"type":"turn.failed","error":{"code":"usage_limit_reached"}}', text: '' }), true);
  assert.equal(isQuotaError('deepseek', { code: 1, out: 'APIError 402 Insufficient Balance', text: '' }), true);
  assert.equal(isQuotaError('deepseek', { code: 1, out: 'TypeError: x is undefined', text: '' }), false);
  assert.equal(isQuotaError('haiku', { code: 1, out: 'rate_limit_error', text: '', timedOut: true }), false);
  // Worker xong việc bình thường, chỉ nhắc tới "429" trong báo cáo → không phải hết hạn mức.
  assert.equal(isQuotaError('luna', { code: 0, out: '', text: 'Đã sửa lỗi 429 trong retry' }), false);
});

test('reviewersFor: reviewer luôn khác worker', () => {
  assert.deepEqual(reviewersFor('deepseek'), ['luna', 'haiku']);
  assert.deepEqual(reviewersFor('haiku'), ['deepseek']);
  assert.deepEqual(reviewersFor('luna'), ['deepseek']);
  for (const w of ['deepseek', 'haiku', 'luna']) assert.ok(!reviewersFor(w).includes(w));
});

test('workerFromCommit: đọc worker trong commit factory-run (cả dạng cũ deepseek/…)', () => {
  assert.equal(workerFromCommit('feat(X): y\n\nWorker: haiku (claude-haiku-5-5@high), lần 1'), 'haiku');
  assert.equal(workerFromCommit('Worker: deepseek/deepseek-flash#high, lần 1/3'), 'deepseek');
  assert.equal(workerFromCommit('merge: x'), '');
});

test('needsLocalServer: task có e2e/playwright → luna cần mở mạng sandbox cho localhost', () => {
  assert.equal(needsLocalServer(['npm run check', 'npx playwright test tests/e2e/a.spec.ts']), true);
  assert.equal(needsLocalServer(['npm run e2e']), true);
  assert.equal(needsLocalServer(['npm run check']), false);
});
