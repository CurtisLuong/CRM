// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Worker source is JavaScript.
import { runBankRates } from '../../worker/bank-rates.js';
// @ts-expect-error Worker source is JavaScript.
import * as config from '../../worker/bank-rates-config.js';
// @ts-expect-error Worker source is JavaScript.
import { validateRate } from '../../worker/bank-rates-extract.js';
// @ts-expect-error Worker source is JavaScript.
import { bingArticleUrl, newsArticles } from '../../worker/bank-rates-sources.js';

const { BANK_SOURCES, MAX_PAGES, MIN_NEWS_PAGES, NEWS_FEEDS, NEWS_SEARCH_FEEDS } = config;
const NOW = new Date('2026-11-12T00:00:00Z');
const ORIGINAL = 'https://dantri.com.vn/kinh-doanh/lai-vay.htm?a=1&b=2';
const bingLink = (url: string) =>
  `http://www.bing.com/news/apiclick.aspx?ref=BF&url=${encodeURIComponent(url)}&tid=fixture`;
const item = (url: string, day = '2026-11-11', title = 'Lãi suất vay mua nhà tại BIDV và MB') =>
  `<item><title>${title}</title><link><![CDATA[${url}]]></link><pubDate>${day}</pubDate></item>`;
const rss = (items: string[]) => `<rss><channel>${items.join('')}</channel></rss>`;
const quote = (bank: string, rate: number) => `${bank} cho vay mua nhà ưu đãi ${rate}%/năm.`;
const newsText = `${quote('BIDV', 6.5)} ${quote('MB', 7)}`;
const row = (code: string, name: string, promo: number) => ({
  bank_code: code,
  promo_rate: promo,
  promo_months: null,
  floating_rate: null,
  reference_rate: null,
  margin: null,
  note: null,
  evidence: {
    promo_rate: quote(name, promo),
    promo_months: null,
    floating_rate: null,
    reference_rate: null,
    margin: null,
  },
});

