import { ICON_FALLBACK, type IconName, STAGE_ICON, STAGE_ICON_FALLBACK } from '@/config/icons';
import { CLOSE_REASONS, LEAD_DROP_REASONS } from '@/config/reasons';
import {
  CARE_STAGE_BRANCH,
  CARE_STAGE_DISPLAY,
  CARE_STAGE_DROPPED,
  CARE_STAGE_PICKER_ORDER,
  CARE_STAGE_WON,
  INTEREST_TIERS,
} from '@/config/stages';
import { taskKindOf } from '@/config/taskKinds';
import type { Customer } from '@/domain/customer';
import type { BriefFact } from '@/domain/customer/brief';
import { interactionTitle, LEAD_FORM_KIND } from '@/domain/customer/interactions';
import { callAttemptsOf, normStage, sourceListOf } from '@/domain/customer/normalize';
import { type CustomerTimelineEntry, customerTimeline } from '@/domain/customer/timeline';
import { fmtClock, type TaskDueInfo, taskDayLabel } from '@/domain/deadlines';
import { calcPrice, DEFAULT_LOAN } from '@/domain/loan';
import { customerUnit, type LoanPrefill } from '@/features/loan/model';
import { callResultLabel, displayText, formatMoney, intakeLabel, sourceLabel } from '@/ui/display';

/** Checklist state belongs to booking_steps; it must never move the stage SLA clock. */
export function bookingStepPatch(customer: Customer, key: string, checked: boolean, at: string) {
  const steps = { ...(customer.booking_steps || {}) };
  if (checked) steps[key] = at;
  else delete steps[key];
  return { booking_steps: steps };
}

/** Contact preference updates are field patches and retain extension keys in the JSON object. */
export function contactPrefsPatch(customer: Customer, key: 'channel' | 'slot', value: string) {
  return { contact_prefs: { ...(customer.contact_prefs || {}), [key]: value } };
}

// ── CP-03: Thêm việc theo 5 hành động, hạn giờ / cả ngày / không hạn (D-010). ──

export type TaskDueValue = { due?: string; due_allday?: boolean } | null;
export type TaskDueResult = { ok: true; due: TaskDueValue } | { ok: false; error: string };

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/**
 * Ngày + giờ trên form → giá trị lưu `next_tasks`. Không có ngày = không hạn (như hành vi cũ).
 * Cả ngày giữ mốc 09:00 local như bản cũ; có giờ thì lưu đúng giờ người dùng chọn.
 */
export function taskDueFromInput(input: { day?: string; time?: string; allDay?: boolean }): TaskDueResult {
  const day = (input.day || '').trim();
  if (!day) return { ok: true, due: null };
  const dayMatch = DAY_RE.exec(day);
  if (!dayMatch) return { ok: false, error: 'Chọn ngày hạn hợp lệ.' };
  const year = Number(dayMatch[1]);
  const month = Number(dayMatch[2]);
  const date = Number(dayMatch[3]);
  const base = new Date(year, month - 1, date, 9, 0, 0, 0);
  if (base.getFullYear() !== year || base.getMonth() !== month - 1 || base.getDate() !== date)
    return { ok: false, error: 'Ngày hạn không có thật. Kiểm tra lại ngày.' };
  if (input.allDay) return { ok: true, due: { due: base.toISOString(), due_allday: true } };
  const time = (input.time || '').trim();
  const timeMatch = TIME_RE.exec(time);
  if (!timeMatch) return { ok: false, error: 'Chọn giờ hạn hoặc chọn Cả ngày.' };
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  if (hours > 23 || minutes > 59) return { ok: false, error: 'Giờ hạn không hợp lệ.' };
  const at = new Date(year, month - 1, date, hours, minutes, 0, 0);
  return { ok: true, due: { due: at.toISOString() } };
}

/** Dòng thời gian: việc đã xong mang thêm mã loại để dùng đúng icon loại việc. */
export type ProfileTimelineEntry = CustomerTimelineEntry & { taskKind?: string; stageNote?: boolean };

