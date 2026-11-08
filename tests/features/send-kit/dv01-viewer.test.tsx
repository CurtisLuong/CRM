import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SendKitItem } from '@/features/send-kit/model';
import { shareDocumentFile } from '@/features/send-kit/nativeShare';
import { route } from '@/features/send-kit/route';

const state = vi.hoisted(() => ({
  account: null as unknown,
  items: [] as SendKitItem[],
  listeners: new Set<() => void>(),
  editable: true,
}));
vi.mock('@/app/session', () => ({ isDemo: () => false }));
vi.mock('@/data/hooks', () => ({ useRepositoryAccount: () => state.account, useCustomers: () => [] }));
vi.mock('@/lib/document-viewer/preview', () => ({
  ImageDocument: () => <div>Ảnh</div>,
  PdfDocument: () => <div>PDF</div>,
}));
function setup(options: { text?: string; count?: number; cached?: boolean; editable?: boolean } = {}) {
  state.editable = options.editable ?? true;
  state.items = [
    {
      id: 'item',
      title: 'Tài liệu mẫu',
      text: options.text ?? '',
      project: null,
      order: 0,
      updatedAt: 1,
      files: Array.from({ length: options.count ?? 2 }, (_, index) => ({
        id: `f${index}`,
        name: `Tệp ${index}.pdf`,
        type: 'application/pdf',
        size: 4,
        blob: new Blob(['pdf']),
        cached: options.cached ?? true,
      })),
    },
  ];
  const repository = {
    list: vi.fn(async () => state.items),
    synchronize: vi.fn(async () => {}),
    watchFiles: () => () => {},
    getSnapshot: () => ({ items: state.items, loadError: '', syncError: '' }),
    subscribe: (callback: () => void) => {
      state.listeners.add(callback);
      return () => state.listeners.delete(callback);
    },
    canEdit: () => state.editable,
    save: vi.fn(async (item: SendKitItem) => {
      state.items = [item];
      for (const listener of state.listeners) listener();
    }),
    remove: vi.fn(async () => {
      state.items = [];
      for (const listener of state.listeners) listener();
    }),
    ensureFiles: vi.fn(async () =>
      state.items.map((item) => ({ ...item, files: item.files.map((file) => ({ ...file, cached: true })) })),
    ),
  };
  state.account = {
    sync: { local: { userId: 'u1' } },
    sendKit: repository,
    catalog: { load: async () => {}, projects: () => [] },
  };
  render(<MemoryRouter>{route.element}</MemoryRouter>);
  return repository;
}
beforeEach(() => {
  state.listeners.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as Window & { Capacitor?: unknown }).Capacitor;
});
describe('DV-01 kho tài liệu', () => {
  it('ô PDF mở đúng tệp, đổi tệp giữ vị trí và kiểm giới hạn có sẵn', async () => {
    const repository = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Xem Tệp 1.pdf' }));
    // DV-02 (Curtis 08/11): tiêu đề trình xem = "{dự án}. {tiêu đề mục}" (mục Chung: tiêu đề mục); ảnh vẫn có alt = tên tệp.
    expect(screen.getByRole('dialog', { name: 'Tài liệu mẫu' }).textContent).toContain('2/2');
    fireEvent.change(screen.getByLabelText('Chọn tệp thay thế'), {
      target: { files: [new File(['x'], 'sai.docx', { type: 'application/msword' })] },
    });
    await screen.findByText('sai.docx: chỉ thêm ảnh, PDF hoặc video.');
    expect(repository.save).not.toHaveBeenCalled();
    const added = new File(['new'], 'mới.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Chọn tệp thay thế'), { target: { files: [added] } });
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Tài liệu mẫu' }).textContent).toContain('PDF · 3 B'),
    );
    expect(state.items[0]?.files.map((file) => file.name)).toEqual(['Tệp 0.pdf', 'mới.pdf']);
    expect(state.items[0]?.order).toBe(0);
  });
  it('xoá tệp cuối không có chữ hỏi xoá cả tài liệu; huỷ không ghi', async () => {
    const repository = setup({ count: 1 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Xem Tệp 0.pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(confirm).toHaveBeenCalledWith('Xoá cả tài liệu “Tài liệu mẫu”?');
    expect(repository.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(repository.remove).toHaveBeenCalledWith('item'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('xoá tệp cuối có chữ giữ mục và chữ', async () => {
    const repository = setup({ count: 1, text: 'Giữ nội dung' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Xem Tệp 0.pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(repository.save).toHaveBeenCalled());
    expect(state.items[0]?.text).toBe('Giữ nội dung');
    expect(state.items[0]?.files).toHaveLength(0);
    expect(repository.remove).not.toHaveBeenCalled();
  });
  it('người chỉ xem vẫn xem/chia sẻ nhưng không được đổi/xoá', async () => {
    setup({ editable: false });
    await userEvent.click(await screen.findByRole('button', { name: 'Xem Tệp 1.pdf' }));
    expect(screen.queryByRole('button', { name: 'Đổi tệp' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Chia sẻ' }).hasAttribute('disabled')).toBe(false));
  });
  it('tệp chưa có trên máy dùng ensureFiles, ngoại tuyến có thông báo và thử lại', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const repository = setup({ cached: false });
    await userEvent.click(await screen.findByRole('button', { name: 'Xem Tệp 1.pdf' }));
    await screen.findByText('Cần mạng để tải tệp này');
    expect(repository.ensureFiles).not.toHaveBeenCalled();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(repository.ensureFiles).toHaveBeenCalledWith(['item']));
    expect(await screen.findByText('PDF', { selector: 'div' })).toBeTruthy();
  });
  it('Android mở chooser, chỉ gửi tệp đang xem, không kèm chữ hay ép app nhận', async () => {
    const share = vi.fn(async () => ({ target: 'chooser' }));
    (window as Window & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      Plugins: { ShareFiles: { share } },
    };
    await shareDocumentFile({ name: 'Tệp.pdf', mime: 'application/pdf' }, new Blob(['hello']));
    expect(share).toHaveBeenCalledWith({
      files: [{ name: 'Tệp.pdf', mimeType: 'application/pdf', base64: 'aGVsbG8=' }],
    });
  });
  it('web chia sẻ một File; máy không hỗ trợ thì tải về và thu hồi URL', async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(async () => {});
    vi.stubGlobal('navigator', { share, canShare: () => true });
    await shareDocumentFile({ name: 'Tệp.pdf', mime: 'application/pdf' }, new Blob(['hello']));
    expect(share.mock.calls[0]?.[0]).toEqual({ files: [expect.any(File)] });
    vi.stubGlobal('navigator', {});
    const create = vi.fn(() => 'blob:test');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.useFakeTimers();
    await shareDocumentFile({ name: 'Tệp.pdf', mime: 'application/pdf' }, new Blob(['hello']));
    expect(create).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:test');
    vi.useRealTimers();
  });
  it('đóng lúc lưu thay tệp thì lưu xong không tự mở lại viewer', async () => {
    const repository = setup();
    let finish!: () => void;
    repository.save.mockImplementationOnce(async (item: SendKitItem) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      state.items = [item];
      for (const listener of state.listeners) listener();
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Xem Tệp 1.pdf' }));
    fireEvent.change(screen.getByLabelText('Chọn tệp thay thế'), {
      target: { files: [new File(['x'], 'mới.pdf', { type: 'application/pdf' })] },
    });
    await waitFor(() => expect(repository.save).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    finish();
    await screen.findByRole('button', { name: 'Xem mới.pdf' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
