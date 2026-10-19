import { CAPACITY_CONFIG } from '@/config/capacity';
import { type CallSlotKey, FOLLOWUP_CONFIG } from '@/config/followup';
import { CLOSE_REASONS, LEAD_DROP_REASONS } from '@/config/reasons';
import { SIGNAL_GROUPS, SIGNALS_CONFIG, type SignalGroup } from '@/config/signals';
import { VELOCITY_CONFIG } from '@/config/velocity';
import type { Customer, Task } from '@/domain/customer';
import { callAttemptsOf, sourceListOf } from '@/domain/customer/normalize';
import { countdownTag, fmtClock, taskDayLabel } from '@/domain/deadlines';
import { computeSignals, type Signal } from '@/domain/signals';
import { fmt as fmtDuration, status as slaStatus } from '@/domain/velocity/engine';
import { callResultLabel, displayText, sourceLabel } from '@/ui/display';

export type QueueFilter = 'priority' | 'new' | 'promise' | 'opportunity';
export type QueueRow = { signal: Signal; customer: Customer; minutes: number };
export type CapacitySnoozeCandidate = { customer: Customer; task: Task };

/** Start of the next configured calling slot, using local time like D-005. */
export function nextCallSlotStart(now: number, notBefore = now): number {
  const slots = Object.values(FOLLOWUP_CONFIG.callSlots)
    .map(({ range }) => Number(range.slice(0, 2)) * 60 + Number(range.slice(3, 5)))
    .sort((a, b) => a - b);
  const current = new Date(Math.max(now, notBefore));
  const minute = current.getHours() * 60 + current.getMinutes();
  const next = slots.find((start) => start > minute);
  if (next === undefined) current.setDate(current.getDate() + 1);
  const targetMinute = next ?? slots[0] ?? 9 * 60;
  current.setHours(Math.floor(targetMinute / 60), targetMinute % 60, 0, 0);
  return current.getTime();
}

