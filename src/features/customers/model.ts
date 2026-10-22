import {
  CARE_DONE_STAGES,
  CARE_STAGE_DISPLAY,
  CARE_STAGE_DROPPED,
  CARE_STAGE_NURTURE,
  CARE_STAGE_WON,
} from '@/config/stages';
import type { Customer } from '@/domain/customer';
import { isQualified, leadStatus, normStage, openTasksOf, sourceListOf } from '@/domain/customer/normalize';
import { callReminder, fmtClock, startOfDayMs } from '@/domain/deadlines';
import { apartmentGroup, compile, match, prepare, type SearchDoc } from '@/domain/search/search';
import { hasSaleTouch, lastTouchMs } from '@/domain/signals';
import { fmt, status } from '@/domain/velocity';

export type CustomerGroup = 'potential' | 'new' | 'team';
/** Preset ngày đăng ký; `custom` đọc thêm `dateFrom`/`dateTo` (CL-01 L4). */
export type DatePreset = 'all' | 'yesterday' | 'today' | 'week' | 'month' | 'custom';
export type CustomerFilters = {
  status: 'active' | 'nurture' | 'won' | 'dropped' | 'done' | 'all' | 'open' | 'new' | 'calling' | 'team';
  stage: string;
  date: DatePreset;
  /** Tuỳ chọn ngày đăng ký: 'YYYY-MM-DD' theo giờ máy (chỉ dùng khi `date = 'custom'`). */
  dateFrom?: string;
  dateTo?: string;
  apt: string;
  source: string;
  owner: string;
  query: string;
};
export const DEFAULT_FILTERS: CustomerFilters = {
  status: 'active',
  stage: '',
  date: 'all',
  apt: '',
  source: '',
  owner: '',
  query: '',
};

const FILTER_STATUSES = new Set<string>([
  'active',
  'nurture',
  'won',
  'dropped',
  'done',
  'all',
  'open',
  'new',
  'calling',
  'team',
]);
const DATE_PRESETS = new Set<string>(['all', 'yesterday', 'today', 'week', 'month', 'custom']);

/**
 * Đọc bộ lọc đã lưu (tệp khách cũ thiếu `dateFrom`/`dateTo` hoặc trường mới) → bộ lọc hợp lệ.
 * Trường lạ/không hiểu → mặc định, không ném lỗi (CL-01, D-012: dữ liệu cũ vẫn đọc được).
 */
export function normalizeFilters(value: unknown): CustomerFilters {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const text = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : '');
  const date = typeof raw.date === 'string' && DATE_PRESETS.has(raw.date) ? (raw.date as DatePreset) : 'all';
  const from = text('dateFrom');
  const to = text('dateTo');
  return {
    status:
      typeof raw.status === 'string' && FILTER_STATUSES.has(raw.status)
        ? (raw.status as CustomerFilters['status'])
        : DEFAULT_FILTERS.status,
    stage: text('stage'),
    date,
    ...(from ? { dateFrom: from } : {}),
    ...(to ? { dateTo: to } : {}),
    apt: text('apt'),
    source: text('source'),
    owner: text('owner'),
    query: text('query'),
  };
}

/** Bộ lọc mặc định của từng nhóm — đúng như khi bấm chip nhóm (CL-01 L3). */
export function defaultFiltersFor(group: CustomerGroup): CustomerFilters {
  return group === 'new' ? { ...DEFAULT_FILTERS, status: 'open' } : { ...DEFAULT_FILTERS };
}

/**
 * "Xoá lọc" ở hàng đếm chỉ hiện khi bộ lọc khác mặc định của nhóm.
 * Không tính ô tìm và sắp xếp (Curtis chọn 2026-10-22).
 */
