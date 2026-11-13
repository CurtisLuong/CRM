// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Worker source is JavaScript.
import { runBankRates } from '../../worker/bank-rates.js';
// @ts-expect-error Worker source is JavaScript.
import * as config from '../../worker/bank-rates-config.js';
// @ts-expect-error Worker source is JavaScript.
import * as extraction from '../../worker/bank-rates-extract.js';
// @ts-expect-error Worker source is JavaScript.
import * as sources from '../../worker/bank-rates-sources.js';

const { BANK_RATES_PROMPT, exceedsDrift, extractPage, parseRates, preferredRates, validateDepositRate } = extraction;
const { bingArticleUrl, dateOnly, newsArticles, newsSourceUrl, pageMetadata, recentNews } = sources;
const { BANK_SOURCES, MAX_NEWS_AGE_DAYS, MAX_PAGES, MIN_NEWS_PAGES, NEWS_FEEDS, newsSearchFeeds } = config;
type Row = Record<string, unknown>;
const NOW = new Date('2026-11-12T00:00:00Z');
const URL = 'https://doanhnhan.baophapluat.vn/lai-suat-big4.html';
const SOURCE = { source_kind: 'news', source_url: URL, published_on: '2026-09-04' };
const LOAN_FIELDS = ['promo_rate', 'promo_months', 'floating_rate', 'reference_rate', 'margin'];
const quote = (rate = 5.9, bank = 'BIDV') =>
  `${bank} niêm yết lãi suất tiết kiệm cá nhân kỳ hạn 12 tháng online ${rate}%/năm.`;
const LOAN = 'BIDV cho vay mua nhà ưu đãi 6,5%/năm.';
function deposit(rate = 5.9, evidence = quote(rate), patch: Row = {}): Row {
  return {
    bank_code: 'bidv',
    ...Object.fromEntries(LOAN_FIELDS.map((key) => [key, null])),
    deposit_rate: rate,
    note: evidence,
    evidence: { ...Object.fromEntries(LOAN_FIELDS.map((key) => [key, null])), deposit_rate: evidence },
    ...patch,
  };
}
const combined = () => ({
  ...deposit(),
  promo_rate: 6.5,
  evidence: { ...(deposit().evidence as Row), promo_rate: LOAN },
});
const bingLink = (url: string) => `https://www.bing.com/news/apiclick.aspx?url=${encodeURIComponent(url)}`;
const rss = (url = URL, day = '2026-09-04', title = 'Lãi suất tiết kiệm 12 tháng Big4') =>
  `<rss><channel><item><title>${title}</title><link><![CDATA[${bingLink(url)}]]></link><pubDate>${day}</pubDate></item></channel></rss>`;