describe('BR-02 giải URL Bing và lọc bài tìm kiếm', () => {
  it('cấu hình đủ hai truy vấn tiếng Việt và giữ đủ 10 trang chủ + 5 RSS cũ', () => {
    // BR-03 thêm truy vấn: chỉ khoá hai truy vấn vay gốc vẫn còn.
    expect(NEWS_SEARCH_FEEDS.map((feed: string) => new URL(feed).searchParams.get('q'))).toEqual(
      expect.arrayContaining(['lãi suất vay mua nhà', 'lãi suất cho vay mua nhà ngân hàng']),
    );
    for (const feed of NEWS_SEARCH_FEEDS) {
      const url = new URL(feed);
      expect(url.origin + url.pathname).toBe('https://www.bing.com/news/search');
      expect(url.searchParams.get('format')).toBe('rss');
      expect(url.searchParams.get('setlang')).toBe('vi');
    }
    expect(BANK_SOURCES).toHaveLength(10);
    expect(NEWS_FEEDS).toHaveLength(5);
    expect(MIN_NEWS_PAGES).toBeGreaterThanOrEqual(12);
  });

  it('giải tham số url một lần, bỏ fragment, giữ query và chấp nhận wrapper HTTP/HTTPS', () => {
    expect(bingArticleUrl(bingLink(`${ORIGINAL}#muc-lai`))).toBe(ORIGINAL);
    expect(bingArticleUrl(bingLink(ORIGINAL).replace('http:', 'https:').replaceAll('&', '&amp;'))).toBe(ORIGINAL);
    for (const address of [
      'https://cafef.vn/lai-vay.chn',
      'https://vietstock.vn/lai-vay.htm',
      'https://vietnamnet.vn/lai-vay.html',
      'https://baomoi.com/lai-vay.epi',
      'https://soha.vn/lai-vay.htm',
    ])
      expect(bingArticleUrl(bingLink(address))).toBe(address);
  });

  it.each([
    undefined,
    '',
    'not a URL',
    'http://www.bing.com/news/apiclick.aspx?ref=BF',
    'http://www.bing.com/news/apiclick.aspx?url=',
    'http://www.bing.com/news/apiclick.aspx?url=%ZZ',
    'http://www.bing.com/news/apiclick.aspx?url=relative-path',
    'http://www.bing.com/news/apiclick.aspx?url=https%253A%252F%252Fdantri.com.vn%252Fa',
    `${bingLink(ORIGINAL)}&url=${encodeURIComponent(ORIGINAL)}`,
    bingLink('https://unknown.example/lai-vay'),
    bingLink('https://dantri.com.vn.evil.example/a'),
    bingLink('https://dantri.com.vn@evil.example/a'),
    bingLink('https://user:password@dantri.com.vn/a'),
    bingLink('https://dantri.com.vn:8443/a'),
    bingLink('https://dantri.com.vn/a.pdf'),
    bingLink('https://bing.com/news/article'),
    bingLink('https://news.bing.com/article'),
    bingLink('javascript:alert(1)'),
    bingLink('data:text/html,test'),
    bingLink('file:///tmp/test'),
    bingLink('ftp://dantri.com.vn/a'),
    bingLink('http://dantri.com.vn/a'),
    bingLink(ORIGINAL).replace('http:', 'ftp:'),
    bingLink(ORIGINAL).replace('www.bing.com', 'www.bing.com.evil.example'),
    bingLink(ORIGINAL).replace('www.bing.com', 'user:password@www.bing.com'),
    bingLink(ORIGINAL).replace('/news/apiclick.aspx', '/news/search'),
    ORIGINAL,
  ])('bỏ link thiếu url, URL lạ, Bing hoặc giao thức không hợp lệ (%#)', (link) => {
    expect(bingArticleUrl(link)).toBeNull();
  });

  it('bài Bing là news, lọc chủ đề/tuổi 45 ngày, bỏ trùng và link không giải được', () => {
    const articles = newsArticles(
      rss([
        item(bingLink(ORIGINAL), '2026-11-10'),
        item(bingLink(ORIGINAL)),
        item(bingLink('https://vietstock.vn/bien-45.htm'), '2026-09-28'),
        item(bingLink('https://vietstock.vn/cu.htm'), '2026-08-01'),
        item(bingLink('https://vietstock.vn/tuong-lai.htm'), '2026-11-13'),
        item(bingLink('https://vietstock.vn/thieu-ngay.htm'), ''),
        item(bingLink('https://vietstock.vn/vi-mo.htm'), '2026-11-12', 'Giảm lãi suất điều hành'),
        item('https://www.bing.com/news/apiclick.aspx?ref=BF'),
        item(bingLink('https://unknown.example/a')),
      ]),
      NEWS_SEARCH_FEEDS[0],
      NOW,
    );
    expect(articles).toEqual([
      expect.objectContaining({
        source_url: ORIGINAL,
        base: ORIGINAL,
        source_kind: 'news',
        published_on: '2026-11-11',
      }),
      expect.objectContaining({ source_url: 'https://vietstock.vn/bien-45.htm', published_on: '2026-09-28' }),
    ]);
  });

  it('bộ kiểm dòng nhận nguồn báo mới nhưng không nhận link Bing hay URL ngoài danh sách', () => {
    const source = { source_kind: 'news', source_url: ORIGINAL };
    expect(validateRate(row('bidv', 'BIDV', 6.5), source, newsText)).toMatchObject({ source_url: ORIGINAL });
    for (const url of [bingLink(ORIGINAL), 'https://bing.com/a', 'https://unknown.example/a']) {
      expect(validateRate(row('bidv', 'BIDV', 6.5), { ...source, source_url: url }, newsText)).toBeNull();
    }
  });
});