export function withTaskKinds(customer: Customer, entries: readonly CustomerTimelineEntry[]): ProfileTimelineEntry[] {
  const tasks = Array.isArray(customer.next_tasks) ? customer.next_tasks : [];
  return entries.map((entry) => {
    if (!entry.id.startsWith('task:')) return entry;
    const index = Number(entry.id.split(':').at(-1));
    const kind = Number.isInteger(index) ? tasks[index]?.kind : undefined;
    return kind ? { ...entry, taskKind: kind } : entry;
  });
}

/** Dòng thời gian gọn dùng trong tấm khách; bổ sung bậc hiện tại nếu lịch sử cũ chưa có mốc. */
export function customerSheetTimeline(customer: Customer, now: number): ProfileTimelineEntry[] {
  const entries = withTaskKinds(customer, customerTimeline(customer));
  const currentStage = normStage(customer.care_stage);
  if (!currentStage) return entries;
  const hasCurrentStage = entries.some(
    (entry) => entry.kind === 'stage' && normStage(entry.title.replace(/^Bậc: /, '')) === currentStage,
  );
  if (hasCurrentStage) return entries;

  const lastStage = entries.filter((entry) => entry.kind === 'stage').sort((a, b) => b.at.localeCompare(a.at))[0];
  const at =
    customer.care_stage_updated_at ||
    (lastStage ? new Date(now).toISOString() : customer.registered_at || customer.created_at);
  if (!at || !Number.isFinite(Date.parse(at))) return entries;

  return [
    ...entries,
    {
      id: `stage-current:${at}`,
      at,
      kind: 'stage' as const,
      title: `Bậc: ${currentStage}`,
    },
  ].sort((a, b) => b.at.localeCompare(a.at));
}

// ── Hồ sơ v3 (D-023): dữ liệu trình bày, chỉ đọc domain/config. ──

export type LastTouch = { when: string; meta: string; headline: string; text: string };

// Mọi mốc giờ trong hồ sơ cùng một kiểu "CN 4/10 09:00"; khác năm thì thêm năm để khỏi nhầm khách cũ.
const dayClock = (iso: string, now: number) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = taskDayLabel(d, now);
  const year = day.includes('/') && d.getFullYear() !== new Date(now).getFullYear() ? `/${d.getFullYear()}` : '';
  return `${day}${year} ${fmtClock(d.getTime())}`;
};

