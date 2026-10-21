import { CLOSE_REASONS, LEAD_DROP_REASONS } from '@/config/reasons';
import { CARE_STAGE_OPTIONS, INTEREST_TIERS } from '@/config/stages';
import { VELOCITY_CONFIG } from '@/config/velocity';
import type { Customer } from '@/domain/customer';
import type { BriefFact } from '@/domain/customer/brief';
import { interactionTitle } from '@/domain/customer/interactions';
import { callAttemptsOf, sourceListOf } from '@/domain/customer/normalize';
import { fmtClock, type TaskDueInfo, taskDayLabel } from '@/domain/deadlines';
import { callResultLabel, displayDateTime, displayText, intakeLabel, sourceLabel } from '@/ui/display';

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

// ── Hồ sơ v3 (D-023): dữ liệu trình bày, chỉ đọc domain/config. ──

export type LastTouch = { when: string; meta: string; headline: string; text: string };

const dayClock = (iso: string, now: number) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${taskDayLabel(d, now)} ${fmtClock(d.getTime())}`;
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
      i?.at
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
    ['Ngày đăng ký', displayDateTime(customer.registered_at || customer.created_at)],
    ['Ghi chú đăng ký', displayText(customer.notes)],
  ];
  return rows.filter(([, v]) => v).map(([label, value]) => ({ label, value }));
}

/** Bậc được chọn trong sheet: giữ nguyên danh sách cũ, thêm bậc hiện tại nếu nằm ngoài phễu. */
export function stageChoicesFor(current: string): string[] {
  const options = CARE_STAGE_OPTIONS.filter(
    (option) => option !== VELOCITY_CONFIG.stageWon && option !== 'Loại',
  ) as string[];
  return current && !options.includes(current) ? [current, ...options] : options;
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
export function filterTimeline<T extends { kind: string }>(entries: readonly T[], key: TimelineFilter): T[] {
  return key === 'all' ? [...entries] : entries.filter((e) => e.kind === key);
}

/** Số mục mỗi loại để hiện trên chip; chip số 0 (trừ "Tất cả") không hiện. */
export function timelineCounts(entries: readonly { kind: string }[]): Record<TimelineFilter, number> {
  const out: Record<TimelineFilter, number> = { all: entries.length, call: 0, note: 0, interaction: 0, stage: 0 };
  for (const e of entries) if (e.kind in out && e.kind !== 'all') out[e.kind as TimelineFilter]++;
  return out;
}