describe('BR-03 trích và tách lãi gửi 12 tháng', () => {
  it('một bài sinh dòng vay/gửi riêng cho cùng ngân hàng và dòng gửi cho ngân hàng khác', async () => {
    const vcb = deposit(5.8, quote(5.8, 'Vietcombank'), { bank_code: 'vietcombank' });
    const run = vi.fn().mockResolvedValue({ response: JSON.stringify({ rates: [combined(), vcb] }) });
    const rows = await extractPage({ AI: { run } }, SOURCE, `${quote()} ${LOAN} ${quote(5.8, 'Vietcombank')}`);
    expect(rows).toHaveLength(3);
    expect(rows).toEqual([
      expect.objectContaining({ bank_code: 'bidv', kind: 'loan', promo_rate: 6.5, deposit_rate: null }),
      expect.objectContaining({ bank_code: 'bidv', kind: 'deposit', deposit_rate: 5.9, note: quote() }),
      expect.objectContaining({ bank_code: 'vietcombank', kind: 'deposit', deposit_rate: 5.8 }),
    ]);
    for (const row of rows.filter((row: Row) => row.kind === 'deposit'))
      for (const key of LOAN_FIELDS) expect(row[key]).toBeNull();
    expect(BANK_RATES_PROMPT).toContain('deposit_rate');
    expect(BANK_RATES_PROMPT).toContain('NGUYÊN VĂN');
    expect(BANK_RATES_PROMPT).toContain('TUYỆT ĐỐI KHÔNG suy đoán');
    expect(BANK_RATES_PROMPT).toContain('số tiền rất lớn');
  });

  it.each([1, 5.9, 12])('nhận lãi gửi %s trong khoảng 1–12', (rate) => {
    expect(validateDepositRate(deposit(rate), SOURCE, quote(rate))).toMatchObject({
      kind: 'deposit',
      deposit_rate: rate,
    });
  });

  it.each([0, 0.99, 12.01, 20])('bỏ lãi gửi %s ngoài khoảng 1–12', (rate) => {
    expect(validateDepositRate(deposit(rate), SOURCE, quote(rate))).toBeNull();
  });

  it.each([
    quote().replace('12 tháng', '6 tháng'),
    quote().replace('12 tháng', '24 tháng'),
    'BIDV lãi suất cho vay mua nhà cố định 12 tháng 5.9%/năm.',
    'BIDV tiền gửi doanh nghiệp kỳ hạn 12 tháng 5.9%/năm.',
    'BIDV tiết kiệm 12 tháng đặc biệt từ 500 tỷ đồng hưởng 5.9%/năm.',
  ])('bỏ kỳ hạn khác, sai sản phẩm hoặc lãi đặc biệt: %s', (text) => {
    expect(validateDepositRate(deposit(5.9, text), SOURCE, text)).toBeNull();
  });

  it('trích dẫn nhiều kỳ hạn: chỉ nhận số của kỳ hạn 12 tháng (Lead, review BR-03)', () => {
    const text = 'BIDV lãi suất tiết kiệm kỳ hạn 6 tháng 4,5%/năm và 12 tháng 5,9%/năm.';
    expect(validateDepositRate(deposit(4.5, text), SOURCE, text)).toBeNull();
    expect(validateDepositRate(deposit(5.9, text), SOURCE, text)).toMatchObject({ deposit_rate: 5.9 });
    const after = 'BIDV trả 5,9%/năm cho tiền gửi tiết kiệm kỳ hạn 12 tháng.';
    expect(validateDepositRate(deposit(5.9, after), SOURCE, after)).toMatchObject({ deposit_rate: 5.9 });
  });

  it('không nhận số thiếu bằng chứng, trích dẫn bịa hoặc lấy số con trong số lớn', () => {
    expect(validateDepositRate(deposit(), SOURCE, 'Không công bố số liệu.')).toBeNull();
    expect(validateDepositRate(deposit(5.9, quote(15.9)), SOURCE, quote(15.9))).toBeNull();
    const missing = deposit();
    missing.evidence = { ...(missing.evidence as Row), deposit_rate: null };
    expect(parseRates(JSON.stringify({ rates: [missing] }))).toBeNull();
    expect(parseRates(JSON.stringify({ rates: [deposit('5.9' as unknown as number)] }))).toBeNull();
    expect(parseRates(JSON.stringify({ rates: [deposit()] }))).toHaveLength(1);
  });

  it('lãi online và tại quầy giữ kênh ghi trong note', () => {
    for (const text of [quote(), quote().replace('online', 'tại quầy')])
      expect(validateDepositRate(deposit(5.9, text), SOURCE, text)?.note).toBe(text);
    expect(
      validateDepositRate(deposit(5.9, quote(), { note: 'Điều kiện không có trong nguồn' }), SOURCE, quote())?.note,
    ).toBeNull();
  });

  it('chọn nguồn độc lập theo (ngân hàng, loại), không mất dòng vay khi có gửi mới hơn', () => {
    const loan = { bank_code: 'bidv', kind: 'loan', source_kind: 'bank', published_on: null, promo_rate: 6.5 };
    const bankDeposit = { ...loan, kind: 'deposit', deposit_rate: 5.9 };
    const newsDeposit = { ...bankDeposit, source_kind: 'news', published_on: '2026-11-12', deposit_rate: 6 };
    expect(preferredRates([loan, newsDeposit, bankDeposit])).toEqual([loan, bankDeposit]);
  });

  it('kiểm lệch theo loại: đúng 2 điểm nhận, hơn 2 điểm bỏ; vay không đối chiếu gửi', () => {
    const row = { bank_code: 'bidv', kind: 'deposit', deposit_rate: 5.9 };
    expect(exceedsDrift(row, { ...row, deposit_rate: 3.9 })).toBe(false);
    expect(exceedsDrift(row, { ...row, deposit_rate: 3.89 })).toBe(true);
    expect(exceedsDrift(row, { ...row, deposit_rate: 7.91 })).toBe(true);
    expect(exceedsDrift(row, { ...row, kind: 'loan', promo_rate: 10, deposit_rate: null })).toBe(false);
    expect(exceedsDrift({ kind: 'loan', promo_rate: 10 }, row)).toBe(false);
  });
});

