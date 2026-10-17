/// <reference types="node" />
// T2.B1 — nhịp follow-up + mẫu Zalo (D-005): khớp golden T0.4 và parity trực tiếp với v1 (legacy/js/followup.js).

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { CARE_STAGE_OPTIONS } from '@/config/stages';
import { type CallAttempt, type Customer, callAttemptsOf } from '@/domain/customer';
import {
  afterCall,
  callSlots,
  fillGreeting,
  firstCall,
  forStage,
  scheduleLabel,
  slotOfTime,
  suggestTemplates,
  upgradeTplText,
  windowAfter,
} from '@/domain/followup';
import { canon, caseLabels, fixture, golden, loadCustomers } from '../deadlines/golden';

const H = 3600000;
const DAY = 86400000;
const me = fixture.users.me;
const fxNow = Date.parse(fixture.now);
const customers = loadCustomers();
const mine = customers.filter((c) => !c.owner_id || c.owner_id === me); // v1 statsSource = allCustomers.filter(isMine)

type Fn = (...args: unknown[]) => unknown;
type V1 = { ctx: Record<string, unknown>; run(code: string): unknown; setNow(v: number | string): void };
const { loadV1 } = createRequire(import.meta.url)('../../legacy-harness/load-v1.js') as {
  loadV1: (opts?: { now?: string | number }) => V1;
};
const v1 = loadV1();
const F = v1.ctx.FOLLOWUP as Record<string, Fn>;
const json = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
/** Gọi FOLLOWUP.<fn> (hoặc hàm top-level app.js) của v1 lúc `now`, kết quả chép sang realm này. */
function callV1(now: number, fn: string, ...args: unknown[]): unknown {
  v1.setNow(now);
  const f = (F[fn] ?? v1.ctx[fn]) as Fn | undefined;
  return json(f?.(...args));
}
function setV1Stats(list: unknown[]) {
  v1.ctx.__stats = json(list);
  v1.run(`allCustomers = __stats; currentUser = { id: ${JSON.stringify(me)} };`);
}

describe('golden T0.4 — followup.json', () => {
  const expected = golden<Record<string, unknown>>('followup');

  it('khớp 100% (fixture + chuỗi tổng hợp + khung giờ)', () => {
    const now = fxNow;
    const perCustomer: Record<string, unknown> = {};
    for (const c of customers) {
      const attempts = callAttemptsOf(c);
      perCustomer[c.id] = {
        firstCall: !c.qualified_at && !attempts.length ? firstCall(c, now) : undefined,
        afterCall: afterCall(c, attempts, now, { statsCustomers: mine }),
        forStage: Object.fromEntries(CARE_STAGE_OPTIONS.map((s) => [s, forStage(c, s, now)])),
        suggestTemplates: suggestTemplates(c, now),
      };
    }
    const seq: Record<string, unknown> = {};
    const base = Date.parse('2026-11-25T02:00:00.000Z');
    const results = ['no_answer', 'line_busy', 'hung_up', 'unreachable', 'no_answer', 'no_answer', 'no_answer'];
    for (const kind of ['lead', 'qualified'] as const) {
      for (let n = 1; n <= results.length; n++) {
        const attempts = results
          .slice(0, n)
          .map((r, i) => ({ at: new Date(base + i * 26 * H).toISOString(), result: r, note: null }));
        const c = {
          id: `seq-${kind}-${n}`,
          owner_id: me,
          full_name: 'Chuỗi',
          phone: '0900009999',
          registered_at: '2026-11-25T01:00:00.000Z',
          care_stage: kind === 'lead' ? 'Đang tiếp cận' : 'Đang chăm sóc',
          qualified_at: kind === 'lead' ? null : '2026-11-20T03:00:00.000Z',
          call_attempts: attempts,
        } as Customer;
        seq[`${kind}-${n}-misses`] = {
          afterCall: afterCall(c, attempts, now, { statsCustomers: mine }),
          suggestTemplates: suggestTemplates(c, now),
        };
      }
      for (const r of ['busy', 'wrong_number', 'talked', 'hung_up', null]) {
        const attempts = [{ at: '2026-12-01T02:00:00.000Z', result: r, note: null }];
        const c = {
          id: `one-${kind}-${r}`,
          owner_id: me,
          full_name: 'Một cuộc',
          phone: '0900009998',
          registered_at: '2026-12-01T01:00:00.000Z',
          care_stage: kind === 'lead' ? 'Đang tiếp cận' : 'Xem dự án',
          qualified_at: kind === 'lead' ? null : '2026-11-20T03:00:00.000Z',
          call_attempts: attempts,
        } as Customer;
        seq[`${kind}-one-${r}`] = afterCall(c, attempts, now, { statsCustomers: mine });
      }
    }
    const got = {
      cases: caseLabels(),
      callSlots: callSlots(),
      perCustomer,
      sequences: seq,
      slotOfTime: Object.fromEntries(
        [0, 6, 7, 8, 9, 11, 12, 13, 14, 17, 18, 19, 20, 21, 22, 23].map((hh) => [
          hh,
          slotOfTime(Date.parse(`2026-12-01T${String(hh).padStart(2, '0')}:30:00+07:00`)),
        ]),
      ),
    };
    expect(canon(got)).toStrictEqual(expected);
  });
});

