// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Worker source is JavaScript.
import { handleBankRates, runBankRates } from '../../worker/bank-rates.js';
// @ts-expect-error Worker source is JavaScript.
import * as config from '../../worker/bank-rates-config.js';
// @ts-expect-error Worker source is JavaScript.
import { extractPage } from '../../worker/bank-rates-extract.js';
// @ts-expect-error Worker source is JavaScript.
import { newsArticles } from '../../worker/bank-rates-sources.js';

type Bank = { code: string; name: string; url: string };
type Kind = 'loan' | 'deposit';
type Row = Record<string, unknown>;
type Params = { messages: { content: string }[] };
const BANKS: Bank[] = config.BANK_SOURCES;
const NOW = new Date('2026-11-13T00:10:00Z');
const FIELDS = ['promo_rate', 'promo_months', 'floating_rate', 'reference_rate', 'margin', 'deposit_rate'];
const empty = () => Object.fromEntries(FIELDS.map((field) => [field, null]));
const key = (row: Row) => `${row.bank_code}:${row.kind}`;
const loan = (bank: Bank) => `${bank.name} cho vay mua nhà ưu đãi 6.5%/năm.`;
const deposit = (bank: Bank, term = 12) => `${bank.name} tiết kiệm cá nhân kỳ hạn ${term} tháng 5.5%/năm.`;
function aiRow(bank: Bank, term = 12) {
  return {
    ...empty(),
    bank_code: bank.code,
    promo_rate: 6.5,
    deposit_rate: 5.5,
    note: null,
    evidence: { ...empty(), promo_rate: loan(bank), deposit_rate: deposit(bank, term) },
  };
}
function latest(bank: Bank, kind: Kind, fetched_at = NOW.toISOString()): Row {
  return {
    ...empty(),
    bank_code: bank.code,
    kind,
    promo_rate: kind === 'loan' ? 6.5 : null,
    deposit_rate: kind === 'deposit' ? 5.5 : null,
    fetched_at,
  };
}
const complete = (fetched_at = NOW.toISOString()) =>
  BANKS.flatMap((bank) => [latest(bank, 'loan', fetched_at), latest(bank, 'deposit', fetched_at)]);
const MISSING = ['mb:loan', 'techcombank:deposit'];
const partial = () => complete().filter((row) => !MISSING.includes(key(row)));

