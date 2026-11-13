// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
// @ts-expect-error Worker source is JavaScript.
import { runBankRates } from '../../worker/bank-rates.js';
// @ts-expect-error Worker source is JavaScript.
import { BANK_RATES_CRON, BANK_RATES_SUPPLEMENTAL_CRON } from '../../worker/bank-rates-config.js';
// @ts-expect-error Worker source is JavaScript.
import { runCron } from '../../worker/fb-leads.js';
// @ts-expect-error Worker source is JavaScript.
import worker from '../../worker/intake-worker.js';

vi.mock('../../worker/bank-rates.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  runBankRates: vi.fn().mockResolvedValue({ written: 0 }),
}));
vi.mock('../../worker/fb-leads.js', () => ({
  handleFb: vi.fn(),
  runCron: vi.fn().mockResolvedValue({ processed: 0 }),
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

it('BR-06 luật 3: cron bổ sung truyền đúng chế độ và giờ; cron lạ bỏ qua, Facebook vẫn riêng', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (job: Promise<unknown>) => pending.push(job) };
  const env = {};
  const scheduledTime = Date.parse('2026-11-13T00:10:00Z');
  await worker.scheduled({ cron: BANK_RATES_SUPPLEMENTAL_CRON, scheduledTime }, env, ctx);
  expect(runBankRates).toHaveBeenCalledWith(env, { now: new Date(scheduledTime), supplemental: true });
  await worker.scheduled({ cron: '0 3 * * *', scheduledTime }, env, ctx);
  expect(runBankRates).toHaveBeenCalledTimes(1);
  expect(pending).toHaveLength(1);
  expect(runCron).not.toHaveBeenCalled();
  await worker.scheduled({ cron: '*/5 * * * *', scheduledTime }, env, ctx);
  expect(runCron).toHaveBeenCalledTimes(1);
  expect(runBankRates).toHaveBeenCalledTimes(1);
  await Promise.all(pending);
});

it.each([false, true])(
  'BR-06 luật 2, 3: hai cron lúc 00:00 UTC chỉ có một lượt đầu (đảo thứ tự=%s)',
  async (reverse) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (job: Promise<unknown>) => pending.push(job) };
    const scheduledTime = Date.parse('2026-11-13T00:00:00Z');
    const crons = [BANK_RATES_CRON, BANK_RATES_SUPPLEMENTAL_CRON];
    if (reverse) crons.reverse();
    for (const cron of crons) await worker.scheduled({ cron, scheduledTime }, {}, ctx);
    expect(runBankRates).toHaveBeenCalledTimes(1);
    expect(runBankRates).toHaveBeenCalledWith({}, { now: new Date(scheduledTime), supplemental: false });
    expect(runCron).not.toHaveBeenCalled();
    await Promise.all(pending);
  },
);
