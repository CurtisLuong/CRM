// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Worker source is JavaScript.
import { handleBankRates, runBankRates } from '../../worker/bank-rates.js';
// @ts-expect-error Worker source is JavaScript.
import * as config from '../../worker/bank-rates-config.js';
// @ts-expect-error Worker source is JavaScript.
import * as extraction from '../../worker/bank-rates-extract.js';

const { CHUNK_TEXT, CHUNK_OVERLAP, MAX_CHUNKS_PER_PAGE, MAX_AI_CALLS, BANK_SOURCES, NEWS_FEEDS, newsSearchFeeds } =
  config;
const { extractPage, extractionStats, textChunks, validateDepositRate, validateRate, parseRates } = extraction;
const LONG = readFileSync(new URL('./fixtures/bank-rates/long-multi-bank.txt', import.meta.url), 'utf8');
const NOW = new Date('2026-11-13T00:00:00Z');
const SOURCE = { source_kind: 'news', source_url: 'https://vietstock.vn/lai-suat-13-11.htm' };
const FIELDS = ['promo_rate', 'promo_months', 'floating_rate', 'reference_rate', 'margin'];
type Row = Record<string, unknown>;
function deposit(bank = 'agribank', value = 5.4, quote = '5,4', patch: Row = {}) {
  return {
    bank_code: bank,
    ...Object.fromEntries(FIELDS.map((key) => [key, null])),
    deposit_rate: value,
    note: 'tại quầy',
    evidence: { ...Object.fromEntries(FIELDS.map((key) => [key, null])), deposit_rate: quote },
    ...patch,
  };
}
const response = (rates: Row[]) => ({ response: JSON.stringify({ rates }) });
const log = () => ({ log: vi.fn(), warn: vi.fn() });
const context = (bank = 'Agribank', term = 12, value = '5,4') =>
  `Lãi suất ngân hàng ${bank} hôm nay. Tiết kiệm cá nhân tại quầy. Kỳ hạn ${term} tháng hưởng ${value}%/năm.`;
