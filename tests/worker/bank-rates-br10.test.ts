// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Worker source is JavaScript.
import { runBankRates } from '../../worker/bank-rates.js';
// @ts-expect-error Worker source is JavaScript.
import { BANK_SOURCES, missingCellSearchFeeds, NEWS_FEEDS } from '../../worker/bank-rates-config.js';
// @ts-expect-error Worker source is JavaScript.
import * as extraction from '../../worker/bank-rates-extract.js';
// @ts-expect-error Worker source is JavaScript.
import { collectQueued, pageHistory, SCAN_STATE_KEY } from '../../worker/bank-rates-state.js';

const { BANK_RATES_PROMPT, extractPage, logRejectedValue, validateDepositRate, validateRate } = extraction;

type Row = Record<string, unknown>;
type Bank = { code: string; name: string; url: string };
type Job = {
  base?: string;
  source_url: string;
  source_kind: string;
  bank_code?: string;
  cell?: string;
  page?: unknown;
};
type Entry = { read_at: string; source_kind: string; rows: number; banks: string[] };
type State = { version: number; queue: Job[]; visited: Record<string, Entry>; paused_until: null };
const BANKS: Bank[] = BANK_SOURCES;
const NOW = new Date('2026-11-14T12:10:00Z');
const FIELDS = ['promo_rate', 'promo_months', 'floating_rate', 'reference_rate', 'margin', 'deposit_rate'];
const empty = () => Object.fromEntries(FIELDS.map((key) => [key, null]));
const SOURCE = { source_kind: 'news', source_url: 'https://cafef.vn/lai-suat.chn' };
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.txt`, import.meta.url), 'utf8');
const DEPOSIT = fixture('br10-deposit-cafef-1211');
const LOAN = fixture('br10-loan-cafef-0911');
const DANTRI = fixture('br10-loan-dantri-0309');
const sentence = (text: string, part: string) => {
  const found = text.split(/(?<=[.!?])\s+/).find((line) => line.includes(part));
  if (!found) throw new Error(`Không thấy câu: ${part}`);
  return found.trim();
};
function aiRow(bank_code: string, field: string, value: number, quote: string, months?: number): Row {
  return {
    ...empty(),
    bank_code,
    note: null,
    [field]: value,
    ...(months === undefined ? {} : { promo_months: months }),
    evidence: { ...empty(), [field]: quote, ...(months === undefined ? {} : { promo_months: quote }) },
  };
}
function validate(text: string, bank: string, field: string, value: number, quote: string, months?: number) {
  const row = aiRow(bank, field, value, quote, months);
  const logger = { warn: vi.fn() };
  const reject = vi.fn();
  const result = (field === 'deposit_rate' ? validateDepositRate : validateRate)(
    row,
    SOURCE,
    text,
    reject,
    (key: string, reason: string) => logRejectedValue(logger, row, key, reason),
  );
  return { result, logger, reject };
}
function rejected(text: string, bank: string, field: string, value: number, quote: string, reason: string) {
  const { result, logger, reject } = validate(text, bank, field, value, quote);
  expect(result).toBeNull();
  expect(reject).toHaveBeenCalledWith(reason);
  expect(logger.warn).toHaveBeenCalledWith(
    'bank-rates rejected value',
    expect.objectContaining({ bank_code: bank, field, value, reason }),
  );
}

describe('BR-10 ba bài so sánh thật, AI giả trích đúng câu', () => {
  it.each([
    ['agribank', 6.8, 'cả bốn ngân hàng'],
    ['bidv', 6.8, 'cả bốn ngân hàng'],
    ['vietcombank', 6.8, 'cả bốn ngân hàng'],
    ['vietinbank', 6.8, 'cả bốn ngân hàng'],
    ['sacombank', 7, 'Trong đó, MBV'],
    ['vpbank', 6.7, 'VPBank, LPBank'],
    ['techcombank', 6.25, 'Bắc Á Bank'],
    ['mb', 5.85, 'MB duy trì'],
    ['acb', 5.3, 'Một số ngân hàng khác'],
    ['hdbank', 5.3, 'Một số ngân hàng khác'],
  ])('fixture gửi CafeF: %s nhận %s đúng kỳ hạn 12T', (bank, value, part) => {
    expect(
      validate(DEPOSIT, String(bank), 'deposit_rate', Number(value), sentence(DEPOSIT, String(part))).result,
    ).toMatchObject({ bank_code: bank, deposit_rate: value, kind: 'deposit' });
  });

  it.each([
    ['mb', 7, 'Trong đó, MBV', 'wrong_bank'],
    ['vietcombank', 7, 'Trong đó, MBV', 'wrong_bank'],
    ['vpbank', 7.4, 'Với kỳ hạn 18', 'wrong_term'],
    ['sacombank', 6.7, 'Đối với kỳ hạn 6', 'wrong_term'],
    ['sacombank', 6.7, 'còn BVBank và Sacombank', 'wrong_term'],
  ])('fixture gửi CafeF: loại %s %s (%s), log %s', (bank, value, part, reason) => {
    rejected(DEPOSIT, String(bank), 'deposit_rate', Number(value), sentence(DEPOSIT, String(part)), String(reason));
  });

  it.each([
    ['techcombank', 9.5, 'Lãi suất vay mua nhà được nhân viên', '9,5–10%/năm'],
    ['vietcombank', 9, 'Vietcombank áp dụng', null],
    ['bidv', 9, 'BIDV triển khai', null],
  ])('fixture vay CafeF: %s nhận %s, 12 tháng, câu %s, khoảng gốc %s', (bank, value, part, note) => {
    expect(
      validate(LOAN, String(bank), 'promo_rate', Number(value), sentence(LOAN, String(part)), 12).result,
    ).toMatchObject({ bank_code: bank, promo_rate: value, promo_months: 12, note });
  });

  it.each([
    ['agribank', 6.5, 'Tại Agribank'],
    ['vietinbank', 10, 'VietinBank đang triển khai'],
  ])('fixture vay CafeF: loại chương trình riêng %s %s, có log', (bank, value, part) => {
    rejected(LOAN, String(bank), 'promo_rate', Number(value), sentence(LOAN, String(part)), 'no_context');
  });

  it.each([
    ['vpbank', 13.2, 'Một số ngân hàng áp dụng mức cao', 12],
    ['hdbank', 9.8, 'Ở chiều ngược lại', 12],
    ['acb', 11, 'Trên 10%', undefined],
  ])('fixture vay Dân trí: %s nhận %s, kỳ %s', (bank, value, part, months) => {
    expect(
      validate(
        DANTRI,
        String(bank),
        'promo_rate',
        Number(value),
        sentence(DANTRI, String(part)),
        months as number | undefined,
      ).result,
    ).toMatchObject({ bank_code: bank, promo_rate: value, promo_months: months ?? null });
  });

  it.each([
    [11.1, 'Một số ngân hàng áp dụng mức cao'],
    [12, 'Một số ngân hàng áp dụng mức cao'],
    [9.5, 'Ở chiều ngược lại'],
    [9.3, 'Ở chiều ngược lại'],
  ])('fixture Dân trí: số %s của VIB/VietBank/Woori không gán cho 10 ngân hàng', (value, part) => {
    for (const bank of BANKS) {
      rejected(DANTRI, bank.code, 'promo_rate', Number(value), sentence(DANTRI, String(part)), 'wrong_bank');
    }
  });

  it('fixture Dân trí: câu MSB và ACB chung 11 chỉ nhận ACB trong danh mục', () => {
    const quote = sentence(DANTRI, 'Trên 10%');
    for (const bank of BANKS.filter((bank) => bank.code !== 'acb')) {
      rejected(DANTRI, bank.code, 'promo_rate', 11, quote, 'wrong_bank');
    }
  });

  it('luật 8: prompt yêu cầu từng ngân hàng và cả câu; extractPage nhận đủ 10 dòng gửi', async () => {
    const rates = [
      ...['agribank', 'bidv', 'vietcombank', 'vietinbank'].map((code) =>
        aiRow(code, 'deposit_rate', 6.8, sentence(DEPOSIT, 'cả bốn ngân hàng')),
      ),
      aiRow('sacombank', 'deposit_rate', 7, sentence(DEPOSIT, 'Trong đó, MBV')),
      aiRow('vpbank', 'deposit_rate', 6.7, sentence(DEPOSIT, 'VPBank, LPBank')),
      aiRow('techcombank', 'deposit_rate', 6.25, sentence(DEPOSIT, 'Bắc Á Bank')),
      aiRow('mb', 'deposit_rate', 5.85, sentence(DEPOSIT, 'MB duy trì')),
      ...['acb', 'hdbank'].map((code) => aiRow(code, 'deposit_rate', 5.3, sentence(DEPOSIT, 'Một số ngân hàng khác'))),
    ];
    const run = vi.fn().mockResolvedValue({ response: JSON.stringify({ rates }) });
    const rows = await extractPage({ AI: { run } }, SOURCE, DEPOSIT);
    expect(rows).toHaveLength(10);
    expect(rows.map((row: Row) => [row.bank_code, row.deposit_rate])).toEqual(
      rates.map((row) => [row.bank_code, row.deposit_rate]),
    );
    expect(BANK_RATES_PROMPT).toContain('một dòng cho mỗi ngân hàng, evidence là cả câu đó');
    expect(run.mock.calls[0]?.[1].messages[0].content).toContain(BANK_RATES_PROMPT);
  });
});

describe('BR-10 luật 1–7 với câu độc lập', () => {
  it.each(['đều niêm yết', 'cùng áp dụng', 'cùng niêm yết', 'cùng ở mức', 'cùng'])(
    'luật 1: danh sách gồm/dấu phẩy/và %s',
    (predicate) => {
      const text = `Tiền gửi kỳ hạn 12 tháng: các ngân hàng gồm BIDV, ACB và MB ${predicate} 6,8%/năm.`;
      for (const bank of ['bidv', 'acb', 'mb']) {
        expect(validate(text, bank, 'deposit_rate', 6.8, text).result).toMatchObject({
          bank_code: bank,
          deposit_rate: 6.8,
        });
      }
    },
  );

  it.each([';', '.'])('luật 1: danh sách không vượt dấu %s', (boundary) => {
    const text = `BIDV tiết kiệm kỳ hạn 12 tháng 5%/năm${boundary} ACB và MB đều niêm yết tiết kiệm 12 tháng 6%/năm.`;
    rejected(text, 'bidv', 'deposit_rate', 6, text, 'wrong_bank');
    for (const bank of ['acb', 'mb'])
      expect(validate(text, bank, 'deposit_rate', 6, text).result).toMatchObject({ deposit_rate: 6 });
  });

  it('luật 1: ngân hàng có mức riêng không nhập vào danh sách mức sau', () => {
    const text = 'BIDV tiết kiệm 12 tháng 5%/năm, ACB và MB cùng áp dụng 6%/năm.';
    rejected(text, 'bidv', 'deposit_rate', 6, text, 'wrong_bank');
  });

  it('luật 2: kỳ hạn câu dẫn kéo dài rồi đổi giữa đoạn, không mượn lần cùng số', () => {
    const text =
      'Mặt bằng lãi suất tiền gửi kỳ hạn 12 tháng được khảo sát. ACB niêm yết 5,3%/năm. MB 5,8%/năm. Với kỳ hạn 18 tháng, ACB 5,9%/năm. MB 5,8%/năm. Đối với kỳ hạn 6 tháng, BIDV 4%/năm. Kỳ hạn 12 tháng, BIDV 6%/năm.';
    expect(validate(text, 'acb', 'deposit_rate', 5.3, 'ACB niêm yết 5,3%/năm.').result).toMatchObject({
      deposit_rate: 5.3,
    });
    expect(validate(text, 'mb', 'deposit_rate', 5.8, 'MB 5,8%/năm.').result).toMatchObject({ deposit_rate: 5.8 });
    rejected(text, 'acb', 'deposit_rate', 5.9, 'ACB 5,9%/năm.', 'wrong_term');
    rejected(text, 'mb', 'deposit_rate', 5.8, 'Với kỳ hạn 18 tháng, ACB 5,9%/năm. MB 5,8%/năm.', 'wrong_term');
    rejected(text, 'bidv', 'deposit_rate', 4, 'BIDV 4%/năm.', 'wrong_term');
    expect(validate(text, 'bidv', 'deposit_rate', 6, 'BIDV 6%/năm.').result).toMatchObject({ deposit_rate: 6 });
  });

  it.each(['MBV', 'VCBNeo', 'Bắc Á Bank', 'VietABank', 'VietBank', 'MBank'])(
    'luật 3: %s không phải ngân hàng trong danh mục',
    (foreign) => {
      const text = `BIDV tiết kiệm kỳ hạn 12 tháng 5%/năm, ${foreign} niêm yết 7%/năm.`;
      for (const bank of BANKS) rejected(text, bank.code, 'deposit_rate', 7, text, 'wrong_bank');
    },
  );

  it.each([
    ['9,5% - 10%/năm', 9.5, '9,5–10%/năm'],
    ['9,8-11,5%/năm', 9.8, '9,8–11,5%/năm'],
    ['từ 9%/năm', 9, null],
    ['khoảng 11%/năm', 11, null],
  ])('luật 4: nhận đầu thấp của %s và lưu khoảng gốc', (rate, value, note) => {
    const text = `ACB cho vay mua nhà lãi suất ${rate} cố định 12 tháng.`;
    expect(validate(text, 'acb', 'promo_rate', Number(value), text, 12).result).toMatchObject({
      promo_rate: value,
      promo_months: 12,
      note,
    });
  });

  it('luật 4: không nhận đầu cao của khoảng thành ưu đãi', () => {
    const text = 'ACB cho vay mua nhà lãi suất 9,8-11,5%/năm cố định 12 tháng.';
    rejected(text, 'acb', 'promo_rate', 11.5, text, 'out_of_range');
  });

  it.each(['cố định 12 tháng', 'trong 12 tháng đầu', 'cho khoản vay cố định 12 tháng'])(
    'luật 5: nhận thời gian %s',
    (period) => {
      const text = `BIDV cho vay mua nhà từ 9%/năm ${period}.`;
      expect(validate(text, 'bidv', 'promo_rate', 9, text, 12).result).toMatchObject({
        promo_rate: 9,
        promo_months: 12,
      });
    },
  );

  it('luật 5: chọn kỳ ngắn nhất ngay cả khi kỳ dài đứng trước, không ghép tháng gói khác', () => {
    const text = 'BIDV vay mua nhà 10%/năm cố định 24 tháng, 9,5%/năm trong 18 tháng, từ 9%/năm cố định 12 tháng.';
    expect(validate(text, 'bidv', 'promo_rate', 9, text, 12).result).toMatchObject({ promo_rate: 9, promo_months: 12 });
    rejected(text, 'bidv', 'promo_rate', 10, text, 'wrong_term');
    rejected(text, 'bidv', 'promo_rate', 9.5, text, 'wrong_term');
    const wrongMonths = validate(text, 'bidv', 'promo_rate', 9, text, 24);
    expect(wrongMonths.result).toMatchObject({ promo_rate: 9, promo_months: null });
    expect(wrongMonths.logger.warn).toHaveBeenCalledWith(
      'bank-rates rejected value',
      expect.objectContaining({ field: 'promo_months', reason: 'wrong_term' }),
    );
  });

  // Curtis 14/11: chỉ bỏ nhà ở xã hội; mọi chương trình nhà thương mại đều tính.
  it.each(['nhà ở xã hội', 'NOXH'])('luật 6: loại gói %s', (condition) => {
    const text = `ACB cho vay mua nhà 9%/năm dành cho ${condition}.`;
    rejected(text, 'acb', 'promo_rate', 9, text, 'no_context');
  });

  it.each(['khách hàng dưới 30 tuổi', 'khách hàng dưới 35 tuổi', 'một số dự án'])(
    'luật 6 (Curtis 14/11): nhận gói nhà thương mại %s',
    (condition) => {
      const text = `ACB cho vay mua nhà 9%/năm dành cho ${condition}.`;
      expect(validate(text, 'acb', 'promo_rate', 9, text).result).toMatchObject({ promo_rate: 9 });
    },
  );

  it('luật 6: hơn 10% không phải số cụ thể', () => {
    const text = 'ACB cho vay mua nhà với lãi suất hơn 10%/năm.';
    rejected(text, 'acb', 'promo_rate', 10, text, 'no_context');
  });

  it.each(['đặc biệt', 'doanh nghiệp'])('luật 7: câu dẫn %s vẫn bị loại', (condition) => {
    const text = `Bảng tiền gửi ${condition} kỳ hạn 12 tháng. ACB và MB cùng áp dụng 7%/năm.`;
    rejected(text, 'acb', 'deposit_rate', 7, text, 'no_context');
  });
});

function scanState(): State {
  return { version: 1, queue: [], visited: {}, paused_until: null };
}
const visited = (kind: string, read_at = NOW.toISOString()): Entry => ({
  read_at,
  source_kind: kind,
  rows: 0,
  banks: [],
});

function queueWorld(state: State) {
  const latest = BANKS.flatMap((bank) =>
    ['loan', 'deposit'].map((kind) => ({
      ...empty(),
      bank_code: bank.code,
      kind,
      fetched_at: NOW.toISOString(),
      promo_rate: kind === 'loan' ? 9 : null,
      deposit_rate: kind === 'deposit' ? 6 : null,
    })),
  ).filter((row) => row.bank_code !== 'mb' || row.kind !== 'loan');
  let stored = JSON.stringify(state);
  const kv = {
    get: vi.fn(async () => JSON.parse(stored)),
    put: vi.fn(async (_key: string, value: string) => {
      stored = value;
    }),
  };
  const fetcher = vi.fn(async (url: string) => {
    if (url.startsWith('https://sb.test/')) return new Response(JSON.stringify(latest));
    return new Response('<p>Chưa có số liệu.</p>');
  });
  const run = vi.fn().mockResolvedValue({ response: '{"rates":[]}' });
  const logger = { log: vi.fn(), warn: vi.fn() };
  const env = {
    SUPABASE_URL: 'https://sb.test',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-key',
    BANK_RATES_STATE: kv,
    AI: { run },
  };
  return {
    state: () => JSON.parse(stored) as State,
    kv,
    fetcher,
    run,
    logger,
    execute: (now = NOW) => runBankRates(env, { now, fetcher, logger }),
  };
}

function restAll(state: State) {
  const cell = { bank_code: 'mb', kind: 'loan' };
  state.visited[BANKS.find((bank) => bank.code === 'mb')?.url || ''] = visited('bank');
  for (const feed of NEWS_FEEDS) state.visited[feed] = visited('feed');
  for (let variant = 0; variant < 4; variant++) {
    state.visited[missingCellSearchFeeds([cell], NOW, variant)[0]] = visited('feed');
  }
}

describe('BR-10 luật 9: hàng chờ và trạng thái nghỉ', () => {
  it('KV toàn URL đã đọc: dọn hàng chờ, all_sources_resting + next_ready, 0 fetch công khai/AI', async () => {
    const state = scanState();
    restAll(state);
    for (let i = 0; i < 58; i++) {
      const url = `https://cafef.vn/da-doc-${i % 29}.chn`;
      state.visited[url] = visited('news');
      state.queue.push({ source_url: url, source_kind: 'news', cell: 'mb:loan' });
    }
    const w = queueWorld(state);
    expect(await w.execute()).toMatchObject({
      skipped: 'all_sources_resting',
      next_ready: '2026-11-14T18:10:00.000Z',
      pages: 0,
      ai_calls: 0,
      queue: 0,
      cells: [],
      missing_before: 1,
      missing_after: 1,
    });
    expect(w.state().queue).toEqual([]);
    expect(w.kv.put).toHaveBeenCalledWith(SCAN_STATE_KEY, expect.any(String));
    expect(w.fetcher).toHaveBeenCalledTimes(1); // Chỉ đọc bảng đối chiếu giả, không đọc trang.
    expect(w.run).not.toHaveBeenCalled();
    expect(w.logger.log).toHaveBeenCalledWith('bank-rates idle', { next_ready: '2026-11-14T18:10:00.000Z' });
    const result = await w.execute(new Date('2026-11-14T18:10:00.000Z'));
    expect(result.skipped).toBeUndefined();
    expect(result.pages).toBeGreaterThan(0);
  });

  it('nguồn báo chung còn sẵn vẫn được xử lý khi trang chủ và mọi truy vấn đang nghỉ', async () => {
    const state = scanState();
    restAll(state);
    const url = 'https://cafef.vn/chua-doc.chn';
    state.queue = [
      { source_url: url, base: url, source_kind: 'news' },
      { source_url: url, base: url, source_kind: 'news', cell: 'mb:loan' },
    ];
    const w = queueWorld(state);
    expect(await w.execute()).toMatchObject({ pages: 1, ai_calls: 1 });
    expect(w.fetcher.mock.calls.filter(([address]) => address === url)).toHaveLength(1);
    expect(w.state().queue).toEqual([]);
  });

  it('URL trùng được gộp, giữ page chờ AI; collectQueued không fetch lại', async () => {
    const state = scanState();
    restAll(state);
    const url = 'https://cafef.vn/doi-ai.chn';
    state.visited[url] = visited('news');
    const page = { url, text: 'MB vay mua nhà từ 9%/năm.', metadata: {} };
    state.queue = [
      { source_url: url, source_kind: 'news' },
      { source_url: url, source_kind: 'news', page },
      { source_url: url, source_kind: 'news', page },
    ];
    const inspect = vi.fn(async () => {
      state.paused_until = null;
      return [];
    });
    const read = vi.fn();
    const logger = { log: vi.fn() };
    const result = await collectQueued({
      state,
      history: pageHistory(state, NOW),
      latest: [],
      missing: [{ bank_code: 'mb', kind: 'loan' }],
      now: NOW,
      read,
      inspect,
      stats: { ai_calls: 0 },
      workLeft: () => 10,
      logger,
      queries: [],
    });
    expect(result.cells).toEqual([{ bank_code: 'mb', kind: 'loan' }]);
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(state.queue).toEqual([]);
  });
});

