import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentsSection, type ProfileDocument } from '@/features/profile/documents';
import { ToastProvider } from '@/ui';

const old: ProfileDocument = {
  id: 'old',
  label: 'Tài liệu.docx',
  kind: 'hop_dong',
  storage_path: 'private/old',
  mime: 'application/msword',
  size: 4,
};
const added: ProfileDocument = { ...old, id: 'new', label: 'Bản mới.docx', storage_path: 'private/new' };
function setup(writable = true) {
  const remote = {
    listDocuments: vi.fn(async () => [old]),
    signedDocUrl: vi.fn(async () => 'http://127.0.0.1/document'),
    uploadDocument: vi.fn(async () => added),
    deleteDocument: vi.fn(async () => {}),
  };
  const count = vi.fn();
  render(
    <ToastProvider>
      <DocumentsSection customerId="c1" remote={remote} writable={writable} onCountChange={count} />
    </ToastProvider>,
  );
  return { remote, count };
}
beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, blob: async () => new Blob(['doc']) })),
  ),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('DV-01 tài liệu hồ sơ', () => {
  it('Mở tải blob bằng liên kết ký, không mở popup; quyền chỉ xem vẫn được chia sẻ', async () => {
    const open = vi.spyOn(window, 'open');
    const { remote } = setup(false);
    await userEvent.click(await screen.findByRole('button', { name: 'Mở' }));
    const dialog = await screen.findByRole('dialog', { name: old.label as string });
    await within(dialog).findByText('Chưa xem trước được loại tệp này');
    expect(remote.signedDocUrl).toHaveBeenCalledWith(old.storage_path);
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1/document', { signal: expect.any(AbortSignal) });
    expect(open).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole('button', { name: 'Đổi tệp' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Xoá' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Chia sẻ' }).hasAttribute('disabled')).toBe(false);
  });
  it('Đổi tệp giữ kind, nhãn mới; chỉ xoá cũ sau upload thành công', async () => {
    const { remote, count } = setup();
    let finish!: (doc: ProfileDocument) => void;
    remote.uploadDocument.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Mở' }));
    const file = new File(['new'], added.label as string, { type: 'application/msword' });
    fireEvent.change(screen.getByLabelText('Chọn tệp thay thế'), { target: { files: [file] } });
    await waitFor(() => expect(remote.uploadDocument).toHaveBeenCalledWith('c1', file, 'hop_dong', file.name));
    expect(remote.deleteDocument).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Đổi tệp' }).hasAttribute('disabled')).toBe(true);
    finish(added);
    await waitFor(() => expect(remote.deleteDocument).toHaveBeenCalledWith(old));
    expect(await screen.findByRole('dialog', { name: added.label as string })).toBeTruthy();
    expect(count).toHaveBeenLastCalledWith(1);
  });
  it('upload lỗi giữ tài liệu cũ, không gọi xoá', async () => {
    const { remote } = setup();
    remote.uploadDocument.mockRejectedValueOnce(new Error('Không tải lên được'));
    await userEvent.click(await screen.findByRole('button', { name: 'Mở' }));
    fireEvent.change(screen.getByLabelText('Chọn tệp thay thế'), { target: { files: [new File(['x'], 'mới.docx')] } });
    await screen.findByText('Không tải lên được');
    expect(remote.deleteDocument).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: old.label as string })).toBeTruthy();
  });
  it('xoá bản cũ lỗi giữ cả hai tệp; không che mất bản mới đã tải lên', async () => {
    const { remote, count } = setup();
    remote.deleteDocument.mockRejectedValueOnce(new Error('lỗi'));
    await userEvent.click(await screen.findByRole('button', { name: 'Mở' }));
    fireEvent.change(screen.getByLabelText('Chọn tệp thay thế'), { target: { files: [new File(['x'], 'mới.docx')] } });
    await screen.findByText('Đã tải tệp mới; chưa xoá được tệp cũ. Thử xoá lại từ danh sách.');
    expect(count).toHaveBeenLastCalledWith(2);
  });
  it('Xoá trong viewer dùng xác nhận sẵn có', async () => {
    const { remote } = setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Mở' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(confirm).toHaveBeenCalledWith('Xoá tài liệu “Tài liệu.docx”?');
    expect(remote.deleteDocument).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(remote.deleteDocument).toHaveBeenCalledWith(old);
  });
  it('đóng lúc đang thay tệp thì hoàn tất lưu không tự mở lại viewer', async () => {
    const { remote } = setup();
    let finish!: (doc: ProfileDocument) => void;
    remote.uploadDocument.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Mở' }));
    fireEvent.change(screen.getByLabelText('Chọn tệp thay thế'), { target: { files: [new File(['x'], 'mới.docx')] } });
    await waitFor(() => expect(remote.uploadDocument).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    finish(added);
    await waitFor(() => expect(remote.deleteDocument).toHaveBeenCalledWith(old));
    await screen.findByText(added.label as string);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