/** Lần tương tác gần nhất (cuộc gọi / ghi chú / Zalo-gặp). Không có → null. */
export function lastTouchOf(customer: Customer, now: number): LastTouch | null {
  type Item = { at: string; meta: string; headline: string; text: string };
  const items: Item[] = [
    ...callAttemptsOf(customer).map((c) => {
      const sec = typeof c.duration === 'number' && c.duration > 0 ? c.duration : 0;
      return {
        at: c.at,
        meta: sec ? `Gọi ${sec >= 60 ? `${Math.round(sec / 60)} phút` : `${sec} giây`}` : 'Cuộc gọi',
        headline: callResultLabel(c.result),
        text: displayText(c.note),
      };
    }),
    ...(Array.isArray(customer.notes_manual) ? customer.notes_manual : []).flatMap((n) =>
      n?.at && displayText(n.text) ? [{ at: n.at, meta: 'Ghi chú', headline: '', text: displayText(n.text) }] : [],
    ),
    ...(Array.isArray(customer.interactions) ? customer.interactions : []).flatMap((i) =>
      i?.at && i.kind !== 'archived' && i.kind !== 'restored'
        ? [
            {
              at: i.at,
              meta: i.channel === 'zalo' ? 'Zalo' : 'Tương tác',
              headline: interactionTitle(i),
              text: displayText(i.note),
            },
          ]
        : [],
    ),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const top = items[0];
  return top ? { when: dayClock(top.at, now), meta: top.meta, headline: top.headline, text: top.text } : null;
}

/** Brief tách 2 phần (D-023 L4): ô đã biết + câu hỏi còn thiếu. Bỏ "Liên hệ cuối" (đã có ở Lần trước). */
export function splitBrief(brief: readonly BriefFact[]): { known: BriefFact[]; missing: BriefFact[] } {
  const rows = brief.filter((f) => f.key !== 'last_contact');
  return {
    known: rows.filter((f) => f.value && f.value !== 'Chưa biết'),
    missing: rows.filter((f) => !f.value || f.value === 'Chưa biết'),
  };
}

/** "Thông tin thêm": chỉ trường có giá trị, nhãn tiếng Việt (D-023 L3 + L4). */
export function extraFacts(customer: Customer, now: number): { label: string; value: string }[] {
  const calls = callAttemptsOf(customer);
  const last = calls.at(-1);
  const tier = INTEREST_TIERS.find((t) => (Number(customer.interest_level) || 0) >= t.min);
  const reason = displayText(customer.disqualify_reason);
  const rows: [string, string][] = [
    ['Trạng thái liên hệ', displayText(customer.contact_status)],
    ['Số lần gọi', calls.length ? `${calls.length} lần` : ''],
    ['Lần gọi cuối', last ? dayClock(last.at, now) : ''],
    ['Nguồn', sourceListOf(customer.source).map(sourceLabel).filter(Boolean).join(' · ')],
    ['Chiến dịch', displayText(customer.campaign)],
    ['Cách nhập', intakeLabel(customer.intake_method)],
    ['Mức quan tâm', customer.interest_level != null && tier ? tier.label : ''],
    ['Lý do loại', reason ? LEAD_DROP_REASONS[reason] || CLOSE_REASONS[reason] || reason : ''],
    ['Ghi chú kết thúc', displayText(customer.disqualify_note || customer.close_note)],
    ['Điều kiện retarget', displayText(customer.retarget_hint?.note)],
    [
      'Không liên hệ',
      customer.contact_prefs?.do_not_contact ? displayText(customer.contact_prefs.dnc_reason) || 'Đã yêu cầu' : '',
    ],
    ['Ngày đăng ký', dayClock(String(customer.registered_at || customer.created_at || ''), now)],
    ['Ghi chú đăng ký', displayText(customer.notes)],
  ];
  return rows.filter(([, v]) => v).map(([label, value]) => ({ label, value }));
}

/**
 * Bậc trong sheet đổi bậc: thứ tự CARE_STAGE_PICKER_ORDER (Nuôi dài hạn là nhánh của Đang chăm sóc,
 * đứng ngay sau bậc đó — Curtis 2026-10-22). Kí HĐMB / Loại không chọn tay ở đây; bậc hiện tại nằm
 * ngoài danh sách (đã chốt/loại) vẫn đứng đầu để radio checked.
 */
export function stageChoicesFor(current: string): string[] {
  const options = CARE_STAGE_PICKER_ORDER.filter(
    (option) => option !== CARE_STAGE_WON && option !== CARE_STAGE_DROPPED,
  ) as string[];
  return current && !options.includes(current) ? [current, ...options] : options;
}

export type StageChoiceRow = { stage: string; label: string; hint?: string };

/** Dòng bậc cho sheet: nhãn hiển thị + lời giải thích nhánh (CARE_STAGE_BRANCH) để vẽ dấu nhánh. */
export function stageChoiceRows(current: string): StageChoiceRow[] {
  return stageChoicesFor(current).map((stage) => ({
    stage,
    label: CARE_STAGE_DISPLAY[stage] || stage,
    hint: CARE_STAGE_BRANCH[stage]?.hint,
  }));
}

/** Vạch trái của việc theo taskDueInfo (D-010, DS v4): quá hạn → đỏ, đến hạn (trong 30 phút ân hạn) → vàng. */
export function dueTone(info: TaskDueInfo | null): 'over' | 'soon' | undefined {
  return info?.state === 'overdue' ? 'over' : info?.state === 'due' ? 'soon' : undefined;
}

export type TimelineFilter = 'all' | 'call' | 'note' | 'interaction' | 'stage';
export const TIMELINE_FILTERS: readonly { key: TimelineFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'call', label: 'Cuộc gọi' },
  { key: 'note', label: 'Ghi chú' },
  { key: 'interaction', label: 'Zalo & gặp' },
  { key: 'stage', label: 'Bậc' },
];

