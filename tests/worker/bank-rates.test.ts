// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BANK_RATE_LIMITS as APP_LIMITS, BANKS } from '../../src/config/banks';
// @ts-expect-error Worker source is JavaScript.
import { runBankRates } from '../../worker/bank-rates.js';
// @ts-expect-error Worker source is JavaScript.
import { BANK_RATE_LIMITS, BANK_SOURCES, MAX_PAGES, MAX_TEXT, NEWS_FEEDS } from '../../worker/bank-rates-config.js';
// @ts-expect-error Worker source is JavaScript.
import * as extraction from '../../worker/bank-rates-extract.js';
// @ts-expect-error Worker source is JavaScript.
import * as sources from '../../worker/bank-rates-sources.js';

const { aiPageText, BANK_RATES_PROMPT, exceedsDrift, extractPage, parseRates, preferredRates, validateRate } =
  extraction;
const { bankLinks, createPageReader, dateOnly, newsArticles, pageMetadata, pageText, recentNews, sourceUrl } = sources;

type Row = Record<string, unknown>;
const fixture = (name: string) => readFileSync(new URL(`./fixtures/bank-rates/${name}`, import.meta.url), 'utf8');
const HTML = fixture('bank.html');
const RSS = fixture('cafef.rss');
const NEWS = fixture('news.html');
const NOW = new Date('2026-11-12T00:00:00Z');
const TEXT = pageText(HTML);
const SOURCE = {
  source_kind: 'bank',
  source_url: 'https://bidv.com.vn/vay-nha',
  source_title: 'Vay nhu cầu nhà ở',
  published_on: '2026-11-10',
  bank_code: 'bidv',
};
const blankEvidence = () => ({
  promo_rate: null,
  promo_months: null,
  floating_rate: null,
  reference_rate: null,
  margin: null,
});
function rate(patch: Row = {}): Row {
  return {
    bank_code: 'bidv',
    promo_rate: 6.5,
    promo_months: 12,
    floating_rate: null,
    reference_rate: 7,
    margin: 3,
    note: 'Áp dụng khoản vay từ 1 tỷ đồng.',
    evidence: {
      promo_rate: 'BIDV áp dụng lãi suất ưu đãi cố định 6,5%/năm trong 12 tháng đầu cho vay mua nhà thương mại.',
      promo_months: 'BIDV áp dụng lãi suất ưu đãi cố định 6,5%/năm trong 12 tháng đầu cho vay mua nhà thương mại.',
      floating_rate: null,
      reference_rate: 'Sau ưu đãi, lãi thả nổi = lãi tham chiếu 7%/năm + biên độ 3 điểm %.',
      margin: 'Sau ưu đãi, lãi thả nổi = lãi tham chiếu 7%/năm + biên độ 3 điểm %.',
    },
    ...patch,
  };
}
const output = (rates: Row[] = [rate()]) => ({ response: JSON.stringify({ rates }) });
const logger = () => ({ warn: vi.fn() });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('BR-01 nguồn và giới hạn', () => {
  it('luật 1, 7: bản sao mười mã, thứ tự và giới hạn khớp nguồn cấu hình app', () => {
    expect(BANK_SOURCES.map((bank: { code: string }) => bank.code)).toEqual(BANKS.map((bank) => bank.code));
    expect(BANK_RATE_LIMITS).toEqual(APP_LIMITS);
    expect(new Set(BANK_SOURCES.map((bank: { url: string }) => bank.url)).size).toBe(10);
  });

  it('luật 2: lấy liên kết có nhãn khớp, giải mã entity, bỏ trùng, script và URL ngoài ngân hàng', () => {
    expect(bankLinks(HTML, 'https://bidv.com.vn/')).toEqual([
      'https://bidv.com.vn/vn/ca-nhan/san-pham-dich-vu/cho-vay/vay-nhu-cau-nha-o',
      'https://bidv.com.vn/lai-suat?type=loan&lang=vi',
      'https://bidv.com.vn/bat-dong-san',
      'https://bidv.com.vn/vay-nha',
    ]);
    expect(sourceUrl('https://bidv.com.vn.evil.example/a', SOURCE.source_url)).toBeNull();
    expect(sourceUrl('https://x:secret@bidv.com.vn/a', SOURCE.source_url)).toBeNull();
    expect(sourceUrl('https://bidv.com.vn:8443/a', SOURCE.source_url)).toBeNull();
    expect(sourceUrl(undefined, SOURCE.source_url)).toBeNull();
    expect(sourceUrl('', SOURCE.source_url)).toBeNull();
    expect(sourceUrl('https://www.bidv.com.vn/a#b', SOURCE.source_url)).toBe('https://www.bidv.com.vn/a');
  });

  it('luật 2: RSS lọc tiêu đề/mô tả theo bốn từ khóa, ngày tối đa 45, loại tương lai/thiếu ngày và URL lạ', () => {
    const articles = newsArticles(RSS, NEWS_FEEDS[0], NOW);
    // BR-03: nhận thêm bài lãi tiền gửi (có hay không bài tien-gui đều được); bài > 90 ngày, tương lai, thiếu/sai ngày, host lạ bị loại.
    const urls = articles.map((article: Row) => article.source_url);
    expect(urls).toEqual(
      expect.arrayContaining([
        'https://cafef.vn/tin-moi.chn?a=1&b=2',
        'https://cafef.vn/lai-suat-ngan-hang-11-11.chn',
        'https://cafef.vn/moc-45-ngay.chn',
      ]),
    );
    for (const bad of ['cu.chn', 'tuong-lai.chn', 'khong-ngay.chn', 'sai-ngay.chn', 'evil.example'])
      expect(
        urls.some((url: string) => url.includes(bad)),
        bad,
      ).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
    expect(
      articles.find((article: Row) => article.source_url === 'https://cafef.vn/lai-suat-ngan-hang-11-11.chn')
        ?.source_title,
    ).toContain('Agribank, Vietcombank, BIDV');
    // BR-03 (Lead 12/11): tuổi bài 90 ngày; mốc chính xác do test BR-03 kiểm.
    expect(recentNews('2026-09-28', NOW)).toBe(true);
    expect(dateOnly('2026-02-31')).toBeNull();
    expect(dateOnly('not-a-date')).toBeNull();
    expect(dateOnly('')).toBeNull();
  });

  it('luật 7: bỏ HTML, script, style, noscript, hotline và cắt văn bản gửi AI đúng 12.000 ký tự', () => {
    const text = pageText(HTML);
    expect(text).toContain('6,5%/năm');
    expect(text).not.toMatch(/SCRIPT_ONLY|NOSCRIPT_ONLY|display:|<[^>]+>|99%/);
    expect(pageText(`<main>${'ư'.repeat(20_000)}</main>`)).toHaveLength(MAX_TEXT);
    expect(aiPageText(text)).not.toContain('0912345678');
    expect(aiPageText('Hotline 1900 9247, 1800 588 855, (024) 3773 8686.')).not.toMatch(/9247|588 855|3773/);
    expect(aiPageText('a'.repeat(20_000))).toHaveLength(MAX_TEXT);
    expect(pageMetadata(HTML)).toEqual({ published_on: '2026-11-10', source_title: 'BIDV - Vay nhu cầu nhà ở' });
  });

  it('luật 7: đếm cả lỗi và redirect trong tổng tối đa 30; không gửi khóa Supabase tới nguồn', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/0')) return new Response(null, { status: 302, headers: { Location: '/redirected' } });
      return new Response('<p>ok</p>');
    });
    const reader = createPageReader(fetcher, logger());
    expect((await reader.read('https://bidv.com.vn/0', 'https://bidv.com.vn/')).url).toBe(
      'https://bidv.com.vn/redirected',
    );
    for (let i = 1; i < 40; i++) await reader.read(`https://bidv.com.vn/${i}`, 'https://bidv.com.vn/');
    expect(reader.count).toBe(MAX_PAGES);
    expect(fetcher).toHaveBeenCalledTimes(30);
    const options = (fetcher.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(options.redirect).toBe('manual');
    expect(JSON.stringify(options.headers)).not.toMatch(/Authorization|apikey/);
  });

  it('luật 2, 6: từ chối redirect ngoài host, tệp không phải văn bản, lỗi một nguồn không làm hỏng reader', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://evil.example/' } }))
      .mockResolvedValueOnce(new Response('pdf', { headers: { 'Content-Type': 'application/pdf' } }))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(new Response('<p>tiếp tục</p>'));
    const log = logger();
    const reader = createPageReader(fetcher, log);
    for (const path of ['redirect', 'pdf', 'error'])
      expect(await reader.read(`https://bidv.com.vn/${path}`, SOURCE.source_url)).toBeNull();
    expect((await reader.read('https://bidv.com.vn/ok', SOURCE.source_url)).html).toContain('tiếp tục');
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('luật 6, 7: nguồn treo bị hủy sau 12 giây, reader vẫn xử lý được nguồn sau', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('timeout')));
          }),
      )
      .mockResolvedValueOnce(new Response('<p>ok</p>'));
    const reader = createPageReader(fetcher, logger());
    const pending = reader.read('https://bidv.com.vn/slow', SOURCE.source_url);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await pending).toBeNull();
    expect((await reader.read('https://bidv.com.vn/ok', SOURCE.source_url)).html).toBe('<p>ok</p>');
  });
});

