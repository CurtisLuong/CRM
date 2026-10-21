import {
  CARE_DONE_STAGES,
  CARE_STAGE_DISPLAY,
  CARE_STAGE_DROPPED,
  CARE_STAGE_NURTURE,
  CARE_STAGE_OPTIONS,
  CARE_STAGE_WON,
} from '@/config/stages';
import type { Customer } from '@/domain/customer';
import { isQualified, leadStatus, normStage, openTasksOf, sourceListOf } from '@/domain/customer/normalize';
import { callReminder, fmtClock } from '@/domain/deadlines';
import { apartmentGroup, compile, match, prepare, type SearchDoc } from '@/domain/search/search';
import { lastTouchMs } from '@/domain/signals';

export type CustomerGroup = 'potential' | 'new' | 'team';
export type CustomerFilters = {
  status: 'active' | 'nurture' | 'won' | 'dropped' | 'done' | 'all' | 'open' | 'new' | 'calling' | 'team';
  stage: string;
  date: 'all' | 'today' | 'week' | 'month';
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
export type SortKey = 'name' | 'registered' | 'updated' | 'stage' | 'interest';
export type SortRule = { key: SortKey; direction: 'asc' | 'desc' };
export const DEFAULT_SORT: SortRule[] = [
  { key: 'updated', direction: 'desc' },
  { key: 'name', direction: 'asc' },
];
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
  const range = dateRange(filters.date, now);
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

export function sortCustomers(rows: readonly Customer[], rules: readonly SortRule[] = DEFAULT_SORT): Customer[] {
  const stageOrder = CARE_STAGE_OPTIONS as readonly string[];
  return [...rows].sort((a, b) => {
    for (const rule of rules) {
      let delta = 0;
      if (rule.key === 'name') delta = (a.full_name || '').localeCompare(b.full_name || '', 'vi');
      if (rule.key === 'registered')
        delta = (a.registered_at || a.created_at || '').localeCompare(b.registered_at || b.created_at || '');
      if (rule.key === 'updated')
        delta = (a.updated_at || a.created_at || '').localeCompare(b.updated_at || b.created_at || '');
      if (rule.key === 'stage')
        delta = stageOrder.indexOf(normStage(a.care_stage) || '') - stageOrder.indexOf(normStage(b.care_stage) || '');
      if (rule.key === 'interest') delta = Number(a.interest_level || 0) - Number(b.interest_level || 0);
      if (delta) return rule.direction === 'asc' ? delta : -delta;
    }
    return 0;
  });
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

export function dateRange(preset: CustomerFilters['date'], now: Date): { start: number; end: number } | null {
  if (preset === 'all') return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
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
export function listCardSub(c: Customer, now: number): ListCardSub {
  const reminder = callReminder(c, now);
  let lead: ListCardSub['lead'];
  if (reminder?.state === 'missed') lead = { text: `Quên gọi ${reminder.text.replace('quên gọi ', '')}`, tone: 'over' };
  else if (reminder?.state === 'due') lead = { text: 'Đến giờ gọi', tone: 'soon' };
  else if (reminder) lead = { text: `Hẹn gọi ${fmtClock(reminder.sort)}` };
  else {
    const last = lastTouchMs(c);
    if (last) lead = { text: relativeAgo(last, now) };
  }
  const stage = normStage(c.care_stage) || '';
  const project = (Array.isArray(c.projects) ? c.projects : []).find(Boolean) || '';
  const rest = [CARE_STAGE_DISPLAY[stage] || stage, project || c.apt_type || ''].filter(Boolean).join(' · ');
  return { lead, rest };
}
