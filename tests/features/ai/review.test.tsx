import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { AiCloseReason } from '@/features/ai/AiCloseReason';
import { AiNoteReview } from '@/features/ai/AiNoteReview';
import { AiRetargetDraft } from '@/features/ai/AiRetargetDraft';
import { AiZaloDraft } from '@/features/ai/AiZaloDraft';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/features/ai/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ai/model')>()),
  getAiSettings: async () => ({ model: 'qwen', style: 'Gọn' }),
  requestAi: mocks.request,
}));
let customer: Customer;
let account: RepositoryAccount;
let update: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv('VITE_WORKER_URL', 'https://worker.test');
  mocks.request.mockReset();
  customer = {
    id: 'c',
    owner_id: 'u',
    full_name: 'An',
    phone: '0901234567',
    updated_at: '2026-10-17T00:00:00Z',
  } as Customer;
  update = vi.fn().mockResolvedValue(undefined);
  account = {
    sync: { local: { userId: 'u' }, isOnline: () => true },
    catalog: { projects: () => [] },
    customers: { getSnapshot: () => [customer], update },
  } as unknown as RepositoryAccount;
});
const parsed = {
  cap_nhat: { finance: 2800000001 },
  viec: [{ text: 'Gửi giấy tờ', ben: 'khach', key: 'same', date: '2026-10-18', kind: 'docs' }],
  hen_goi: null,
  thay_doi: ['Đã đổi vốn'],
  nguoi_quyet_dinh: [{ ten: '', vai_tro: 'chồng', ghi_chu: 'Cùng quyết định' }],
  phan_doi: ['Lo chi phí'],
};
const generate = () => fireEvent.click(screen.getByRole('button', { name: 'Lưu + AI · xem đề xuất' }));
describe('review before local changes', () => {
  it('does not update until specific proposals are selected and approved; shows evidence and side', async () => {
    mocks.request.mockResolvedValue({ data: parsed });
    render(<AiNoteReview account={account} customer={customer} note="Không phải 3 tỷ, vốn 2 tỷ 800 triệu 1 đồng" />);
    generate();
    await screen.findByText(/Đã đổi vốn/);
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText(/Khách hẹn: Gửi giấy tờ/)).toBeTruthy();
    expect(screen.getByText(/Lo chi phí/)).toBeTruthy();
    expect(screen.getByText(/Chưa rõ tên/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /Vốn sẵn có/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt và lưu các mục đã chọn' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[1]).toMatchObject({ finance: 2800000001 });
    expect(update.mock.calls[0]?.[1]).not.toHaveProperty('next_tasks');
    expect(update.mock.calls[0]?.[1]).not.toHaveProperty('household');
  });
  it('invalidates late analysis after A→B→A source changes', async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.request.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const view = render(<AiNoteReview account={account} customer={customer} note="A" />);
    generate();
    await waitFor(() => expect(mocks.request).toHaveBeenCalled());
    view.rerender(<AiNoteReview account={account} customer={customer} note="B" />);
    view.rerender(<AiNoteReview account={account} customer={customer} note="A" />);
    await act(async () => resolve({ data: parsed }));
    expect(screen.queryByTestId('ai-note-review')).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
  it('clears selections when note changes and preserves original oversized note without network', async () => {
    mocks.request.mockResolvedValue({ data: parsed });
    const view = render(<AiNoteReview account={account} customer={customer} note="A" />);
    generate();
    await screen.findByTestId('ai-note-review');
    const note = 'x'.repeat(1501);
    view.rerender(<AiNoteReview account={account} customer={customer} note={note} />);
    expect(screen.queryByTestId('ai-note-review')).toBeNull();
    expect(screen.getByRole('button', { name: 'Lưu + AI · xem đề xuất' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('lưu ghi chú gốc');
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(note).toHaveLength(1501);
  });
  it('shows the default call time that approval will save for a date-only call', async () => {
    mocks.request.mockResolvedValue({
      data: { cap_nhat: {}, viec: [], hen_goi: { date: '2099-01-02', slot: null, time: null, reason: 'Hỏi lại vốn' } },
    });
    render(<AiNoteReview account={account} customer={customer} note="Gọi lại ngày 2/1" />);
    generate();
    const row = await screen.findByRole('checkbox', { name: /Hẹn gọi/ });
    expect(row.closest('label')?.textContent).toContain('2099-01-02 09:00–10:00');
    expect(row.closest('label')?.textContent).toContain('giờ mặc định');
    fireEvent.click(row);
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt và lưu các mục đã chọn' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[1]).toMatchObject({
      next_call_at: '2099-01-02T02:00:00.000Z',
      next_call_end: '2099-01-02T03:00:00.000Z',
    });
  });
  it.each(['owner', 'archived'])('rechecks latest %s permission immediately before approval', async (mode) => {
    mocks.request.mockResolvedValue({ data: parsed });
    render(<AiNoteReview account={account} customer={customer} note="A" />);
    generate();
    await screen.findByTestId('ai-note-review');
    fireEvent.click(screen.getByRole('checkbox', { name: /Vốn sẵn có/ }));
    customer = { ...customer, ...(mode === 'owner' ? { owner_id: 'other' } : { archived_at: '2026-10-17' }) };
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt và lưu các mục đã chọn' }));
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('chỉ có quyền xem');
  });
});
describe('draft boundaries', () => {
  it('rechecks DNC after in-flight Zalo generation', async () => {
    let resolve: (value: unknown) => void = () => {};
    mocks.request.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const onDraft = vi.fn();
    render(<AiZaloDraft account={account} customer={customer} onDraft={onDraft} />);
    fireEvent.click(screen.getByRole('button', { name: 'Soạn bằng AI' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalled());
    customer = { ...customer, contact_prefs: { do_not_contact: true } };
    await act(async () => resolve({ data: { tin_nhan: 'Nháp', chi_tiet_dung: 'Ghi chú' } }));
    expect(onDraft).not.toHaveBeenCalled();
  });
  it('new close reason remains an explicit review callback and filters unknown codes', async () => {
    mocks.request.mockResolvedValue({
      data: {
        goi_y: [
          { ma: 'price', bang_chung: 'Ghi chú 17/10: giá cao' },
          { ma: 'invented', bang_chung: 'X' },
        ],
        dieu_kien_retarget: 'Giá thấp hơn',
      },
    });
    const onReview = vi.fn();
    render(<AiCloseReason account={account} customer={customer} reasons={{ price: 'Do giá' }} onReview={onReview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đề xuất AI' }));
    await screen.findByText('Ghi chú 17/10: giá cao');
    expect(onReview).not.toHaveBeenCalled();
    expect(screen.queryByText('X')).toBeNull();
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Chọn để kiểm tra trước khi lưu' }));
    expect(onReview).toHaveBeenCalledWith({
      code: 'price',
      evidence: 'Ghi chú 17/10: giá cao',
      retarget: 'Giá thấp hơn',
    });
    expect(update).not.toHaveBeenCalled();
  });
  it('retarget cannot generate without verified product input', () => {
    render(
      <AiRetargetDraft
        account={account}
        customer={customer}
        product={null}
        match={{ matched: [], blocked: [] }}
        history={{}}
        onDraft={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Tạo đề xuất AI' }).hasAttribute('disabled')).toBe(true);
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