export function isFilterDirty(group: CustomerGroup, filters: CustomerFilters): boolean {
  const current = normalizeFilters(filters);
  const base = defaultFiltersFor(group);
  return (
    current.status !== base.status ||
    current.stage !== base.stage ||
    current.date !== base.date ||
    (current.dateFrom ?? '') !== (base.dateFrom ?? '') ||
    (current.dateTo ?? '') !== (base.dateTo ?? '') ||
    current.apt !== base.apt ||
    current.source !== base.source ||
    current.owner !== base.owner
  );
}
/**
 * Sắp xếp 3 tầng cố định (PF-08, Curtis duyệt 2026-10-22): ngày đăng ký → lần tương tác → tên.
 * Mỗi tầng một chiều; tầng trên quyết trước, bằng nhau mới xét tầng dưới.
 */
export type SortChoice = {
  /** Tầng 1: `desc` = mới nhất trước (mặc định), `asc` = cũ nhất trước. So theo ngày lịch. */
  registered: 'desc' | 'asc';
  /** Tầng 2: `untouched` = chưa tương tác trước (mặc định), `recent` = gần nhất trước. */
  touch: 'untouched' | 'recent';
  /** Tầng 3: `asc` = A–Z (mặc định), `desc` = Z–A. */
  name: 'asc' | 'desc';
};
export const DEFAULT_SORT: SortChoice = { registered: 'desc', touch: 'untouched', name: 'asc' };

/**
 * Đọc lựa chọn đã lưu (localStorage / tệp khách) → lựa chọn hợp lệ.
 * Dữ liệu cũ (mảng `SortRule[]` kiểu cũ, hoặc thiếu/sai một tầng) rơi về mặc định, không lỗi (L4).
 */
export function parseSortChoice(value: unknown): SortChoice {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_SORT };
  const raw = value as Record<string, unknown>;
  if (
    (raw.registered !== 'desc' && raw.registered !== 'asc') ||
    (raw.touch !== 'untouched' && raw.touch !== 'recent') ||
    (raw.name !== 'asc' && raw.name !== 'desc')
  )
    return { ...DEFAULT_SORT };
  return { registered: raw.registered, touch: raw.touch, name: raw.name };
}

export function virtualWindow(total: number, scroll: number, viewport: number, itemHeight: number, overscan = 4) {
  const start = Math.max(0, Math.floor(scroll / itemHeight) - overscan);
  const end = Math.min(total, start + Math.ceil(viewport / itemHeight) + overscan * 2);
  return { start, end, offset: start * itemHeight, totalHeight: total * itemHeight };
}

/** Tài liệu tìm của một khách (PF-06: Bảng lệnh tính 1 lần cho mỗi danh sách, không mỗi phím). */
export const searchable = (c: Customer): SearchDoc => {
  const interests = Array.isArray(c.interests) ? c.interests : [];
  const projects = Array.isArray(c.projects) ? c.projects.join(' ') : '';
  const notes = [
    c.notes,
    ...(Array.isArray(c.notes_manual) ? c.notes_manual.map((n) => n?.text) : []),
    ...(c.care_stage_history || []).map((h) => h?.note),
    ...(c.call_attempts || []).map((a) => a?.note),
    ...openTasksOf(c).map((t) => t.text),
  ]
    .filter(Boolean)
    .join(' ');
  const advanced = c.advanced && typeof c.advanced === 'object' ? Object.entries(c.advanced).flat().join(' ') : '';
  return prepare([
    ['Tên', c.full_name],
    ['SĐT', c.phone],
    ['Dự án', `${projects} ${interests.map((x) => x?.project).join(' ')}`],
    ['Loại căn', c.apt_type],
    ['Ghi chú', `${notes} ${advanced}`],
    ['Thông tin đăng ký', c.notes],
    ['Mã căn', c.apt_code],
    ['Mã toà', c.building_code],
    ['Ngày sinh', c.dob],
    ['Giới tính', c.gender],
    ['Mệnh', c.menh],
    ['Cung', c.cung],
    ['Hôn nhân', c.marital_status],
    ['Công việc', c.occupation],
    ['Thu nhập', c.income],
    ['Thường trú', c.residence],
    ['Mục đích', c.purpose],
    ['Tiến độ', c.care_stage],
    ['Liên lạc', c.contact_status],
    ['Chiến dịch', c.campaign],
    ['Lý do loại', c.disqualify_note],
  ]);
};

