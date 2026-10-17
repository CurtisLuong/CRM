/// <reference types="node" />
// T2.B1 — hạn / đến hạn / quá hạn (D-010): khớp golden T0.4, ranh giới D-010, và parity trực tiếp với v1.

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { type Customer, openTasksOf } from '@/domain/customer';
import {
  callReminder,
  callScheduleLabel,
  countdownTag,
  dashWhen,
  relDayLabel,
  taskDayLabel,
  taskDueInfo,
} from '@/domain/deadlines';
import { canon, golden, loadCustomers } from './golden';

const MIN = 60000;
const H = 3600000;
const DAY = 86400000;

type V1Ctx = Record<string, (...args: unknown[]) => unknown>;
const { loadV1 } = createRequire(import.meta.url)('../../legacy-harness/load-v1.js') as {
  loadV1: (opts?: { now?: string | number }) => { ctx: V1Ctx; setNow(v: number | string): void };
};
const v1 = loadV1();
/** Gọi hàm v1 ở thời điểm `now`, chép kết quả sang realm này (JSON). */
function callV1(now: number, fn: string, ...args: unknown[]): unknown {
  v1.setNow(now);
  const out = v1.ctx[fn]?.(...args);
  return out === undefined ? undefined : JSON.parse(JSON.stringify(out));
}

describe('golden T0.4 — deadlines.json', () => {
  type Golden = { clocks: Record<string, unknown> };
  const expected = golden<Golden>('deadlines');

  for (const nowIso of Object.keys(expected.clocks)) {
    it(`khớp 100% lúc ${nowIso}`, () => {
      const now = Date.parse(nowIso);
      const offsets = [
        -2 * DAY,
        -DAY,
        -61 * MIN,
        -31 * MIN,
        -30 * MIN,
        -MIN,
        0,
        MIN,
        59 * MIN,
        23 * H,
        25 * H,
        3 * DAY,
      ];
      const matrix: unknown[] = [];
      for (const off of offsets)
        for (const endPlus of [0, 60 * MIN])
          for (const allDay of [false, true]) {
            if (allDay && endPlus) continue;
            matrix.push({
              startOffsetMin: off / MIN,
              endPlusMin: endPlus / MIN,
              allDay,
              tag: countdownTag(now + off, now + off + endPlus, allDay, now),
            });
          }
      matrix.push({ case: 'NaN start', tag: countdownTag(Number.NaN, Number.NaN, false, now) });
      const perCustomer: Record<string, unknown> = {};
      for (const c of loadCustomers()) {
        const tasks = (Array.isArray(c.next_tasks) ? c.next_tasks : []).map((t) => ({
          text: t?.text,
          info: t && taskDueInfo(t, now),
        }));
        perCustomer[c.id] = { callReminder: callReminder(c, now), openTasks: openTasksOf(c).length, tasks };
      }
      const got = {
        matrix,
        perCustomer,
        invalid: {
          taskDueInfoInvalid: taskDueInfo({ due: 'invalid' }, now),
          taskDueInfoEmpty: taskDueInfo({}, now),
          callReminderInvalid: callReminder({ next_call_at: 'invalid' }, now),
        },
      };
      expect(canon(got)).toStrictEqual(expected.clocks[nowIso]);
    });
  }
});

