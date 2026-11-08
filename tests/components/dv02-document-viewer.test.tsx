import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentViewer, type DocumentViewerFile } from '@/components/crm/document-viewer';

vi.mock('@/lib/document-viewer/preview', () => ({
  ImageDocument: () => <div>Ảnh</div>,
  PdfDocument: () => <div>PDF</div>,
}));

const file = (overrides: Partial<DocumentViewerFile>): DocumentViewerFile => ({
  id: 'file',
  name: 'tệp',
  mime: '',
  load: async () => new Blob(['x']),
  ...overrides,
});

describe('DV-02 tiêu đề và dòng phụ của trình xem', () => {
  it('tiêu đề mục thay tên tệp; tên tệp vẫn xem được qua title; dòng phụ là loại + cỡ', () => {
    const image = file({ name: 'IMG_20261028_161949.jpg', mime: 'image/jpeg', size: 148480 });
    render(
      <DocumentViewer
        files={[image]}
        fileId={image.id}
        open
        onOpenChange={vi.fn()}
        title="Vin Tràng Cát. Tổng quan dự án"
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Vin Tràng Cát. Tổng quan dự án' });
    const heading = within(dialog).getByRole('heading', { name: 'Vin Tràng Cát. Tổng quan dự án' });
    expect(heading.getAttribute('title')).toBe('IMG_20261028_161949.jpg');
    expect(dialog.textContent).toContain('JPG · 145 KB');
    expect(dialog.textContent).not.toContain('image/jpeg');
  });

  it('không truyền title thì giữ tên tệp; PNG suy từ mime khi tên thiếu đuôi', () => {
    const image = file({ name: 'Ảnh chụp màn hình', mime: 'image/png', size: 2_201_010 });
    render(<DocumentViewer files={[image]} fileId={image.id} open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Ảnh chụp màn hình' });
    expect(within(dialog).getByRole('heading', { name: 'Ảnh chụp màn hình' }).getAttribute('title')).toBe(
      'Ảnh chụp màn hình',
    );
    expect(dialog.textContent).toContain('PNG · 2.1 MB');
  });

  it('PDF hiện đuôi PDF và cỡ', () => {
    const pdf = file({ id: 'pdf', name: 'Hồ sơ.pdf', mime: 'application/pdf', size: 849920 });
    render(<DocumentViewer files={[pdf]} fileId={pdf.id} open onOpenChange={vi.fn()} title="Hồ sơ vay" />);
    const dialog = screen.getByRole('dialog', { name: 'Hồ sơ vay' });
    expect(dialog.textContent).toContain('PDF · 830 KB');
  });

  it('tệp không rõ loại không lộ mime thô', () => {
    const unknown = file({ name: 'ghi-chu', mime: 'application/octet-stream', size: 12 });
    render(<DocumentViewer files={[unknown]} fileId={unknown.id} open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'ghi-chu' });
    expect(dialog.textContent).toContain('Tệp · 12 B');
    expect(dialog.textContent).not.toContain('application/octet-stream');
  });
});
