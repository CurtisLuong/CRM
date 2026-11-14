// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Worker source is JavaScript.
import * as config from '../../worker/bank-rates-config.js';
// @ts-expect-error Worker source is JavaScript.
import { SCAN_STATE_KEY } from '../../worker/bank-rates-state.js';

const { BANK_RATES_SUPPLEMENTAL_CRON, BANK_SOURCES, MAX_SUBREQUESTS, NEWS_FEEDS } = config;

type Bank = { code: string; name: string; url: string };
type Row = Record<string, unknown>;
type Job = { source_url: string; depth?: number; page?: unknown; role?: string };
type ScanState = {
  paused_until: string | null;
  visited: Record<string, { read_at: string; source_kind: string; rows: number; banks: string[] }>;
  queue: Job[];
};
type Prompt = { text: string; banks: { code: string }[]; kind?: string };
const BANKS: Bank[] = BANK_SOURCES;
const NOW = new Date('2026-11-14T12:10:00Z');
const FIELDS = ['promo_rate', 'promo_months', 'floating_rate', 'reference_rate', 'margin', 'deposit_rate'];
const empty = () => Object.fromEntries(FIELDS.map((field) => [field, null]));
const key = (row: Row) => `${row.bank_code}:${row.kind}`;
const loan = (bank: Bank) => `${bank.name} cho vay mua nhà ưu đãi 6.5%/năm.`;
const deposit = (bank: Bank) => `${bank.name} tiết kiệm cá nhân kỳ hạn 12 tháng 5.5%/năm.`;
const textFor = (codes: string[]) =>
  BANKS.filter((bank) => codes.includes(bank.code))
    .map((bank) => `${loan(bank)} ${deposit(bank)}`)
    .join(' ');
const complete = (now = NOW): Row[] =>
  BANKS.flatMap((bank) =>
    ['loan', 'deposit'].map((kind) => ({
      ...empty(),
      bank_code: bank.code,
      kind,
      fetched_at: now.toISOString(),
      published_on: '2026-11-14',
      promo_rate: kind === 'loan' ? 6.5 : null,
      deposit_rate: kind === 'deposit' ? 5.5 : null,
    })),
  );
const without = (keys: string[], now = NOW) => complete(now).filter((row) => !keys.includes(key(row)));
const article = (url: string, title = 'Lãi suất vay mua nhà', date = '2026-11-14') =>
  `<item><title>${title}</title><link>${url}</link><pubDate>${date}</pubDate></item>`;
const searchArticle = (url: string, title?: string, date?: string) =>
  article(`https://www.bing.com/news/apiclick.aspx?url=${encodeURIComponent(url)}`, title, date);
const rss = (...items: string[]) => `<rss>${items.join('')}</rss>`;
const html = (text = 'Chưa công bố số.', day = '2026-11-14') =>
  `${day ? `<time datetime="${day}"></time>` : ''}<p>${text}</p>`;

class FakeKV {
  private values = new Map<string, string>();
  async get(key: string, type: string) {
    const value = this.values.get(key);
    return value ? (type === 'json' ? JSON.parse(value) : value) : null;
  }
  async put(key: string, value: string) {
    this.values.set(key, value);
  }
  state(): ScanState {
    return JSON.parse(this.values.get(SCAN_STATE_KEY) || '{}');
  }
}