/** Lọc dòng thời gian theo loại (I7). 'all' giữ nguyên. */
export function filterTimeline<T extends StageEntryLike>(entries: readonly T[], key: TimelineFilter): T[] {
  if (key === 'stage') return stageTransitions(entries).sort(newestFirst);
  return key === 'all' ? [...entries] : entries.filter((e) => e.kind === key);
}

/** Số mục mỗi loại để hiện trên chip; chip số 0 (trừ "Tất cả") không hiện. */
export function timelineCounts(entries: readonly StageEntryLike[]): Record<TimelineFilter, number> {
  const out: Record<TimelineFilter, number> = {
    all: entries.length,
    call: 0,
    note: 0,
    interaction: 0,
    stage: 0,
  };
  for (const e of entries) if (e.kind in out && e.kind !== 'all') out[e.kind as TimelineFilter]++;
  out.stage = stageTransitions(entries).length;
  return out;
}

// ── PF-02: dòng thời gian phân cấp theo bậc. Mốc bậc = đầu nhóm, mục khác thuộc bậc gần nhất trước nó. ──

type TimelineEntryLike = {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail?: string;
  stageNote?: boolean;
  interactionKind?: string;
  /** CP-03: mã loại của việc đã xong (profile bơm vào từ next_tasks). */
  taskKind?: string;
};

export type TimelineRow<T> = { entry: T; icon: IconName };

export type TimelineGroup<T> = {
  id: string;
  /** Mốc bậc mở nhóm; null = nhóm "Trước khi có mốc bậc". */
  stage: T | null;
  title: string;
  at: string;
  icon: IconName;
  rows: TimelineRow<T>[];
};

export type TimelineView<T> = {
  /** false = khách chưa có mốc bậc → danh sách phẳng như cũ (không tiêu đề nhóm, không thụt). */
  grouped: boolean;
  flat: TimelineRow<T>[];
  groups: TimelineGroup<T>[];
  /** Dòng theo đúng thời gian; bậc và lưu trữ/khôi phục luôn đứng cấp trên cùng. */
  ordered: { entry: T; icon: IconName; topLevel: boolean; nested: boolean }[];
};

export const BEFORE_STAGE_TITLE = 'Trước khi có mốc bậc';

type StageEntryLike = { kind: string; at?: string; title?: string };

const newestFirst = (a: { at?: string }, b: { at?: string }) => Date.parse(b.at || '') - Date.parse(a.at || '');

/** So sánh bậc theo thứ tự thời gian, kể cả tên cũ; không sửa lịch sử đã lưu. */
function stageTransitions<T extends StageEntryLike>(entries: readonly T[]): T[] {
  const stages = entries.filter((entry) => entry.kind === 'stage').sort((a, b) => newestFirst(b, a));
  return stages.filter((entry, index) => {
    const previous = stages[index - 1];
    return (
      !previous ||
      !entry.title ||
      normStage(entry.title.replace(/^Bậc: /, '')) !== normStage(previous.title?.replace(/^Bậc: /, ''))
    );
  });
}

/** Tên bậc đã lưu nằm sau tiền tố "Bậc: " của customerTimeline (domain giữ nguyên tiêu đề hiển thị). */
const stageNameOf = (entry: TimelineEntryLike) =>
  entry.title.startsWith('Bậc: ') ? entry.title.slice('Bậc: '.length) : entry.title;

/** Khái niệm icon theo loại mục (D-006); ánh xạ glyph vẫn chỉ ở src/config/icons.ts. */
export function timelineIcon(entry: TimelineEntryLike): IconName {
  switch (entry.kind) {
    case 'stage':
      if (entry.stageNote) return 'note';
      return STAGE_ICON[stageNameOf(entry)] ?? STAGE_ICON_FALLBACK;
    case 'call':
      return 'call';
    case 'note':
      return 'note';
    case 'interaction':
      switch (entry.interactionKind) {
        case 'sent':
          return 'message';
        case 'meeting':
          return 'cafe';
        case 'project_view':
          return 'visit';
        case LEAD_FORM_KIND:
          return 'new_lead';
        default:
          return 'message';
      }
    case 'task':
      return entry.taskKind ? taskKindOf(entry.taskKind).icon : 'task';
    case 'approved':
      return 'ai';
    case 'archive':
      return 'history';
    default:
      return ICON_FALLBACK;
  }
}

