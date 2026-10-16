import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { computeSignals, evaluateSignals, legacyDashboardGroups, signalRules } from '@/domain/signals';
import { fixture, golden, loadCustomers } from '../deadlines/golden';

const require = createRequire(import.meta.url);
const { loadV1 } = require('../../legacy-harness/load-v1.js');
const now = Date.parse(fixture.now);
const ctx = { now, ownerId: fixture.users.me };
const customers = loadCustomers().filter((c) => c.owner_id === ctx.ownerId);
const baseline = golden<{
  groups: { key: string; items: { id: string }[] }[];
  notifications: { ruleKey: string; customerId: string; sortAt: number; level: string }[];
}>('dashboard');
const ids = (groups: typeof baseline.groups) => groups.map((g) => ({ key: g.key, ids: g.items.map((i) => i.id) }));
const base = (patch: Partial<Customer> = {}): Customer => ({
  id: 'synthetic',
  phone: '0900000000',
  full_name: 'Test',
  owner_id: ctx.ownerId,
  care_stage: 'Đăng kí mới',
  created_at: new Date(now - 3600000).toISOString(),
  ...patch,
});
const rule = (id: string, customer: Customer) => signalRules.find((r) => r.id === id)?.evaluate(customer, ctx) || [];

describe('signals baseline parity', () => {
  it('registers S01–S10 exactly once without a manual registry', () => {
    expect(signalRules.map((r) => r.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `S${String(i + 1).padStart(2, '0')}`),
    );
  });
  it('matches every original golden group customer and order including birthday projection', () => {
    expect(legacyDashboardGroups(customers, ctx)).toEqual(ids(baseline.groups));
  });
  it('matches actual legacy dashboard functions on the fixture and a changed clock', () => {
    const h = loadV1({ now });
    h.ctx.__customers = structuredClone(customers);
    for (const clock of [now, now + 3600000]) {
      h.setNow(clock);
      const groups = h
        .run('dashActionGroups(__customers)')
        .map((g: { key: string; items: { c: Customer }[] }) => ({ key: g.key, ids: g.items.map((i) => i.c.id) }));
      expect(legacyDashboardGroups(customers, { ...ctx, now: clock })).toEqual(groups);
    }
  });
  it('preserves all four legacy notification memberships and ranking', () => {
    const actual = evaluateSignals(customers, ctx).flatMap((s) =>
      s.notification ? [{ ...s.notification, customerId: s.customerId }] : [],
    );
    const ranks: Record<string, number> = { urgent: 0, warn: 1 };
    actual.sort((a, b) => (ranks[a.level] ?? 0) - (ranks[b.level] ?? 0) || a.sortAt - b.sortAt);
    expect(actual).toEqual(
      baseline.notifications.map(({ ruleKey, level, sortAt, customerId }) => ({ ruleKey, level, sortAt, customerId })),
    );
  });
  it('keeps legacy effective customer queue prefix and exposes the added SLA target warning', () => {
    const expected = [
      ...new Set(baseline.groups.filter((g) => g.key !== 'bday').flatMap((g) => g.items.map((i) => i.id))),
    ];
    const signals = computeSignals(customers, ctx, 'legacy');
    expect(signals.map((s) => s.customerId)).toEqual([...expected, 'f0000000-0000-4000-8000-000000000005']);
    expect(new Set(signals.map((s) => s.customerId)).size).toBe(signals.length);
    expect(signals.some((s) => s.secondaryReasons?.length)).toBe(true);
    expect(JSON.stringify(customers)).toEqual(
      JSON.stringify(loadCustomers().filter((c) => c.owner_id === ctx.ownerId)),
    );
  });
});

