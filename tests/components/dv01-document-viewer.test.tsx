import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentViewer, type DocumentViewerFile } from '@/components/crm/document-viewer';
import { OfflineDocumentError } from '@/lib/document-viewer/files';

const attachment = (id: string, load = vi.fn(async () => new Blob(['Word']))) => ({
  id,
  name: `${id}.docx`,
  mime: 'application/msword',
  size: 2048,
  load,
});
afterEach(() => vi.restoreAllMocks());
describe('DV-01 viewer dùng chung', () => {
  it('dialog lấy tên tệp, cắt tên bằng truncate/title; chỉ hiện callback được truyền', async () => {
    const file = attachment('Hợp đồng');
    const share = vi.fn(async () => {});
    render(<DocumentViewer files={[file]} fileId={file.id} open onOpenChange={vi.fn()} onShare={share} />);
    const dialog = screen.getByRole('dialog', { name: file.name });
    expect(within(dialog).getByRole('heading', { name: file.name }).title).toBe(file.name);
    await screen.findByText('Chưa xem trước được loại tệp này');
    expect(dialog.textContent).toContain('Word · 2 KB');
    expect(dialog.textContent).not.toContain('application/msword');
    expect(screen.queryByRole('button', { name: 'Đổi tệp' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Chia sẻ' }));
    expect(share).toHaveBeenCalledWith(file, expect.any(Blob));
  });
  it('có trạng thái tải có chữ, lỗi tải và Thử lại', async () => {
    const load = vi
      .fn<() => Promise<Blob>>()
      .mockRejectedValueOnce(new Error('url nội bộ'))
      .mockResolvedValue(new Blob(['ok']));
    const file = attachment('Lỗi', load);
    render(<DocumentViewer files={[file]} fileId={file.id} open onOpenChange={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('Đang tải…');
    expect((await screen.findByRole('alert')).textContent).toBe('Chưa tải được tệp');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByText('Chưa xem trước được loại tệp này');
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('ngoại tuyến có thông báo riêng và vẫn cho thử lại', async () => {
    const file = attachment(
      'Chưa tải',
      vi.fn(async () => {
        throw new OfflineDocumentError();
      }),
    );
    render(<DocumentViewer files={[file]} fileId={file.id} open onOpenChange={vi.fn()} />);
    expect(await screen.findByText('Cần mạng để tải tệp này')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
  it('chuyển tệp đúng thứ tự, số đếm và không dùng kết quả tải cũ', async () => {
    let resolve!: (blob: Blob) => void;
    const files: DocumentViewerFile[] = [
      attachment(
        'Một',
        vi.fn(
          () =>
            new Promise<Blob>((done) => {
              resolve = done;
            }),
        ),
      ),
      attachment('Hai'),
    ];
    function Harness() {
      const [id, setId] = useState('Một');
      return <DocumentViewer files={files} fileId={id} open onOpenChange={vi.fn()} onFileChange={setId} />;
    }
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Tệp trước' }).hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Tệp sau' }));
    expect(screen.getByRole('dialog', { name: 'Hai.docx' }).textContent).toContain('2/2');
    resolve(new Blob(['cũ']));
    await screen.findByText('Chưa xem trước được loại tệp này');
    expect(screen.getByRole('button', { name: 'Tệp sau' }).hasAttribute('disabled')).toBe(true);
  });
  it('thay thế qua picker, khoá thao tác lúc lưu và báo lỗi ngay trong dialog', async () => {
    const file = attachment('Một');
    const replace = vi.fn(async () => {
      throw new Error('Tệp quá lớn');
    });
    render(
      <DocumentViewer
        files={[file]}
        fileId={file.id}
        open
        onOpenChange={vi.fn()}
        onReplace={replace}
        onDelete={vi.fn()}
      />,
    );
    const replacement = new File(['new'], 'mới.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Chọn tệp thay thế'), { target: { files: [replacement] } });
    await screen.findByText('Tệp quá lớn');
    expect(replace).toHaveBeenCalledWith(file, replacement);
    expect(screen.getByRole('button', { name: 'Xoá' }).className).toContain('text-alert-text');
  });
  it('Esc/X đóng, huỷ tải đang chạy và trả focus về nút mở', async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | undefined;
    const file = attachment(
      'Một',
      vi.fn((input?: AbortSignal) => {
        signal = input;
        return new Promise<Blob>(() => {});
      }),
    );
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Xem tệp
          </button>
          <DocumentViewer files={[file]} fileId={file.id} open={open} onOpenChange={setOpen} />
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Xem tệp' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
