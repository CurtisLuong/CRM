/// <reference types="node" />
// T2.B2 — Parity: src/domain/velocity phải cho ra ĐÚNG như v1 (legacy/js/velocity.js + runSlaAutomation trong
// legacy/js/app.js): (1) khớp golden velocity.json / sla-automation.json, (2) so trực tiếp với v1 chạy thật
// (load-v1.js, đồng hồ giả) trên fixture ở nhiều thời điểm.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { normStage } from '@/domain/customer';
import type { StageFollowup } from '@/domain/velocity';
import * as V from '@/domain/velocity';

type V1Ctx = {
  ctx: { [k: string]: unknown; FOLLOWUP: { forStage: StageFollowup } };
  run: (code: string) => unknown;
  setNow: (v: string | number) => void;
  now: () => number;
};
const require = createRequire(import.meta.url);
// load-v1.js đặt process.env.TZ = 'Asia/Ho_Chi_Minh' khi nạp → v2 cũng tính giờ theo VN như golden.
const { loadV1 } = require('../../legacy-harness/load-v1.js') as { loadV1: (o?: { now?: string | number }) => V1Ctx };

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, '..', '..');
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures', 'legacy-customers.json'), 'utf8')) as {
  now: string;
  users: { me: string; colleague: string };
  customers: (Record<string, unknown> & { _case?: string })[];
};
const golden = <T>(name: string) =>
  (JSON.parse(fs.readFileSync(path.join(ROOT, 'golden', `${name}.json`), 'utf8')) as { result: T }).result;
type VelocityGolden = {
  perCustomer: Record<string, unknown>;
  newLeadStart: Record<string, string>;
  fmt: Record<string, string>;
};
type SlaGolden = { first: { calls: unknown[]; toasts: string[] }; secondRun: { calls: unknown[] } };

const strip = ({ _case, ...rest }: Record<string, unknown>) => rest as unknown as Customer;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const NOW = Date.parse(fixture.now);
const ME = fixture.users.me;