const FIXTURE_RATES = [
  deposit(),
  deposit('vietcombank', 5.8, '5,8'),
  deposit('vietinbank', 5.9, '5,9'),
  deposit('bidv', 5.7, '5,7'),
];
function fixtureAI() {
  return vi.fn(async (_model: string, params: { messages: { content: string }[] }) => {
    const { text } = JSON.parse(params.messages[1]?.content || '{}');
    return response(FIXTURE_RATES.filter((row) => text.includes(row.evidence.deposit_rate)));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BR-04 cắt bài và giới hạn AI', () => {
  it('bài dài nhiều mục gọi mỗi đoạn, gộp bốn ngân hàng và giữ nguồn; không lưu cửa sổ vào note', async () => {
    expect(LONG.length).toBeGreaterThan(CHUNK_TEXT);
    const run = fixtureAI();
    const stats = extractionStats();
    const rows = await extractPage({ AI: { run } }, SOURCE, LONG, { stats, logger: log() });
    const chunks = textChunks(LONG);
    expect(chunks.length).toBeGreaterThan(1);
    expect(run).toHaveBeenCalledTimes(chunks.length);
    expect(stats.ai_calls).toBe(chunks.length);
    expect(rows).toHaveLength(4);
    expect(rows).toEqual(
      FIXTURE_RATES.map((row) =>
        expect.objectContaining({
          bank_code: row.bank_code,
          deposit_rate: row.deposit_rate,
          kind: 'deposit',
          source_url: SOURCE.source_url,
          note: 'tại quầy',
        }),
      ),
    );
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].length).toBeLessThanOrEqual(CHUNK_TEXT);
      expect(JSON.parse(run.mock.calls[i]?.[1].messages[1]?.content || '{}').text).toBe(chunks[i]);
      if (i > 0) expect(chunks[i].slice(0, CHUNK_OVERLAP)).toBe(chunks[i - 1].slice(-CHUNK_OVERLAP));
    }
  });

  it('đoạn ngắn giữ nguyên, ưu tiên cuối câu và gộp dòng trùng giữa các đoạn', async () => {
    expect(textChunks('Bài ngắn.')).toEqual(['Bài ngắn.']);
    const text = `${'a'.repeat(CHUNK_TEXT - 100)}. ${'b'.repeat(500)}`;
    const chunks = textChunks(text);
    expect(chunks[0]).toBe(`${'a'.repeat(CHUNK_TEXT - 100)}.`);
    const run = vi.fn().mockResolvedValue(response([deposit()]));
    const rows = await extractPage({ AI: { run } }, SOURCE, context().repeat(50), { logger: log() });
    expect(run.mock.calls.length).toBeGreaterThan(1);
    expect(rows).toHaveLength(1);
  });

  it('tôn trọng MAX_CHUNKS_PER_PAGE, log bỏ đoạn và vẫn trả số đã lấy', async () => {
    // Ranh giới câu nằm đầu vùng tìm điểm cắt, tạo năm đoạn trong MAX_TEXT.
    const chars = `${context()}${'x'.repeat(11_800)}`.split('');
    for (const position of [3_100, 5_801, 8_502, 11_203]) chars[position] = '.';
    const text = chars.join('');
    expect(textChunks(text).length).toBeGreaterThan(MAX_CHUNKS_PER_PAGE);
    const logger = log();
    const run = vi.fn().mockResolvedValue(response([deposit()]));
    expect(await extractPage({ AI: { run } }, SOURCE, text, { logger })).toHaveLength(1);
    expect(run).toHaveBeenCalledTimes(MAX_CHUNKS_PER_PAGE);
    expect(logger.warn).toHaveBeenCalledWith('bank-rates AI budget reached', {
      limit: 'MAX_CHUNKS_PER_PAGE',
      max: MAX_CHUNKS_PER_PAGE,
    });
  });

  it('ngân sách dùng chung giữa các trang; hết MAX_AI_CALLS không gọi tiếp', async () => {
    const stats = extractionStats();
    const logger = log();
    const run = vi.fn().mockResolvedValue(response([deposit()]));
    stats.ai_calls = MAX_AI_CALLS - 1;
    expect(await extractPage({ AI: { run } }, SOURCE, LONG, { stats, logger })).toHaveLength(1);
    expect(await extractPage({ AI: { run } }, SOURCE, context(), { stats, logger })).toEqual([]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(stats.ai_calls).toBe(MAX_AI_CALLS);
    expect(logger.warn).toHaveBeenCalledWith('bank-rates AI budget reached', {
      limit: 'MAX_AI_CALLS',
      max: MAX_AI_CALLS,
    });
  });
});