export function v1FilterCustomers(
  customers: readonly Customer[],
  group: CustomerGroup,
  filters: CustomerFilters,
  ownerId: string,
  now = new Date(),
): Customer[] {
  const search = compile(filters.query);
  const range = dateRange(filters.date, now, filters.dateFrom, filters.dateTo);
  return customers.filter((c) => {
    if (
      group === 'new'
        ? isQualified(c)
        : group === 'team'
          ? !c.owner_id || c.owner_id === ownerId
          : !isQualified(c) || c.owner_id !== ownerId
    )
      return false;
    if (group === 'new') {
      const status = leadStatus(c);
      if (filters.status === 'open' && status === 'dropped') return false;
      if (filters.status !== 'all' && filters.status !== 'open' && filters.status !== status) return false;
    } else if (filters.stage) {
      if (normStage(c.care_stage) !== filters.stage) return false;
    } else {
      const stage = normStage(c.care_stage);
      if (filters.status === 'active' && (CARE_DONE_STAGES.includes(stage as never) || stage === CARE_STAGE_NURTURE))
        return false;
      if (filters.status === 'nurture' && stage !== CARE_STAGE_NURTURE) return false;
      if (filters.status === 'won' && stage !== CARE_STAGE_WON) return false;
      if (filters.status === 'dropped' && stage !== CARE_STAGE_DROPPED) return false;
      if (filters.status === 'done' && !CARE_DONE_STAGES.includes(stage as never)) return false;
    }
    if (filters.apt && (apartmentGroup(c.apt_type) || 'missing') !== filters.apt) return false;
    if (filters.source && !sourceListOf(c.source).includes(filters.source)) return false;
    if (filters.owner === 'following' && !(Array.isArray(c.followers) && c.followers.includes(ownerId))) return false;
    if (filters.owner && filters.owner !== 'following' && c.owner_id !== filters.owner) return false;
    if (range) {
      const t = Date.parse(c.registered_at || c.created_at || '');
      if (!Number.isFinite(t) || t < range.start || t >= range.end) return false;
    }
    return match(searchable(c), search).match;
  });
}

/**
 * Sắp xếp danh sách khách (PF-08). Thứ tự: khách cần gọi → khách quá hạn SLA → 3 tầng.
 * Khách cần gọi/quá SLA chỉ hết ghim khi đang tìm (`searching`) — lọc/tệp vẫn ghim (L2).
 * Tính `callReminder`/`status`/`lastTouchMs` đúng một lần mỗi khách rồi mới so sánh, để vài nghìn khách vẫn mượt.
 */
