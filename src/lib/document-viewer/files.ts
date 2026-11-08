export class OfflineDocumentError extends Error {
  constructor() {
    super('Cần mạng để tải tệp này');
  }
}

export function previewKind(name: string, mime: string): 'image' | 'pdf' | 'other' {
  if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg|avif)$/i.test(name)) return 'image';
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  return 'other';
}

export function fileTypeLabel(name: string, mime: string): string {
  const kind = previewKind(name, mime);
  if (kind === 'pdf') return 'PDF';
  if (kind === 'image') return 'Ảnh';
  if (/\.(docx?)$/i.test(name) || mime.includes('word')) return 'Word';
  if (/\.(xlsx?)$/i.test(name) || mime.includes('sheet') || mime.includes('excel')) return 'Excel';
  if (mime.startsWith('video/')) return 'Video';
  return 'Tệp đính kèm';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
