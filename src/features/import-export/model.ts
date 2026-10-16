import { APT_TYPES } from '@/config/aptTypes';
import { SOURCE_DEFAULT } from '@/config/sources';
import { CARE_STAGE_DEFAULT, CARE_STAGE_LEGACY, CARE_STAGE_OPTIONS, INTEREST_DEFAULT_NEW } from '@/config/stages';
import type { Customer } from '@/domain/customer';
import { normStage } from '@/domain/customer/normalize';
import { normalizePhoneVN } from '@/domain/customer/phone';

export const IO_FIELDS = [
  { key: 'full_name', label: 'Họ tên', def: true },
  { key: 'phone', label: 'Số điện thoại', def: true },
  { key: 'gender', label: 'Giới tính', def: false },
  { key: 'dob', label: 'Ngày sinh', def: false },
  { key: 'marital_status', label: 'Hôn nhân', def: false },
  { key: 'residence', label: 'Thường trú', def: false },
  { key: 'occupation', label: 'Công việc', def: false },
  { key: 'income', label: 'Thu nhập', def: false },
  { key: 'projects', label: 'Dự án', def: true },
  { key: 'apt_type', label: 'Loại căn', def: true },
  { key: 'registered_at', label: 'Thời gian đăng kí', def: false },
  { key: 'interest_level', label: 'Mức quan tâm', def: false },
  { key: 'care_stage', label: 'Tiến độ chăm sóc', def: false },
  { key: 'contact_status', label: 'Trạng thái liên lạc', def: false },
] as const;

export type IoKey = (typeof IO_FIELDS)[number]['key'];
export type ImportColumn = IoKey | '__note' | '';
export type ImportTemplate = { mapping: ImportColumn[]; headerRow: boolean };
const LABELS = new Map(IO_FIELDS.map((field) => [field.label.toLocaleLowerCase('vi'), field.key]));

export function guessColumn(header: unknown): ImportColumn {
  const text = String(header ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLocaleLowerCase('vi');
  if (!text) return '';
  return LABELS.get(text) ?? '__note';
}

function text(raw: unknown) {
  return raw == null ? '' : String(raw).trim();
}

function parseDob(raw: unknown): string | null {
  if (raw instanceof Date && Number.isFinite(raw.getTime()))
    return `
    ${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`.trim();
  const value = text(raw);
  const fullYearFirst = value.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (fullYearFirst) {
    const [year = '', month = '', day = ''] = fullYearFirst.slice(1);
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const dayFirst = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dayFirst) {
    const [day = '', month = '', year = ''] = dayFirst.slice(1);
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const dayMonth = value.match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (dayMonth) {
    const [day = '', month = ''] = dayMonth.slice(1);
    return `--${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

function parseRegisteredAt(raw: unknown): string | null {
  if (raw instanceof Date && Number.isFinite(raw.getTime())) return raw.toISOString();
  const value = text(raw);
  if (!value) return null;
  const match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (match) {
    const [day = '0', month = '0', year = '0', hour = '0', minute = '0'] = match.slice(1);
    const date = new Date(+year, +month - 1, +day, +hour, +minute);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function parseImportValue(key: IoKey, raw: unknown): unknown {
  const value = text(raw);
  if (!value) return null;
  switch (key) {
    case 'full_name':
    case 'phone':
    case 'residence':
    case 'income':
    case 'contact_status':
    case 'occupation':
      return value;
    case 'gender': {
      const gender = value.toLocaleLowerCase('vi');
      if (['nam', 'male', 'm'].includes(gender)) return 'nam';
      if (['nữ', 'nu', 'female', 'f'].includes(gender)) return 'nữ';
      return 'khác';
    }
    case 'marital_status': {
      const status = value.toLocaleLowerCase('vi');
      if (status.includes('đã') || status.includes('married')) return 'đã kết hôn';
      if (status.includes('chưa') || status.includes('single')) return 'chưa kết hôn';
      return null;
    }
    case 'dob':
      return parseDob(raw);
    case 'registered_at':
      return parseRegisteredAt(raw);
    case 'projects':
      return value
        .split(/[,;]/)
        .map((part) => part.trim())
        .filter(Boolean);
    case 'apt_type': {
      const normalized = value.toLocaleLowerCase('vi').replace(/[^a-z0-9+]/g, '');
      return APT_TYPES.find((type) => type.toLocaleLowerCase('vi').replace(/[^a-z0-9+]/g, '') === normalized) || value;
    }
    case 'interest_level': {
      const number = Number(value.replace('%', '').trim());
      return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : null;
    }
    case 'care_stage': {
      const stage = [...CARE_STAGE_OPTIONS, ...Object.keys(CARE_STAGE_LEGACY)].find(
        (item) => item.toLocaleLowerCase('vi') === value.toLocaleLowerCase('vi'),
      );
      return stage ? normStage(stage) : null;
    }
  }
}

export function makeImportRecord(row: readonly unknown[], mapping: readonly ImportColumn[]) {
  const payload: Record<string, unknown> = {};
  const notes: string[] = [];
  for (const [index, key] of mapping.entries()) {
    const raw = row[index];
    if (key === '__note') {
      const note = text(raw);
      if (note) notes.push(note);
    } else if (key) {
      const value = parseImportValue(key, raw);
      if (value != null) payload[key] = value;
    }
  }
  if (typeof payload.phone === 'string') payload.phone = normalizePhoneVN(payload.phone);
  if (!payload.full_name || !payload.phone) return { payload: null, notes };
  payload.interest_level ??= INTEREST_DEFAULT_NEW;
  payload.care_stage ??= CARE_STAGE_DEFAULT;
  payload.source = [SOURCE_DEFAULT];
  payload.intake_method = 'import';
  return { payload, notes };
}

export function formatExportCell(customer: Customer, key: IoKey): string | number {
  const value = customer[key as keyof Customer];
  if (key === 'projects') return Array.isArray(value) ? value.join(', ') : '';
  if (key === 'registered_at' && typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  if (key === 'dob' && typeof value === 'string') {
    const parts = value.startsWith('--') ? value.slice(2).split('-').reverse() : value.split('-').reverse();
    return parts.join('/');
  }
  if ((key === 'gender' || key === 'marital_status') && typeof value === 'string') {
    return `${value.charAt(0).toLocaleUpperCase('vi')}${value.slice(1)}`;
  }
  if (Array.isArray(value)) return value.join(', ');
  if (value == null || typeof value === 'object') return '';
  return value as string | number;
}

export function uniqueOwnedCustomers(customers: readonly Customer[], ownerId: string) {
  return customers.filter((customer) => customer.owner_id === ownerId && !customer.archived_at);
}

export function readImportTemplate(storage: Storage, key: string): ImportTemplate | null {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null') as ImportTemplate | null;
    return value && Array.isArray(value.mapping) && typeof value.headerRow === 'boolean' ? value : null;
  } catch {
    return null;
  }
}
