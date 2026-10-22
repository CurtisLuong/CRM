// Test hàm thuần của factory-review.mjs / factory-merge.mjs. Chạy: node --test scripts/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkedOutAt, defaultChecks } from './factory-merge.mjs';
import { parseReview } from './factory-review.mjs';

test('parseReview: khối ```json cuối; verdict theo cờ (lấy mức nghiêm hơn)', () => {
  const ok = parseReview('Đã đọc.\n```json\n{"verdict":"ok","flags":[],"summary":"Ổn"}\n```');
  assert.deepEqual(ok, { verdict: 'ok', flags: [], summary: 'Ổn' });
  const lied = parseReview('```json\n{"verdict":"ok","flags":[{"point":3,"severity":"warn","file":"a.test.ts","detail":"assert hằng"}]}\n```');
  assert.equal(lied.verdict, 'flag');
  const block = parseReview('{"verdict":"flag","flags":[{"point":1,"severity":"block","detail":"bịa luật 45 phút"}]}');
  assert.equal(block.verdict, 'block');
  assert.equal(block.flags[0].file, '');
});

test('parseReview: không có JSON → flag để Lead xem; verdict xấu không cờ → thêm cờ giải thích', () => {
  const none = parseReview('Tôi thấy ổn.');
  assert.equal(none.verdict, 'flag');
  assert.equal(none.flags.length, 1);
  const bare = parseReview('{"verdict":"block","flags":[],"summary":"Sai số chuẩn"}');
  assert.equal(bare.verdict, 'block');
  assert.equal(bare.flags[0].detail, 'Sai số chuẩn');
});

test('defaultChecks: check (hoặc test) + e2e theo package.json', () => {
  assert.deepEqual(defaultChecks({ scripts: { check: 'x', e2e: 'y', test: 'z' } }), ['npm run check', 'npm run e2e']);
  assert.deepEqual(defaultChecks({ scripts: { test: 'z' } }), ['npm test']);
  assert.deepEqual(defaultChecks({}), []);
});

test('checkedOutAt: tìm thư mục đang mở nhánh', () => {
  const p = 'worktree /a\nHEAD 1\nbranch refs/heads/factory\n\nworktree /b\nHEAD 2\ndetached\n';
  assert.equal(checkedOutAt(p, 'factory'), '/a');
  assert.equal(checkedOutAt(p, 'factory2'), null);
});