/** Tên bậc hiển thị: customerTimeline đang giữ tiền tố "Bậc: " cho dữ liệu cũ, giao diện mới bỏ tiền tố. */
export function stageDisplayTitle(title: string): string {
  const name = title.startsWith('Bậc: ') ? title.slice('Bậc: '.length) : title;
  return normStage(name) || name;
}

/** ID dòng thời gian → con trỏ tới phần tử đã lưu; đuôi ID là chỉ số nên giờ ISO có dấu ':' vẫn đọc đúng. */
export type TimelineEntryTarget = {
  kind: 'note' | 'stage' | 'call' | 'interaction' | 'task';
  at: string;
  index: number;
};

export function timelineEntryTarget(id: string): TimelineEntryTarget | null {
  const first = id.indexOf(':');
  const last = id.lastIndexOf(':');
  if (first < 0 || last <= first) return null;
  const kind = id.slice(0, first);
  if (kind !== 'note' && kind !== 'stage' && kind !== 'call' && kind !== 'interaction' && kind !== 'task') return null;
  const index = Number(id.slice(last + 1));
  const at = id.slice(first + 1, last);
  if (!Number.isInteger(index) || index < 0 || !at) return null;
  return { kind, at, index };
}

/** Ghi chú của mốc bậc chỉ hiện ở "Tất cả" / "Bậc" (lọc "Cuộc gọi" không được lộ chữ ghi chú). */
export function showsStageDetail(filter: TimelineFilter): boolean {
  return filter === 'all' || filter === 'stage';
}

/**
 * Nhóm mục theo mốc bậc: nhóm mới nhất trước, mục con mới nhất trước.
 * Mục cũ hơn mọi mốc bậc → nhóm cuối "Trước khi có mốc bậc". Không có mốc bậc → [].
 */
export function timelineGroups<T extends TimelineEntryLike>(entries: readonly T[]): TimelineGroup<T>[] {
  const stages = stageTransitions(entries).sort(newestFirst);
  if (!stages.length) return [];
  const groups: TimelineGroup<T>[] = stages.map((stage) => ({
    id: stage.id,
    stage,
    title: stage.title,
    at: stage.at,
    icon: timelineIcon(stage),
    rows: [],
  }));
  const before: TimelineGroup<T> = {
    id: 'before',
    stage: null,
    title: BEFORE_STAGE_TITLE,
    at: '',
    icon: 'history',
    rows: [],
  };
  // groups xếp mới nhất trước → nhóm đầu tiên có at <= mục là bậc gần nhất; cùng thời điểm thuộc bậc đó.
  const transitions = new Set(stages);
  const calls = entries.filter((entry) => entry.kind === 'call').map((entry) => Date.parse(entry.at));
  const children = entries.flatMap((entry): T[] => {
    if (entry.kind === 'archive' || transitions.has(entry)) return [];
    if (entry.kind !== 'stage') return [entry];
    // Mốc gọi cũ chỉ là bản sao của cuộc gọi; giữ ID gốc cho các ghi chú còn hiển thị.
    if (!entry.detail?.trim() || calls.some((at) => Math.abs(at - Date.parse(entry.at)) <= 2 * 60_000)) return [];
    return [{ ...entry, title: 'Ghi chú bậc', stageNote: true }];
  });
  for (const entry of children.sort(newestFirst)) {
    const group = groups.find((g) => Date.parse(g.at) <= Date.parse(entry.at)) ?? before;
    group.rows.push({ entry, icon: timelineIcon(entry) });
  }
  return before.rows.length ? [...groups, before] : groups;
}