describe('BR-01 AI, luật chọn và kiểm số', () => {
  it('luật 1: lưu ưu đãi + tháng và cộng tham chiếu + biên độ từ trích dẫn', () => {
    expect(validateRate(rate(), SOURCE, TEXT)).toMatchObject({
      promo_rate: 6.5,
      promo_months: 12,
      reference_rate: 7,
      margin: 3,
      floating_rate: 10,
    });
    const row = rate({
      promo_rate: null,
      promo_months: null,
      reference_rate: 6.7,
      margin: 2.5,
      evidence: {
        ...blankEvidence(),
        reference_rate: 'BIDV vay mua nhà tham chiếu 6,7%/năm + biên độ 2,5 điểm %.',
        margin: 'BIDV vay mua nhà tham chiếu 6,7%/năm + biên độ 2,5 điểm %.',
      },
    });
    expect(validateRate(row, SOURCE, 'BIDV vay mua nhà tham chiếu 6,7%/năm + biên độ 2,5 điểm %.')).toMatchObject({
      floating_rate: 9.2,
      margin: 2.5,
    });
  });

  it('luật 1: chỉ có một số thả nổi vẫn lưu, không tự điền tham chiếu hoặc biên độ', () => {
    const quote = 'BIDV lãi vay mua nhà thả nổi 10%/năm.';
    const row = rate({
      promo_rate: null,
      promo_months: null,
      reference_rate: null,
      margin: null,
      floating_rate: 10,
      evidence: { ...blankEvidence(), floating_rate: quote },
    });
    expect(validateRate(row, SOURCE, quote)).toMatchObject({
      promo_rate: null,
      promo_months: null,
      reference_rate: null,
      margin: null,
      floating_rate: 10,
    });
  });

  it('luật 3: bank thắng news dù cũ; cùng loại chọn published_on mới hơn, không trộn gói/nguồn', () => {
    const make = (kind: string, day: string | null, promo: number) => ({
      bank_code: 'bidv',
      source_kind: kind,
      published_on: day,
      promo_rate: promo,
    });
    const bank = make('bank', '2026-11-10', 6.5);
    expect(
      preferredRates([make('news', '2026-11-12', 6), make('bank', null, 8), bank, make('bank', '2026-11-09', 7)]),
    ).toEqual([bank]);
    const news = make('news', '2026-11-12', 6);
    expect(preferredRates([make('news', null, 7), news, make('news', '2026-11-11', 8)])).toEqual([news]);
    expect(preferredRates([bank, news])).toEqual([bank]);
  });

  it.each([2.99, 20.01, -1, 0])('luật 4: bỏ số ưu đãi %s ngoài 3–20, giữ số thả nổi hợp lệ', (promo) => {
    const quote = `BIDV vay mua nhà ưu đãi ${promo}%/năm trong 12 tháng, thả nổi 10%/năm.`;
    const row = rate({
      promo_rate: promo,
      reference_rate: null,
      margin: null,
      floating_rate: 10,
      evidence: { ...blankEvidence(), promo_rate: quote, promo_months: quote, floating_rate: quote },
    });
    expect(validateRate(row, SOURCE, quote)).toMatchObject({ promo_rate: null, promo_months: null, floating_rate: 10 });
  });

  it.each([3, 20])('luật 4: nhận số tại biên %s phần trăm', (promo) => {
    const quote = `BIDV vay mua nhà ưu đãi ${promo}%/năm trong 12 tháng.`;
    expect(
      validateRate(
        rate({ promo_rate: promo, evidence: { ...blankEvidence(), promo_rate: quote, promo_months: quote } }),
        SOURCE,
        quote,
      ).promo_rate,
    ).toBe(promo);
  });

  it('luật 4: tổng thả nổi ngoài khoảng bị bỏ; ưu đãi lớn hơn thả nổi thì bỏ thả nổi', () => {
    const tooHigh = 'BIDV vay mua nhà ưu đãi 6,5%/năm trong 12 tháng. Lãi tham chiếu 19%/năm + biên độ 3 điểm %.';
    const row = rate({
      reference_rate: 19,
      evidence: {
        promo_rate: tooHigh,
        promo_months: tooHigh,
        floating_rate: null,
        reference_rate: tooHigh,
        margin: tooHigh,
      },
    });
    expect(validateRate(row, SOURCE, tooHigh)).toMatchObject({ promo_rate: 6.5, floating_rate: null });
    const quote = 'BIDV vay mua nhà ưu đãi 12%/năm trong 12 tháng; thả nổi 10%/năm.';
    const reverse = rate({
      promo_rate: 12,
      floating_rate: 10,
      reference_rate: null,
      margin: null,
      evidence: { ...blankEvidence(), promo_rate: quote, promo_months: quote, floating_rate: quote },
    });
    expect(validateRate(reverse, SOURCE, quote)).toMatchObject({ promo_rate: 12, floating_rate: null });
  });

  it('luật 4: lệch hơn 2 điểm ở số có bản cũ thì chặn cả dòng, đúng 2 điểm vẫn nhận', () => {
    const row = validateRate(rate(), SOURCE, TEXT);
    expect(exceedsDrift(row, { promo_rate: 4.49 })).toBe(true);
    expect(exceedsDrift(row, { promo_rate: 4.5, floating_rate: 8 })).toBe(false);
    expect(exceedsDrift(row, { floating_rate: 12.01 })).toBe(true);
    expect(exceedsDrift(row, { reference_rate: 4.9 })).toBe(true);
    expect(exceedsDrift(row, { margin: 5.01 })).toBe(true);
    expect(exceedsDrift(row, { promo_rate: null, floating_rate: null })).toBe(false);
    expect(exceedsDrift(row, null)).toBe(false);
    expect(exceedsDrift({ promo_rate: 8.3 }, { promo_rate: 6.3 })).toBe(false);
  });

  it('luật 4, 5: không có số, thiếu nguồn hoặc gán sai ngân hàng đều bỏ dòng', () => {
    expect(validateRate(rate(), { ...SOURCE, source_url: '' }, TEXT)).toBeNull();
    expect(validateRate(rate(), { ...SOURCE, source_url: 'not a URL' }, TEXT)).toBeNull();
    expect(validateRate(rate(), { ...SOURCE, source_url: 'https://evil.example/' }, TEXT)).toBeNull();
    expect(validateRate(rate(), { ...SOURCE, bank_code: 'mb' }, TEXT)).toBeNull();
    expect(validateRate(rate(), SOURCE, 'Không có số liệu.')).toBeNull();
    expect(
      validateRate(
        rate({ promo_rate: null, promo_months: null, reference_rate: null, margin: null, evidence: blankEvidence() }),
        SOURCE,
        TEXT,
      ),
    ).toBeNull();
  });

  it('luật 5: bỏ số không có trong trích dẫn/văn bản, không lấy số nhỏ nằm trong số lớn', () => {
    const row = rate({ promo_rate: 6.6 });
    expect(validateRate(row, SOURCE, TEXT)).toMatchObject({ promo_rate: null, floating_rate: 10 });
    const quote = 'Vay mua nhà ưu đãi 16,5%/năm trong 12 tháng.';
    expect(
      validateRate(rate({ evidence: { ...blankEvidence(), promo_rate: quote, promo_months: quote } }), SOURCE, quote),
    ).toBeNull();
    const fabricated = rate({ evidence: { ...blankEvidence(), promo_rate: 'BIDV ưu đãi 6,5%/năm không có thật.' } });
    expect(validateRate(fabricated, SOURCE, TEXT)).toBeNull();
  });

  it.each([
    'not JSON',
    '```json\n{"rates":[]}\n```',
    JSON.stringify({ rates: [], extra: true }),
    JSON.stringify({ rates: [rate({ promo_rate: '6.5' })] }),
    JSON.stringify({ rates: [rate({ promo_months: 1.5 })] }),
    JSON.stringify({ rates: [rate({ promo_months: -1 })] }),
    JSON.stringify({ rates: [rate({ bank_code: 'unknown' })] }),
    JSON.stringify({ rates: [rate({ evidence: {} })] }),
    JSON.stringify({ rates: [rate({ note: 123 })] }),
    JSON.stringify({ rates: [rate({ source_url: 'https://fake.example' })] }),
    JSON.stringify({ rates: [rate(), rate()] }),
    JSON.stringify({ rates: [{ bank_code: 'bidv' }] }),
    JSON.stringify({ rates: [rate({ evidence: { ...blankEvidence(), promo_rate: null } })] }),
  ])('luật 5: JSON sai khuôn bị bỏ toàn bộ (%#)', (response) => {
    expect(parseRates({ response })).toBeNull();
  });

  it('luật 5, 7: dùng env.AI với qwen có sẵn, prompt cấm suy đoán và chỉ gửi văn bản công khai đã lọc', async () => {
    const run = vi.fn().mockResolvedValue(output());
    const rows = await extractPage({ AI: { run }, SECRET: 'NEVER_SEND' }, SOURCE, TEXT);
    expect(rows).toHaveLength(1);
    expect(run.mock.calls[0]?.[0]).toBe('@cf/qwen/qwen3-30b-a3b-fp8');
    const sent = run.mock.calls[0]?.[1];
    expect(sent.temperature).toBe(0);
    expect(sent.messages[0].content).toBe(`${BANK_RATES_PROMPT} /no_think`);
    expect(sent.messages[0].content).toContain('TUYỆT ĐỐI KHÔNG suy đoán');
    expect(JSON.parse(sent.messages[1].content).banks).toEqual([{ code: 'bidv', name: 'BIDV' }]);
    expect(JSON.stringify(sent)).not.toMatch(/NEVER_SEND|SCRIPT_ONLY|0912345678/);
    expect(parseRates(output([]))).toEqual([]);
    expect(parseRates({ response: { rates: [rate()] } })).toHaveLength(1);
  });

  it('luật 6: AI treo bị bỏ trang sau 45 giây để lượt chạy không dừng ở một nguồn', async () => {
    vi.useFakeTimers();
    const pending = extractPage({ AI: { run: () => new Promise(() => {}) } }, SOURCE, TEXT);
    const rejection = expect(pending).rejects.toThrow('AI timeout');
    await vi.advanceTimersByTimeAsync(45_000);
    await rejection;
  });
});

