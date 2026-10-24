import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DocumentsSection,
  documentGroup,
  documentMeta,
  documentName,
  formatFileSize,
  groupDocuments,
  type ProfileDocument,
} from '@/features/profile/documents';
import { ToastProvider } from '@/ui';

const docs: ProfileDocument[] = [
  {
    id: 'd1',
    label: 'Sổ đỏ.jpg',
    storage_path: 'u1/c1/d1.jpg',
    mime: 'image/jpeg',
    size: 2_516_582,
  },
  {
    id: 'd2',
    label: 'Hợp đồng.pdf',
    storage_path: 'u1/c1/d2.pdf',
    mime: 'application/pdf',
    size: 512,
  },
  {
    id: 'd3',
    label: 'Đơn xác nhận.doc',
    storage_path: 'u1/c1/d3.doc',
    mime: 'application/msword',
    size: 2048,
  },
  {
    id: 'd4',
    label: 'Bảng lương.xlsx',
    storage_path: 'u1/c1/d4.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: null,
  },
  { id: 'd5', label: 'Bản scan', storage_path: 'u1/c1/d5.bin', mime: 'application/octet-stream' },
];
const [imgDoc, pdfDoc, wordDoc, sheetDoc, otherDoc] = docs as [
  ProfileDocument,
  ProfileDocument,
  ProfileDocument,
  ProfileDocument,
  ProfileDocument,
];

function makeRemote(initial: ProfileDocument[] = docs) {
  return {
    listDocuments: vi.fn(async () => initial),
    uploadDocument: vi.fn(
      async (_id: string, file: Blob & { name?: string }, kind?: string, label?: string | null) => ({
        id: 'new',
        label,
        storage_path: `u1/c1/new.${file.type === 'image/png' ? 'png' : 'bin'}`,
        mime: file.type,
        size: file.size,
        kind,
      }),
    ),
    deleteDocument: vi.fn(async () => undefined),
    signedDocUrl: vi.fn(async () => 'https://docs.test/signed'),
  };
}

function renderDocs(
  options: {
    remote?: ReturnType<typeof makeRemote>;
    writable?: boolean;
    online?: boolean;
    onCountChange?: (count: number) => void;
  } = {},
) {
  const remote = options.remote ?? makeRemote();
  const onCountChange = options.onCountChange ?? vi.fn();
  render(
    <ToastProvider>
      <DocumentsSection
        customerId="c1"
        remote={remote}
        writable={options.writable ?? true}
        online={options.online ?? true}
        onCountChange={onCountChange}
      />
    </ToastProvider>,
  );
  return { remote, onCountChange };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CP-02 phân nhóm tài liệu', () => {
  it('xếp theo mime và đuôi tên tệp vào đúng nhóm', () => {
    expect(documentGroup(imgDoc)).toBe('image');
    expect(documentGroup(pdfDoc)).toBe('pdf');
    expect(documentGroup(wordDoc)).toBe('word');
    expect(documentGroup(sheetDoc)).toBe('sheet');
    expect(documentGroup(otherDoc)).toBe('other');
    expect(documentGroup({ id: 'x', storage_path: 'u/c/anh.PNG' })).toBe('image');
    expect(documentGroup({ id: 'x', storage_path: 'u/c/giay.docx' })).toBe('word');
    expect(documentGroup({ id: 'x', storage_path: 'u/c/so.xls' })).toBe('sheet');
  });

  it('chỉ trả nhóm có tệp, giữ thứ tự Ảnh chụp → PDF → Văn bản → Bảng tính → Khác', () => {
    const groups = groupDocuments([sheetDoc, pdfDoc, otherDoc]);
    expect(groups.map((group) => group.key)).toStrictEqual(['pdf', 'sheet', 'other']);
    expect(groupDocuments([pdfDoc]).map((group) => group.label)).toStrictEqual(['PDF']);
    expect(groupDocuments([])).toStrictEqual([]);
  });

  it('tên người dùng + loại/kích thước; không trả storage_path', () => {
    expect(documentName(imgDoc)).toBe('Sổ đỏ.jpg');
    expect(documentName({ id: 'x', storage_path: 'u1/c1/ten-tu-path.pdf' })).toBe('ten-tu-path.pdf');
    expect(documentName({ id: 'x', storage_path: '' })).toBe('Tài liệu');
    expect(documentMeta(imgDoc)).toBe('Ảnh JPG · 2,4 MB');
    expect(documentMeta(pdfDoc)).toBe('PDF · 512 B');
    expect(documentMeta(wordDoc)).toBe('Word · 2 KB');
    expect(documentMeta(sheetDoc)).toBe('Excel');
    expect(formatFileSize(null)).toBe('');
  });
});