function world(
  initial: Row[] = partial(),
  options: {
    noRates?: boolean;
    long?: boolean;
    batchFailure?: boolean;
    failBank?: string;
    readFailure?: boolean;
    stale?: boolean;
    term?: number;
    onlyBanks?: string[];
    redirects?: boolean;
  } = {},
) {
  const saved: Row[] = [];
  const rows = [...initial];
  const publicCalls: string[] = [];
  const queries: string[] = [];
  const logger = { log: vi.fn(), warn: vi.fn() };
  const run = vi.fn(async (_model: string, params: Params) => {
    const { text } = JSON.parse(params.messages[1]?.content || '{}');
    const rates = options.noRates
      ? []
      : BANKS.filter((bank) => text.includes(loan(bank)) || text.includes(deposit(bank, options.term))).map((bank) =>
          aiRow(bank, options.term),
        );
    return { response: JSON.stringify({ rates }) };
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
      if (init?.method !== 'POST')
        return options.readFailure ? new Response(null, { status: 503 }) : new Response(JSON.stringify(rows));
      const payload = JSON.parse(String(init.body));
      const batch: Row[] = [payload].flat();
      if ((options.batchFailure && Array.isArray(payload)) || batch.some((row) => row.bank_code === options.failBank))
        return new Response('fixture write failure', { status: 503 });
      saved.push(...batch);
      for (const row of batch) {
        const index = rows.findIndex((previous) => key(previous) === key(row));
        if (index < 0) rows.push(row);
        else rows[index] = row;
      }
      return new Response(null, { status: 201 });
    }
    publicCalls.push(address);
    if (url.hostname === 'www.bing.com') {
      queries.push(url.searchParams.get('q') || '');
      const articles = Array.from({ length: options.long ? 30 : 1 }, (_, i) =>
        [
          `https://cafef.vn/lai-suat-${i}.chn`,
          `${BANKS.find((bank) => queries.at(-1)?.includes(` ${bank.name} tháng`))?.url || BANKS[0]?.url}lai-suat`,
          'https://unknown.example/lai-suat',
        ]
          .map(
            (link) =>
              `<item><title>Lãi suất vay mua nhà và tiết kiệm 12 tháng</title><link>https://www.bing.com/news/apiclick.aspx?url=${encodeURIComponent(link)}</link><pubDate>2026-11-13</pubDate></item>`,
          )
          .join(''),
      ).join('');
      return new Response(`<rss>${articles}</rss>`);
    }
    if (config.NEWS_FEEDS.includes(address)) return new Response('<rss/>');
    const bank = BANKS.find((bank) => new URL(bank.url).hostname === url.hostname);
    if (options.redirects && bank && url.pathname === '/')
      return new Response(null, { status: 302, headers: { Location: '/home' } });
    const available = BANKS.filter(
      (item) => (!bank || bank === item) && (!options.onlyBanks || options.onlyBanks.includes(item.code)),
    );
    const text = available.map((bank) => `${loan(bank)} ${deposit(bank, options.term)}`).join(' ');
    const date = options.stale && !bank ? '2026-07-01' : '2026-11-13';
    return new Response(
      `<time datetime="${date}"></time><p>${text}${options.long ? ' Điều kiện áp dụng.'.repeat(900) : ''}</p>${bank ? '<a href="/lai-suat">Lãi suất</a>' : ''}`,
    );
  });
  const execute = (now = NOW, supplemental?: boolean) => runBankRates(env, { now, supplemental, fetcher, logger });
  return { saved, rows, queries, publicCalls, logger, run, env, fetcher, execute };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('BR-06 ô đủ và chế độ chạy', () => {
  it('luật 1: tính ngày Việt Nam theo fetched_at; vay cần ưu đãi hoặc thả nổi, gửi cần số gửi', async () => {
    const rows = complete('2026-11-12T17:01:00Z');
    rows[0] = { ...rows[0], promo_rate: null, floating_rate: 10 };
    rows[2] = { ...rows[2], promo_rate: null, floating_rate: null, reference_rate: 7, margin: 3 };
    rows[3] = { ...rows[3], deposit_rate: null };
    rows[4] = { ...rows[4], fetched_at: '2026-11-12T16:59:59Z' };
    const w = world(rows, { noRates: true });
    expect(await w.execute()).toMatchObject({ missing_before: 3, missing_after: 3, written: 0 });
  });

  it('luật 2: chưa có dữ liệu hôm nay thì quét rộng đủ mười trang ngân hàng và các nguồn BR-01→05', async () => {
    const w = world(complete('2026-11-12T00:00:00Z'));
    const result = await w.execute();
    expect(w.publicCalls).toEqual(
      expect.arrayContaining([...BANKS.map((bank) => bank.url), ...config.NEWS_FEEDS, ...config.newsSearchFeeds(NOW)]),
    );
    expect(result).toMatchObject({ missing_before: 20, missing_after: 0, written: 20 });
  });

  it('luật 2: cron lượt đầu chỉ định quét rộng dù đã có vài ô hôm nay', async () => {
    const w = world(partial());
    await w.execute(NOW, false);
    expect(w.publicCalls).toEqual(expect.arrayContaining(BANKS.map((bank) => bank.url)));
    expect(w.queries).toEqual(config.newsSearchFeeds(NOW).map((url: string) => new URL(url).searchParams.get('q')));
  });

  it('luật 3: hai ô thiếu cùng ngân hàng đều được trích, dùng lại trang đã đọc', async () => {
    const w = world(complete().filter((row) => row.bank_code !== 'mb'));
    expect(await w.execute()).toMatchObject({ missing_before: 2, missing_after: 0, written: 2 });
    expect(w.saved.map(key)).toEqual(['mb:loan', 'mb:deposit']);
    const home = BANKS.find((bank) => bank.code === 'mb')?.url;
    expect(w.publicCalls.filter((url) => url === home)).toHaveLength(1);
  });

  it('luật 3, 5: chỉ truy vấn ô thiếu; AI trả cả loại đã đủ cũng chỉ ghi ô thiếu', async () => {
    const w = world();
    const result = await w.execute();
    expect(w.queries).toEqual([
      'lãi suất vay mua nhà MB tháng 11/2026',
      'lãi suất tiết kiệm 12 tháng Techcombank tháng 11/2026',
    ]);
    expect(w.queries.join(' ')).not.toMatch(/BIDV|VietinBank|Agribank|Vietcombank|VPBank|HDBank|ACB|Sacombank/);
    expect(w.saved.map(key)).toEqual(MISSING);
    expect(result).toMatchObject({ missing_before: 2, missing_after: 0, written: 2, failed: 0 });
    expect(w.logger.log).toHaveBeenCalledWith(
      'bank-rates summary',
      expect.objectContaining({
        missing_before: 2,
        missing_after: 0,
        queries: w.queries,
      }),
    );
    const calls = w.fetcher.mock.calls.length;
    const aiCalls = w.run.mock.calls.length;
    expect(await w.execute()).toMatchObject({ skipped: 'complete_today', pages: 0, ai_calls: 0 });
    expect(w.fetcher.mock.calls.length - calls).toBe(1);
    expect(w.run.mock.calls.length).toBe(aiCalls);
  });

  it('luật 3: đủ 20 ô hôm nay thì complete_today, chỉ đọc DB, không fetch trang hoặc gọi AI', async () => {
    const w = world(complete());
    expect(await w.execute(NOW, true)).toMatchObject({
      skipped: 'complete_today',
      missing_before: 0,
      missing_after: 0,
      pages: 0,
      candidates: 0,
      written: 0,
      drifted: 0,
      failed: 0,
      ai_calls: 0,
    });
    expect(w.fetcher).toHaveBeenCalledTimes(1);
    expect(w.publicCalls).toEqual([]);
    expect(w.run).not.toHaveBeenCalled();
    expect(w.saved).toEqual([]);
  });

  it.each([0, 12, 19])('luật 3: xoay vòng lượt liên tiếp dù ô thiếu không đổi (đã đủ %s ô)', async (filled) => {
    const rows = complete().slice(0, filled);
    const w = world(rows, { noRates: true });
    for (let i = 0; i < 10; i++) {
      const before = w.queries.length;
      const result = await w.execute(NOW, true);
      expect(result).toMatchObject({ missing_before: 20 - filled, missing_after: 20 - filled, written: 0 });
      expect(w.queries.length - before).toBe(Math.min(20 - filled, config.SUPPLEMENTAL_CELLS_PER_RUN));
    }
    expect(new Set(w.queries)).toEqual(
      new Set(
        config
          .missingCellSearchFeeds(
            BANKS.flatMap((bank) => ['loan', 'deposit'].map((kind) => ({ bank_code: bank.code, kind }))).slice(filled),
            NOW,
          )
          .map((url: string) => new URL(url).searchParams.get('q')),
      ),
    );
  });

  it('luật 3: isolate mới ở mỗi mốc cron vẫn tìm hết ô thiếu; truy vấn chuyển tháng theo ngày Việt Nam', async () => {
    const queries = new Set<string>();
    for (let i = 1; i <= 10; i++) {
      const w = world([], { noRates: true });
      await w.execute(new Date(NOW.getTime() + (i - 1) * 600_000), true);
      for (const query of w.queries) queries.add(query);
    }
    expect(queries.size).toBe(20);
    expect(
      config
        .missingCellSearchFeeds([{ bank_code: 'mb', kind: 'deposit' }], new Date('2026-12-31T18:00:00Z'))
        .map((url: string) => new URL(url).searchParams.get('q')),
    ).toEqual(['lãi suất tiết kiệm 12 tháng MB tháng 1/2027']);
  });

  it('luật 6: POST có secret chạy rộng khi chưa có dòng hôm nay, chạy bổ sung khi đã có', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mb = BANKS.find((bank) => bank.code === 'mb');
    const w = world([], { onlyBanks: ['mb'] });
    vi.stubGlobal('fetch', w.fetcher);
    const request = () =>
      new Request('https://worker.test/bank-rates/run', {
        method: 'POST',
        headers: { 'X-Cron-Secret': w.env.BANK_RATES_SECRET },
      });
    const first = await handleBankRates(request(), w.env);
    expect(await first.json()).toMatchObject({ missing_before: 20, missing_after: 18, written: 2 });
    expect(w.publicCalls).toContain(mb?.url);
    const before = w.queries.length;
    const second = await handleBankRates(request(), w.env);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ missing_before: 18, missing_after: 18, written: 0 });
    expect(w.queries.slice(before)).toHaveLength(config.SUPPLEMENTAL_CELLS_PER_RUN);
    expect(w.queries.slice(before).join(' ')).not.toContain(' MB tháng');
  });
});