/** Cấu trúc nhóm + lọc cho tab Dòng thời gian, kèm tên icon từng mục. */
export function timelineView<T extends TimelineEntryLike>(
  entries: readonly T[],
  filter: TimelineFilter,
): TimelineView<T> {
  const groups = timelineGroups(entries);
  const visibleEntries = groups.length
    ? [
        ...groups.flatMap((group) => [...(group.stage ? [group.stage] : []), ...group.rows.map((row) => row.entry)]),
        ...entries.filter((entry) => entry.kind === 'archive'),
      ]
    : entries;
  const orderedEntries = visibleEntries
    .filter((entry) => filter === 'all' || (entry.kind === filter && !entry.stageNote))
    .slice()
    .sort(newestFirst);
  const ordered = orderedEntries.map((entry) => ({
    entry,
    icon: timelineIcon(entry),
    topLevel: (entry.kind === 'stage' && !entry.stageNote) || entry.kind === 'archive',
    nested: !!groups.length && (entry.kind !== 'stage' || !!entry.stageNote) && entry.kind !== 'archive',
  }));
  if (!groups.length) {
    return {
      grouped: false,
      flat: filterTimeline(entries, filter).map((entry) => ({ entry, icon: timelineIcon(entry) })),
      groups: [],
      ordered,
    };
  }
  if (filter === 'all') return { grouped: true, flat: [], groups, ordered };
  // "Bậc" = chỉ các đầu nhóm (nhóm "Trước khi có mốc bậc" không phải một bậc nên không hiện).
  if (filter === 'stage') {
    return {
      grouped: true,
      flat: [],
      groups: groups.filter((g) => g.stage).map((g) => ({ ...g, rows: [] })),
      ordered,
    };
  }
  return {
    grouped: true,
    flat: [],
    groups: groups.flatMap((g) => {
      const rows = g.rows.filter((r) => r.entry.kind === filter);
      return rows.length ? [{ ...g, rows }] : [];
    }),
    ordered,
  };
}

/** Giới hạn hoạt động sau khi lọc; tiêu đề bậc không chiếm suất của dòng con. */
export function limitTimelineView<T extends TimelineEntryLike>(view: TimelineView<T>, limit: number) {
  const isActivity = (entry: T) => entry.kind !== 'stage' || !!entry.stageNote;
  const total = view.ordered.filter(({ entry }) => isActivity(entry)).length;
  const hiddenCount = Math.max(0, total - limit);
  if (!hiddenCount) return { view, hiddenCount };

  let remaining = limit;
  const groups = view.groups.flatMap((group) => {
    if (remaining <= 0) return [];
    const rows = group.rows.slice(0, remaining);
    remaining -= rows.length;
    return [{ ...group, rows }];
  });
  remaining = limit;
  const ordered = view.ordered.filter(({ entry }) => {
    if (remaining <= 0) return false;
    if (isActivity(entry)) remaining--;
    return true;
  });
  return { view: { ...view, groups, ordered, flat: view.flat.slice(0, limit) }, hiddenCount };
}

/** Sửa ghi chú trên dòng thời gian: chỉ ghi chú tay và ghi chú bậc; giữ nguyên trường lạ (D-012). */
export function editedTimelineNotePatch(
  customer: Customer,
  entryId: string,
  text: string,
  editedAt: string,
): Record<string, unknown> | null {
  const separator = entryId.lastIndexOf(':');
  const index = Number(entryId.slice(separator + 1));
  if (separator < 0 || !Number.isInteger(index) || index < 0 || text.length === 0) return null;

  if (entryId.startsWith('note:')) {
    const notes = Array.isArray(customer.notes_manual) ? customer.notes_manual.slice() : [];
    const note = notes[index];
    if (!note || note.text === text) return null;
    notes[index] = { ...note, text, edited_at: editedAt };
    return { notes_manual: notes };
  }

  if (entryId.startsWith('stage:')) {
    const history = Array.isArray(customer.care_stage_history) ? customer.care_stage_history.slice() : [];
    const entry = history[index];
    if (!entry || entry.note === text) return null;
    history[index] = { ...entry, note: text, edited_at: editedAt };
    return { care_stage_history: history };
  }

  return null;
}

