import { describe, expect, it } from 'vitest';
import { fileTypeLabel, formatBytes, previewKind } from '@/lib/document-viewer/files';
import { clampPan, fitScale, zoomAt } from '@/lib/document-viewer/geometry';

const content = { width: 1600, height: 1200 };
const viewport = { width: 400, height: 600 };
describe('DV-01 zoom/pan', () => {
  it('ảnh vừa cả khung, không kéo giãn ảnh nhỏ; PDF vừa chiều ngang', () => {
    expect(fitScale(content, viewport)).toBe(0.25);
    expect(fitScale({ width: 20, height: 10 }, viewport)).toBe(1);
    expect(fitScale({ width: 800, height: 4000 }, viewport, true)).toBe(0.5);
  });
  it('kẹp từ vừa màn hình đến 8x', () => {
    const view = { scale: 0.25, x: 0, y: 0 };
    expect(zoomAt(view, 0.01, { x: 200, y: 300 }, content, viewport, 0.25).scale).toBe(0.25);
    expect(zoomAt(view, 100, { x: 200, y: 300 }, content, viewport, 0.25).scale).toBe(8);
  });
  it('giữ điểm neo chuột/ngón tay khi phóng to', () => {
    const current = { scale: 1, x: 150, y: 300 };
    const anchor = { x: 80, y: 180 };
    const next = zoomAt(current, 2, anchor, content, viewport, 0.25);
    expect((next.x + anchor.x) / next.scale).toBe((current.x + anchor.x) / current.scale);
    expect((next.y + anchor.y) / next.scale).toBe((current.y + anchor.y) / current.scale);
  });
  it('giữ điểm neo khi ảnh vừa màn hình có khoảng trống trên dưới', () => {
    const next = zoomAt({ scale: 0.25, x: 0, y: 0 }, 1, { x: 200, y: 300 }, content, viewport, 0.25);
    expect(next).toEqual({ scale: 1, x: 600, y: 300 });
  });
  it('không kéo nội dung ra khỏi khung và đưa về gốc khi thu nhỏ', () => {
    expect(clampPan({ x: -500, y: 9999 }, 1, content, viewport)).toEqual({ x: 0, y: 600 });
    expect(clampPan({ x: 200, y: 400 }, 0.25, content, viewport)).toEqual({ x: 0, y: 0 });
  });
  it('nhãn không lộ mime thô, nhận cả tệp thiếu mime', () => {
    expect(previewKind('Scan.PDF', '')).toBe('pdf');
    expect(fileTypeLabel('Bảng.xlsx', 'application/octet-stream')).toBe('Excel');
    expect(fileTypeLabel('Khác.bin', 'application/octet-stream')).toBe('Tệp đính kèm');
    expect(formatBytes(1024)).toBe('1 KB');
  });
});