describe('ranh giới D-010', () => {
  const base = Date.parse('2026-12-01T12:00:00+07:00');
  const midnight = Date.parse('2026-12-02T00:00:00+07:00');
  const iso = (ms: number) => new Date(ms).toISOString();

  // [nhãn, lúc xem, hạn, cả ngày, countdownTag.state, taskDueInfo.state] — cùng bộ ca với tests/deadlines.test.js (v1).
  const taskCases: [string, number, number, boolean, string, string][] = [
    ['trước giờ việc', base, base + MIN, false, 'soon', 'today'],
    ['đúng giờ việc', base, base, false, 'due', 'due'],
    ['trong 30 phút sau mốc', base + 29 * MIN, base, false, 'due', 'due'],
    ['đúng mốc +30 phút vẫn đến hạn', base + 30 * MIN, base, false, 'due', 'due'],
    ['quá mốc +30 phút 1ms → quá hạn', base + 30 * MIN + 1, base, false, 'missed', 'overdue'],
    ['cả ngày: đầu ngày', midnight - DAY, midnight - 1, true, 'due', 'due'],
    ['cả ngày: hạn cũ lưu nửa đêm vẫn đến hạn cả ngày', base, base - 12 * H, true, 'due', 'due'],
    ['cả ngày: ms cuối của ngày', midnight - 1, midnight - MIN, true, 'due', 'due'],
    ['cả ngày: sang ngày hôm sau → quá hạn', midnight, midnight - MIN, true, 'missed', 'overdue'],
    ['việc có giờ: 30 phút gia hạn vắt qua nửa đêm', midnight + 10 * MIN, midnight - 10 * MIN, false, 'due', 'due'],
    ['việc có giờ: qua nửa đêm, hết gia hạn', midnight + 20 * MIN + 1, midnight - 10 * MIN, false, 'missed', 'overdue'],
    ['cả ngày: ms cuối hôm trước → còn 1 ngày (soon)', midnight - 1, midnight + H, true, 'soon', ''],
    ['cả ngày: còn 2 ngày → far', midnight - 1, midnight + DAY + H, true, 'far', ''],
  ];
  it.each(taskCases)('việc — %s', (_label, at, due, allDay, cd, info) => {
    expect(countdownTag(due, due, allDay, at)?.state).toBe(cd);
    expect(taskDueInfo({ due: iso(due), due_allday: allDay }, at)?.state).toBe(info);
    expect(callV1(at, 'countdownTag', due, due, allDay)).toStrictEqual(countdownTag(due, due, allDay, at));
  });

  // Hẹn gọi khung base → end: đến hạn tới hết khung + 30 phút.
  const callCases: [string, number, number | null, string][] = [
    ['trước khung', base - MIN, base + H, 'soon'],
    ['trong khung', base + 30 * MIN, base + H, 'due'],
    ['sau khung, trong 30 phút', base + 80 * MIN, base + H, 'due'],
    ['đúng cuối khung +30 phút', base + 90 * MIN, base + H, 'due'],
    ['cuối khung +30 phút 1ms → quá hạn', base + 90 * MIN + 1, base + H, 'missed'],
    ['không có giờ kết thúc, trong 30 phút', base + 30 * MIN, null, 'due'],
    ['không có giờ kết thúc, quá 30 phút', base + 30 * MIN + 1, null, 'missed'],
  ];
  it.each(callCases)('hẹn gọi — %s', (_label, at, end, state) => {
    expect(countdownTag(base, end ?? base, false, at)?.state).toBe(state);
    const c = { next_call_at: iso(base), next_call_end: end == null ? null : iso(end) };
    expect(callReminder(c, at)?.state).toBe(state);
    expect(callV1(at, 'callReminder', c)).toStrictEqual(callReminder(c, at));
  });

  it('chữ hiển thị', () => {
    expect(callReminder({ next_call_at: iso(base) }, base - 45 * MIN)).toStrictEqual({
      state: 'soon',
      text: '45p nữa gọi',
      sort: base,
    });
    expect(callReminder({ next_call_at: iso(base) }, base + 31 * MIN)?.text).toBe('quên gọi 12:00');
    expect(callReminder({ next_call_at: iso(base) }, base - DAY - 1)).toBeNull(); // còn xa → không nhắc
    expect(countdownTag(base, base, false, base - 3 * H)?.text).toBe('còn 3:00');
    expect(countdownTag(base + 2 * DAY, base + 2 * DAY, false, base)?.text).toBe('còn 2 ngày');
    expect(taskDueInfo({ due: iso(base + DAY) }, base)?.label).toBe('Ngày mai · 12:00');
    expect(taskDueInfo({ due: iso(base + 3 * DAY), due_allday: true }, base)?.label).toBe('T6 4/12');
  });
});

describe('parity trực tiếp với v1 (nạp legacy/)', () => {
  // Bộ sinh số giả ngẫu nhiên có seed (mulberry32) → tái lập được.
  let seed = 20261016;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const base = Date.parse('2026-12-01T00:00:00+07:00');
  const samples = Array.from({ length: 400 }, () => {
    const now = base + Math.floor(rnd() * 3 * DAY);
    const start = now + Math.round((rnd() - 0.5) * 6 * DAY);
    return { now, start, end: start + Math.floor(rnd() * 3) * 45 * MIN, allDay: rnd() < 0.3 };
  });

  it('countdownTag / taskDueInfo / callReminder trên 400 thời điểm ngẫu nhiên', () => {
    for (const { now, start, end, allDay } of samples) {
      const task = { due: new Date(start).toISOString(), due_allday: allDay };
      const c = { next_call_at: new Date(start).toISOString(), next_call_end: new Date(end).toISOString() };
      expect(countdownTag(start, end, allDay, now)).toStrictEqual(callV1(now, 'countdownTag', start, end, allDay));
      expect(taskDueInfo(task, now)).toStrictEqual(callV1(now, 'taskDueInfo', task));
      expect(callReminder(c, now)).toStrictEqual(callV1(now, 'callReminder', c));
    }
  });

  it('nhãn ngày: taskDayLabel / relDayLabel / dashWhen / callScheduleLabel', () => {
    for (const { now, start, end } of samples) {
      const c = { next_call_at: new Date(start).toISOString(), next_call_end: new Date(end).toISOString() };
      v1.setNow(now);
      const d = new (v1.ctx.Date as unknown as DateConstructor)(start);
      expect(taskDayLabel(new Date(start), now)).toBe(v1.ctx.taskDayLabel?.(d));
      expect(relDayLabel(new Date(start), now)).toBe(v1.ctx.relDayLabel?.(d));
      expect(dashWhen(start, now)).toBe(v1.ctx.dashWhen?.(start));
      expect(callScheduleLabel(c as Pick<Customer, 'next_call_at' | 'next_call_end'>, now)).toBe(
        v1.ctx.callScheduleLabel?.(c),
      );
    }
  });
});