function world(initial = without(['mb:loan'])) {
  const rows = [...initial],
    saved: Row[] = [],
    publicCalls: string[] = [],
    queries: string[] = [];
  const prompts: Prompt[] = [];
  const kv = new FakeKV();
  const pages = new Map<string, string>();
  const responses = new Map<string, () => Response>();
  const logger = { log: vi.fn(), warn: vi.fn() };
  const options = {
    search: (_query: string): string => rss(),
    quota: null as unknown,
    batchFailure: false,
    writeFailure: false,
    readFailure: false,
    ai: null as null | ((prompt: Prompt) => unknown),
  };
  const run = vi.fn(async (_model: string, params: { messages: { content: string }[] }) => {
    const prompt: Prompt = JSON.parse(params.messages[1]?.content || '{}');
    prompts.push(prompt);
    if (options.quota) throw options.quota;
    if (options.ai) return options.ai(prompt);
    const rates = BANKS.filter((bank) => prompt.text.includes(loan(bank)) || prompt.text.includes(deposit(bank))).map(
      (bank) => ({
        ...empty(),
        bank_code: bank.code,
        note: null,
        promo_rate: prompt.text.includes(loan(bank)) ? 6.5 : null,
        deposit_rate: prompt.text.includes(deposit(bank)) ? 5.5 : null,
        evidence: {
          ...empty(),
          promo_rate: prompt.text.includes(loan(bank)) ? loan(bank) : null,
          deposit_rate: prompt.text.includes(deposit(bank)) ? deposit(bank) : null,
        },
      }),
    );
    return { response: JSON.stringify({ rates }) };
  });
  const env = {
    SUPABASE_URL: 'https://sb.test',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-key',
    BANK_RATES_SECRET: 'fixture-secret',
    AI: { run },
    BANK_RATES_STATE: kv,
  };
  const fetcher = vi.fn(async (address: string, init?: RequestInit) => {
    const url = new URL(address);
    if (url.hostname === 'sb.test') {
      if (init?.method !== 'POST')
        return new Response(JSON.stringify(rows), { status: options.readFailure ? 503 : 200 });
      const payload = JSON.parse(String(init.body));
      if (options.writeFailure || (options.batchFailure && Array.isArray(payload)))
        return new Response(null, { status: 503 });
      const batch: Row[] = [payload].flat();
      saved.push(...batch);
      for (const row of batch) {
        const index = rows.findIndex((old) => key(old) === key(row));
        if (index < 0) rows.push(row);
        else rows[index] = row;
      }
      return new Response(null, { status: 201 });
    }
    publicCalls.push(address);
    const response = responses.get(address);
    if (response) return response();
    if (url.hostname === 'www.bing.com') {
      const query = url.searchParams.get('q') || '';
      queries.push(query);
      return new Response(options.search(query));
    }
    return new Response(pages.get(address) || (NEWS_FEEDS.includes(address) ? rss() : html()));
  });
  const execute = async (now = NOW, supplemental?: boolean) => {
    // Mỗi lượt nạp lại module và env: không được nhờ con trỏ WeakMap của isolate trước.
    vi.resetModules();
    // @ts-expect-error Worker source is JavaScript.
    const { runBankRates } = await import('../../worker/bank-rates.js');
    const requests = fetcher.mock.calls.length,
      calls = run.mock.calls.length;
    const result = await runBankRates({ ...env }, { now, supplemental, fetcher, logger });
    expect(fetcher.mock.calls.length - requests + run.mock.calls.length - calls).toBeLessThanOrEqual(MAX_SUBREQUESTS);
    return result;
  };
  return {
    rows,
    saved,
    publicCalls,
    queries,
    prompts,
    kv,
    pages,
    responses,
    logger,
    options,
    run,
    env,
    fetcher,
    execute,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('BR-09 ô và thứ tự ưu tiên', () => {
  it('luật 1: ngày VN, vay chỉ cần ưu đãi/thả nổi, gửi phải có deposit_rate', async () => {
    const rows = complete(new Date('2026-11-13T17:01:00Z'));
    rows[0] = { ...rows[0], promo_rate: null, floating_rate: 10 };
    rows[2] = { ...rows[2], promo_rate: null, reference_rate: 7, margin: 3 };
    rows[3] = { ...rows[3], deposit_rate: null };
    rows[4] = { ...rows[4], fetched_at: '2026-11-13T16:59:59Z' };
    const result = await world(rows).execute();
    expect(result).toMatchObject({ missing_before: 3, missing_after: 3, written: 0 });
    expect(result.cells).not.toContainEqual({ bank_code: 'bidv', kind: 'loan' });
  });

  it('luật 2: đủ 20 ô chỉ đọc DB, không fetch trang/AI', async () => {
    const w = world(complete());
    expect(await w.execute()).toMatchObject({
      skipped: 'complete_today',
      pages: 0,
      ai_calls: 0,
      cells: [],
      skipped_urls: 0,
      queue: 0,
    });
    expect(w.fetcher).toHaveBeenCalledTimes(1);
    expect(w.publicCalls).toEqual([]);
    expect(w.run).not.toHaveBeenCalled();
  });

  it.each([true, false, undefined])(
    'luật 3: ngân hàng A đủ hai ô không bị truy vấn/mở trang, tìm B (chế độ=%s)',
    async (mode) => {
      const w = world(without(['mb:loan', 'mb:deposit']));
      const result = await w.execute(NOW, mode);
      expect(result.cells).toEqual([
        { bank_code: 'mb', kind: 'loan' },
        { bank_code: 'mb', kind: 'deposit' },
      ]);
      expect(w.queries).toHaveLength(2);
      expect(w.queries.every((query) => query.includes(' MB '))).toBe(true);
      expect(w.publicCalls).toContain('https://mbbank.com.vn/');
      expect(w.publicCalls.some((url) => url.includes('acb.com.vn'))).toBe(false);
      expect(w.publicCalls.filter((url) => BANKS.some((bank) => bank.url === url))).toEqual(['https://mbbank.com.vn/']);
    },
  );

  it('luật 3: ô trống trước, sau đó ô có ngày nguồn cũ nhất', async () => {
    const rows = without(['sacombank:deposit', 'bidv:loan', 'vietinbank:loan']);
    rows.push(
      { ...complete()[0], published_on: '2026-11-10', fetched_at: '2026-11-13T00:00:00Z' },
      { ...complete()[2], published_on: '2026-11-02', fetched_at: '2026-11-13T00:00:00Z' },
    );
    expect((await world(rows).execute()).cells).toEqual([
      { bank_code: 'sacombank', kind: 'deposit' },
      { bank_code: 'vietinbank', kind: 'loan' },
    ]);
  });

  it('luật 3–5: khi mọi nguồn của ô ưu tiên đang nghỉ thì tiếp tục ô còn nguồn chưa đọc', async () => {
    const w = world(without(['mb:loan', 'mb:deposit', 'acb:loan', 'acb:deposit']));
    for (let i = 0; i < 4; i++) await w.execute(new Date(NOW.getTime() + i * 10 * 60_000));
    const start = w.queries.length;
    expect((await w.execute(new Date(NOW.getTime() + 40 * 60_000))).cells).toEqual([
      { bank_code: 'acb', kind: 'loan' },
      { bank_code: 'acb', kind: 'deposit' },
    ]);
    expect(w.queries.slice(start).every((query) => query.includes(' ACB '))).toBe(true);
  });
});

describe('BR-09 hàng chờ bền qua isolate', () => {
  it('luật 4–5: trang X không có số được nghỉ, lượt sau đọc URL khác rồi mở các mẫu b/c/d', async () => {
    const w = world();
    const urls = Array.from({ length: 20 }, (_, i) => `https://cafef.vn/lai-suat-${i}.chn`);
    w.options.search = () => rss(...urls.map((url) => searchArticle(url)));
    const first = await w.execute();
    expect(first).toMatchObject({ written: 0, skipped_urls: 0 });
    expect(first.queue).toBeGreaterThan(0);
    expect(w.kv.state().visited[urls[0] as string]).toEqual({
      read_at: NOW.toISOString(),
      source_kind: 'news',
      rows: 0,
      banks: [],
    });
    const boundary = w.publicCalls.length;
    const second = await w.execute(new Date(NOW.getTime() + 10 * 60_000));
    expect(second.skipped_urls).toBeGreaterThan(0);
    expect(w.publicCalls.slice(boundary)).not.toContain(urls[0]);
    expect(w.publicCalls.slice(boundary).some((url) => urls.includes(url))).toBe(true);
    expect(w.queries).toHaveLength(1);
    for (let i = 2; i < 5; i++) await w.execute(new Date(NOW.getTime() + i * 10 * 60_000));
    expect(w.queries).toEqual([
      'lãi suất vay mua nhà MB tháng 11/2026',
      'lãi suất vay mua nhà MB',
      'so sánh lãi suất vay mua nhà các ngân hàng tháng 11/2026',
      'lãi suất vay mua nhà MB tháng 10/2026',
    ]);
    const after = w.publicCalls.length;
    await w.execute(new Date(NOW.getTime() + 7 * 86_400_000));
    expect(w.publicCalls.slice(after)).toContain(urls[0]);
  });

  it('luật 4: tìm kiếm/danh mục nghỉ 6 giờ, trang ngân hàng 24 giờ, báo 7 ngày', async () => {
    const w = world();
    const url = 'https://cafef.vn/lai-suat.chn';
    w.options.search = () => rss(searchArticle(url));
    await w.execute();
    const firstQuery = w.publicCalls.find((url) => url.includes('bing.com')) as string;
    let start = w.publicCalls.length;
    await w.execute(new Date(NOW.getTime() + 6 * 3_600_000 - 1));
    expect(w.publicCalls.slice(start)).not.toContain(firstQuery);
    expect(w.publicCalls.slice(start)).not.toContain(NEWS_FEEDS[0]);
    start = w.publicCalls.length;
    await w.execute(new Date(NOW.getTime() + 6 * 3_600_000));
    expect(w.publicCalls.slice(start)).toContain(firstQuery);
    expect(w.publicCalls.slice(start)).toContain(NEWS_FEEDS[0]);
    expect(w.publicCalls.slice(start)).not.toContain('https://mbbank.com.vn/');
    expect(w.publicCalls.slice(start)).not.toContain(url);
    start = w.publicCalls.length;
    await w.execute(new Date(NOW.getTime() + 24 * 3_600_000));
    expect(w.publicCalls.slice(start)).toContain('https://mbbank.com.vn/');
    expect(w.publicCalls.slice(start)).not.toContain(url);
  });

  it('luật 5: danh mục báo và liên kết ngân hàng đi qua KV tới sâu 3 lớp, không mở lớp 4/host lạ', async () => {
    const w = world();
    const news = 'https://cafef.vn/tu-danh-muc.chn';
    w.pages.set(NEWS_FEEDS[0], rss(article(news)));
    for (let i = 0; i <= 3; i++) {
      w.pages.set(
        `https://mbbank.com.vn/${i ? `tang-${i}` : ''}`,
        `${html()}<a href="/tang-${i + 1}">Lãi suất</a><a href="https://evil.example/">Lãi suất</a>`,
      );
    }
    // Hết AI sau trang chủ; liên kết trang con phải nằm trong KV cho isolate sau.
    const articles = Array.from({ length: 12 }, (_, i) => `https://cafef.vn/cho-${i}.chn`);
    w.options.search = () => rss(...articles.map((url) => searchArticle(url)));
    await w.execute();
    expect(w.kv.state().queue).toContainEqual(
      expect.objectContaining({ source_url: 'https://mbbank.com.vn/tang-1', depth: 1 }),
    );
    await w.execute(new Date(NOW.getTime() + 10 * 60_000));
    expect(w.publicCalls).toEqual(
      expect.arrayContaining([news, ...[1, 2, 3].map((i) => `https://mbbank.com.vn/tang-${i}`)]),
    );
    expect(w.publicCalls).not.toContain('https://mbbank.com.vn/tang-4');
    expect(w.publicCalls.some((url) => url.includes('evil.example'))).toBe(false);
  });

  it('luật 5: mẫu gửi có so sánh nhiều ngân hàng và tháng trước đúng khi đổi năm', async () => {
    const now = new Date('2026-12-31T18:00:00Z');
    const w = world(without(['mb:deposit'], now));
    for (let i = 0; i < 4; i++) await w.execute(new Date(now.getTime() + i * 10 * 60_000));
    expect(w.queries).toEqual([
      'lãi suất tiết kiệm 12 tháng MB tháng 1/2027',
      'lãi suất tiết kiệm 12 tháng MB',
      'bảng lãi suất tiết kiệm 12 tháng các ngân hàng tháng 1/2027',
      'lãi suất tiết kiệm 12 tháng MB tháng 12/2026',
    ]);
  });

  it('luật 4: nhớ cả redirect và giữ đúng thời gian nghỉ của danh mục', async () => {
    const w = world();
    const target = 'https://cafef.vn/rss-chuyen-huong.rss';
    w.responses.set(NEWS_FEEDS[0], () => new Response(null, { status: 302, headers: { Location: target } }));
    w.pages.set(target, rss());
    await w.execute();
    expect(w.kv.state().visited[target]?.source_kind).toBe('feed');
    const start = w.publicCalls.length;
    await w.execute(new Date(NOW.getTime() + 6 * 3_600_000));
    expect(w.publicCalls.slice(start)).toContain(target);
  });

  it('luật 5: danh mục đọc lỗi nằm trong hàng chờ KV và được đọc tiếp sau thời gian nghỉ', async () => {
    const w = world();
    w.responses.set(NEWS_FEEDS[0], () => new Response(null, { status: 503 }));
    await w.execute();
    expect(w.kv.state().queue).toContainEqual(expect.objectContaining({ source_url: NEWS_FEEDS[0], role: 'feed' }));
    const start = w.publicCalls.length;
    await w.execute(new Date(NOW.getTime() + 10 * 60_000));
    expect(w.publicCalls.slice(start)).not.toContain(NEWS_FEEDS[0]);
    w.responses.delete(NEWS_FEEDS[0]);
    const url = 'https://cafef.vn/doc-tiep.chn';
    w.pages.set(NEWS_FEEDS[0], rss(article(url)));
    w.pages.set(url, html(textFor(['mb'])));
    // Sau 6 giờ đã qua ngày VN mới, bài báo lấp được cả hai ô của MB.
    expect(await w.execute(new Date(NOW.getTime() + 6 * 3_600_000))).toMatchObject({ written: 2 });
    expect(w.saved.map(key)).toEqual(['mb:loan', 'mb:deposit']);
    expect(w.saved[0]).toMatchObject({ source_url: url });
  });
});

describe('BR-09 bài so sánh và ngày nguồn', () => {
  it.each([
    'So sánh lãi suất vay mua nhà các ngân hàng',
    'Lãi suất vay mua nhà BIDV VietinBank',
    'Bảng lãi suất vay mua nhà',
  ])('luật 6, 10: bài "%s" đi trước bài đơn, lấp 4 ngân hàng và ghi nhật ký', async (title) => {
    const codes = ['bidv', 'vietinbank', 'agribank', 'vietcombank'];
    const w = world(without(codes.map((code) => `${code}:loan`)));
    const single = 'https://cafef.vn/don.chn',
      comparison = 'https://cafef.vn/so-sanh.chn';
    w.options.search = () => rss(searchArticle(single), searchArticle(comparison, title));
    w.pages.set(comparison, html(textFor(codes)));
    const result = await w.execute();
    expect(result).toMatchObject({
      written: 4,
      missing_before: 4,
      missing_after: 0,
      cells: [
        { bank_code: 'bidv', kind: 'loan' },
        { bank_code: 'vietinbank', kind: 'loan' },
      ],
    });
    expect(w.saved.map(key)).toEqual(codes.map((code) => `${code}:loan`));
    expect(w.publicCalls).not.toContain(single);
    expect(w.publicCalls.filter((url) => BANKS.some((bank) => bank.url === url))).toEqual([]);
    expect(w.kv.state().visited[comparison]).toMatchObject({ rows: 4, banks: codes });
    expect(w.logger.log).toHaveBeenCalledWith('bank-rates page', {
      url: comparison,
      source_kind: 'news',
      ai_rows: 4,
      accepted: 4,
    });
    expect(w.prompts[0]?.banks).toHaveLength(10);
    const fetches = w.fetcher.mock.calls.length,
      calls = w.run.mock.calls.length;
    expect(await w.execute()).toMatchObject({ skipped: 'complete_today', pages: 0, ai_calls: 0 });
    expect(w.fetcher).toHaveBeenCalledTimes(fetches + 1);
    expect(w.run).toHaveBeenCalledTimes(calls);
  });

  it('luật 6, 9: trang acb.com.vn có số Vietcombank bị loại', async () => {
    const w = world(without(['acb:loan', 'vietcombank:loan']));
    w.pages.set('https://acb.com.vn/', html(textFor(['vietcombank'])));
    expect(await w.execute()).toMatchObject({ written: 0 });
    expect(w.saved).toEqual([]);
    expect(w.logger.warn).toHaveBeenCalledWith(
      'bank-rates rejected value',
      expect.objectContaining({ reason: 'wrong_bank', bank_code: 'vietcombank' }),
    );
  });

  it.each(['2026-11-01', '2026-11-10', '2026-11-12', ''])(
    'luật 7: nguồn %s đối chiếu ô đang hiện ngày 10/11',
    async (day) => {
      const previous = { ...complete()[8], fetched_at: '2026-11-13T00:00:00Z', published_on: '2026-11-10' };
      const w = world([...without(['mb:loan']), previous]);
      const url = 'https://cafef.vn/ngay-nguon.chn';
      w.options.search = () => rss(searchArticle(url, 'Lãi suất vay mua nhà MB', day));
      w.pages.set(url, html(textFor(['mb']), day));
      const expected = day === '2026-11-01' ? 0 : 1;
      expect(await w.execute()).toMatchObject({ written: expected, missing_after: 1 - expected });
      if (expected) expect(w.saved[0]).toMatchObject({ fetched_at: NOW.toISOString(), published_on: day || null });
    },
  );

  it('luật 7: ngày nguồn mới hơn thắng ưu tiên ngân hàng khi có nhiều ứng viên', async () => {
    const w = world(without(['mb:loan', 'acb:loan']));
    const old = 'https://mbbank.com.vn/uu-dai',
      fresh = 'https://cafef.vn/moi.chn';
    w.options.search = (query) =>
      query.includes(' MB ')
        ? rss(searchArticle(old, 'Lãi suất vay mua nhà MB', '2026-11-01'))
        : rss(searchArticle(fresh, 'Lãi suất vay mua nhà MB', '2026-11-12'));
    w.pages.set(old, html(textFor(['mb']), '2026-11-01'));
    w.pages.set(fresh, html(textFor(['mb']), '2026-11-12'));
    expect(await w.execute()).toMatchObject({ written: 1 });
    expect(w.saved[0]).toMatchObject({ bank_code: 'mb', source_kind: 'news', published_on: '2026-11-12' });
  });

  it('luật 7: chọn dòng mới nhất giữa mọi loại nguồn; thiếu ngày dùng ngày VN của fetched_at', async () => {
    // @ts-expect-error Worker source is JavaScript.
    const { newestRates } = await import('../../worker/bank-rates-state.js');
    const olderBank = { ...complete()[8], source_kind: 'bank', published_on: '2026-11-10' };
    const newerNews = { ...olderBank, source_kind: 'news', published_on: '2026-11-12' };
    expect(newestRates([olderBank, newerNews], NOW)).toEqual([newerNews]);
    expect(newestRates([newerNews, olderBank], NOW)).toEqual([newerNews]);
    const fallback = { ...newerNews, published_on: null, fetched_at: '2026-11-13T17:01:00Z' };
    expect(newestRates([newerNews, fallback], NOW)).toEqual([fallback]);
    const sameDayBank = { ...olderBank, published_on: '2026-11-12' };
    expect(newestRates([newerNews, sameDayBank], NOW)).toEqual([sameDayBank]);
  });

  it('luật 1, 7: nhận ngày bài báo hôm nay theo VN khi UTC còn ở ngày trước', async () => {
    const now = new Date('2026-11-14T17:10:00Z');
    const w = world(without(['mb:loan'], now));
    const url = 'https://cafef.vn/ngay-viet-nam.chn';
    w.options.search = () => rss(searchArticle(url, 'Lãi suất vay mua nhà MB', '2026-11-15'));
    w.pages.set(url, html(textFor(['mb']), '2026-11-15'));
    expect(await w.execute(now)).toMatchObject({ written: 1, missing_after: 0 });
    expect(w.saved[0]).toMatchObject({ published_on: '2026-11-15' });
  });
});

describe('BR-09 hạn mức và hàng rào', () => {
  it.each([new Error('4006: allocation exhausted'), new Error('daily free allocation exceeded'), { status: 429 }])(
    'luật 8: hết hạn mức dừng ngay, 23:50 không fetch/AI, 00:10 tiếp tục từ KV (%j)',
    async (error) => {
      const start = new Date('2026-11-14T23:40:00Z');
      const w = world(without(['mb:loan'], start));
      const url = 'https://cafef.vn/doi-ai.chn';
      w.options.search = () => rss(searchArticle(url));
      w.pages.set(url, html(`${textFor(['mb'])} ${'Điều kiện vay mua nhà. '.repeat(600)}`));
      w.options.quota = error;
      expect(await w.execute(start)).toMatchObject({
        written: 0,
        ai_calls: 1,
        paused_until: '2026-11-15T00:00:00.000Z',
      });
      expect(w.kv.state().paused_until).toBe('2026-11-15T00:00:00.000Z');
      expect(w.kv.state().queue.find((job) => job.source_url === url)?.page).toBeDefined();
      const fetches = w.fetcher.mock.calls.length,
        aiCalls = w.run.mock.calls.length;
      expect(await w.execute(new Date('2026-11-14T23:50:00Z'))).toMatchObject({
        skipped: 'ai_quota',
        until: '2026-11-15T00:00:00.000Z',
        pages: 0,
        ai_calls: 0,
      });
      expect(w.fetcher).toHaveBeenCalledTimes(fetches);
      expect(w.run).toHaveBeenCalledTimes(aiCalls);
      w.options.quota = null;
      expect(await w.execute(new Date('2026-11-15T00:10:00Z'))).toMatchObject({ written: 1, pages: 0 });
      expect(w.kv.state().paused_until).toBeNull();
      expect(w.publicCalls.filter((address) => address === url)).toHaveLength(1);
    },
  );

  it('luật 8: lỗi AI thường không tạo lịch nghỉ hạn mức', async () => {
    const w = world();
    w.options.quota = new Error('temporary unavailable');
    expect(await w.execute()).toMatchObject({ written: 0 });
    expect(w.kv.state().paused_until).toBeNull();
  });

  it('luật 9: không nới độ lệch khi dùng KV', async () => {
    const w = world([...without(['mb:loan']), { ...complete()[8], promo_rate: 3, fetched_at: '2026-11-13T00:00:00Z' }]);
    w.pages.set('https://mbbank.com.vn/', html(textFor(['mb'])));
    expect(await w.execute()).toMatchObject({ written: 0, drifted: 1, rejected: { drift: 1 } });
    expect(w.kv.state().visited['https://mbbank.com.vn/']?.banks).toEqual([]);
  });

  it.each([
    ['no_quote_in_text', 'MB cho vay mua nhà ưu đãi 6.5%/năm.', 'Chưa công bố số.', 'promo_rate', 6.5],
    [
      'wrong_bank',
      'MB cho vay mua nhà ưu đãi 6.5%/năm. BIDV 7%/năm.',
      'MB cho vay mua nhà ưu đãi 6.5%/năm. BIDV 7%/năm.',
      'promo_rate',
      7,
    ],
    ['no_context', 'MB cho vay tín chấp 6.5%/năm.', 'MB cho vay tín chấp 6.5%/năm.', 'promo_rate', 6.5],
    ['out_of_range', 'MB cho vay mua nhà ưu đãi 25%/năm.', 'MB cho vay mua nhà ưu đãi 25%/năm.', 'promo_rate', 25],
    [
      'wrong_term',
      'MB tiết kiệm cá nhân kỳ hạn 6 tháng 5.5%/năm.',
      'MB tiết kiệm cá nhân kỳ hạn 6 tháng 5.5%/năm.',
      'deposit_rate',
      5.5,
    ],
    [
      'out_of_range',
      'MB tiết kiệm cá nhân kỳ hạn 12 tháng 13%/năm.',
      'MB tiết kiệm cá nhân kỳ hạn 12 tháng 13%/năm.',
      'deposit_rate',
      13,
    ],
  ])('luật 9: giữ kiểm số %s với KV', async (reason, quote, text, field, value) => {
    const w = world(without(['mb:loan', 'mb:deposit']));
    const url = 'https://cafef.vn/kiem-so.chn';
    w.options.search = () => rss(searchArticle(url));
    w.pages.set(url, html(String(text)));
    w.options.ai = (prompt) => ({
      response: JSON.stringify({
        rates:
          prompt.text === text
            ? [
                {
                  ...empty(),
                  bank_code: 'mb',
                  note: null,
                  [field]: value,
                  evidence: { ...empty(), [field]: quote },
                },
              ]
            : [],
      }),
    });
    expect(await w.execute()).toMatchObject({ written: 0 });
    expect(w.logger.warn).toHaveBeenCalledWith(
      'bank-rates rejected value',
      expect.objectContaining({ reason, bank_code: 'mb' }),
    );
  });

  it('luật 4: ngân hàng chỉ được tính đã lấp sau khi ghi DB thành công', async () => {
    const w = world();
    w.options.writeFailure = true;
    w.pages.set('https://mbbank.com.vn/', html(textFor(['mb'])));
    expect(await w.execute()).toMatchObject({ written: 0, failed: 1, missing_after: 1 });
    expect(w.kv.state().visited['https://mbbank.com.vn/']).toMatchObject({ rows: 1, banks: [] });
  });

  it('luật 8–10: nhiều trang dài, lỗi ghi gộp vẫn không quá 50 fetch + AI mỗi lượt', async () => {
    const w = world([]);
    w.options.batchFailure = true;
    const urls = Array.from({ length: 50 }, (_, i) => `https://cafef.vn/nhieu-${i}.chn`);
    w.options.search = () => rss(...urls.map((url) => searchArticle(url, 'Bảng lãi suất vay mua nhà các ngân hàng')));
    for (const url of urls)
      w.pages.set(url, html(`${textFor(BANKS.map((bank) => bank.code))} ${'Điều kiện áp dụng. '.repeat(900)}`));
    const result = await w.execute();
    expect(result.written).toBeGreaterThan(0);
    expect(w.fetcher.mock.calls.length + w.run.mock.calls.length).toBeLessThanOrEqual(MAX_SUBREQUESTS);
    expect(result).toHaveProperty('queue');
    expect(w.logger.log).toHaveBeenCalledWith(
      'bank-rates summary',
      expect.objectContaining({ cells: result.cells, skipped_urls: result.skipped_urls, queue: result.queue }),
    );
  });

  it('đọc DB lỗi phải dừng trước trang và AI', async () => {
    const w = world();
    w.options.readFailure = true;
    await expect(w.execute()).rejects.toThrow('database HTTP 503');
    expect(w.publicCalls).toEqual([]);
    expect(w.run).not.toHaveBeenCalled();
  });

  it('luật 8–10: redirect + AI dài + lỗi ghi gộp dừng đúng trần 50 subrequest', async () => {
    const w = world([]);
    w.options.batchFailure = true;
    const urls = Array.from({ length: 20 }, (_, i) => `https://cafef.vn/budget-${i}.chn`);
    w.options.search = () => rss(...urls.map((url) => searchArticle(url, 'Bảng lãi suất vay mua nhà các ngân hàng')));
    for (const url of urls) {
      for (let depth = 0; depth < 3; depth++) {
        w.responses.set(
          `${url}${depth || ''}`,
          () => new Response(null, { status: 302, headers: { Location: `${url}${depth + 1}` } }),
        );
      }
      w.pages.set(
        `${url}3`,
        html(`${textFor(BANKS.slice(0, 9).map((bank) => bank.code))} ${'Điều kiện áp dụng. '.repeat(900)}`),
      );
    }
    const result = await w.execute();
    expect(result.written).toBeGreaterThan(0);
    expect(result.failed).toBeGreaterThan(0);
    expect(w.fetcher.mock.calls.length + w.run.mock.calls.length).toBe(MAX_SUBREQUESTS);
  });

  it('luật 2, 9: cron cả ngày, bỏ trùng 00:00; gọi tay cũng là một lượt dùng KV', async () => {
    expect(BANK_RATES_SUPPLEMENTAL_CRON).toBe('*/10 * * * *');
    const toml = readFileSync(new URL('../../worker/wrangler.toml', import.meta.url), 'utf8');
    expect(toml).toContain('crons = ["*/5 * * * *", "0 0 * * *", "*/10 * * * *"]');
    const w = world();
    vi.stubGlobal('fetch', w.fetcher);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    // @ts-expect-error Worker source is JavaScript.
    const { default: worker } = await import('../../worker/intake-worker.js');
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) };
    await worker.scheduled(
      { cron: BANK_RATES_SUPPLEMENTAL_CRON, scheduledTime: Date.parse('2026-11-14T00:00:00Z') },
      w.env,
      ctx,
    );
    expect(pending).toHaveLength(0);
    await worker.scheduled({ cron: BANK_RATES_SUPPLEMENTAL_CRON, scheduledTime: NOW.getTime() }, w.env, ctx);
    await Promise.all(pending);
    expect(w.queries).toHaveLength(1);
    const response = await worker.fetch(
      new Request('https://worker.test/bank-rates/run', {
        method: 'POST',
        headers: { 'X-Cron-Secret': w.env.BANK_RATES_SECRET },
      }),
      { ...w.env },
      {},
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ written: 0, cells: [{ bank_code: 'mb', kind: 'loan' }] });
    expect(w.queries[1]).toBe('lãi suất vay mua nhà MB');
  });
});