describe('BR-06 giữ hàng rào trong lượt bổ sung', () => {
  it('luật 4: tìm kiếm nhận trang đúng ngân hàng và báo cho phép, bỏ host/ngân hàng lạ và bài cũ', () => {
    const bank = BANKS.find((bank) => bank.code === 'mb') as Bank;
    const addresses = [
      `${bank.url}lai-suat`,
      'https://cafef.vn/lai-suat.chn',
      'https://bidv.com.vn/lai-suat',
      'https://unknown.example/lai-suat',
      'https://mbbank.com.vn.evil.example/lai-suat',
      'https://cafef.vn/bai-cu.chn',
    ];
    const rss = `<rss>${addresses
      .map(
        (url, index) =>
          `<item><title>Lãi suất vay mua nhà MB</title><link>https://www.bing.com/news/apiclick.aspx?url=${encodeURIComponent(url)}</link><pubDate>${index === 5 ? '2026-07-01' : '2026-11-13'}</pubDate></item>`,
      )
      .join('')}</rss>`;
    const feed = config.missingCellSearchFeeds([{ bank_code: bank.code, kind: 'loan' }], NOW)[0];
    expect(newsArticles(rss, feed, NOW, bank)).toEqual([
      expect.objectContaining({ source_url: addresses[0], source_kind: 'bank' }),
      expect.objectContaining({ source_url: addresses[1], source_kind: 'news' }),
    ]);
  });

  it.each([false, true])(
    'luật 4: trang dài + redirect + ghi gộp lỗi vẫn ≤ 50 subrequest (ghi lỗi=%s)',
    async (batchFailure) => {
      const w = world(partial(), { long: true, redirects: true, batchFailure });
      const result = await w.execute();
      expect(result.written).toBe(2);
      expect(result.missing_after).toBe(0);
      expect(w.saved.map(key)).toEqual(MISSING);
      expect(w.fetcher.mock.calls.length + w.run.mock.calls.length).toBeLessThanOrEqual(config.MAX_SUBREQUESTS);
      const posts = w.fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
      expect(posts).toHaveLength(batchFailure ? 3 : 1);
      expect(w.publicCalls.some((url) => url.includes('unknown.example'))).toBe(false);
    },
  );

  it('luật 4: lệch > 2 điểm giữ số cũ, log từng số loại cùng evidence ≤ 80 ký tự', async () => {
    const mb = BANKS.find((bank) => bank.code === 'mb') as Bank;
    const tech = BANKS.find((bank) => bank.code === 'techcombank') as Bank;
    const old = [
      { ...latest(mb, 'loan', '2026-11-12T00:00:00Z'), promo_rate: 4 },
      { ...latest(tech, 'deposit', '2026-11-12T00:00:00Z'), deposit_rate: 3 },
    ];
    const w = world([...partial(), ...old]);
    expect(await w.execute()).toMatchObject({ drifted: 2, written: 0, missing_before: 2, missing_after: 2 });
    expect(w.saved).toEqual([]);
    for (const [bank_code, field, value, evidence] of [
      ['mb', 'promo_rate', 6.5, loan(mb)],
      ['techcombank', 'deposit_rate', 5.5, deposit(tech)],
    ])
      expect(w.logger.warn).toHaveBeenCalledWith('bank-rates rejected value', {
        bank_code,
        field,
        value,
        reason: 'drift',
        evidence,
      });
  });

  it('luật 4: kỳ hạn khác và bài báo quá 90 ngày không lấp ô gửi', async () => {
    const w = world(partial(), { term: 6, stale: true });
    expect(await w.execute()).toMatchObject({ written: 1, missing_before: 2, missing_after: 1 });
    expect(w.saved.map(key)).toEqual(['mb:loan']);
    expect(w.logger.warn).toHaveBeenCalledWith(
      'bank-rates rejected value',
      expect.objectContaining({
        bank_code: 'techcombank',
        field: 'deposit_rate',
        value: 5.5,
        reason: 'wrong_term',
      }),
    );
  });

  it('luật 4: lỗi đọc DB dừng trước nguồn/AI; lỗi ghi lẻ không được tính là ô đủ', async () => {
    const read = world(partial(), { readFailure: true });
    await expect(read.execute()).rejects.toThrow('database HTTP 503');
    expect(read.publicCalls).toEqual([]);
    expect(read.run).not.toHaveBeenCalled();
    const write = world(partial(), { batchFailure: true, failBank: 'mb' });
    expect(await write.execute()).toMatchObject({ written: 1, failed: 1, missing_before: 2, missing_after: 1 });
    expect(write.saved.map(key)).toEqual(['techcombank:deposit']);
  });

  it('log cả trường bị loại trong dòng vẫn được giữ; ẩn SĐT trước khi cắt evidence', async () => {
    const bank = BANKS[0] as Bank;
    const badQuote = `${deposit(bank)} Liên hệ 0912345678. ${'Điều kiện. '.repeat(15)}`;
    const row = aiRow(bank);
    row.evidence.deposit_rate = badQuote;
    const logger = { warn: vi.fn() };
    const rates = await extractPage(
      { AI: { run: () => ({ response: JSON.stringify({ rates: [row] }) }) } },
      {
        source_kind: 'bank',
        source_url: bank.url,
      },
      loan(bank),
      { logger },
    );
    expect(rates).toHaveLength(1);
    expect(rates[0]).toMatchObject({ kind: 'loan', promo_rate: 6.5 });
    const details = logger.warn.mock.calls.find(([message]) => message === 'bank-rates rejected value')?.[1];
    expect(details).toMatchObject({
      bank_code: bank.code,
      field: 'deposit_rate',
      value: 5.5,
      reason: 'no_quote_in_text',
    });
    expect(details.evidence).toHaveLength(80);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('0912345678');
  });

  it('log số thành phần bị bỏ cùng dòng và số thuộc JSON sai khuôn mà không nới kiểm', async () => {
    const bank = BANKS[0] as Bank;
    const source = { source_kind: 'bank', source_url: bank.url };
    const logger = { warn: vi.fn() };
    const quote = `${bank.name} cho vay mua nhà lãi tham chiếu 7%/năm.`;
    const row = {
      ...empty(),
      bank_code: bank.code,
      reference_rate: 7,
      note: null,
      evidence: { ...empty(), reference_rate: quote },
    };
    const run = vi.fn().mockResolvedValue({ response: JSON.stringify({ rates: [row] }) });
    expect(await extractPage({ AI: { run } }, source, quote, { logger })).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith('bank-rates rejected value', {
      bank_code: bank.code,
      field: 'reference_rate',
      value: 7,
      reason: 'out_of_range',
      evidence: quote,
    });
    run.mockResolvedValue({ response: JSON.stringify({ rates: [{ ...row, extra: true }] }) });
    await expect(extractPage({ AI: { run } }, source, quote, { logger })).rejects.toThrow('AI JSON invalid');
    expect(logger.warn).toHaveBeenCalledWith('bank-rates rejected value', {
      bank_code: bank.code,
      field: 'reference_rate',
      value: 7,
      reason: 'json',
      evidence: quote,
    });
  });
});
