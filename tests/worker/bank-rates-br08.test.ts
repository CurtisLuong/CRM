// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Worker source is JavaScript.
import { runBankRates } from '../../worker/bank-rates.js';
// @ts-expect-error Worker source is JavaScript.
import { BANK_SOURCES, MAX_SUBREQUESTS } from '../../worker/bank-rates-config.js';
// @ts-expect-error Worker source is JavaScript.
import { extractPage } from '../../worker/bank-rates-extract.js';

type Bank = { code: string; name: string; url: string };
type Row = Record<string, unknown>;
type Prompt = { text: string; banks: { code: string }[]; kind?: string };
const BANKS: Bank[] = BANK_SOURCES;
const NOW = new Date('2026-11-13T01:20:00Z');
const ARTICLE = 'https://vietnambiz.vn/lai-suat-big4.htm';
const PRIVATE_TEXT = 'Nội dung trang chỉ để trích số, không ghi nhật ký. Liên hệ 0912345678.';
const FIELDS = ['promo_rate', 'promo_months', 'floating_rate', 'reference_rate', 'margin', 'deposit_rate'];
const empty = () => Object.fromEntries(FIELDS.map((field) => [field, null]));
const key = (row: Row) => `${row.bank_code}:${row.kind}`;
const loan = (name: string) => `${name} cho vay mua nhà ưu đãi 6.5%/năm.`;
const deposit = (name: string) => `${name} tiết kiệm cá nhân kỳ hạn 12 tháng 5.5%/năm.`;
function aiRow(code: string, name: string) {
  return {
    ...empty(),
    bank_code: code,
    promo_rate: 6.5,
    deposit_rate: 5.5,
    note: null,
    evidence: { ...empty(), promo_rate: loan(name), deposit_rate: deposit(name) },
  };
}
const NEWS_ROWS = [aiRow('vietcombank', 'Vietcombank'), aiRow('bidv', 'BIDV'), aiRow('agribank', 'Agribank')];
const NEWS_TEXT = NEWS_ROWS.map((row) => `${row.evidence.promo_rate} ${row.evidence.deposit_rate}`).join(' ');
const MISSING = ['acb:loan', 'acb:deposit', 'vietcombank:loan', 'bidv:deposit'];
function latest(missing: string[] = MISSING): Row[] {
  return BANKS.flatMap((bank) =>
    ['loan', 'deposit'].map((kind) => ({
      ...empty(),
      bank_code: bank.code,
      kind,
      promo_rate: kind === 'loan' ? 6.5 : null,
      deposit_rate: kind === 'deposit' ? 5.5 : null,
      fetched_at: NOW.toISOString(),
    })),
  ).filter((row) => !missing.includes(key(row)));
}