function world(
  options: {
    articles?: number;
    bankLinks?: boolean;
    bankRate?: boolean;
    seedRedirect?: boolean;
    articleRedirect?: boolean;
    stalePage?: boolean;
    drift?: boolean;
  } = {},
) {
  const addresses = Array.from({ length: options.articles ?? 1 }, (_, index) =>
    index === 0 ? ORIGINAL : `https://dantri.com.vn/kinh-doanh/lai-vay-${index}.htm`,
  );
  const searchRss = rss(addresses.map((url) => item(bingLink(url))));
  const publicCalls: string[] = [];
  const inserts: Record<string, unknown>[] = [];
  const log = { warn: vi.fn() };
  const run = vi.fn(async (_model: string, params: { messages: { content: string }[] }) => {
    const { text } = JSON.parse(params.messages[1]?.content || '{}');
    const rates = text.includes(newsText)
      ? [row('bidv', 'BIDV', 6.5), row('mb', 'MB', 7)]
      : text.includes(quote('BIDV', 8))
        ? [row('bidv', 'BIDV', 8)]
        : [];
    return { response: JSON.stringify({ rates }) };
  });
  const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'fake-key', AI: { run } };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('https://sb.test/')) {
      if (init?.method === 'POST') {
        inserts.push(JSON.parse(String(init.body)));
        return new Response(null, { status: 201 });
      }
      return new Response(
        JSON.stringify(
          options.drift
            ? [
                {
                  bank_code: 'mb',
                  promo_rate: 4.9,
                  floating_rate: null,
                  reference_rate: null,
                  margin: null,
                  fetched_at: '2026-11-11T00:00:00Z',
                },
              ]
            : [],
        ),
      );
    }
    publicCalls.push(url);
    if (NEWS_SEARCH_FEEDS.includes(url)) {
      if (options.seedRedirect && url === NEWS_SEARCH_FEEDS[0])
        return new Response(null, { status: 302, headers: { Location: `${url}&redirected=1` } });
      return new Response(searchRss);
    }
    if (url === `${NEWS_SEARCH_FEEDS[0]}&redirected=1`) return new Response(searchRss);
    if (NEWS_FEEDS.includes(url))
      return new Response(rss([item(ORIGINAL), item('https://cafef.vn/rss-only.chn', '2026-11-12')]));
    const bank = BANK_SOURCES.find((source: { url: string }) => source.url === url);
    if (bank)
      return new Response(
        [
          '<p>Menu ngân hàng</p>',
          options.bankLinks ? '<a href="/lai-suat">Lãi suất vay mua nhà</a>' : '<a href="/about">Giới thiệu</a>',
          options.bankRate && bank.code === 'bidv' ? `<p>${quote('BIDV', 8)}</p>` : '',
        ].join(''),
      );
    if (options.articleRedirect && url === ORIGINAL)
      return new Response(null, { status: 302, headers: { Location: '/kinh-doanh/trang-dich.htm' } });
    if (addresses.includes(url) || url.endsWith('/trang-dich.htm') || url === 'https://cafef.vn/rss-only.chn')
      return new Response(
        `${options.stalePage ? '<meta property="article:published_time" content="2026-07-01">' : ''}<p>${url === 'https://cafef.vn/rss-only.chn' ? 'Chưa công bố số.' : newsText}</p>`,
      );
    return new Response('<p>Chưa có lãi suất</p>');
  });
  return { env, fetcher, publicCalls, inserts, run, log, addresses };
}

