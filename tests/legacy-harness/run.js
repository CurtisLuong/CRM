#!/usr/bin/env node
// Sinh / kiểm tra golden output của logic v1 (T0.4).
//   node tests/legacy-harness/run.js            → chạy mọi ca, ghi tests/golden/*.json, báo file nào đổi
//   node tests/legacy-harness/run.js --check    → chỉ so sánh, exit 1 nếu khác golden đã lưu (dùng trong CI / trước PR)
//   node tests/legacy-harness/run.js deadlines  → chỉ chạy các ca có tên chứa chuỗi này
'use strict';
process.env.TZ = 'Asia/Ho_Chi_Minh';
const fs = require('node:fs');
const path = require('node:path');
const { loadV1 } = require('./load-v1');
const { cases } = require('./cases');

const GOLDEN = path.join(__dirname, '..', 'golden');
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'legacy-customers.json');
const args = process.argv.slice(2);
const check = args.includes('--check');
const filter = args.find((a) => !a.startsWith('--'));

// JSON ổn định: khoá sắp xếp, Date → ISO, NaN/Infinity giữ dạng chuỗi (khác với null), bỏ hàm.
function canon(v, seen = new Set()) {
  if (v === undefined) return undefined;
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
  if (typeof v === 'function') return undefined;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString();
  if (seen.has(v)) return '[Circular]';
  seen.add(v);
  let out;
  if (Array.isArray(v)) out = v.map((x) => { const c = canon(x, seen); return c === undefined ? null : c; });
  else {
    out = {};
    for (const k of Object.keys(v).sort()) { const c = canon(v[k], seen); if (c !== undefined) out[k] = c; }
  }
  seen.delete(v);
  return out;
}
const serialize = (v) => JSON.stringify(canon(v), null, 2) + '\n';

(async () => {
  const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  fs.mkdirSync(GOLDEN, { recursive: true });
  let changed = 0, failed = 0, same = 0;
  for (const c of cases) {
    if (filter && !c.name.includes(filter)) continue;
    const file = path.join(GOLDEN, c.name + '.json');
    let body;
    try {
      const h = loadV1({ now: fx.now });
      const result = await c.build(h, fx);
      body = serialize({ _golden: { case: c.name, desc: c.desc, fixture: 'tests/fixtures/legacy-customers.json', now: fx.now, tz: process.env.TZ }, result });
    } catch (e) {
      failed++;
      console.error(`✗ ${c.name}: ${e.stack || e.message}`);
      continue;
    }
    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (prev === body) { same++; console.log(`= ${c.name}`); continue; }
    changed++;
    if (check) console.error(`≠ ${c.name}: khác golden đã lưu (${path.relative(process.cwd(), file)})`);
    else { fs.writeFileSync(file, body); console.log(`${prev == null ? '+' : '~'} ${c.name} → ${path.relative(process.cwd(), file)}`); }
  }
  console.log(`\n${same} giống · ${changed} ${check ? 'khác' : 'đã ghi'} · ${failed} lỗi`);
  process.exit(failed || (check && changed) ? 1 : 0);
})();