function world(
  options: { missing?: string[]; bankPage?: boolean; noRates?: boolean; status?: number; stale?: boolean } = {},
) {
  const saved: Row[] = [];
  const prompts: Prompt[] = [];
  const queries: string[] = [];
  const logger = { log: vi.fn(), warn: vi.fn() };
  const run = vi.fn(async (_model: string, params: { messages: { content: string }[] }) => {
    const prompt: Prompt = JSON.parse(params.messages[1]?.content || '{}');
    prompts.push(prompt);
    return {
      response: JSON.stringify({ rates: !options.noRates && prompt.text.includes(NEWS_TEXT) ? NEWS_ROWS : [] }),
    };
  });
  const env = {
    SUPABASE_URL: 'https://sb.test',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-key',
    BANK_RATES_SECRET: 'fixture-secret',
    AI: { run },
  };
  const fetcher = vi.fn(async (address: string, init?: RequestInit) => {
    const url = new URL(address);
    if (url.hostname === 'sb.test') {
      if (init?.method !== 'POST') return new Response(JSON.stringify(latest(options.missing)));
      saved.push(...[JSON.parse(String(init.body))].flat());
      return new Response(null, { status: 201 });
    }
    if (url.hostname === 'www.bing.com') {
      queries.push(url.searchParams.get('q') || '');
      return new Response(
        `<rss><item><title>Lãi suất vay mua nhà và tiết kiệm Big4</title><link>https://www.bing.com/news/apiclick.aspx?url=${encodeURIComponent(ARTICLE)}</link><pubDate>2026-11-13</pubDate></item></rss>`,
      );
    }
    if (address === ARTICLE && options.status) return new Response(PRIVATE_TEXT, { status: options.status });
    const content = options.bankPage ? url.hostname === 'acb.com.vn' : address === ARTICLE;
    const date = options.stale && address === ARTICLE ? '2026-01-01' : '2026-11-13';
    return new Response(
      `<time datetime="${date}"></time><p>${content ? NEWS_TEXT : 'Chưa công bố số.'} ${PRIVATE_TEXT}</p>`,
    );
  });
  const execute = () => runBankRates(env, { now: NOW, supplemental: true, fetcher, logger });
  return { env, fetcher, logger, run, saved, prompts, queries, execute };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('BR-08 nguồn bổ sung', () => {
  it('luật 1: tìm ACB vẫn ghi vay Vietcombank và gửi BIDV có trích dẫn đúng, bỏ mọi ô đã đủ', async () => {
    const w = world();
    expect(await w.execute()).toMatchObject({ missing_before: 4, missing_after: 2, written: 2 });
    expect(w.queries).toEqual([
      'lãi suất vay mua nhà ACB tháng 11/2026',
      'lãi suất tiết kiệm 12 tháng ACB tháng 11/2026',
    ]);
    expect(w.saved.map(key)).toEqual(['vietcombank:loan', 'bidv:deposit']);
    expect(w.saved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bank_code: 'vietcombank',
          promo_rate: 6.5,
          source_kind: 'news',
          source_url: ARTICLE,
        }),
        expect.objectContaining({ bank_code: 'bidv', deposit_rate: 5.5, source_kind: 'news', source_url: ARTICLE }),
      ]),
    );
    const newsPrompts = w.prompts.filter((prompt) => prompt.text.includes(NEWS_TEXT));
    expect(newsPrompts.length).toBeGreaterThan(0);
    for (const prompt of newsPrompts) {
      expect(prompt.banks.map((bank) => bank.code)).toEqual(BANKS.map((bank) => bank.code));
      expect(prompt.kind).toBeUndefined();
    }
    expect(w.fetcher.mock.calls.length + w.run.mock.calls.length).toBeLessThanOrEqual(MAX_SUBREQUESTS);
  });

  it('luật 2: dòng Vietcombank/BIDV từ acb.com.vn vẫn bị loại cho cả vay và gửi', async () => {
    const w = world({ bankPage: true });
    expect(await w.execute()).toMatchObject({ written: 0, missing_after: 4 });
    expect(w.saved).toEqual([]);
    for (const field of ['promo_rate', 'deposit_rate'])
      expect(w.logger.warn).toHaveBeenCalledWith(
        'bank-rates rejected value',
        expect.objectContaining({ bank_code: 'vietcombank', field, reason: 'wrong_bank' }),
      );
  });

  it.each([
    ['wrong_bank', 'BIDV cho vay mua nhà ưu đãi 6.5%/năm.', 6.5, null],
    ['no_quote_in_text', 'Vietcombank cho vay mua nhà ưu đãi 6.5%/năm.', 6.5, null],
    ['no_context', 'Vietcombank cho vay tín chấp 6.5%/năm.', 6.5, null],
    ['out_of_range', 'Vietcombank cho vay mua nhà ưu đãi 25%/năm.', 25, null],
    ['wrong_term', 'Vietcombank tiết kiệm cá nhân kỳ hạn 6 tháng 5.5%/năm.', null, 5.5],
    ['out_of_range', 'Vietcombank tiết kiệm cá nhân kỳ hạn 12 tháng 13%/năm.', null, 13],
  ])('luật 3: báo không bỏ kiểm %s', async (reason, quote, promo, depositRate) => {
    const row = {
      ...empty(),
      bank_code: 'vietcombank',
      promo_rate: promo,
      deposit_rate: depositRate,
      note: null,
      evidence: {
        ...empty(),
        promo_rate: promo === null ? null : quote,
        deposit_rate: depositRate === null ? null : quote,
      },
    };
    const logger = { warn: vi.fn() };
    const env = { AI: { run: vi.fn().mockResolvedValue({ response: JSON.stringify({ rates: [row] }) }) } };
    const text = reason === 'no_quote_in_text' ? 'Vietcombank chưa công bố số.' : quote;
    expect(
      await extractPage(env, { source_kind: 'news', source_url: ARTICLE, bank_code: 'acb' }, text, { logger }),
    ).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith('bank-rates rejected value', expect.objectContaining({ reason }));
  });

  it('luật 3: báo nhận đủ ngân hàng nhưng vẫn chặn lệch trên 2 điểm', async () => {
    const w = world();
    const fetcher = async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://sb.test/') && init?.method !== 'POST') {
        return new Response(
          JSON.stringify([
            ...latest(),
            { ...empty(), bank_code: 'vietcombank', kind: 'loan', promo_rate: 3, fetched_at: '2026-11-12T00:00:00Z' },
          ]),
        );
      }
      return w.fetcher(url, init);
    };
    expect(await runBankRates(w.env, { now: NOW, supplemental: true, fetcher, logger: w.logger })).toMatchObject({
      written: 1,
      drifted: 1,
      missing_after: 3,
    });
    expect(w.saved.map(key)).toEqual(['bidv:deposit']);
  });
});