describe('BR-04 bằng chứng ngắn và ngân hàng gần nhất', () => {
  it.each(['5,4', '5,4%'])('mở rộng %s về tiêu đề mục, sản phẩm và kỳ hạn', (quote) => {
    expect(validateDepositRate(deposit('agribank', 5.4, quote), SOURCE, context())).toMatchObject({
      deposit_rate: 5.4,
    });
  });

  it.each(['VietcomBank', 'Vietinbank'])('nhận tên viết khác %s từ BANK_SOURCES', (bank) => {
    expect(validateDepositRate(deposit(bank.toLowerCase()), SOURCE, context(bank))).toMatchObject({
      deposit_rate: 5.4,
    });
  });

  it('tìm tên ngân hàng trong 1.500 ký tự trước cửa sổ nhưng không mượn ngữ cảnh sản phẩm quá xa', () => {
    const text = `Agribank hôm nay. ${'Thông báo điều kiện. '.repeat(32)} Tiết kiệm kỳ hạn 12 tháng hưởng 5,4%/năm.`;
    expect(validateDepositRate(deposit(), SOURCE, text)).toMatchObject({ deposit_rate: 5.4 });
    expect(
      validateDepositRate(deposit(), SOURCE, `Agribank. ${'a '.repeat(800)} Tiết kiệm 12 tháng 5,4%/năm.`),
    ).toMatchObject({ deposit_rate: 5.4 });
    expect(
      validateDepositRate(deposit(), SOURCE, `Agribank. ${'Điều kiện. '.repeat(190)} Tiết kiệm 12 tháng 5,4%/năm.`),
    ).toBeNull();
    expect(
      validateDepositRate(deposit(), SOURCE, `Agribank tiết kiệm. ${'Điều kiện. '.repeat(40)} 12 tháng 5,4%/năm.`),
    ).toBeNull();
  });

  it('xét từng chỗ xuất hiện: lần đầu kỳ hạn 6 tháng, lần sau đúng 12 tháng vẫn nhận', () => {
    const text = `${context('Agribank', 6)} ${context('Vietcombank')} ${context()}`;
    expect(validateDepositRate(deposit(), SOURCE, text)).toMatchObject({ deposit_rate: 5.4 });
    expect(validateDepositRate(deposit('agribank', 5.4, context('Agribank', 6)), SOURCE, text)).toBeNull();
  });

  it.each([
    [context('Vietcombank'), 'wrong_bank'],
    [`${context()} ${context('VietinBank', 12, '5,9')}`, 'wrong_bank', '5,9', 5.9],
    [context('Agribank', 6), 'wrong_term'],
    [context('Agribank', 12, '5,8'), 'no_quote_in_text'],
    [context('Agribank', 12, '15,4'), 'no_quote_in_text'],
    [context('Agribank', 12, '5,40'), 'no_quote_in_text'],
    ['Agribank áp dụng lãi cho vay 12 tháng 5,4%/năm.', 'no_context'],
    ['Agribank công bố lãi gửi 12 tháng 5,4%/năm.', 'no_context'],
    [context().replace('cá nhân', 'doanh nghiệp'), 'no_context'],
    [context().replace('cá nhân', 'đặc biệt'), 'no_context'],
    [context('Agribank', 12, '12,5'), 'out_of_range', '12,5', 12.5],
    ['Tiết kiệm 12 tháng 5,4%/năm. Agribank nằm ở câu sau.', 'wrong_bank'],
    [context('MBank'), 'wrong_bank'],
  ])('loại số không hợp lệ và ghi lý do: %s', (text, reason, quote = '5,4', value = 5.4) => {
    const reject = vi.fn();
    expect(validateDepositRate(deposit('agribank', value, quote), SOURCE, text, reject)).toBeNull();
    expect(reject).toHaveBeenCalledWith(reason);
  });

  it('kỳ hạn và ngân hàng gắn với chính lần số xuất hiện, không mượn lần khác trong cửa sổ', () => {
    const text = 'Agribank tiết kiệm 12 tháng 5,4%/năm. Vietcombank tiết kiệm 6 tháng 5,4%/năm.';
    expect(validateDepositRate(deposit('vietcombank'), SOURCE, text)).toBeNull();
    expect(validateDepositRate(deposit(), SOURCE, text)).toMatchObject({ deposit_rate: 5.4 });
  });

  it('lãi huy động được nhận; note bịa bị bỏ; lãi vay ngắn vẫn cần sản phẩm và đúng ngân hàng', () => {
    expect(
      validateDepositRate(
        deposit('agribank', 5.4, '5,4', { note: 'note không có' }),
        SOURCE,
        'Agribank huy động cá nhân kỳ hạn 12 tháng 5,4%/năm.',
      ),
    ).toMatchObject({ note: null, deposit_rate: 5.4 });
    const loan = {
      ...deposit(),
      deposit_rate: null,
      promo_rate: 6.5,
      evidence: { ...deposit().evidence, deposit_rate: null, promo_rate: '6,5' },
    };
    expect(validateRate(loan, SOURCE, 'Agribank cho vay mua nhà. Ưu đãi 6,5%/năm.')).toMatchObject({ promo_rate: 6.5 });
    expect(validateRate(loan, SOURCE, 'VietinBank cho vay mua nhà. Ưu đãi 6,5%/năm.')).toBeNull();
    expect(validateRate(loan, SOURCE, 'Agribank tiết kiệm 6,5%/năm.')).toBeNull();
  });
});

