import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { type AiParseNote, aiAvailable, buildAiApprovalPatch, getAiSettings, requestAi } from '@/features/ai/model';

describe('AI client model', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('hides AI if worker URL is empty or the device is offline', () => {
    expect(aiAvailable(undefined, true)).toBe(false);
    expect(aiAvailable('https://worker.test', false)).toBe(false);
    expect(aiAvailable(' https://worker.test ', true)).toBe(true);
  });

  it('reuses per-account AI settings from T3.11', async () => {
    localStorage.setItem('crm_ai_settings:person-1', JSON.stringify({ model: 'glm', style: 'Gọn' }));
    const account = {
      remote: { getAiSettingsRemote: vi.fn().mockResolvedValue(null) },
    } as unknown as RepositoryAccount;
    await expect(getAiSettings(account, 'person-1')).resolves.toMatchObject({ model: 'glm', style: 'Gọn' });
  });

  it('posts the existing Worker contract and configured style/model, without adding a phone field', async () => {
    vi.stubEnv('VITE_WORKER_URL', 'https://worker.test/');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { tin_nhan: 'Xin chào' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const account = {
      sync: {
        isOnline: () => true,
        client: { auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } },
      },
    } as unknown as RepositoryAccount;
    await requestAi(
      account,
      'zalo',
      { full_name: 'An' },
      { goal: 'Hỏi thăm 0901234567' },
      { model: 'glm', style: 'Ngắn 0901234567' },
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://worker.test/ai');
    expect(body).toMatchObject({
      task: 'zalo',
      customer: { full_name: 'An' },
      extra: {
        goal: 'Hỏi thăm [đã ẩn số điện thoại]',
        model: 'glm',
        style: 'Ngắn [đã ẩn số điện thoại]',
      },
    });
    expect(body.customer).not.toHaveProperty('phone');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token' });
  });

  it('creates a field patch only for explicitly selected suggestions and preserves unknown JSON keys', () => {
    const customer = {
      id: 'c',
      phone: '0912345678',
      full_name: 'An',
      owner_id: 'owner',
      field_meta: { finance: { at: 'old', by: 'sale', confirmed: true, custom: 'keep' }, other: { value: 1 } },
      next_tasks: [{ at: 'old', text: 'Existing', custom: 'keep-task' }],
    } as unknown as Customer;
    const suggestion: AiParseNote = {
      cap_nhat: { finance: '500000000', income: '25 triệu' },
      viec: [{ text: 'Gửi bảng giá', kind: 'message', date: '2099-01-02' }],
    };
    const patch = buildAiApprovalPatch(customer, suggestion, ['field:finance', 'task:0'], '2026-10-16T00:00:00Z');
    expect(patch.finance).toBe(500000000);
    expect(patch).not.toHaveProperty('income');
    expect(patch.field_meta).toMatchObject({
      finance: { by: 'ai', confirmed: true, custom: 'keep' },
      other: { value: 1 },
    });
    expect(patch.next_tasks).toEqual([
      { at: 'old', text: 'Existing', custom: 'keep-task' },
      expect.objectContaining({ text: 'Gửi bảng giá', source: 'ai', due_allday: true }),
    ]);
    expect(customer.next_tasks).toHaveLength(1);
    expect(buildAiApprovalPatch(customer, suggestion, [])).toEqual({});
  });
});
