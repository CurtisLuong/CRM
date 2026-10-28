/**
 * Định dạng giá trị để HIỂN THỊ (docs/DESIGN.md luật L3): không bao giờ ra mã lưu DB,
 * ngày ISO hay "[object Object]". Nhãn lấy từ src/config (một nguồn). Không dùng để ghi dữ liệu.
 */
import { CALL_RESULTS } from '@/config/callResults';
import { INTAKE_METHODS, SOURCE_LEGACY, SOURCES } from '@/config/sources';

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const pad = (n: number) => String(n).padStart(2, '0');

/** Chuỗi hiển thị được từ giá trị bất kỳ; giá trị không hiểu được → '' (để màn ẩn ô đó). */
export function displayText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return ISO_RE.test(value) ? displayDateTime(value) : value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (Array.isArray(value)) return value.map(displayText).filter(Boolean).join(' · ');
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const key of ['text', 'label', 'name', 'note']) if (typeof o[key] === 'string') return displayText(o[key]);
  }
  return '';
}

/** "dd/mm/yyyy" theo giờ máy; chuỗi không phải ngày → ''. */
export function displayDate(iso: unknown): string {
  const d = toDate(iso);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
}

/** "HH:mm dd/mm/yyyy" theo giờ máy; chuỗi không phải ngày → ''. */
export function displayDateTime(iso: unknown): string {
  const d = toDate(iso);
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())} ${displayDate(iso)}` : '';
}

/** Mã kết quả cuộc gọi → nhãn; null/'' = chưa ghi; mã lạ → "Kết quả khác". */
export function callResultLabel(code: unknown): string {
  if (code == null || code === '') return 'Chưa ghi kết quả';
  return (CALL_RESULTS as Record<string, string>)[String(code)] ?? 'Kết quả khác';
}

/** Mã nguồn (kể cả mã cũ trong SOURCE_LEGACY) → nhãn; mã lạ → "Nguồn khác". */
export function sourceLabel(code: unknown): string {
  const raw = displayText(code);
  if (!raw) return '';
  const key = SOURCE_LEGACY[raw] ?? raw;
  return SOURCES[key] ?? 'Nguồn khác';
}

/** Mã cách nhập → nhãn; mã lạ → ''. */
export function intakeLabel(code: unknown): string {
  return INTAKE_METHODS[displayText(code)] ?? '';
}

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