function world(
  options: {
    latest?: Row[];
    readError?: boolean;
    badLatest?: unknown;
    newsOnly?: boolean;
    noRates?: boolean;
    failInsert?: string;
  } = {},
) {
  const inserts: Row[] = [];
  const publicCalls: string[] = [];
  const dbCalls: { url: string; init?: RequestInit }[] = [];
  const run = vi.fn(async (_model: string, params: { messages: { content: string }[] }) => {
    const payload = JSON.parse(params.messages[1]?.content || '{}');
    if (options.noRates) return output([]);
    const text: string = payload.text;
    if (text.includes('Khách hàng cá nhân vay mua nhà thương mại tại BIDV')) {
      const bidvQuote =
        'Khách hàng cá nhân vay mua nhà thương mại tại BIDV được ưu đãi cố định 6%/năm trong 12 tháng đầu.';
      const floatQuote = 'Lãi suất thả nổi của BIDV là 10%/năm sau ưu đãi.';
      const mbQuote = 'MB áp dụng lãi vay mua nhà ưu đãi 7%/năm trong 24 tháng; sau ưu đãi thả nổi 11%/năm.';
      return output([
        rate({
          promo_rate: 6,
          floating_rate: 10,
          reference_rate: null,
          margin: null,
          evidence: { ...blankEvidence(), promo_rate: bidvQuote, promo_months: bidvQuote, floating_rate: floatQuote },
        }),
        rate({
          bank_code: 'mb',
          promo_rate: 7,
          promo_months: 24,
          floating_rate: 11,
          reference_rate: null,
          margin: null,
          evidence: { ...blankEvidence(), promo_rate: mbQuote, promo_months: mbQuote, floating_rate: mbQuote },
        }),
      ]);
    }
    return output();
  });
  const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'fake-service-role', AI: { run } };
  const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.hostname === 'sb.test') {
      dbCalls.push({ url: input, init });
      if (init?.method === 'POST') {
        // Worker ghi gộp một mảng (BR-05); mảng có dòng lỗi thì cả request lỗi như PostgREST.
        const rows = [JSON.parse(String(init.body))].flat();
        if (rows.some((row) => row.bank_code === options.failInsert)) return new Response(null, { status: 503 });
        inserts.push(...rows);
        return new Response(null, { status: 201 });
      }
      if (options.readError) return new Response(null, { status: 503 });
      return new Response(JSON.stringify(options.badLatest ?? options.latest ?? []));
    }
    publicCalls.push(input);
    if (input === NEWS_FEEDS[0]) return new Response(RSS);
    if (NEWS_FEEDS.includes(input)) throw new Error('one feed unavailable');
    if (url.hostname === 'cafef.vn') return new Response(NEWS);
    if (!options.newsOnly && url.hostname === 'bidv.com.vn') return new Response(HTML);
    return new Response(null, { status: 403 });
  });
  return { env, fetcher, inserts, publicCalls, dbCalls, run, log: logger() };
}