describe('parity trực tiếp với v1', () => {
  let seed = 51;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const RESULTS = ['no_answer', 'unreachable', 'line_busy', 'hung_up', 'busy', 'wrong_number', 'talked', null, 'lạ'];
  const OCC = ['Tự do', 'Công ty, DN', 'Công, viên chức', 'Công an, Bộ đội', '', null, 'Nội trợ'];
  const base = Date.parse('2026-11-20T00:00:00+07:00');

  function randomCase() {
    const reg = base + Math.floor(rnd() * 20 * DAY);
    const n = 1 + Math.floor(rnd() * 7);
    let at = reg + Math.floor(rnd() * 6 * H);
    const attempts: CallAttempt[] = [];
    for (let i = 0; i < n; i++) {
      const result = pick(RESULTS);
      attempts.push({
        at: new Date(at).toISOString(),
        result,
        note: null,
        duration: result ? null : pick([0, 0, 35, null]),
      });
      at += Math.floor(rnd() * 3 * DAY);
    }
    const qualified = rnd() < 0.5;
    const c = {
      id: 'r',
      owner_id: me,
      full_name: 'Khách',
      phone: '0900000000',
      registered_at: rnd() < 0.9 ? new Date(reg).toISOString() : null,
      created_at: new Date(reg).toISOString(),
      occupation: pick(OCC),
      qualified_at: qualified ? new Date(reg).toISOString() : null,
      care_stage: qualified ? pick(CARE_STAGE_OPTIONS) : pick(['Đăng kí mới', 'Đang tiếp cận']),
      dob: pick([null, '1990-12-01', '--12-02', '1985-12-05', 'hỏng']),
      call_attempts: attempts,
    } as Customer;
    return { c, attempts: callAttemptsOf(c), now: Math.max(at, base + 25 * DAY) - Math.floor(rnd() * DAY) };
  }

  it('afterCall / firstCall / suggestTemplates — 600 ca ngẫu nhiên, có và không có dữ liệu khung tốt nhất', () => {
    for (const stats of [[], mine]) {
      setV1Stats(stats);
      for (let i = 0; i < 300; i++) {
        const { c, attempts, now } = randomCase();
        const opts = { statsCustomers: stats };
        expect(json(afterCall(c, attempts, now, opts)), `afterCall #${i}`).toStrictEqual(
          callV1(now, 'afterCall', c, attempts),
        );
        expect(json(firstCall(c, now)), `firstCall #${i}`).toStrictEqual(callV1(now, 'firstCall', c));
        expect(suggestTemplates(c, now), `suggestTemplates #${i}`).toStrictEqual(callV1(now, 'suggestTemplates', c));
      }
    }
  });

  it('windowAfter / forStage / scheduleLabel quanh nửa đêm, Chủ nhật, cuối khung', () => {
    for (let i = 0; i < 300; i++) {
      const now = base + Math.floor(rnd() * 14 * DAY);
      const c = { occupation: pick(OCC) } as Customer;
      const days = Math.floor(rnd() * 10) - 1;
      const which = rnd() < 0.5 ? 'main' : 'alt';
      const w = windowAfter(c, days, which, now);
      expect(json(w)).toStrictEqual(callV1(now, 'windowAfter', c, days, which));
      const stage = pick(CARE_STAGE_OPTIONS);
      expect(json(forStage(c, stage, now))).toStrictEqual(callV1(now, 'forStage', c, stage));
      v1.setNow(now);
      const D = v1.ctx.Date as DateConstructor;
      expect(scheduleLabel(w.start, w.end)).toBe(F.label?.(new D(+w.start), new D(+w.end)));
      expect(slotOfTime(now)).toBe(callV1(now, 'slotOfTime', now));
    }
  });

  it('fillGreeting + upgradeTplText', () => {
    const tpls = [
      ...(v1.run('FOLLOWUP.templatesDefault.map((t) => t.text)') as string[]),
      'Anh/chị {hoten} ơi, {anhchi} xem dự án {du_an} nhé. {DU_AN} {Ten}',
      '',
    ];
    const people = [
      { full_name: 'Nguyễn Thị  Huyền ', gender: 'Nữ', projects: ['Hoàng Huy'] },
      { full_name: 'Trần Văn Nam', gender: 'nam', projects: [] },
      { full_name: '', gender: null, projects: ['A', 'B'] },
      { full_name: 'Lê X', gender: 'Khác', projects: null },
    ];
    for (const t of tpls)
      for (const p of people) {
        expect(fillGreeting(t, p as Customer)).toBe(callV1(fxNow, 'fillGreeting', t, p));
      }
    expect(fillGreeting('Em là {sale}', null, { myName: 'Lương Hồng Duy' })).toBe('Em là Duy');
    expect(fillGreeting('Em là {sale}', null, { myName: '  ' })).toBe('Em là Duy'); // ZALO_SENDER_NAME
    const prev = v1.run('FOLLOWUP.templatesPrevious') as Record<string, string>;
    for (const [id, text] of Object.entries(prev)) {
      expect(upgradeTplText(id, text)).toBe(callV1(fxNow, 'upgradeTplText', id, text));
      expect(upgradeTplText(id, `${text} (đã sửa)`)).toBe(`${text} (đã sửa)`);
    }
  });
});