describe('BR-10 ranh giới ngữ cảnh gói vay', () => {
  it('luật 5: các mức ở nhiều câu vẫn chọn thời gian cố định ngắn nhất', () => {
    const text = 'BIDV cho vay mua nhà 10%/năm cố định 24 tháng. Lãi suất 9%/năm cố định 12 tháng.';
    expect(validate(text, 'bidv', 'promo_rate', 9, text, 12).result).toMatchObject({ promo_rate: 9, promo_months: 12 });
    rejected(text, 'bidv', 'promo_rate', 10, text, 'wrong_term');
  });

  it('luật 6: câu giải thích sau mức lãi nói rõ không áp dụng chung thì loại', () => {
    const text = 'ACB cho vay mua nhà 9%/năm. Đây không phải mức lãi suất áp dụng chung cho khách hàng.';
    rejected(text, 'acb', 'promo_rate', 9, 'ACB cho vay mua nhà 9%/năm.', 'no_context');
  });

  it('luật 7: không dùng kỳ hạn hoặc khoản tiền làm lãi ưu đãi', () => {
    const text = 'ACB cho vay mua nhà thời hạn 9 năm, ưu đãi 6%/năm cố định 12 tháng.';
    rejected(text, 'acb', 'promo_rate', 9, text, 'no_context');
  });

  it('luật 7: câu dẫn vay không biến số gửi thành vay', () => {
    const text = 'Khảo sát lãi suất vay mua nhà các ngân hàng. ACB tiết kiệm kỳ hạn 12 tháng 6%/năm.';
    rejected(text, 'acb', 'promo_rate', 6, text, 'no_context');
  });

  it('luật 7: câu dẫn gửi không biến số vay thành gửi', () => {
    const text = 'Bảng tiền gửi kỳ hạn 12 tháng các ngân hàng. ACB cho vay mua nhà cố định 12 tháng 6%/năm.';
    rejected(text, 'acb', 'deposit_rate', 6, text, 'no_context');
  });
});

