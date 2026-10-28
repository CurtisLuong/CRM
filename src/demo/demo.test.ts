import { SIGNALS_CONFIG } from '@/config/signals';
import { CARE_STAGE_PICKER_ORDER } from '@/config/stages';
import { isDemoAvailable } from '@/data/supabase';
import { computeSignals } from '@/domain/signals';
import { status } from '@/domain/velocity';
import { groupQueue, queueRows } from '@/features/today/model';
import { DEMO_USER_ID, demoDataset } from './dataset';

describe('demoDataset', () => {
  const now = new Date(2026, 9, 28, 10, 0).getTime();

  it('covers every Today group and every selectable care stage with fresh data', () => {
    const customers = demoDataset(now);
    const groupKeys = new Set(groupQueue(queueRows(customers, now, DEMO_USER_ID)).map((group) => group.key));
    const stages = new Set(customers.map((customer) => customer.care_stage));
    const signals = computeSignals(customers, { now, ownerId: DEMO_USER_ID });

    expect(customers.length).toBeGreaterThanOrEqual(20);
    expect(customers.length).toBeLessThanOrEqual(25);
    expect(SIGNALS_CONFIG.groupOrder.every((group) => groupKeys.has(group))).toBe(true);
    expect(CARE_STAGE_PICKER_ORDER.every((stage) => stages.has(stage))).toBe(true);
    expect(signals.some((signal) => signal.notification)).toBe(true);
    expect(customers.some((customer) => customer.archived_at)).toBe(true);
    expect(customers.some((customer) => customer.owner_id !== DEMO_USER_ID)).toBe(true);
    expect(
      customers.some((customer) => customer.booking_steps && Object.keys(customer.booking_steps).length === 0),
    ).toBe(true);

    const over = customers.find((customer) => customer.id === 'dm01-02');
    const atTarget = customers.find((customer) => customer.id === 'dm01-12');
    const within = customers.find((customer) => customer.id === 'dm01-13');
    expect(status(over, now)?.state).toBe('over');
    expect(status(atTarget, now)?.state).toBe('warn');
    expect(status(within, now)?.state).toBe('ok');
  });

  it('changes relative timestamps when loaded at a different time', () => {
    const first = demoDataset(now);
    const second = demoDataset(now + DAY_MS);
    expect(Date.parse(second[0]?.updated_at || '') - Date.parse(first[0]?.updated_at || '')).toBe(DAY_MS);
    expect(new Set(first.map((customer) => customer.phone)).size).toBe(first.length);
  });
});

describe('isDemoAvailable', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is false when the configured Supabase URL is production', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://nrqccwamwctihivpxjww.supabase.co');
    expect(isDemoAvailable()).toBe(false);
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