/** Capacity can move one future all-day task per suggested P2 row; never move customer promises. */
export function capacitySnoozeCandidates(rows: readonly QueueRow[], now: number): CapacitySnoozeCandidate[] {
  const today = new Date(now);
  const result: CapacitySnoozeCandidate[] = [];
  const seen = new Set<string>();
  for (const { customer } of rows) {
    const task = (Array.isArray(customer.next_tasks) ? customer.next_tasks : []).find((entry) => {
      if (!entry || entry.done_at || entry.side === 'customer' || !entry.due || !entry.due_allday) return false;
      const due = new Date(entry.due);
      return (
        due.getFullYear() > today.getFullYear() ||
        (due.getFullYear() === today.getFullYear() && due.getMonth() > today.getMonth()) ||
        (due.getFullYear() === today.getFullYear() &&
          due.getMonth() === today.getMonth() &&
          due.getDate() > today.getDate())
      );
    });
    if (!task?.at) continue;
    const key = `${customer.id}:${task.key || task.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ customer, task });
  }
  return result;
}
export function queueRows(customers: readonly Customer[], now: number, ownerId?: string): QueueRow[] {
  const byId = new Map(customers.map((customer) => [customer.id, customer]));
  return computeSignals(customers, { now, ownerId })
    .map((signal) => {
      const customer = byId.get(signal.customerId);
      return customer
        ? {
            signal,
            customer,
            minutes: Math.max(
              1,
              ...[signal, ...(signal.secondaryReasons ?? [])].flatMap((item) =>
                item.actions.map((action) => CAPACITY_CONFIG.minutes[action] ?? 3),
              ),
            ),
          }
        : null;
    })
    .filter((row): row is QueueRow => row !== null);
}

export function filterQueue(rows: readonly QueueRow[], filter: QueueFilter): QueueRow[] {
  if (filter === 'priority') return [...rows];
  const selected = rows.filter(({ signal }) => {
    if (filter === 'new') return signal.group === 'new';
    if (filter === 'promise') return signal.group === 'due' || signal.group === 'tasks' || signal.group === 'today';
    return signal.priority !== 'P0' && (signal.group === 'hot' || signal.group === 'warm' || signal.group === 'nonext');
  });
  const selectedIds = new Set(selected.map((row) => row.signal.dedupeKey));
  return [...rows.filter((row) => row.signal.priority === 'P0' && !selectedIds.has(row.signal.dedupeKey)), ...selected];
}

export function visibleQueue(rows: readonly QueueRow[], filter: QueueFilter): QueueRow[] {
  const filtered = filterQueue(rows, filter);
  const p0 = filtered.filter((row) => row.signal.priority === 'P0');
  const rest = filtered
    .filter((row) => row.signal.priority !== 'P0')
    .slice(0, Math.max(0, CAPACITY_CONFIG.maxRows - p0.length));
  // P0 cam kết không bị cắt khỏi danh sách, kể cả khi vượt 7 dòng.
  return [...p0, ...rest];
}

export function currentCallSlot(now: number): { key: CallSlotKey; name: string; remaining: number } | null {
  const minute = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  for (const key of Object.keys(FOLLOWUP_CONFIG.callSlots) as CallSlotKey[]) {
    const { range, name } = FOLLOWUP_CONFIG.callSlots[key];
    const [start, end] = range.split('-').map((part) => {
      const [hour, minutePart] = part.split(':').map(Number);
      return (hour ?? 0) * 60 + (minutePart ?? 0);
    });
    if (start !== undefined && end !== undefined && minute >= start && minute < end)
      return { key, name, remaining: end - minute };
  }
  return null;
}

export function capacityPlan(rows: readonly QueueRow[], now: number) {
  const slot = currentCallSlot(now);
  const minutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  const overflow = slot ? Math.max(0, minutes - slot.remaining) : 0;
  const movable = rows.filter(
    (row) =>
      row.signal.priority === 'P2' &&
      !row.customer.next_call_at &&
      !(
        Array.isArray(row.customer.next_tasks) &&
        row.customer.next_tasks.some((task) => task && !task.done_at && !!task.due && !task.due_allday)
      ),
  );
  const suggested: QueueRow[] = [];
  let recovered = 0;
  for (const row of movable) {
    if (recovered >= overflow) break;
    suggested.push(row);
    recovered += row.minutes;
  }
  return { slot, minutes, overflow, suggested, recovered };
}

export function endOfDaySummary(customers: readonly Customer[], now: number) {
  const today = new Date(now).toDateString();
  const tomorrowDay = new Date(now);
  tomorrowDay.setDate(tomorrowDay.getDate() + 1);
  let kept = 0,
    late = 0,
    unrecorded = 0,
    tomorrow = 0;
  for (const customer of customers) {
    for (const task of Array.isArray(customer.next_tasks) ? customer.next_tasks : []) {
      if (!task) continue;
      if (task.side === 'me' && task.done_at && new Date(task.done_at).toDateString() === today) kept++;
      if (!task.done_at && task.side === 'me' && task.due && Date.parse(task.due) < now) late++;
      if (!task.done_at && task.due && new Date(task.due).toDateString() === tomorrowDay.toDateString()) tomorrow++;
    }
    for (const attempt of Array.isArray(customer.call_attempts) ? customer.call_attempts : []) {
      if (attempt?.at && new Date(attempt.at).toDateString() === today && !attempt.result) unrecorded++;
    }
  }
  return { kept, late, unrecorded, tomorrow };
}

export const formatDue = (due?: number) =>
  due == null ? 'Chưa có hạn' : new Date(due).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

const EVIDENCE_LABELS: Record<string, string> = {
  registered_at: 'Ngày đăng ký',
  created_at: 'Ngày tạo',
  sla_anchor_at: 'Mốc tính SLA',
  next_call_at: 'Hẹn gọi',
  next_call_end: 'Kết thúc khung gọi',
  next_call_reason: 'Lý do hẹn gọi',
  care_stage_updated_at: 'Cập nhật bậc',
  care_stage: 'Bậc chăm sóc',
  lastTouch: 'Liên hệ cuối',
  lastInteraction: 'Trao đổi cuối',
  last_touch_at: 'Liên hệ cuối',
  interest_level: 'Mức quan tâm',
  step: 'Bước hồ sơ',
  phase: 'Giai đoạn',
  start: 'Bắt đầu giai đoạn',
  due: 'Hạn',
  due_at: 'Hạn',
  after: 'Ngày retarget',
  reason: 'Lý do',
  project_view_at: 'Ngày xem dự án',
  project_view: 'Lần xem dự án',
  finance: 'Tài chính',
  purpose: 'Mục đích mua',
  decision_maker: 'Người quyết định',
  purchase_timeline: 'Thời điểm mua',
};
const EVIDENCE_DATES = new Set([
  'registered_at',
  'created_at',
  'sla_anchor_at',
  'next_call_at',
  'next_call_end',
  'care_stage_updated_at',
  'lastTouch',
  'lastInteraction',
  'last_touch_at',
  'start',
  'due',
  'due_at',
  'after',
  'project_view_at',
]);

/** Display only evidence with a known label and a readable value; never stringify structured records. */
export function formatSignalEvidence(evidence: Signal['evidence']): string[] {
  return evidence.flatMap(({ field, value }) => {
    const label = EVIDENCE_LABELS[field];
    if (!label || value == null || (typeof value !== 'string' && typeof value !== 'number')) return [];
    let formatted: string;
    if (EVIDENCE_DATES.has(field)) {
      const timestamp = typeof value === 'number' ? value : Date.parse(value);
      if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) return [];
      formatted = formatDue(timestamp);
    } else if (field === 'step') {
      const step = VELOCITY_CONFIG.bookingSteps.find((entry) => entry.key === value);
      if (!step) return [];
      formatted = step.label;
    } else if (field === 'phase') {
      const phase = Object.entries(VELOCITY_CONFIG.phases).find(([key]) => key === value)?.[1];
      if (!phase) return [];
      formatted = phase.label;
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) return [];
      formatted = `${value.toLocaleString('vi-VN')}${field === 'interest_level' ? '%' : ''}`;
    } else {
      const text = value.trim();
      formatted = field === 'reason' ? CLOSE_REASONS[text] || LEAD_DROP_REASONS[text] || text : text;
      if (!formatted || formatted.includes('[object Object]') || /^\d{4}-\d{2}-\d{2}T/.test(formatted)) return [];
    }
    return [`${label}: ${formatted}`];
  });
}

// ── Hôm nay v3 (D-023): gom nhóm + dữ liệu thẻ. Chỉ đọc domain/config, không tự đặt luật. ──

export type TodayGroup = {
  key: SignalGroup | 'other';
  title: string;
  rows: QueueRow[];
  /** Thẻ đầy đủ (nhóm gấp nhất). */
  full: boolean;
  /** Nhóm ít gấp: mặc định đóng, chạm tiêu đề để mở. */
  collapsed: boolean;
};

/**
 * Nhóm hiển thị. Tín hiệu chính có nhóm → nhóm đó. Không có (vd. S05 SLA quá mục tiêu, S10 bước hồ sơ):
 * nhóm KHÔNG thu gọn đầu tiên của tín hiệu phụ → nếu chính là P0 thì 'sla' (việc P0 không bao giờ bị giấu
 * trong nhóm thu gọn) → nhóm thu gọn của tín hiệu phụ → không nhóm.
 */
export function rowGroup(signal: Signal): SignalGroup | undefined {
  if (signal.group) return signal.group;
  const collapsed = new Set<string>(SIGNALS_CONFIG.todayCollapsedGroups);
  const secondary = (signal.secondaryReasons ?? []).flatMap((s) => (s.group ? [s.group] : []));
  return secondary.find((g) => !collapsed.has(g)) ?? (signal.priority === 'P0' ? 'sla' : undefined) ?? secondary[0];
}

/** Mọi hành động của tín hiệu chính + phụ (vd. khách mới: S05 mở hồ sơ + S01 gọi). */
const rowActions = (signal: Signal) => new Set([signal, ...(signal.secondaryReasons ?? [])].flatMap((s) => s.actions));

/** Gom hàng đợi theo nhóm tín hiệu, đúng thứ tự `SIGNALS_CONFIG.groupOrder`; tín hiệu không nhóm → "Việc khác" cuối. Nhóm rỗng bị bỏ. */
export function groupQueue(rows: readonly QueueRow[]): TodayGroup[] {
  const full = new Set<string>(SIGNALS_CONFIG.todayFullGroups);
  const collapsed = new Set<string>(SIGNALS_CONFIG.todayCollapsedGroups);
  const groups: TodayGroup[] = SIGNALS_CONFIG.groupOrder.map((key) => ({
    key,
    title: SIGNAL_GROUPS[key].title,
    rows: rows.filter((row) => rowGroup(row.signal) === key),
    full: full.has(key),
    collapsed: collapsed.has(key),
  }));
  const known = new Set<string>(SIGNALS_CONFIG.groupOrder);
  groups.push({
    key: 'other',
    title: 'Việc khác',
    rows: rows.filter((row) => {
      const g = rowGroup(row.signal);
      return !g || !known.has(g);
    }),
    full: false,
    collapsed: false,
  });
  return groups.filter((group) => group.rows.length > 0);
}

/** Việc (next_tasks) mà tín hiệu nhắc tới — để nút Xong hoàn tất đúng việc. */
export function signalTask(signal: Signal, customer: Customer): Task | undefined {
  const ev = signal.evidence.find((entry) => entry.field === 'task')?.value as Partial<Task> | undefined;
  return (Array.isArray(customer.next_tasks) ? customer.next_tasks : []).find(
    (entry): entry is Task =>
      !!entry &&
      !entry.done_at &&
      ((!!ev?.key && entry.key === ev.key) ||
        (!!ev?.at && entry.at === ev.at) ||
        (!ev?.key && !ev?.at && entry.due === ev?.due && entry.text === ev?.text)),
  );
}

export type TodayCardAction = 'call' | 'complete' | 'outcome' | 'open';
export type TodayCard = {
  tone?: 'over' | 'soon';
  /** Dòng dưới tên: phần đầu (thời hạn) + phần sau. */
  when?: { text: string; state: 'over' | 'soon' | 'plain' };
  detail: string;
  facts: { label: string; value: string }[];
  note?: string;
  sla?: { label: string; state: 'ok' | 'warn' | 'over'; ratio: number; text: string };
  action: TodayCardAction;
};

const dayClock = (iso: string, now: number) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${taskDayLabel(d, now)} ${fmtClock(d.getTime())}`;
};

function lastNoteOf(customer: Customer): string {
  const notes = [
    ...(Array.isArray(customer.notes_manual) ? customer.notes_manual : []).map((n) => ({ at: n?.at, text: n?.text })),
    ...callAttemptsOf(customer).map((c) => ({ at: c.at, text: c.note })),
  ]
    .filter((n): n is { at: string; text: string } => !!n.at && typeof n.text === 'string' && !!n.text.trim())
    .sort((a, b) => b.at.localeCompare(a.at));
  return notes[0]?.text.trim() || displayText(customer.notes);
}

/** Thanh SLA bậc (DESIGN_SYSTEM v4 SlaBar) từ `velocity.status` (D-008); ngoài phễu → undefined. Dùng chung Hôm nay + Hồ sơ. */
export function slaBarOf(customer: Customer, now: number): TodayCard['sla'] {
  const s = slaStatus(customer, now);
  if (!s) return undefined;
  return {
    label: s.label,
    state: s.state,
    ratio: s.max > 0 ? Math.max(0, s.elapsed) / s.max : 0,
    text:
      s.state === 'over'
        ? `quá ${fmtDuration(s.elapsed - s.max)}`
        : `còn ${fmtDuration((s.state === 'warn' ? s.max : s.target) - s.elapsed)}`,
  };
}

/** Dữ liệu một thẻ khách ở Hôm nay. Thời hạn theo `countdownTag` (D-010), SLA theo `velocity.status` (D-008). */
export function todayCard(row: QueueRow, now: number): TodayCard {
  const { signal, customer } = row;
  // Hành động: đúng MỘT (D-023 L2).
  const actions = rowActions(signal);
  const group = rowGroup(signal);
  const action: TodayCardAction = actions.has('call')
    ? 'call'
    : actions.has('record_call') || group === 'pending'
      ? 'outcome'
      : actions.has('complete') && signalTask(signal, customer)
        ? 'complete'
        : 'open';

  // Thời hạn.
  let when: TodayCard['when'];
  let tone: TodayCard['tone'];
  if (signal.due != null && Number.isFinite(signal.due)) {
    // Hẹn gọi có khung: quá hạn tính từ CUỐI khung + 30 phút (D-010) — đọc next_call_end từ bằng chứng.
    const endEv = signal.evidence.find((e) => e.field === 'next_call_end')?.value;
    const endMs = typeof endEv === 'string' ? Date.parse(endEv) : Number.NaN;
    const cd = countdownTag(signal.due, Number.isFinite(endMs) ? endMs : signal.due, false, now);
    const at = new Date(signal.due);
    const clock = fmtClock(signal.due);
    const day = taskDayLabel(at, now);
    const stamp = day === 'Hôm nay' ? clock : `${day} ${clock}`;
    if (cd?.state === 'missed') {
      tone = 'over';
      when = { text: `Quá ${fmtDuration(now - (Number.isFinite(endMs) ? endMs : signal.due))}`, state: 'over' };
    } else if (cd?.state === 'due') {
      tone = 'soon';
      when = { text: 'Đến hạn', state: 'soon' };
    } else {
      when = { text: stamp, state: 'plain' };
    }
    if (when.state !== 'plain') when.text = `${when.text} · hạn ${stamp}`;
  }

  // Cấp 2.
  const calls = callAttemptsOf(customer);
  const last = calls.at(-1);
  // Thẻ về thủ tục/hạn mức (nhóm SLA, hoặc hành động chỉ là mở hồ sơ): bằng chứng của tín hiệu thay cho số liệu cuộc gọi.
  const evidence =
    group === 'sla' || action === 'open'
      ? formatSignalEvidence(signal.evidence)
          .filter((line) => !line.startsWith('Bậc chăm sóc:'))
          .slice(0, 3)
          .map((line) => {
            const i = line.indexOf(': ');
            return { label: line.slice(0, i), value: line.slice(i + 2) };
          })
      : [];
  const facts = evidence.length
    ? evidence
    : last
      ? [
          { label: 'Gọi gần nhất', value: `${dayClock(last.at, now)} · ${callResultLabel(last.result)}` },
          { label: 'Đã gọi', value: `${calls.length} lần` },
        ]
      : [
          { label: 'Nguồn', value: sourceListOf(customer.source).map(sourceLabel).filter(Boolean).join(' · ') },
          { label: 'Đã gọi', value: 'Chưa' },
        ];

  // Cấp 3: SLA bậc.
  const sla = slaBarOf(customer, now);

  // Nhóm SLA/hồ sơ: lý do + bằng chứng quan trọng hơn ghi chú.
  const note = group === 'sla' ? undefined : lastNoteOf(customer) || undefined;
  // Nhóm hẹn gọi / khách mới: tiêu đề tín hiệu chỉ nhắc lại thời hạn → bỏ để không lặp chữ (U4).
  const detail = group === 'due' || group === 'today' || group === 'new' ? '' : signal.title;
  return { tone, when, detail, facts, note, sla, action };
}