export function sortCustomers(
  rows: readonly Customer[],
  choice: SortChoice,
  now: number,
  searching: boolean,
  /** Người dùng hiện tại: khách của người khác không ghim cần gọi/quá SLA (CL-01 L8). */
  ownerId?: string,
): Customer[] {
  const prepared = rows.map((c) => {
    const mine = !ownerId || !c.owner_id || c.owner_id === ownerId;
    const reminder = mine ? callReminder(c, now) : null;
    const sla = mine ? status(c, now) : null;
    const registered = Date.parse(c.registered_at || c.created_at || '');
    const last = hasSaleTouch(c) ? lastTouchMs(c) : null;
    const touch = last !== null && Number.isFinite(last) ? last : null;
    return {
      c,
      // Nhóm 1 chỉ gồm 'missed' (0) và 'due' (1); 'soon' không ghim.
      callRank: reminder?.state === 'missed' ? 0 : reminder?.state === 'due' ? 1 : null,
      callStart: reminder?.sort ?? 0,
      // Chỉ 'over' mới ghim; 'warn' (quá mục tiêu) không (L2).
      over: sla?.state === 'over' ? sla.elapsed - sla.max : null,
      registeredDay: Number.isFinite(registered) ? startOfDayMs(registered) : null,
      touchDay: touch === null ? null : startOfDayMs(touch),
      touched: touch !== null,
    };
  });

  type Row = (typeof prepared)[number];
  // Nhóm ghim: 0 = cần gọi, 1 = quá SLA, 2 = còn lại.
  const pinGroup = (row: Row) => (row.callRank !== null ? 0 : row.over !== null ? 1 : 2);

  const registeredDelta = (a: Row, b: Row) => {
    // Thiếu cả registered_at lẫn created_at → cuối danh sách ở cả hai chiều (L1).
    if (a.registeredDay === null || b.registeredDay === null) {
      if (a.registeredDay === b.registeredDay) return 0;
      return a.registeredDay === null ? 1 : -1;
    }
    const byDay = a.registeredDay - b.registeredDay;
    return choice.registered === 'asc' ? byDay : -byDay;
  };

  const touchDelta = (a: Row, b: Row) => {
    if (a.touched !== b.touched) {
      if (choice.touch === 'untouched') return a.touched ? 1 : -1;
      return a.touched ? -1 : 1;
    }
    if (!a.touched || a.touchDay === null || b.touchDay === null) return 0;
    const byDay = a.touchDay - b.touchDay;
    // 'untouched' = chưa tương tác trước → xa nhất (ngày cũ nhất) trước; 'recent' = gần nhất trước.
    return choice.touch === 'untouched' ? byDay : -byDay;
  };

  return prepared
    .sort((a, b) => {
      if (!searching) {
        const group = pinGroup(a) - pinGroup(b);
        if (group) return group;
        if (a.callRank !== null && b.callRank !== null) {
          // Quên gọi trước đến giờ gọi; cùng trạng thái → giờ hẹn sớm nhất trước.
          if (a.callRank !== b.callRank) return a.callRank - b.callRank;
          const byStart = a.callStart - b.callStart;
          if (byStart) return byStart;
        } else if (a.over !== null && b.over !== null) {
          // Quá lâu nhất trước.
          const byOver = b.over - a.over;
          if (byOver) return byOver;
        }
      }
      return (
        registeredDelta(a, b) ||
        touchDelta(a, b) ||
        (choice.name === 'asc' ? 1 : -1) * (a.c.full_name || '').localeCompare(b.c.full_name || '', 'vi')
      );
    })
    .map((row) => row.c);
}

/** Số khách theo nhóm chip đầu danh sách: của tôi (tiềm năng/khách mới) + khách đồng nghiệp. */
export function customerGroupCounts(customers: readonly Customer[], ownerId: string) {
  const own = customers.filter((c) => c.owner_id === ownerId);
  return {
    potential: own.filter((c) => isQualified(c)).length,
    leads: own.filter((c) => !isQualified(c)).length,
    team: customers.filter((c) => c.owner_id && c.owner_id !== ownerId).length,
  };
}

