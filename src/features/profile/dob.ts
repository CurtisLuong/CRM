import type { Customer } from '@/domain/customer';
import { factPatch } from '@/domain/customer/facts';
import { calcCungFromDOB, calcMenhFromSolarDOB, parseDob } from '@/domain/lunar/lunar';

/**
 * CL-03: ngày sinh trên hồ sơ khách.
 * Chỉ đọc/ghi đúng 2 dạng đã lưu ('YYYY-MM-DD' đủ năm, '--MM-DD' thiếu năm); mệnh/cung/tuổi
 * luôn tính lại từ dob bằng hàm domain — không tin chuỗi cũ trong cột menh/cung.
 */

const pad2 = (value: number) => String(value).padStart(2, '0');

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const daysInMonth = (month: number, year: number | null) => {
  if (month === 2) {
    // Thiếu năm: chấp nhận 29/02 như form Thêm khách (không đủ dữ kiện để biết nhuận).
    if (year == null) return 29;
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

export type DobInput = { dob: string | null; error: string | null };

/**
 * Chuỗi người dùng gõ ("15/08/1985", "15/08", "15-08-1985") → giá trị lưu.
 * Rỗng → xoá ngày sinh (dob null). Ngày không tồn tại → lỗi, không lưu.
 */
export function parseDobInput(raw: string, maxYear = new Date().getFullYear()): DobInput {
  const value = raw.trim();
  if (!value) return { dob: null, error: null };
  const parts = value
    .split(/[/.-]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length !== 2 && parts.length !== 3)
    return { dob: null, error: 'Ngày sinh dùng dạng ngày/tháng hoặc ngày/tháng/năm.' };
  const [dayText, monthText, yearText] = parts;
  if (!/^\d{1,2}$/.test(dayText || '') || !/^\d{1,2}$/.test(monthText || ''))
    return { dob: null, error: 'Ngày sinh không hợp lệ.' };
  const day = Number(dayText);
  const month = Number(monthText);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(month, yearText ? Number(yearText) : null))
    return { dob: null, error: 'Ngày sinh không hợp lệ.' };
  if (yearText != null) {
    if (!/^\d{4}$/.test(yearText)) return { dob: null, error: 'Năm sinh không hợp lệ.' };
    const year = Number(yearText);
    if (year < 1900 || year > maxYear) return { dob: null, error: 'Năm sinh không hợp lệ.' };
    return { dob: `${year}-${pad2(month)}-${pad2(day)}`, error: null };
  }
  return { dob: `--${pad2(month)}-${pad2(day)}`, error: null };
}

function ageAt(year: number, month: number, day: number, now: number): number | null {
  const today = new Date(now);
  if (Number.isNaN(today.getTime())) return null;
  let age = today.getFullYear() - year;
  const beforeBirthday = today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

export type DobView = {
  /** parseDob đọc được (đúng 2 dạng chuẩn). */
  known: boolean;
  /** Chuỗi đang lưu — dạng lạ vẫn hiện nguyên chữ để không mất dữ liệu cũ. */
  raw: string;
  /** Giá trị đưa vào ô nhập, kiểu Việt Nam ("15/08/1985" / "15/08"). */
  input: string;
  age: number | null;
  menhFull: string;
  /** "Mệnh Kim" — dạng ngắn cạnh ngày sinh. */
  menhShort: string | null;
  /** "Hải Trung Kim" — nạp âm ở chữ phụ. */
  menhNapAm: string | null;
  cung: string | null;
};

const EMPTY_VIEW: DobView = {
  known: false,
  raw: '',
  input: '',
  age: null,
  menhFull: '',
  menhShort: null,
  menhNapAm: null,
  cung: null,
};

/** dob + now → ngày hiển thị, tuổi, mệnh (ngắn + nạp âm), cung. */
export function dobView(dob: unknown, now: number): DobView {
  const raw = typeof dob === 'string' ? dob.trim() : '';
  const parsed = parseDob(dob);
  if (!parsed) return { ...EMPTY_VIEW, raw };
  const input = parsed.year
    ? `${pad2(parsed.day)}/${pad2(parsed.month)}/${parsed.year}`
    : `${pad2(parsed.day)}/${pad2(parsed.month)}`;
  // Chỉ cần ngày + tháng cho cung; thiếu năm thì không có tuổi và mệnh.
  const menhFull = parsed.year ? calcMenhFromSolarDOB(dob) : '';
  const [, element, napAm] = menhFull.match(/^Mệnh\s+(.+?)\s+—\s+(.+?)\s+\(/u) || [];
  return {
    known: true,
    raw,
    input,
    age: parsed.year ? ageAt(parsed.year, parsed.month, parsed.day, now) : null,
    menhFull,
    menhShort: element ? `Mệnh ${element}` : menhFull || null,
    menhNapAm: napAm || null,
    cung: calcCungFromDOB(dob) || null,
  };
}

/**
 * Bản vá lưu ngày sinh: dob + menh + cung cùng một lần, kèm field_meta như mọi ô khác.
 * Xoá ngày sinh → cả 3 cột null (giữ nguyên các trường lạ của khách).
 */
export function dobSavePatch(customer: Customer, dob: string | null, at = new Date().toISOString()) {
  return {
    ...factPatch(customer, 'dob', dob, 'sale', at),
    menh: dob ? calcMenhFromSolarDOB(dob) || null : null,
    cung: dob ? calcCungFromDOB(dob) || null : null,
  };
}