describe('CP-02 tài liệu trong hồ sơ', () => {
  it('hiện nhóm có dữ liệu, nhãn tên + loại/kích thước, không hiện storage_path', async () => {
    const onCountChange = vi.fn();
    renderDocs({ onCountChange });
    expect(await screen.findByText('Sổ đỏ.jpg')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /^Ảnh chụp/ })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /^PDF/ })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /^Văn bản/ })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /^Bảng tính/ })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /^Khác/ })).toBeTruthy();
    expect(screen.getByText('Ảnh JPG · 2,4 MB')).toBeTruthy();
    expect(screen.getByText('PDF · 512 B')).toBeTruthy();
    expect(screen.queryByText(/u1\/c1\/d1\.jpg/)).toBeNull();
    expect(screen.queryByText(/storage_path/)).toBeNull();
    expect(onCountChange).toHaveBeenCalledWith(5);
  });

  it('chỉ dựng nhóm có tệp: không có PDF thì không có mục PDF', async () => {
    renderDocs({ remote: makeRemote([wordDoc]) });
    expect(await screen.findByText('Đơn xác nhận.doc')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /^Văn bản/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: /^PDF/ })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: /^Ảnh chụp/ })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: /^Bảng tính/ })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: /^Khác/ })).toBeNull();
  });

  it('lỗi tải danh sách báo lỗi, KHÔNG hiện như danh sách trống', async () => {
    const remote = makeRemote();
    remote.listDocuments.mockRejectedValue(new Error('Mất kết nối máy chủ'));
    renderDocs({ remote });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Mất kết nối máy chủ');
    expect(screen.queryByText('Chưa có tài liệu.')).toBeNull();
    expect(screen.queryByText('Đang tải tài liệu…')).toBeNull();
  });

  it('chưa có tài liệu trực tuyến hiện trạng thái trống', async () => {
    renderDocs({ remote: makeRemote([]), online: true });
    expect(await screen.findByText('Chưa có tài liệu.')).toBeTruthy();
  });

  it('ngoại tuyến không báo "chưa có tài liệu"', async () => {
    renderDocs({ remote: makeRemote([]), online: false });
    expect(await screen.findByText('Ngoại tuyến · tài liệu chỉ tải khi có mạng.')).toBeTruthy();
    expect(screen.queryByText('Chưa có tài liệu.')).toBeNull();
  });

  it('tải tài liệu lên gọi remote rồi thêm vào danh sách và cập nhật số đếm', async () => {
    const onCountChange = vi.fn();
    const { remote } = renderDocs({ remote: makeRemote([]), onCountChange });
    await screen.findByText('Chưa có tài liệu.');
    const file = new File([Uint8Array.from([1, 2])], 'anh-moi.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Tải tài liệu'), { target: { files: [file] } });
    await waitFor(() => expect(remote.uploadDocument).toHaveBeenCalledWith('c1', file, 'anh', 'anh-moi.png'));
    expect(await screen.findByText('Đã tải tài liệu lên')).toBeTruthy();
    expect(await screen.findByText('anh-moi.png')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: /^Ảnh chụp/ })).toBeTruthy();
    expect(onCountChange).toHaveBeenLastCalledWith(1);
  });

  it('xoá tài liệu cần xác nhận; Huỷ thì không gọi remote', async () => {
    const user = userEvent.setup();
    const { remote } = renderDocs({ remote: makeRemote([pdfDoc]) });
    await screen.findByText('Hợp đồng.pdf');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: 'Xoá Hợp đồng.pdf' }));
    expect(confirm).toHaveBeenCalledWith('Xoá tài liệu “Hợp đồng.pdf”?');
    expect(remote.deleteDocument).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Xoá Hợp đồng.pdf' }));
    await waitFor(() => expect(remote.deleteDocument).toHaveBeenCalledWith(pdfDoc));
    expect(screen.queryByText('Hợp đồng.pdf')).toBeNull();
    expect(await screen.findByText('Đã xoá tài liệu')).toBeTruthy();
  });

  it('mở tệp lấy liên kết đã ký và mở tab mới', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { remote } = renderDocs({ remote: makeRemote([pdfDoc]) });
    await screen.findByText('Hợp đồng.pdf');
    await user.click(screen.getByRole('button', { name: 'Mở' }));
    await waitFor(() => expect(remote.signedDocUrl).toHaveBeenCalledWith('u1/c1/d2.pdf'));
    expect(open).toHaveBeenCalledWith('https://docs.test/signed', '_blank', 'noopener,noreferrer');
  });

  it('khách chỉ xem: không có nút tải lên hay xoá, vẫn mở được tệp', async () => {
    renderDocs({ writable: false, remote: makeRemote([pdfDoc]) });
    await screen.findByText('Hợp đồng.pdf');
    expect(screen.queryByLabelText('Tải tài liệu')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Xoá / })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mở' })).toBeTruthy();
    expect(screen.getByText('Bạn chỉ có quyền xem; thao tác sửa và tải lên đã khoá.')).toBeTruthy();
  });

  it('nhóm chỉ hiện số tệp đúng và mỗi tệp nằm trong nhóm của nó', async () => {
    renderDocs();
    const imageGroup = (await screen.findByRole('heading', { level: 3, name: /^Ảnh chụp/ })).closest('section');
    expect(imageGroup).toBeTruthy();
    expect(within(imageGroup as HTMLElement).getByText('Sổ đỏ.jpg')).toBeTruthy();
    expect(within(imageGroup as HTMLElement).queryByText('Hợp đồng.pdf')).toBeNull();
  });
});