describe('positive and negative conditions, evidence and suppression', () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  const care = { qualified_at: iso(now - 86400000), care_stage: 'Đang chăm sóc' };
  const cases: [string, Customer, Customer][] = [
    ['S01', base(), base({ call_attempts: [{ at: iso(now), result: 'no_answer' }] })],
    ['S02', base({ next_call_at: iso(now) }), base({ next_call_at: iso(now + 3 * 86400000) })],
    [
      'S03',
      base({ next_tasks: [{ text: 'Gửi hồ sơ', due: iso(now), side: 'me' }] }),
      base({ next_tasks: [{ due: iso(now), done_at: iso(now) }] }),
    ],
    [
      'S04',
      base({ next_tasks: [{ text: 'Khách trả lời', due: iso(now - 3600000), side: 'customer' }] }),
      base({ next_tasks: [{ due: iso(now), side: 'customer' }] }),
    ],
    [
      'S05',
      base({ ...care, care_stage_updated_at: iso(now - 30 * 86400000) }),
      base({ ...care, care_stage_updated_at: iso(now) }),
    ],
    [
      'S06',
      base({ call_attempts: [{ at: iso(now - 2 * 86400000), result: 'no_answer' }] }),
      base({ call_attempts: [{ at: iso(now), result: 'no_answer' }] }),
    ],
    ['S07', base({ ...care, care_stage_updated_at: iso(now) }), base({ ...care, next_call_at: iso(now + 3600000) })],
    [
      'S08',
      base({ ...care, interest_level: 90, care_stage_updated_at: iso(now - 10 * 86400000) }),
      base({ ...care, interest_level: 20 }),
    ],
    [
      'S09',
      base({ call_attempts: [{ at: iso(now), result: null }] }),
      base({ call_attempts: [{ at: iso(now), result: 'talked' }] }),
    ],
    [
      'S10',
      base({ ...care, care_stage: 'Booking', care_stage_updated_at: iso(now - 6 * 86400000) }),
      base({ ...care, care_stage: 'Booking', care_stage_updated_at: iso(now) }),
    ],
  ];
  it.each(cases)('%s has evidence/actions only when its condition holds', (id, positive, negative) => {
    const signals = rule(id, positive);
    expect(signals.length).toBeGreaterThan(0);
    expect(rule(id, negative)).toEqual([]);
    for (const s of signals) {
      expect(s.evidence.length).toBeGreaterThan(0);
      expect(s.actions.length).toBeGreaterThan(0);
    }
  });
  it('suppresses unchanged evidence, restores after evidence change, expires snooze', () => {
    const c = base(),
      signal = rule('S01', c)[0];
    if (!signal) throw new Error('Expected S01 candidate');
    const state = { signals: { [signal.id]: { fingerprint: signal.fingerprint, hidden: true } } };
    expect(evaluateSignals([c], { ...ctx, ui_state: state }).some((s) => s.rule === 'S01')).toBe(false);
    expect(evaluateSignals([c], { ...ctx, now: now + 3600000, ui_state: state }).some((s) => s.rule === 'S01')).toBe(
      false,
    );
    expect(
      evaluateSignals([{ ...c, registered_at: iso(now) }], { ...ctx, ui_state: state }).some((s) => s.rule === 'S01'),
    ).toBe(true);
    const snooze = { signals: { [signal.id]: { fingerprint: signal.fingerprint, snoozedUntil: now + 1 } } };
    expect(evaluateSignals([c], { ...ctx, ui_state: snooze }).some((s) => s.rule === 'S01')).toBe(false);
    expect(evaluateSignals([c], { ...ctx, now: now + 1, ui_state: snooze }).some((s) => s.rule === 'S01')).toBe(true);
  });
  it('does not revive a hidden appointment when the clock changes its presentation group', () => {
    const c = base({ next_call_at: iso(now + 3600000) });
    const signal = rule('S02', c)[0];
    if (!signal) throw new Error('Expected appointment');
    const ui_state = { signals: { [signal.id]: { fingerprint: signal.fingerprint, hidden: true } } };
    expect(evaluateSignals([c], { ...ctx, now: now + 2 * 3600000, ui_state }).filter((s) => s.rule === 'S02')).toEqual(
      [],
    );
  });
  it('handles malformed JSONB arrays like legacy without modifying them', () => {
    const c = base({
      qualified_at: iso(now),
      care_stage: 'Đang chăm sóc',
      interest_level: 90,
      created_at: iso(now - 10 * 86400000),
    });
    Object.assign(c, { notes_manual: {}, care_stage_history: 'bad', next_tasks: {}, call_attempts: {} });
    expect(() => computeSignals([c], ctx)).not.toThrow();
    expect(rule('S03', c)).toEqual([]);
    expect(rule('S09', c)).toEqual([]);
  });
  it('uses the shared deadline grace for calls and promises', () => {
    const start = iso(now - 30 * 60000);
    expect(rule('S02', base({ next_call_at: start }))[0]?.reason).toBe('đến hạn');
    expect(rule('S04', base({ next_tasks: [{ side: 'customer', due: start }] }))).toEqual([]);
    expect(rule('S04', base({ next_tasks: [{ side: 'customer', due: iso(now - 30 * 60000 - 1) }] }))).toHaveLength(1);
  });
  it('uses approved UX sorting by default while retaining explicit legacy ordering', () => {
    expect(computeSignals(customers, ctx).map((s) => s.customerId.slice(-3))).toEqual([
      '010',
      '009',
      '020',
      '019',
      '002',
      '008',
      '001',
      '011',
      '018',
      '004',
      '005',
      '016',
      '003',
    ]);
  });
  it('uses SLA deadlines rather than registration dates for S01 and S05', () => {
    // At 10:00: registration at 09:00 -> ideal 09:30, hard SLA 13:00.
    const c = base({ registered_at: iso(now - 3600000) });
    expect(rule('S01', c)[0]?.due).toBe(now + 3 * 3600000);
    expect(rule('S05', c)[0]?.due).toBe(now - 30 * 60000);
    const over = base({ registered_at: iso(now - 5 * 3600000) });
    // Registration at 05:00 is counted from 07:00, still in target warning at 10:00.
    expect(rule('S05', over)[0]?.due).toBe(now - 150 * 60000);
    const old = base({ registered_at: iso(now - 24 * 3600000) });
    expect(rule('S05', old)[0]?.due).toBe(now - 20 * 3600000);
  });
  it('excludes soft-deleted customers even when passed raw local records', () => {
    const archived = base({
      archived_at: iso(now),
      next_call_at: iso(now),
      call_attempts: [{ at: iso(now), result: null }],
    });
    expect(evaluateSignals([archived], ctx)).toEqual([]);
    expect(computeSignals([archived], ctx)).toEqual([]);
  });
  it('does not infer time-based signals from missing/invalid prerequisites', () => {
    const c = base({
      created_at: null,
      registered_at: null,
      next_call_at: 'bad',
      call_attempts: [{ at: 'bad', result: null }],
    });
    expect(['S01', 'S02', 'S05', 'S06', 'S08', 'S09', 'S10'].flatMap((id) => rule(id, c))).toEqual([]);
    expect(computeSignals([base({ owner_id: 'other' })], ctx)).toEqual([]);
  });
});
