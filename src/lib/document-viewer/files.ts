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

/** Mime hay gặp → đuôi viết HOA; chỉ dùng khi tên tệp không có đuôi. */
const MIME_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/json': 'JSON',
  'application/zip': 'ZIP',
  'text/plain': 'TXT',
  'text/csv': 'CSV',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/gif': 'GIF',
  'image/webp': 'WEBP',
  'image/heic': 'HEIC',
  'image/heif': 'HEIF',
  'image/bmp': 'BMP',
  'image/tiff': 'TIFF',
  'image/avif': 'AVIF',
  'image/svg+xml': 'SVG',
  'video/mp4': 'MP4',
  'video/quicktime': 'MOV',
  'video/webm': 'WEBM',
};

/** Loại tệp cho người dùng: ưu tiên đuôi viết HOA, thiếu đuôi mới suy từ mime. */
export function fileTypeLabel(name: string, mime: string): string {
  const extension = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  if (extension?.[1]) return extension[1].toUpperCase();
  const clean = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (MIME_LABELS[clean]) return MIME_LABELS[clean];
  // Ảnh lạ vẫn đoán được từ mime: image/tiff → TIFF; không để lộ mime thô.
  if (clean.startsWith('image/')) {
    const subtype = clean.slice('image/'.length).split('+')[0];
    if (subtype) return subtype.toUpperCase();
  }
  return 'Tệp';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