describe('BR-03 nguồn báo, ngày nguồn và ngân sách', () => {
  it('cấu hình ba truy vấn mới theo tháng Việt Nam, không cố định tháng khi isolate sống lâu', () => {
    const queries = (now: Date) =>
      newsSearchFeeds(now).map((feed: string) => new globalThis.URL(feed).searchParams.get('q'));
    expect(queries(NOW)).toEqual(
      expect.arrayContaining([
        'lãi suất tiết kiệm 12 tháng',
        'lãi suất tiết kiệm Big4',
        'lãi suất vay mua nhà tháng 11/2026',
      ]),
    );
    expect(queries(new Date('2026-12-31T18:00:00Z'))).toContain('lãi suất vay mua nhà tháng 1/2027');
    expect(MAX_NEWS_AGE_DAYS).toBe(90);
    expect(MIN_NEWS_PAGES).toBe(10);
    expect(BANK_SOURCES.length + NEWS_FEEDS.length + newsSearchFeeds(NOW).length + MIN_NEWS_PAGES).toBe(MAX_PAGES);
  });

  it.each([
    '24h.com.vn',
    'thanhnien.vn',
    'tuoitre.vn',
    'vnexpress.net',
    'znews.vn',
    'laodong.vn',
    'baophapluat.vn',
    'doanhnhan.baophapluat.vn',
    'nguoiquansat.vn',
    'cafebiz.vn',
    'cafeland.vn',
    'batdongsan.com.vn',
    'baogialai.com.vn',
    'nld.com.vn',
    'tienphong.vn',
    'vtv.vn',
  ])('nhận URL HTTPS của %s qua bộ lọc và wrapper Bing', (host) => {
    const url = `https://${host}/lai-suat.html`;
    expect(newsSourceUrl(url)).toBe(url);
    expect(bingArticleUrl(bingLink(url))).toBe(url);
    expect(validateDepositRate(deposit(), { ...SOURCE, source_url: url }, quote())?.source_url).toBe(url);
  });

  it.each([
    'http://thanhnien.vn/a',
    'https://unknown.example/a',
    'https://bing.com/a',
    'https://news.bing.com/a',
    'https://127.0.0.1/a',
    'https://[::1]/a',
    'https://24h.com.vn.evil.example/a',
    'https://evil24h.com.vn/a',
    'https://thanhnien.vn@evil.example/a',
  ])('chặn URL ngoài danh sách: %s', (url) => {
    expect(newsSourceUrl(url)).toBeNull();
    expect(bingArticleUrl(bingLink(url))).toBeNull();
    expect(validateDepositRate(deposit(), { ...SOURCE, source_url: url }, quote())).toBeNull();
  });

  it('nhận bài ngày 90 và bài vay tháng 9, bỏ ngày 91, tương lai và thiếu ngày', () => {
    expect(recentNews('2026-08-14', NOW)).toBe(true);
    expect(recentNews('2026-08-13', NOW)).toBe(false);
    expect(recentNews('2026-11-13', NOW)).toBe(false);
    expect(recentNews(null, NOW)).toBe(false);
    const feed = newsSearchFeeds(NOW)[2];
    expect(newsArticles(rss(URL, '2026-08-14'), feed, NOW)).toHaveLength(1);
    expect(
      newsArticles(rss(URL, '2026-11-11', 'Lãi suất Big4 kỳ hạn 12 tháng đồng loạt niêm yết 5,9%/năm'), feed, NOW),
    ).toHaveLength(1);
    expect(newsArticles(rss(URL, '2026-08-13'), feed, NOW)).toEqual([]);
    expect(newsArticles(rss(URL, '2026-09-04', 'Lãi suất vay mua nhà tháng 9'), feed, NOW)).toHaveLength(1);
    expect(newsArticles(rss(URL, ''), feed, NOW)).toEqual([]);
  });

  it('đọc ngày công bố meta/ngày bài, không dùng ngày cập nhật hoặc ngày hiệu lực trong nội dung', () => {
    expect(
      pageMetadata('<meta property="article:published_time" content="2026-09-04T08:00:00+07:00">').published_on,
    ).toBe('2026-09-04');
    expect(pageMetadata('<time>04/09/2026 08:00</time>').published_on).toBe('2026-09-04');
    expect(pageMetadata('<span class="publish-date">Thứ sáu, 04/09/2026</span>').published_on).toBe('2026-09-04');
    expect(
      pageMetadata('<meta property="article:modified_time" content="2026-11-12"><p>Hiệu lực 12/11/2026</p>')
        .published_on,
    ).toBeNull();
    expect(dateOnly('31/02/2026')).toBeNull();
  });
});