describe('BR-02 lượt chạy offline và ngân sách ưu tiên bài báo', () => {
  it.each([false, true])(
    'giữ đủ 17 nguồn đầu vào, dành ≥12 lượt bài tìm kiếm trước trang con (redirect=%s)',
    async (seedRedirect) => {
      const w = world({ articles: 30, bankLinks: true, seedRedirect });
      const result = await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log });
      expect(result.pages).toBe(MAX_PAGES);
      expect(w.publicCalls).toHaveLength(MAX_PAGES);
      expect(w.publicCalls.slice(0, 2 + Number(seedRedirect))).toContain(NEWS_SEARCH_FEEDS[0]);
      expect(w.publicCalls).toEqual(
        expect.arrayContaining([
          ...NEWS_SEARCH_FEEDS,
          ...BANK_SOURCES.map((bank: { url: string }) => bank.url),
          ...NEWS_FEEDS,
        ]),
      );
      const articleCalls = w.publicCalls.filter((url) => w.addresses.includes(url));
      expect(articleCalls).toHaveLength(13 - Number(seedRedirect));
      expect(articleCalls.length).toBeGreaterThanOrEqual(12);
      expect(new Set(articleCalls).size).toBe(articleCalls.length);
      expect(w.publicCalls).not.toContain('https://cafef.vn/rss-only.chn');
      expect(w.publicCalls.some((url) => url.endsWith('/lai-suat'))).toBe(false);
      expect(w.publicCalls.some((url) => url.includes('/news/apiclick.aspx'))).toBe(false);
    },
  );

  it('URL trùng hai truy vấn + RSS chỉ đọc một lần; bài RSS sau tìm kiếm, trang con dùng phần dư', async () => {
    const w = world({ bankLinks: true });
    await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log });
    expect(w.publicCalls.filter((url) => url === ORIGINAL)).toHaveLength(1);
    const searchIndex = w.publicCalls.indexOf(ORIGINAL);
    const rssIndex = w.publicCalls.indexOf('https://cafef.vn/rss-only.chn');
    const bankChildIndex = w.publicCalls.indexOf('https://bidv.com.vn/lai-suat');
    expect(searchIndex).toBe(17);
    expect(rssIndex).toBeGreaterThan(searchIndex);
    expect(bankChildIndex).toBeGreaterThan(rssIndex);
    expect(w.publicCalls.length).toBeLessThanOrEqual(30);
  });

  it('menu không có liên kết lãi suất thì không đọc trang con; một bài báo sinh nhiều dòng với URL gốc', async () => {
    const w = world();
    const result = await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log });
    expect(result.written).toBe(2);
    expect(w.publicCalls).toHaveLength(19);
    expect(w.inserts).toEqual([
      expect.objectContaining({ bank_code: 'bidv', promo_rate: 6.5, source_kind: 'news', source_url: ORIGINAL }),
      expect.objectContaining({ bank_code: 'mb', promo_rate: 7, source_kind: 'news', source_url: ORIGINAL }),
    ]);
    for (const saved of w.inserts) {
      expect(w.publicCalls).toContain(saved.source_url);
      expect(String(saved.source_url)).not.toContain('bing.com');
    }
  });

  it('bài redirect dùng URL đích đã đọc, giữ nhãn news và ngày RSS', async () => {
    const w = world({ articleRedirect: true });
    await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log });
    expect(w.inserts).toHaveLength(2);
    for (const saved of w.inserts)
      expect(saved).toMatchObject({
        source_url: 'https://dantri.com.vn/kinh-doanh/trang-dich.htm',
        source_kind: 'news',
        published_on: '2026-11-11',
      });
  });

  it('ngày trang gốc quá 45 ngày bị bỏ dù RSS mới', async () => {
    const w = world({ stalePage: true });
    const result = await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log });
    expect(result.written).toBe(0);
    expect(w.inserts).toEqual([]);
    expect(w.run).toHaveBeenCalledTimes(10);
  });

  it('giữ luật ngân hàng thắng báo và chặn lệch >2 điểm cho dòng từ tìm kiếm', async () => {
    const w = world({ bankRate: true, drift: true });
    const result = await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log });
    expect(result).toMatchObject({ written: 1, drifted: 1 });
    expect(w.inserts).toEqual([
      expect.objectContaining({
        bank_code: 'bidv',
        promo_rate: 8,
        source_kind: 'bank',
        source_url: 'https://bidv.com.vn/',
      }),
    ]);
  });
});