describe('BR-10 kỳ hạn thuộc đúng sản phẩm và đúng số', () => {
  it('luật 2, 7: không kế thừa số tháng ưu đãi vay thành kỳ hạn gửi', () => {
    const text = 'MB cho vay mua nhà cố định 12 tháng 8%/năm. ACB tiền gửi 6%/năm.';
    rejected(text, 'acb', 'deposit_rate', 6, 'ACB tiền gửi 6%/năm.', 'wrong_term');
  });

  it('luật 2: kỳ hạn ngân hàng sau không gán ngược cho số trước trong đoạn 12T', () => {
    const text = 'Bảng tiền gửi kỳ hạn 12 tháng. ACB 6%/năm, MB tiết kiệm kỳ hạn 18 tháng 7%/năm.';
    expect(validate(text, 'acb', 'deposit_rate', 6, 'ACB 6%/năm').result).toMatchObject({ deposit_rate: 6 });
    rejected(text, 'mb', 'deposit_rate', 7, '7%/năm', 'wrong_term');
  });

  it('luật 2: kỳ hạn ngay sau số vẫn thắng kỳ hạn câu trước', () => {
    const text = 'Bảng tiền gửi kỳ hạn 6 tháng. ACB hưởng 6%/năm ở kỳ hạn 12 tháng.';
    expect(validate(text, 'acb', 'deposit_rate', 6, '6%/năm').result).toMatchObject({ deposit_rate: 6 });
  });
});

describe('BR-10 Lead: danh sách "lần lượt" là mỗi ngân hàng một số', () => {
  const text =
    'Lãi suất tiết kiệm kỳ hạn 12 tháng tại ACB, MB, BIDV và Techcombank lần lượt là 6%, 6,5%, 7% và 7,2%/năm.';
  it.each([
    ['mb', 6, '6%'],
    ['acb', 6.5, '6,5%'],
    ['bidv', 7.2, '7,2%'],
  ])('không chia chung số cho %s = %s', (bank, value, quote) => {
    expect(validate(text, bank, 'deposit_rate', value, `${quote}`).result).toBeNull();
  });
  it('danh sách không có "đều/cùng" nhưng chỉ một số rồi sang ngân hàng khác vẫn chia chung', () => {
    const list = 'Lãi suất tiết kiệm kỳ hạn 12 tháng: ACB và HDBank 5,3%/năm, PVcomBank 5,1%/năm.';
    expect(validate(list, 'acb', 'deposit_rate', 5.3, '5,3%').result).not.toBeNull();
    expect(validate(list, 'hdbank', 'deposit_rate', 5.3, '5,3%').result).not.toBeNull();
  });
});