describe('BR-04 cứu JSON và giữ dữ liệu từng đoạn', () => {
  it('thừa ngoặc giữa các object vẫn cứu hai dòng, xử lý ngoặc và escape trong chuỗi', async () => {
    const agr = deposit('agribank', 5.4, '5,4', { note: 'Điều kiện {"kênh"}: tại quầy' });
    const vcb = deposit('vietcombank');
    const broken = `{"rates":[${JSON.stringify(agr)}}},${JSON.stringify(vcb)}]}`;
    const run = vi.fn().mockResolvedValue({ response: broken });
    const rows = await extractPage(
      { AI: { run } },
      SOURCE,
      `${context()} Điều kiện {"kênh"}: tại quầy. ${context('Vietcombank')}`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].note).toBe('Điều kiện {"kênh"}: tại quầy');
    expect(parseRates({ response: broken })).toBeNull();
  });

  it('object cứu được vẫn bị loại nếu không có số hoặc sai ngân hàng', async () => {
    const run = vi.fn().mockResolvedValue({ response: `{"rates":[${JSON.stringify(deposit())}}}]}` });
    const stats = extractionStats();
    expect(await extractPage({ AI: { run } }, SOURCE, context('BIDV'), { stats })).toEqual([]);
    expect(stats.rejected.wrong_bank).toBe(1);
  });

  it('JSON đúng cú pháp nhưng sai khuôn bỏ cả phản hồi, không cứu object hợp lệ bên cạnh', async () => {
    const run = vi.fn().mockResolvedValue(response([deposit(), { bank_code: 'vietcombank' }]));
    const stats = extractionStats();
    await expect(extractPage({ AI: { run } }, SOURCE, context(), { stats })).rejects.toThrow('AI JSON invalid');
    expect(stats.rejected.json).toBe(1);
    expect(stats.ai_rows).toBe(0);
    expect(stats.failed_pages).toBe(1);
  });

  it('không cứu được gì thì báo failed; đoạn hỏng không làm mất các đoạn tốt', async () => {
    const stats = extractionStats();
    const run = vi
      .fn()
      .mockResolvedValueOnce({ response: '{"rates":[broken}' })
      .mockResolvedValue(response([deposit()]));
    const rows = await extractPage({ AI: { run } }, SOURCE, context().repeat(50), { stats });
    expect(rows).toHaveLength(1);
    expect(stats.failed_pages).toBe(1);
    expect(stats.rejected.json).toBe(1);
    expect(stats.validated).toBeGreaterThan(0);
    await expect(extractPage({ AI: { run: () => ({ response: 'bad' }) } }, SOURCE, context())).rejects.toThrow(
      'AI JSON invalid',
    );
  });
});