describe('BR-01 lượt cập nhật offline với Supabase và AI giả', () => {
  it('luật 1–7: nguồn lỗi không dừng lượt, ghi nguồn thật, bank thắng news, MB lấy báo; chỉ chạm bảng lãi suất', async () => {
    const w = world();
    const result = await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log });
    expect(result.written).toBe(2);
    expect(result.pages).toBeLessThanOrEqual(30);
    expect(w.inserts.find((row) => row.bank_code === 'bidv')).toMatchObject({
      promo_rate: 6.5,
      floating_rate: 10,
      source_kind: 'bank',
      source_url: 'https://bidv.com.vn/',
      fetched_at: NOW.toISOString(),
    });
    expect(w.inserts.find((row) => row.bank_code === 'mb')).toMatchObject({
      promo_rate: 7,
      promo_months: 24,
      floating_rate: 11,
      source_kind: 'news',
      source_url: 'https://cafef.vn/tin-moi.chn?a=1&b=2',
    });
    for (const row of w.inserts) expect(w.publicCalls).toContain(row.source_url);
    expect(w.inserts.every((row) => ['bidv', 'mb'].includes(String(row.bank_code)))).toBe(true);
    expect(w.dbCalls.every((call) => /^https:\/\/sb.test\/rest\/v1\/bank_rates(?:_latest\?|$)/.test(call.url))).toBe(
      true,
    );
    expect(w.dbCalls[0]?.init?.headers).toMatchObject({
      apikey: 'fake-service-role',
      Authorization: 'Bearer fake-service-role',
    });
    expect(w.log.warn).toHaveBeenCalled();
  });

  it('luật 5: provenance dùng trang đích sau redirect, không ghi URL chưa đọc', async () => {
    const w = world();
    const fetcher = async (url: string, init?: RequestInit) =>
      url === 'https://bidv.com.vn/'
        ? new Response(null, { status: 302, headers: { Location: '/trang-dich' } })
        : w.fetcher(url, init);
    await runBankRates(w.env, { now: NOW, fetcher, logger: w.log });
    const row = w.inserts.find((row) => row.bank_code === 'bidv');
    expect(row?.source_url).toBe('https://bidv.com.vn/trang-dich');
    expect(w.publicCalls).toContain('https://bidv.com.vn/trang-dich');
  });

  it('luật 4: chặn dòng lệch hơn 2 điểm, log cảnh báo và giữ nguyên bản cũ', async () => {
    const w = world({
      latest: [
        {
          bank_code: 'bidv',
          promo_rate: 4.49,
          floating_rate: 10,
          reference_rate: 7,
          margin: 3,
          fetched_at: '2026-11-11T00:00:00Z',
        },
      ],
    });
    const result = await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log });
    expect(result.drifted).toBe(1);
    expect(w.inserts.map((row) => row.bank_code)).toEqual(['mb']);
    expect(w.log.warn).toHaveBeenCalledWith(
      'bank-rates drift > 2 points; keeping previous',
      expect.objectContaining({ bank_code: 'bidv' }),
    );
  });

  it('luật 4, 5: không tìm được số hoặc AI sai khuôn thì không ghi', async () => {
    for (const invalid of [false, true]) {
      const w = world({ noRates: true });
      if (invalid) w.run.mockImplementation(async () => ({ response: 'bad JSON' }));
      const result = await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log });
      expect(result.written).toBe(0);
      expect(w.inserts).toEqual([]);
      if (invalid) expect(result.failed).toBeGreaterThan(0);
    }
  });

  it.each([{ readError: true }, { badLatest: {} }, { badLatest: [{ bank_code: 'bidv', fetched_at: 'invalid' }] }])(
    'luật 4: đọc latest lỗi/sai cấu trúc phải dừng trước khi lấy nguồn hoặc ghi (%#)',
    async (options) => {
      const w = world(options);
      await expect(runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log })).rejects.toThrow();
      expect(w.inserts).toEqual([]);
      expect(w.publicCalls).toEqual([]);
      expect(w.run).not.toHaveBeenCalled();
    },
  );

  it('luật 6: một lần mỗi ngày; gộp yêu cầu đồng thời và chặn lần sau cùng ngày', async () => {
    const w = world();
    const options = { now: NOW, fetcher: w.fetcher, logger: w.log };
    const [first, duplicate] = await Promise.all([runBankRates(w.env, options), runBankRates(w.env, options)]);
    expect(first).toEqual(duplicate);
    expect(w.inserts).toHaveLength(2);
    const before = w.fetcher.mock.calls.length;
    expect(await runBankRates(w.env, options)).toMatchObject({ skipped: 'already_ran_today' });
    expect(w.fetcher).toHaveBeenCalledTimes(before);
    await runBankRates(w.env, { ...options, now: new Date('2026-11-13T00:00:00Z') });
    expect(w.inserts).toHaveLength(4);
  });

  it('luật 6: isolate mới nhận ra đã ghi trong ngày Việt Nam qua latest', async () => {
    const w = world({
      latest: [
        {
          bank_code: 'bidv',
          promo_rate: 6.5,
          floating_rate: 10,
          reference_rate: null,
          margin: null,
          fetched_at: '2026-11-11T18:00:00Z',
        },
      ],
    });
    expect(await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log })).toMatchObject({
      skipped: 'already_ran_today',
    });
    expect(w.publicCalls).toEqual([]);
    expect(w.inserts).toEqual([]);
  });

  it('luật 6: lỗi ghi một ngân hàng không dừng ngân hàng tiếp theo', async () => {
    const w = world({ failInsert: 'bidv' });
    const result = await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.log });
    expect(result.failed).toBe(1);
    expect(result.written).toBe(1);
    expect(w.inserts.map((row) => row.bank_code)).toEqual(['mb']);
  });

  it('luật 7: lượt đầy đủ không vượt 30 request dù nguồn có hàng trăm liên kết và redirect', async () => {
    const w = world({ noRates: true });
    const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
      if (input.startsWith('https://sb.test/')) return w.fetcher(input, init);
      const url = new URL(input);
      if (NEWS_FEEDS.includes(input)) return new Response(RSS.replaceAll('cafef.vn', url.hostname));
      if (url.pathname === '/')
        return new Response(Array.from({ length: 100 }, (_, i) => `<a href="/loan${i}">Vay nhà</a>`).join(''));
      if (url.pathname.startsWith('/loan'))
        return new Response(null, { status: 302, headers: { Location: `${url.pathname}/next` } });
      return new Response(NEWS);
    });
    const result = await runBankRates(w.env, { now: NOW, fetcher, logger: w.log });
    const publicCalls = fetcher.mock.calls.filter(([url]) => !url.startsWith('https://sb.test/'));
    expect(result.pages).toBe(30);
    expect(publicCalls).toHaveLength(30);
  });
});