function startOfDay(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** 'YYYY-MM-DD' (giờ máy) → mốc 00:00 cùng ngày; sai định dạng/không tồn tại → null. */
export function parseDayKey(value?: string): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  // Chặn 2026-02-31 (JS tự nhảy sang tháng sau).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** Mốc ngày của một thời điểm → 'YYYY-MM-DD' theo giờ máy (giá trị cho `dateFrom`/`dateTo`). */
export function dayKey(value: Date | number): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Ngày kiểu Việt Nam: "15/10"; khác năm hiện tại thì thêm năm ("15/10/2025"). */
function shortDay(date: Date, now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const base = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base}/${date.getFullYear()}`;
}

/** Chữ hiển thị cho khoảng Tuỳ chọn: "15/10" hoặc "10/10 – 15/10" (đã đổi chỗ nếu ngược). */
export function customDateLabel(from: string | undefined, to: string | undefined, now: Date): string {
  const a = parseDayKey(from);
  if (!a) return '';
  const b = parseDayKey(to) ?? a;
  const start = a <= b ? a : b;
  const end = a <= b ? b : a;
  return start.getTime() === end.getTime() ? shortDay(start, now) : `${shortDay(start, now)} – ${shortDay(end, now)}`;
}

/**
 * Khoảng `[start, end)` của preset ngày đăng ký (CL-01 L4). Tuần bắt đầu Thứ Hai, tháng từ ngày 1.
 * `custom` nhận một ngày (from = to) hoặc một khoảng; chọn ngược thì tự đổi chỗ; gồm trọn cả hai ngày.
 */
export function dateRange(
  preset: CustomerFilters['date'],
  now: Date,
  from?: string,
  to?: string,
): { start: number; end: number } | null {
  if (preset === 'all') return null;
  if (preset === 'custom') {
    const a = parseDayKey(from);
    if (!a) return null;
    const b = parseDayKey(to) ?? a;
    const start = a <= b ? a : b;
    const last = a <= b ? b : a;
    const end = new Date(last);
    end.setDate(end.getDate() + 1);
    return { start: start.getTime(), end: end.getTime() };
  }
  const today = startOfDay(now);
  if (preset === 'yesterday') {
    const start = new Date(today);
    start.setDate(start.getDate() - 1);
    return { start: start.getTime(), end: today.getTime() };
  }
  const start = new Date(today);
  if (preset === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (preset === 'month') start.setDate(1);
  const end = new Date(start);
  if (preset === 'today') end.setDate(end.getDate() + 1);
  if (preset === 'week') end.setDate(end.getDate() + 7);
  if (preset === 'month') end.setMonth(end.getMonth() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

// ── Danh sách v3 (D-023): dòng phụ của thẻ gọn. Trạng thái hạn ĐỨNG ĐẦU để không bị cắt. ──

const DAY_MS = 86_400_000;

/** "Hôm nay", "Hôm qua", "N ngày trước", "N tuần trước", "N tháng trước" theo ngày lịch máy. */
export function relativeAgo(ms: number, now: number): string {
  const day = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((day(now) - day(ms)) / DAY_MS);
  if (days <= 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  if (days < 7) return `${days} ngày trước`;
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
  return `${Math.floor(days / 30)} tháng trước`;
}

export type ListCardSub = {
  /** Phần đầu: hạn gọi (callReminder, D-010) hoặc lần liên hệ cuối. */
  lead?: { text: string; tone?: 'over' | 'soon' };
  /** Bậc · dự án/loại căn. */
  rest: string;
};

/** Dòng phụ thẻ khách trong danh sách. Không có gì → rest có thể rỗng. */
export function listCardSub(c: Customer, now: number, ownerId?: string): ListCardSub {
  const mine = !ownerId || !c.owner_id || c.owner_id === ownerId;
  const reminder = callReminder(c, now);
  // Khách đồng nghiệp không thuộc phạm vi chăm sóc của mình: không SLA, không nhắc việc (D-003).
  const sla = mine ? status(c, now) : null;
  const last = lastTouchMs(c);
  let lead: ListCardSub['lead'];
  let keepTouch = false;
  // Thứ tự ưu tiên L3: quên gọi > đến giờ gọi > quá SLA > hẹn gọi > lần liên hệ cuối.
  if (!mine) {
    if (reminder && reminder.state !== 'missed' && reminder.state !== 'due')
      lead = { text: `Hẹn gọi ${fmtClock(reminder.sort)}` };
    else if (last) lead = { text: relativeAgo(last, now) };
  } else if (reminder?.state === 'missed')
    lead = { text: `Quên gọi ${reminder.text.replace('quên gọi ', '')}`, tone: 'over' };
  else if (reminder?.state === 'due') lead = { text: 'Đến giờ gọi', tone: 'soon' };
  else if (sla?.state === 'over') {
    lead = { text: `Quá SLA ${fmt(sla.elapsed - sla.max)}`, tone: 'over' };
    keepTouch = true;
  } else if (reminder) lead = { text: `Hẹn gọi ${fmtClock(reminder.sort)}` };
  else if (last) lead = { text: relativeAgo(last, now) };
  const stage = normStage(c.care_stage) || '';
  const project = (Array.isArray(c.projects) ? c.projects : []).find(Boolean) || '';
  // "Quá SLA" thay chỗ hẹn gọi nhưng lần liên hệ cuối vẫn đứng ngay sau để không mất dấu chăm sóc.
  const rest = [
    ...(keepTouch && last ? [relativeAgo(last, now)] : []),
    CARE_STAGE_DISPLAY[stage] || stage,
    project || c.apt_type || '',
  ]
    .filter(Boolean)
    .join(' · ');
  return { lead, rest };
}