describe('BR-08 gọi tay và nhật ký', () => {
  it.each([1, 2])(
    'luật 4: ba POST ở ba isolate mới cách nhau %s phút chọn ba cặp ô thiếu khác nhau',
    async (minutes) => {
      vi.useFakeTimers();
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const pairs: string[] = [];
      // Ô đủ nằm xen kẽ: không để mốc thời gian bị dồn trở lại cùng ngân hàng.
      const missing = BANKS.slice(0, 9).map((bank) => `${bank.code}:deposit`);
      for (let i = 0; i < 3; i++) {
        vi.resetModules();
        // @ts-expect-error Worker source is JavaScript.
        const { handleBankRates } = await import('../../worker/bank-rates.js');
        vi.setSystemTime(new Date(NOW.getTime() + i * minutes * 60_000));
        const w = world({ noRates: true, missing });
        vi.stubGlobal('fetch', w.fetcher);
        const response = await handleBankRates(
          new Request('https://worker.test/bank-rates/run', {
            method: 'POST',
            headers: { 'X-Cron-Secret': w.env.BANK_RATES_SECRET },
          }),
          w.env,
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ written: 0, missing_before: 9, missing_after: 9 });
        expect(w.queries).toHaveLength(2);
        expect(new Set(w.queries).size).toBe(2);
        pairs.push(w.queries.join('|'));
        expect(w.queries.every((query) => query.includes('tiết kiệm 12 tháng'))).toBe(true);
        expect(w.fetcher.mock.calls.length + w.run.mock.calls.length).toBeLessThanOrEqual(MAX_SUBREQUESTS);
      }
      expect(new Set(pairs).size).toBe(3);
    },
  );

  it('luật 5: log mỗi trang có url, source_kind, ai_rows, accepted, không chứa nội dung hay SĐT', async () => {
    const w = world();
    await w.execute();
    const pages = w.logger.log.mock.calls
      .filter(([message]) => message === 'bank-rates page')
      .map(([, detail]) => detail);
    expect(pages).toEqual(
      expect.arrayContaining([
        { url: ARTICLE, source_kind: 'news', ai_rows: 3, accepted: 2 },
        { url: 'https://acb.com.vn/', source_kind: 'bank', ai_rows: 0, accepted: 0 },
      ]),
    );
    for (const page of pages) {
      expect(Object.keys(page).sort()).toEqual(['accepted', 'ai_rows', 'source_kind', 'url']);
      expect(page.ai_rows).toEqual(expect.any(Number));
      expect(page.accepted).toEqual(expect.any(Number));
    }
    const logs = JSON.stringify([w.logger.log.mock.calls, w.logger.warn.mock.calls]);
    expect(logs).not.toContain(PRIVATE_TEXT);
    expect(logs).not.toContain('0912345678');
    expect(logs).not.toContain(NEWS_TEXT);
  });

  it('luật 5: bài quá cũ vẫn log trang với 0 dòng AI và 0 dòng nhận', async () => {
    const w = world({ stale: true });
    expect(await w.execute()).toMatchObject({ written: 0 });
    expect(w.logger.log).toHaveBeenCalledWith('bank-rates page', {
      url: ARTICLE,
      source_kind: 'news',
      ai_rows: 0,
      accepted: 0,
    });
  });

  it('luật 5: trang đọc lỗi log thêm HTTP status, không log nội dung lỗi', async () => {
    const w = world({ status: 503 });
    expect(await w.execute()).toMatchObject({ written: 0 });
    expect(w.logger.warn).toHaveBeenCalledWith('bank-rates source failed', { url: ARTICLE, status: 503 });
    expect(JSON.stringify(w.logger.warn.mock.calls)).not.toContain(PRIVATE_TEXT);
  });
});
