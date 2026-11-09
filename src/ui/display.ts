/**
 * Định dạng giá trị để HIỂN THỊ (docs/DESIGN.md luật L3): không bao giờ ra mã lưu DB,
 * ngày ISO hay "[object Object]". Nhãn lấy từ src/config (một nguồn). Tiền chỉ đổi đơn vị ở biên nhập/hiển thị.
 */
import { CALL_RESULTS } from '@/config/callResults';
import { INTAKE_METHODS, SOURCE_LEGACY, SOURCES } from '@/config/sources';

export { formatMoney } from '@/domain/customer/brief';

/** Số đang lưu theo đồng, kể cả chuỗi số cũ; không suy đoán từ chữ tự do. */
export function moneyValue(value: unknown): number | null {
  if (value == null || value === '' || (typeof value !== 'number' && typeof value !== 'string')) return null;
  if (typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/** Ô nhập luôn đọc theo triệu; dấu chấm trước nhóm 3 chữ số là dấu nghìn. */
export function parseMoneyInput(raw: string): number | null | undefined {
  const value = parseMoneyNumber(raw);
  if (value == null) return value;
  const amount = Math.round(value * 1_000_000);
  return Number.isSafeInteger(amount) ? amount : undefined;
}

function parseMoneyNumber(raw: string): number | null | undefined {
  const text = raw.trim();
  if (!text) return null;
  const grouped = /^\d+(\.\d{3})+(,\d+)?$/.test(text);
  if (!grouped && !/^\d+([.,]\d+)?$/.test(text)) return undefined;
  const normalized = (grouped ? text.replaceAll('.', '') : text).replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

/** Chữ thu nhập cũ → số đồng cho ô tiền, chỉ đọc; không chuẩn hoá dữ liệu khi mở hồ sơ. */
export function parseIncome(value: string | null | undefined): number | null | undefined {
  const text = value?.trim() ?? '';
  if (!text) return null;
  const match = text.match(/^(?:khoảng\s+)?(\d+(?:[.,]\d+)*)(?:\s*(tr|triệu)(?:\s*\/\s*tháng)?)?$/iu);
  if (!match?.[1]) return undefined;
  const parsed = parseMoneyNumber(match[1]);
  if (parsed == null) return undefined;
  // Thu nhập cũ từ 100.000 trở lên được ghi theo đồng.
  const amount = Math.round(!match[2] && parsed >= 100_000 ? parsed : parsed * 1_000_000);
  return Number.isSafeInteger(amount) ? amount : undefined;
}

/** Cột income vẫn là chữ và luôn ghi theo triệu, kể cả trên 1 tỷ/tháng. */
export function incomeText(value: number | null): string | null {
  return value == null
    ? null
    : `${(value / 1_000_000).toLocaleString('vi-VN', { useGrouping: false, maximumFractionDigits: 6 })} triệu/tháng`;
}

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
