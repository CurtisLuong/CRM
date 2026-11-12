// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Worker source is JavaScript.
import { handleBankRates, runBankRates } from '../../worker/bank-rates.js';
// @ts-expect-error Worker source is JavaScript.
import { handleFb, runCron } from '../../worker/fb-leads.js';
// @ts-expect-error Worker source is JavaScript.
import worker from '../../worker/intake-worker.js';

vi.mock('../../worker/bank-rates.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runBankRates: vi.fn().mockResolvedValue({ written: 0 }),
}));
vi.mock('../../worker/fb-leads.js', () => ({
  handleFb: vi.fn(async () => new Response('fb existing response')),
  runCron: vi.fn().mockResolvedValue({ processed: 0 }),
}));

const manual = (secret?: string, method = 'POST') =>
  new Request('https://worker.test/bank-rates/run', {
    method,
    headers: secret === undefined ? {} : { 'X-Cron-Secret': secret },
  });
const env = () => ({
  BANK_RATES_SECRET: 'fake-cron-secret',
  SUPABASE_URL: 'https://sb.test',
  SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role',
  ALLOWED_ORIGIN: 'https://crm.test',
  AI: { run: vi.fn().mockResolvedValue({ response: '{"rates":[]}' }) },
});

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BR-01 route thủ công và cron', () => {
  it('luật 6: thiếu biến BANK_RATES_SECRET thì route tắt, không đọc nguồn hoặc gọi AI', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const config = { ...env(), BANK_RATES_SECRET: undefined };
    const response = await worker.fetch(manual('fake-cron-secret'), config, {});
    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
    expect(config.AI.run).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'wrong-secret', 'fake-cron-secret-extra'])(
    'luật 6: sai/thiếu secret (%s) bị từ chối trước mọi I/O',
    async (secret) => {
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      const config = env();
      const response = await worker.fetch(manual(secret), config, {});
      expect(response.status).toBe(401);
      expect(fetcher).not.toHaveBeenCalled();
      expect(config.AI.run).not.toHaveBeenCalled();
    },
  );

  it('luật 6: đúng secret cho phép chạy thủ công qua route; không nhận GET hoặc đường dẫn khác', async () => {
    const config = env();
    const fetcher = vi.fn(async (input: string) =>
      input.startsWith('https://sb.test/') ? new Response('[]') : new Response('<p>Chưa công bố số liệu.</p>'),
    );
    vi.stubGlobal('fetch', fetcher);
    const response = await worker.fetch(manual(config.BANK_RATES_SECRET), config, {});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ written: 0, pages: 15 });
    expect(fetcher).toHaveBeenCalled();
    expect((await worker.fetch(manual(config.BANK_RATES_SECRET, 'GET'), config, {})).status).toBe(404);
    expect(
      (await worker.fetch(new Request('https://worker.test/bank-rates/other', { method: 'POST' }), config, {})).status,
    ).toBe(404);
  });

  it('luật 4, 6: lỗi đọc DB trả 503, không lộ secret/nội dung lỗi và không đọc nguồn', async () => {
    const config = env();
    const fetcher = vi.fn().mockRejectedValue(new Error('fake-service-role private detail'));
    vi.stubGlobal('fetch', fetcher);
    const response = await handleBankRates(manual(config.BANK_RATES_SECRET), config);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/fake-service-role|private detail|fake-cron-secret/);
    expect(config.AI.run).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('luật 6: cron 00:00 UTC chỉ chạy bank rates; cron */5 chỉ chạy Facebook; cron lạ bỏ qua', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const config = env();
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) };
    await worker.scheduled({ cron: '0 0 * * *' }, config, ctx);
    expect(runBankRates).toHaveBeenCalledTimes(1);
    expect(runCron).not.toHaveBeenCalled();
    await worker.scheduled({ cron: '*/5 * * * *' }, config, ctx);
    expect(runCron).toHaveBeenCalledTimes(1);
    expect(runBankRates).toHaveBeenCalledTimes(1);
    await worker.scheduled({ cron: '0 3 * * *' }, config, ctx);
    expect(pending).toHaveLength(2);
    await Promise.all(pending);
  });

  it('luật 6: wrangler giữ cron Facebook và thêm đúng lịch 07:00 Việt Nam', () => {
    const toml = readFileSync(new URL('../../worker/wrangler.toml', import.meta.url), 'utf8');
    expect(toml).toMatch(/crons\s*=\s*\["\*\/5 \* \* \* \*", "0 0 \* \* \*"\]/);
  });

  it('hợp đồng: /ocr, /ai, /stt vẫn xác thực và có CORS; /fb/* chuyển tiếp handler cũ', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const config = env();
    for (const path of ['/ocr', '/ai', '/stt']) {
      const response = await worker.fetch(new Request(`https://worker.test${path}`, { method: 'POST' }), config, {});
      expect(response.status).toBe(401);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://crm.test');
    }
    const request = new Request('https://worker.test/fb/webhook');
    expect(await (await worker.fetch(request, config, {})).text()).toBe('fb existing response');
    expect(handleFb).toHaveBeenCalledWith(request, config, {});
    expect(fetcher).not.toHaveBeenCalled();
  });
});
