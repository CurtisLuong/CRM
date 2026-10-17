import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { promiseTaskKey } from '@/domain/deadlines/promises';
import { coachAggregates } from '@/features/ai/AiCoach';
import { verifiedProductDate } from '@/features/ai/AiRetargetDraft';
import {
  type AiParseNote,
  buildAiApprovalPatch,
  exactVnd,
  requestAi,
  validateAiResult,
  vietnamDay,
} from '@/features/ai/model';
import { redactAiText } from '@/features/ai/privacy';

const customer = { id: 'c', owner_id: 'u', phone: '0901234567', full_name: 'An' } as Customer;
const account = {
  sync: {
    isOnline: () => true,
    client: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } },
  },
} as unknown as RepositoryAccount;
const settings = { model: 'qwen', style: 'Gọn' };
beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv('VITE_WORKER_URL', 'https://worker.test');
});
describe('human-approved AI values', () => {
  it.each([
    true,
    null,
    NaN,
    Infinity,
    1000000.2,
    '2 tỷ 8',
    '2.800.000.000',
    '2800000000đ',
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid money %s without reinterpretation', (value) => {
    expect(exactVnd(value)).toBeNull();
    expect(buildAiApprovalPatch(customer, { cap_nhat: { finance: value } }, ['field:finance'])).not.toHaveProperty(
      'finance',
    );
  });
  it('retains VND exactly, including one dong, after human selection', () => {
    expect(buildAiApprovalPatch(customer, { cap_nhat: { finance: '2800000001' } }, ['field:finance']).finance).toBe(
      2800000001,
    );
  });
  it('persists both sides and unique at identifiers, compatible with canonical manual identities', () => {
    const source: AiParseNote = {
      viec: [
        { text: 'Gửi giấy tờ', date: '2026-10-18', time: '00:15', ben: 'em', key: 'shared' },
        { text: 'Gửi giấy tờ', date: '2026-10-18', time: '00:15', ben: 'khach', key: 'shared' },
        { text: 'Gửi giấy tờ', date: '2026-10-18', time: '00:15', ben: 'em', key: 'shared' },
      ],
    };
    const patch = buildAiApprovalPatch(customer, source, ['task:0', 'task:1', 'task:2'], '2026-10-17T00:00:00Z');
    const tasks = patch.next_tasks as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.side)).toEqual(['me', 'customer']);
    expect(new Set(tasks.map((task) => task.at)).size).toBe(2);
    expect(tasks[0]).toMatchObject({
      due: '2026-10-17T17:15:00.000Z',
      ai_key: 'shared',
      key: promiseTaskKey('c', 'me', 'Gửi giấy tờ', '2026-10-17T17:15:00.000Z'),
    });
    expect(buildAiApprovalPatch({ ...customer, next_tasks: tasks } as Customer, source, ['task:0', 'task:1'])).toEqual(
      {},
    );
  });
  it('dedupes legacy tasks by Vietnam day, preserves unknown data and opposite side', () => {
    const original = { at: 'old', text: 'Gửi giấy tờ', due: '2026-10-17T17:15:00Z', custom: { keep: 1 } };
    const patch = buildAiApprovalPatch(
      { ...customer, next_tasks: [original] } as Customer,
      {
        viec: [
          { text: 'Gửi giấy tờ', date: '2026-10-18', ben: 'em' },
          { text: 'Gửi giấy tờ', date: '2026-10-18', ben: 'khach' },
        ],
      },
      ['task:0', 'task:1'],
    );
    expect(patch.next_tasks).toEqual([original, expect.objectContaining({ side: 'customer' })]);
  });
  it.each([{ date: '2026-02-30' }, { date: '2026-10-18', time: '24:00' }, { date: '2026-10-18', time: '12:99' }])(
    'does not roll invalid dates/clocks %j',
    (value) => {
      expect(
        buildAiApprovalPatch(customer, { viec: [{ text: 'Việc', ...value }], hen_goi: value }, ['task:0', 'call']),
      ).toEqual({});
    },
  );
  it('uses injected now and Vietnam offset for future calls even when actual clock differs', () => {
    expect(
      buildAiApprovalPatch(
        customer,
        { hen_goi: { date: '2020-01-02', time: '00:15' } },
        ['call'],
        '2020-01-01T00:00:00Z',
      ),
    ).toMatchObject({ next_call_at: '2020-01-01T17:15:00.000Z' });
    expect(vietnamDay(new Date('2026-10-17T18:00:00Z'))).toBe('2026-10-18');
  });
  it('appends selected household only and preserves all existing metadata', () => {
    const existing = { id: 'h', name: 'Mai', role: 'vợ', phone: '0901234567', custom: 'keep' };
    const patch = buildAiApprovalPatch(
      { ...customer, household: [existing] } as Customer,
      { nguoi_quyet_dinh: [{ ten: '', vai_tro: 'chồng', ghi_chu: 'Cùng quyết định' }] },
      ['person:0'],
    );
    expect(patch.household).toEqual([existing, expect.objectContaining({ name: '', role: 'chồng', source: 'ai' })]);
    expect(JSON.stringify(patch.household)).not.toContain('Chưa rõ');
  });
});
describe('transport boundaries and aggregate privacy', () => {
  it.each(['x'.repeat(1501), `${'x'.repeat(1489)}0901234567`])(
    'rejects raw or redaction-expanded note before fetch',
    async (note) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(requestAi(account, 'parse_note', {}, { note }, settings)).rejects.toThrow('1.500');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(note.length).toBeGreaterThan(1490);
    },
  );
  it('sends full accepted note and tail correction without money corruption or PII', async () => {
    const note = `${'x'.repeat(1400)} Vốn 1000000000, gọi 02412345678. Sửa lại không phải 3 tỷ, tối đa 2 tỷ 8`;
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ data: { cap_nhat: {}, viec: [], hen_goi: null } }) });
    vi.stubGlobal('fetch', fetchMock);
    await requestAi(account, 'parse_note', { phone: '0901234567', owner_id: 'u' }, { note }, settings);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.extra.note).toBe(redactAiText(note));
    expect(body.extra.note).toContain('1000000000');
    expect(body.extra.note).toMatch(/tối đa 2 tỷ 8$/);
    expect(body.customer).toEqual({});
  });
  it('rejects array/malformed result containers and hides raw Worker errors', async () => {
    expect(() => validateAiResult('zalo', [])).toThrow('không hợp lệ');
    expect(() =>
      validateAiResult('parse_note', { cap_nhat: {}, viec: [{ text: 'X', ben: 'sale' }], hen_goi: null }),
    ).toThrow('không hợp lệ');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Secret customer note 0901234567' }),
      }),
    );
    await expect(requestAi(account, 'brief', {}, {}, settings)).rejects.toThrow('mã 500');
  });
  it('strips individual rows and identifiers from coach aggregates while preserving actual periods', () => {
    expect(
      coachAggregates({
        coverage: {
          value: 50,
          numerator: 5,
          denominator: 10,
          period: '30 ngày',
          sample_threshold: 5,
          customerIds: ['private'],
          rows: [{ phone: '0901234567' }],
        } as never,
      }),
    ).toEqual({ coverage: { value: 50, numerator: 5, denominator: 10, period: '30 ngày', sample_threshold: 5 } });
  });
  it.each(['2026-02-30', '2026-10-17T24:00:00Z', 'yesterday', ''])(
    'rejects fabricated/invalid product verification %s',
    (value) => expect(verifiedProductDate(value)).toBe(false),
  );
  it('accepts explicit valid verification date and timestamp', () => {
    expect(verifiedProductDate('2026-10-17')).toBe(true);
    expect(verifiedProductDate('2026-10-17T09:00:00+07:00')).toBe(true);
  });
});