function world({ budget = false, drift = false, badJson = false } = {}) {
  const inserts: Row[] = [];
  const logger = log();
  const run = budget
    ? fixtureAI()
    : vi
        .fn()
        .mockResolvedValue(
          badJson
            ? { response: '{' }
            : response([deposit(), deposit('vietcombank', 5.9, '5,9'), deposit('bidv', 5.8, '5,8')]),
        );
  const env = {
    SUPABASE_URL: 'https://sb.test',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-key',
    BANK_RATES_SECRET: 'fixture-secret',
    AI: { run },
  };
  const addresses = Array.from({ length: 10 }, (_, i) => `https://vietstock.vn/lai-suat-${i}.htm`);
  const latest = drift
    ? [
        {
          bank_code: 'agribank',
          kind: 'deposit',
          deposit_rate: 3,
          ...Object.fromEntries(FIELDS.filter((key) => key !== 'promo_months').map((key) => [key, null])),
          fetched_at: '2026-11-12T00:00:00Z',
        },
      ]
    : [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('https://sb.test/')) {
      if (init?.method === 'POST') {
        inserts.push(...[JSON.parse(String(init.body))].flat());
        return new Response(null, { status: 201 });
      }
      return new Response(JSON.stringify(latest));
    }
    if (newsSearchFeeds(NOW).includes(url))
      return new Response(
        `<rss>${addresses
          .map(
            (address) =>
              `<item><title>Lãi suất tiết kiệm 12 tháng</title><link>https://www.bing.com/news/apiclick.aspx?url=${encodeURIComponent(address)}</link><pubDate>2026-11-13</pubDate></item>`,
          )
          .join('')}</rss>`,
      );
    if (NEWS_FEEDS.includes(url)) return new Response('<rss/>');
    if (budget || addresses.includes(url) || url === BANK_SOURCES[0].url)
      return new Response(
        `<time datetime="2026-11-13"></time><p>${budget ? LONG : `${context()} ${context('Vietcombank', 6, '5,9')}`}</p>`,
      );
    return new Response('Chưa có số liệu.');
  });
  return { env, run, logger, fetcher, inserts };
}

describe('BR-04 thống kê lượt chạy và response', () => {
  it('MAX_AI_CALLS áp toàn lượt, vẫn ghi số đã có; summary không chứa bài hoặc SĐT', async () => {
    const w = world({ budget: true });
    const result = await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.logger });
    expect(w.run).toHaveBeenCalledTimes(MAX_AI_CALLS);
    expect(result.ai_calls).toBe(MAX_AI_CALLS);
    expect(w.inserts.length).toBeGreaterThan(0);
    expect(w.logger.warn).toHaveBeenCalledWith('bank-rates AI budget reached', {
      limit: 'MAX_AI_CALLS',
      max: MAX_AI_CALLS,
    });
    expect(w.logger.log).toHaveBeenCalledWith(
      'bank-rates summary',
      expect.objectContaining({
        ai_calls: MAX_AI_CALLS,
        ai_rows: expect.any(Number),
        validated: expect.any(Number),
        rejected: result.rejected,
      }),
    );
    expect(JSON.stringify(w.logger.log.mock.calls)).not.toContain('Điều kiện áp dụng');
  });

  it('BR-05: cả lượt (fetch + AI + DB) không vượt trần subrequest của Cloudflare; ghi gộp một request', async () => {
    for (const budget of [true, false]) {
      const w = world({ budget });
      const result = await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.logger });
      expect(w.fetcher.mock.calls.length + w.run.mock.calls.length).toBeLessThanOrEqual(config.MAX_SUBREQUESTS);
      expect(result.written).toBe(w.inserts.length);
      expect(w.inserts.length).toBeGreaterThan(0);
      const posts = w.fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
      expect(posts).toHaveLength(1);
    }
  });

  it('BR-05: ghi gộp lỗi thì ghi lẻ từng dòng, log kèm lý do lỗi', async () => {
    const w = world({});
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && Array.isArray(JSON.parse(String(init.body))))
        return new Response('batch bad', { status: 400 });
      return w.fetcher(url, init);
    });
    const result = await runBankRates(w.env, { now: NOW, fetcher, logger: w.logger });
    expect(w.inserts.length).toBeGreaterThan(0);
    expect(result).toMatchObject({ written: w.inserts.length, failed: 0 });
    const posts = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1 + w.inserts.length);
  });

  it('summary và response có số dòng trả/qua kiểm, rejected gồm sai kỳ hạn, thiếu quote và lệch', async () => {
    const w = world({ drift: true });
    const result = await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.logger });
    expect(result).toMatchObject({
      written: 0,
      drifted: 1,
      failed: 0,
      rejected: {
        no_quote_in_text: expect.any(Number),
        no_context: 0,
        wrong_term: expect.any(Number),
        wrong_bank: expect.any(Number),
        out_of_range: 0,
        drift: 1,
        json: 0,
      },
    });
    expect(result.rejected.wrong_term).toBeGreaterThan(0);
    expect(result.rejected.no_quote_in_text).toBeGreaterThan(0);
    expect(w.logger.log).toHaveBeenCalledWith(
      'bank-rates summary',
      expect.objectContaining({ ai_rows: result.ai_calls * 3, validated: expect.any(Number) }),
    );
  });

  it('JSON không cứu được tăng failed và rejected.json trong kết quả', async () => {
    const w = world({ badJson: true });
    const result = await runBankRates(w.env, { now: NOW, fetcher: w.fetcher, logger: w.logger });
    expect(result.failed).toBe(result.ai_calls);
    expect(result.rejected.json).toBe(result.ai_calls);
    expect(w.inserts).toEqual([]);
  });

  it('route /run trả ai_calls và rejected, lần bỏ qua cũng có thống kê rỗng', async () => {
    const w = world();
    vi.stubGlobal('fetch', w.fetcher);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const request = new Request('https://worker.test/bank-rates/run', {
      method: 'POST',
      headers: { 'X-Cron-Secret': w.env.BANK_RATES_SECRET },
    });
    const result = await handleBankRates(request, w.env);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      ai_calls: expect.any(Number),
      rejected: expect.objectContaining({ json: 0 }),
    });
    const skipped = await handleBankRates(request, w.env);
    expect(await skipped.json()).toMatchObject({ skipped: 'already_ran_today', ai_calls: 0, rejected: { drift: 0 } });
  });
});
