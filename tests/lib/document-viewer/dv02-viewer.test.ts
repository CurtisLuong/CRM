import { describe, expect, it } from 'vitest';
import { fileTypeLabel, formatBytes } from '@/lib/document-viewer/files';
import { panView } from '@/lib/document-viewer/geometry';

const content = { width: 1600, height: 1200 };
const viewport = { width: 400, height: 600 };

describe('DV-02 loại tệp', () => {
  it('lấy đuôi viết HOA, kể cả ảnh chụp điện thoại', () => {
    expect(fileTypeLabel('IMG_20261028_161949.jpg', 'image/jpeg')).toBe('JPG');
    expect(fileTypeLabel('scan.PDF', 'application/octet-stream')).toBe('PDF');
    expect(fileTypeLabel('Bảng.xlsx', '')).toBe('XLSX');
    expect(fileTypeLabel('Ảnh mẫu.svg', 'image/svg+xml')).toBe('SVG');
  });
  it('không có đuôi thì suy từ mime, không suy được mới là "Tệp"', () => {
    expect(fileTypeLabel('Ảnh', 'image/png')).toBe('PNG');
    expect(fileTypeLabel('Máy quét', 'application/pdf')).toBe('PDF');
    expect(fileTypeLabel('Bảng', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('XLSX');
    expect(fileTypeLabel('Ghi chú', 'text/plain')).toBe('TXT');
    expect(fileTypeLabel('Khác', 'application/octet-stream')).toBe('Tệp');
  });
  it('không lộ mime thô và giữ định dạng kích thước hiện có', () => {
    expect(fileTypeLabel('Tệp lạ', 'application/x-www-form-urlencoded')).toBe('Tệp');
    expect(formatBytes(148480)).toBe('145 KB');
    expect(formatBytes(2_201_010)).toBe('2.1 MB');
  });
});

describe('DV-02 kéo 1:1', () => {
  it('nội dung dịch đúng quãng ngón tay, không lệch tỉ lệ', () => {
    const current = { scale: 2, x: 100, y: 50 };
    const next = panView(current, { x: 200, y: 200 }, { x: 100, y: 160 }, content, viewport);
    expect(next).toEqual({ scale: 2, x: 200, y: 90 });
  });
  it('dừng đúng mép khi kéo quá đà', () => {
    const small = { width: 300, height: 400 };
    const current = { scale: 2, x: 100, y: 100 };
    expect(panView(current, { x: 0, y: 0 }, { x: 999, y: 999 }, small, viewport)).toEqual({
      scale: 2,
      x: 0,
      y: 0,
    });
    expect(panView(current, { x: 999, y: 999 }, { x: 0, y: 0 }, small, viewport)).toEqual({
      scale: 2,
      x: 200,
      y: 200,
    });
  });
});