/** Giỏ hàng tối thiểu để ước giá: giá hiệu lực căn > toà > dự án (cùng thứ tự máy tính vay). */
export type PriceCatalog = {
  projectByName: (name: unknown) => { id?: unknown } | null;
  buildingByCode: (projectId: unknown, code: unknown) => { id?: unknown } | null;
  unitByCode: (buildingId: unknown, code: unknown) => unknown;
  unitPrice: (unit: unknown) => number | null;
  buildingPrice: (building: unknown) => number | null;
  projectPrice: (project: unknown) => number | null;
  unitArea?: (unit: unknown) => number | null;
  typicalArea?: (projectId: unknown, buildingId: unknown, aptType: unknown) => number | null;
  // Phí mỗi căn theo căn > toà > dự án (D-031); catalog cũ không có thì phí 0.
  unitFee?: (unit: unknown) => number | null;
  buildingFee?: (building: unknown) => number | null;
  projectFee?: (project: unknown) => number | null;
};

/** Dự án / toà / căn của khách trong Giỏ hàng (dự án đầu tiên có trong Giỏ hàng). */
function catalogRows(customer: Customer, catalog: PriceCatalog | null) {
  // Catalog rút gọn (chỉ danh sách dự án) không tra được giá → coi như chưa có dự án.
  if (typeof catalog?.projectByName !== 'function') return { project: null, building: null, unit: null };
  const project =
    (Array.isArray(customer.projects) &&
      customer.projects.map((name) => catalog?.projectByName(name)).find((row) => !!row)) ||
    null;
  const building = project ? catalog?.buildingByCode(project.id, customer.building_code) : null;
  const unit = building ? catalog?.unitByCode(building.id, customer.apt_code) : null;
  return { project, building, unit };
}

/** Tỷ lệ VAT, KPBT của dự án + phí của căn — để ra Giá dự kiến như máy tính vay (D-031). */
export type PriceRates = { vatRate: number; kpbtRate: number; fee: number };
export const DEFAULT_PRICE_RATES: PriceRates = { vatRate: 5, kpbtRate: 2, fee: 0 };
export function priceRates(customer: Customer, catalog: PriceCatalog | null): PriceRates {
  const { project, building, unit } = catalogRows(customer, catalog);
  if (!project) return DEFAULT_PRICE_RATES;
  const p = project as { vat_rate?: unknown; kpbt_rate?: unknown };
  const fee = Number(
    unit ? catalog?.unitFee?.(unit) : building ? catalog?.buildingFee?.(building) : catalog?.projectFee?.(project),
  );
  return {
    vatRate: p.vat_rate == null ? 5 : Number(p.vat_rate),
    kpbtRate: p.kpbt_rate == null ? 2 : Number(p.kpbt_rate),
    fee: fee > 0 ? fee : 0,
  };
}
/** Giá căn = Giá dự kiến = thuần + VAT + KPBT + phí (Curtis 06/11, cùng hàm máy tính vay). */
export function expectedPrice(net: number, rates: PriceRates): number {
  return calcPrice({ netPriceOverride: net, ...rates }).full;
}
/** Ngược lại: giá căn anh nhập (gồm VAT, KPBT, phí) → giá thuần để máy tính vay và số vay dùng. */
export function netFromExpected(full: number, rates: PriceRates): number {
  return Math.round((full - rates.fee) / (1 + (rates.vatRate + rates.kpbtRate) / 100));
}

export type PriceEstimate =
  | { total: number; area: number; pricePerM2: number; areaSource?: 'catalog' }
  | { missing: 'area' | 'project' | 'price'; area?: number; areaSource?: 'catalog' };