function world(latest: Row[] = [], metadata = '<time>04/09/2026 08:00</time>') {
  const inserts: Row[] = [];
  const publicCalls: string[] = [];
  const queries: string[] = [];
  const log = { warn: vi.fn() };
  const run = vi.fn(async (_model: string, params: { messages: { content: string }[] }) => {
    const { text } = JSON.parse(params.messages[1]?.content || '{}');
    return { response: JSON.stringify({ rates: text.includes(quote()) ? [combined()] : [] }) };
  });
  const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'fixture-key', AI: { run } };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('https://sb.test/')) {
      if (init?.method === 'POST') {
        inserts.push(...[JSON.parse(String(init.body))].flat());
        return new Response(null, { status: 201 });
      }
      queries.push(url);
      return new Response(JSON.stringify(latest));
    }
    publicCalls.push(url);
    if (newsSearchFeeds(NOW).includes(url)) return new Response(rss(URL, '2026-11-11'));
    if (NEWS_FEEDS.includes(url)) return new Response('<rss/>');
    if (url === URL) return new Response(`${metadata}<p>${quote()} ${LOAN}</p>`);
    if (url === BANK_SOURCES[0].url) return new Response(`<p>${quote()} ${LOAN}</p>`);
    return new Response('<p>Chưa có số liệu</p>');
  });
  return { inserts, publicCalls, queries, log, env, fetcher, run };
}
const previous = (kind: string, rate: number, fetched_at = '2026-11-11T00:00:00Z'): Row => ({
  bank_code: 'bidv',
  kind,
  deposit_rate: kind === 'deposit' ? rate : null,
  promo_rate: kind === 'loan' ? rate : null,
  floating_rate: null,
  reference_rate: null,
  margin: null,
  fetched_at,
});

describe('BR-03 lượt chạy fixture, không gọi mạng', () => {
  it.each([false, true])('đọc cả hai loại từ view và log lệch gửi độc lập với vay (đảo thứ tự=%s)', async (reverse) => {
    const latest = [previous('deposit', 3.8), previous('loan', 6.5)];
    const w = world(reverse ? latest.reverse() : latest);
    const result = await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log });
    expect(result).toMatchObject({ written: 1, drifted: 1, failed: 0 });
    expect(w.inserts).toEqual([expect.objectContaining({ kind: 'loan', promo_rate: 6.5, deposit_rate: null })]);
    expect(w.log.warn).toHaveBeenCalledWith(
      'bank-rates drift > 2 points; keeping previous',
      expect.objectContaining({ bank_code: 'bidv', kind: 'deposit' }),
    );
    expect(w.queries[0]).toContain('select=bank_code,kind,deposit_rate,');
    expect(result.pages).toBeLessThanOrEqual(30);
  });

  it('trang ngân hàng không có ngày đăng lưu null, fetched_at vẫn là ngày đọc', async () => {
    const w = world();
    await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log });
    expect(w.inserts).toHaveLength(2);
    for (const row of w.inserts) expect(row).toMatchObject({ published_on: null, fetched_at: NOW.toISOString() });
  });

  it('nguồn báo giữ ngày bài gốc dù RSS và ngày đọc mới hơn', async () => {
    const w = world();
    const fetcher = (url: string, init?: RequestInit) =>
      url === BANK_SOURCES[0].url ? Promise.resolve(new Response('<p>Chưa có số liệu</p>')) : w.fetcher(url, init);
    await runBankRates(w.env, { now: NOW, fetcher, logger: w.log });
    expect(w.inserts).toHaveLength(2);
    for (const row of w.inserts)
      expect(row).toMatchObject({
        source_url: URL,
        published_on: '2026-09-04',
        fetched_at: NOW.toISOString(),
      });
  });

  it('ngày RSS được giữ khi trang báo không có ngày, không tự điền ngày đọc', async () => {
    const w = world([], '');
    const fetcher = (url: string, init?: RequestInit) =>
      url === BANK_SOURCES[0].url ? Promise.resolve(new Response('<p>Chưa có số liệu</p>')) : w.fetcher(url, init);
    await runBankRates(w.env, { now: NOW, fetcher, logger: w.log });
    expect(w.inserts).toHaveLength(2);
    for (const row of w.inserts) expect(row.published_on).toBe('2026-11-11');
  });

  it.each(['loan', 'deposit'])('isolate mới nhận ra lượt đã chạy hôm nay từ dòng %s trong view', async (kind) => {
    const w = world([previous(kind, 5.9, '2026-11-11T18:00:00Z')]);
    expect(await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log })).toMatchObject({
      skipped: 'already_ran_today',
      pages: 0,
      written: 0,
    });
    expect(w.publicCalls).toEqual([]);
  });

  it('view sai kind hoặc sai số gửi phải dừng trước khi đọc nguồn', async () => {
    for (const row of [previous('unknown', 5.9), { ...previous('deposit', 5.9), deposit_rate: '5.9' }]) {
      const w = world([row]);
      await expect(runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log })).rejects.toThrow(
        'latest invalid',
      );
      expect(w.publicCalls).toEqual([]);
      expect(w.inserts).toEqual([]);
    }
  });
});