// JSON ổn định như tests/legacy-harness/run.js: NaN/Infinity → chuỗi, Date → ISO, bỏ undefined.
function canon(v: unknown): unknown {
  if (v === undefined || v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
  if (typeof v === 'function') return undefined;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    const d = v as Date;
    return Number.isNaN(d.getTime()) ? 'Invalid Date' : d.toISOString();
  }
  if (Array.isArray(v)) return v.map((x) => canon(x) ?? null);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as object).sort()) {
    const c = canon((v as Record<string, unknown>)[k]);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

// v1 trả thêm `cls` (class CSS màu nhãn) — v2 để giao diện tự chọn theo state.
const CLS = { ok: 'call-far', warn: 'call-soon', over: 'call-missed' } as const;
const withCls = (st: V.SlaStatus | null) => (st ? { ...st, cls: CLS[st.state] } : null);

function v2PerCustomer(c: Customer, now: number) {
  return {
    normStage: normStage(c.care_stage),
    phaseOf: V.phaseOf(c),
    status: withCls(V.status(c, now)),
    autoAction: V.autoAction(c, now),
    stageEnteredAt: V.stageEnteredAt(c),
    bookingSteps: V.bookingSteps(c, now),
  };
}

describe('golden velocity.json', () => {
  const g = golden<VelocityGolden>('velocity');
  for (const raw of fixture.customers) {
    it(`${String(raw.id).slice(-2)} — ${raw._case}`, () => {
      const c = strip(clone(raw));
      expect(canon(v2PerCustomer(c, NOW))).toEqual(g.perCustomer[c.id]);
    });
  }
  it('newLeadStart theo giờ đăng ký (0h–23h)', () => {
    const out = Object.fromEntries(
      Array.from({ length: 24 }, (_, hh) => {
        const t = Date.parse(`2026-12-01T${String(hh).padStart(2, '0')}:15:00+07:00`);
        return [String(hh), new Date(V.newLeadStart(t)).toISOString()];
      }),
    );
    expect(out).toEqual(g.newLeadStart);
  });
  it('fmt', () => {
    const out = Object.fromEntries(Object.keys(g.fmt).map((d) => [d, V.fmt(Number(d))]));
    expect(out).toEqual(g.fmt);
  });
});

/** Nạp khách như refreshList v1 (đổi bậc cũ trong bộ nhớ). */
function setupV1(now: string | number) {
  const h = loadV1({ now });
  h.ctx.__in = clone(fixture.customers.map(strip));
  h.ctx.__me = ME;
  h.run(`currentUser = { id: __me, email: 'sale@example.test' }; allCustomers = __in;
    for (const c of allCustomers) if (CARE_STAGE_LEGACY[c.care_stage]) c.care_stage = normStage(c.care_stage);`);
  return h;
}
const v1ForStage =
  (h: V1Ctx): StageFollowup =>
  (c, stage) =>
    h.ctx.FOLLOWUP.forStage(c, stage);

/** Writer giả: ghi patch vào danh sách trong bộ nhớ như CRM.update giả của golden. */
function memoryWriter(list: Customer[]) {
  const calls: { id: string; payload: unknown; opts: unknown }[] = [];
  const writer: V.CustomerWriter = {
    async update(id, patch, opts) {
      calls.push({ id, payload: clone(patch), opts: opts ? clone(opts) : null });
      const c = list.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
      return c;
    },
  };
  return { writer, calls };
}

describe('golden sla-automation.json', () => {
  it('kế hoạch = payload v1 gửi CRM.update; ghi xong chạy lại không còn gì', async () => {
    const g = golden<SlaGolden>('sla-automation');
    const h = setupV1(NOW);
    const list = clone(h.run('allCustomers')) as Customer[];
    const plan = V.planSlaAutomation(list, NOW, ME, v1ForStage(h));
    const { writer, calls } = memoryWriter(list);
    const res = await V.applySlaPlan(plan, writer);
    expect(res.failed).toEqual([]);
    expect(canon(calls)).toEqual(g.first.calls);
    expect(V.slaPlanMessage(plan)).toBe(g.first.toasts[0]);
    const again = V.planSlaAutomation(list, NOW, ME, v1ForStage(h));
    expect(again.changes).toEqual(g.secondRun.calls);
    expect(V.slaPlanMessage(again)).toBeNull();
  });
});

describe('so trực tiếp với v1 ở nhiều thời điểm', () => {
  const clocks = [
    '2026-10-09T23:00:00+07:00',
    '2026-10-17T10:00:00+07:00',
    '2026-10-30T21:59:00+07:00',
    '2026-11-15T06:00:00+07:00',
    '2026-12-01T10:00:00+07:00',
    '2027-02-20T03:00:00+07:00',
  ];
  for (const iso of clocks) {
    it(iso, async () => {
      const now = Date.parse(iso);
      const h = loadV1({ now });
      for (const raw of fixture.customers) {
        const c = strip(clone(raw));
        h.ctx.__c = clone(c);
        const v1 = clone(
          h.run(`({ phaseOf: VELOCITY.phaseOf(__c), status: VELOCITY.status(__c, ${now}),
            autoAction: VELOCITY.autoAction(__c, ${now}), stageEnteredAt: VELOCITY.stageEnteredAt(__c),
            bookingSteps: VELOCITY.bookingSteps(__c, ${now}) })`),
        );
        const v2 = v2PerCustomer(c, now);
        expect(canon({ ...v2, normStage: undefined })).toEqual(canon(v1));
      }
      // runSlaAutomation thật ở cùng đồng hồ
      const hv = setupV1(now);
      const list = clone(hv.run('allCustomers')) as Customer[];
      hv.run(`globalThis.__calls = []; CRM.update = async (id, payload, opts) => { __calls.push({ id, payload, opts: opts || null }); };
        showToast = () => {};`);
      await hv.run('runSlaAutomation()');
      const plan = V.planSlaAutomation(list, now, ME, v1ForStage(hv));
      const { writer, calls } = memoryWriter(clone(list));
      await V.applySlaPlan(plan, writer);
      expect(canon(calls)).toEqual(canon(clone(hv.run('__calls'))));
    });
  }
});