/** Giá thuần ước tính (`total`) = diện tích × đơn giá/m² trong Giỏ hàng. Chỉ để xem — không ghi vào hồ sơ. */
export function estimatePrice(customer: Customer, catalog: PriceCatalog | null): PriceEstimate {
  const ownArea = Number(customer.apt_area);
  // Catalog cũ chưa hỗ trợ diện tích: giữ nhánh trả về sớm khi khách chưa nhập số riêng.
  if (!(ownArea > 0) && !catalog?.unitArea && !catalog?.typicalArea) return { missing: 'area' };
  const { project, building, unit } = catalogRows(customer, catalog);
  // Chỉ đọc diện tích hiệu lực từ Giỏ hàng; không điền ngược vào apt_area của khách.
  const unitArea = unit ? catalog?.unitArea?.(unit) : null;
  const area =
    ownArea > 0
      ? ownArea
      : unitArea != null && unitArea > 0
        ? unitArea
        : Number(project && catalog?.typicalArea?.(project.id, building?.id ?? null, customer.apt_type));
  if (!(area > 0)) return { missing: 'area' };
  if (!project) return { missing: 'project' };
  // Giữ nguyên dạng kết quả cũ khi khách đã nhập diện tích riêng.
  const inherited = ownArea > 0 ? {} : { areaSource: 'catalog' as const };
  const price = Number(
    unit ? catalog?.unitPrice(unit) : building ? catalog?.buildingPrice(building) : catalog?.projectPrice(project),
  );
  if (!(price > 0)) return { missing: 'price', ...(ownArea > 0 ? {} : { area, ...inherited }) };
  return { total: area * price, area, pricePerM2: price, ...inherited };
}

/** Ô "Giá căn (tỷ)": 2058000000 → "2,058". Lưu vẫn theo VNĐ như form Thêm khách (`apt_price`). */
export function formatPriceTy(value: number): string {
  return (value / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
}

/** "2,06" / "2.06" (tỷ) → 2060000000; rỗng → null; sai dạng → undefined (không lưu). */
export function parsePriceTy(raw: string): number | null | undefined {
  const text = raw.trim().replace(/\s/g, '');
  if (!text) return null;
  if (!/^\d+([.,]\d+)?$/.test(text)) return undefined;
  const value = Math.round(Number(text.replace(',', '.')) * 1_000_000_000);
  return value > 0 ? value : undefined;
}

/**
 * Thẻ "Giá & vay" trên hồ sơ (Curtis 06/11): giá căn (`apt_price`) = Giá dự kiến gồm VAT + KPBT + phí; anh nhập
 * thì thắng ước tính. Số vay = 70% × (thuần + VAT), không gồm KPBT và phí (D-031) — cùng hàm máy tính vay.
 */
export function profileLoan(customer: Customer, estimate: PriceEstimate, rates: PriceRates = DEFAULT_PRICE_RATES) {
  const saved = Number(customer.apt_price) > 0 ? Number(customer.apt_price) : null;
  const area = 'area' in estimate && Number(estimate.area) > 0 ? Number(estimate.area) : 0;
  const pricePerM2 = 'total' in estimate ? estimate.pricePerM2 : 0;
  const net = saved != null ? netFromExpected(saved, rates) : 'total' in estimate ? estimate.total : null;
  const price = saved ?? (net == null ? null : expectedPrice(net, rates));
  const ltv = DEFAULT_LOAN.ltv;
  const loan =
    net == null ? null : Math.round((calcPrice({ ...rates, netPriceOverride: net }).gross * Number(ltv)) / 100);
  const prefill: LoanPrefill = {
    customerId: customer.id,
    ...customerUnit(customer),
    ...(area > 0 ? { area } : {}),
    ...(pricePerM2 > 0 ? { pricePerM2 } : {}),
    ...(saved != null && net != null ? { netOverride: net } : {}),
  };
  return { price, manual: saved != null, loan, ltv: Number(ltv), prefill };
}

/** 2340000000 → "2,34 tỷ"; 850000000 → "850 triệu". */
export function formatVndShort(value: number): string {
  return formatMoney(value);
}

export const PRICE_ESTIMATE_MISSING: Record<'area' | 'project' | 'price', string> = {
  area: 'Cần diện tích',
  project: 'Cần dự án quan tâm',
  price: 'Dự án chưa có giá/m² trong Giỏ hàng',
};
