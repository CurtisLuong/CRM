// Test hàm thuần của factory-run.mjs. Chạy: node --test scripts/
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { blockedQuestion, finalText, inScope, parseTask } from './factory-run.mjs';

test('inScope: thư mục, glob nhiều cấp, file cụ thể', () => {
  const scope = ['src/features/profile/**', 'tests/e2e/', 'src/ui/display.ts', 'src/features/today', 'src/**/*.test.ts'];
  for (const ok of [
    'src/features/profile/route.tsx',
    'src/features/profile/parts/header.tsx',
    'tests/e2e/m4-profile.spec.ts',
    'src/ui/display.ts',
    'src/features/today/model.ts',
    'src/domain/x.test.ts',
  ])
    assert.equal(inScope(ok, scope), true, ok);
  for (const bad of [
    'src/features/profile2/route.tsx',
    'src/ui/display.tsx',
    'src/ui/Button.tsx',
    'tests/e2efake/x.spec.ts',
    'src/features/todayx/a.ts',
    'src/domain/x.ts',
    'package.json',
  ])
    assert.equal(inScope(bad, scope), false, bad);
});

test('inScope: * chỉ trong 1 cấp, ? một ký tự', () => {
  assert.equal(inScope('docs/a.md', ['docs/*.md']), true);
  assert.equal(inScope('docs/v3/a.md', ['docs/*.md']), false);
  assert.equal(inScope('src/a1.ts', ['src/a?.ts']), true);
});

test('blockedQuestion: đầu dòng, có/không bọc markdown; không bắt chữ giữa câu', () => {
  assert.equal(blockedQuestion('Đã xem.\nBLOCKED: Hạn tính từ đầu hay cuối khung?'), 'Hạn tính từ đầu hay cuối khung?');
  assert.equal(blockedQuestion('**BLOCKED:** Test 3 trái luật 2 — sửa test hay luật?'), 'Test 3 trái luật 2 — sửa test hay luật?');
  assert.equal(blockedQuestion('- `BLOCKED`: thiếu số chuẩn'), 'thiếu số chuẩn');
  assert.equal(blockedQuestion('Không có gì bị BLOCKED: mọi thứ ổn'), '');
  assert.equal(blockedQuestion(''), '');
});

test('finalText: phần text cuối cùng trong log JSON của OpenCode', () => {
  const jsonl = [
    JSON.stringify({ type: 'step_start' }),
    JSON.stringify({ type: 'text', part: { type: 'text', text: 'Đang làm…' } }),
    'không phải json',
    JSON.stringify({ type: 'tool_use', part: { text: 'bỏ qua' } }),
    JSON.stringify({ type: 'text', part: { type: 'text', text: '1. Đã làm\nBLOCKED: hỏi' } }),
    JSON.stringify({ type: 'step_finish', part: { cost: 0.01 } }),
  ].join('\n');
  assert.equal(finalText(jsonl), '1. Đã làm\nBLOCKED: hỏi');
  assert.equal(finalText(''), '');
});

test('parseTask: mẫu mới (Phạm vi glob + Nghiệm thu code block)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ft-'));
  const file = join(dir, 'X1.md');
  writeFileSync(
    file,
    [
      '# X1 — Thử mẫu mới',
      'Loại: code.',
      '## Mục tiêu',
      'Gì đó với `src/domain/x.ts` (chỉ nhắc, không phải phạm vi).',
      '## Phạm vi',
      'Được sửa: `src/features/profile/**`, `src/ui/display.ts`. Được tạo test mới trong `tests/features/profile/`.',
      '## Nghiệm thu',
      '- Test bắt buộc: `tests/features/profile/x.test.ts`',
      '```bash',
      'npm run check',
      'npx playwright test tests/e2e/m4-profile.spec.ts',
      '```',
    ].join('\n'),
  );
  const t = parseTask(file);
  assert.equal(t.id, 'X1');
  assert.equal(t.title, 'Thử mẫu mới');
  assert.deepEqual(t.allowed, ['src/features/profile/**', 'src/ui/display.ts', 'tests/features/profile/']);
  assert.deepEqual(t.checks, ['npm run check', 'npx playwright test tests/e2e/m4-profile.spec.ts']);
});

test('parseTask: mẫu cũ vẫn đọc được', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ft-'));
  const file = join(dir, 'Y1.md');
  writeFileSync(
    file,
    ['# Y1 — Cũ', '## File được phép sửa', '- `src/a.ts`', '- `tests/a.test.ts`', '## Lệnh kiểm tra', '```bash', 'npm run check', '```'].join('\n'),
  );
  const t = parseTask(file);
  assert.deepEqual(t.allowed, ['src/a.ts', 'tests/a.test.ts']);
  assert.deepEqual(t.checks, ['npm run check']);
});
