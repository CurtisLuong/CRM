/**
 * Tốc độ phễu / SLA (D-008) — port 1-1 legacy/js/velocity.js (window.VELOCITY). Hàm thuần: luôn nhận
 * `now` (ms), không đọc đồng hồ máy, không sửa bản ghi. Giờ đăng ký tính theo múi giờ của máy (như v1).
 * Cấu hình (hạn mức, quy tắc tự chuyển, checklist Booking): src/config/velocity.ts — nguồn duy nhất.
 */
import { VELOCITY_CONFIG as C, DAY, HOUR, MIN, type PhaseKey } from '@/config/velocity';
import type { Customer } from '@/domain/customer';
import { callAttemptsOf, normStage } from '@/domain/customer';

/** Trạng thái đồng hồ: ok = trong mục tiêu · warn = quá mục tiêu · over = quá hạn mức. */
export type SlaState = 'ok' | 'warn' | 'over';

/** Giai đoạn SLA hiện tại; start có thể NaN khi khách thiếu mọi mốc thời gian. */
export type PhaseInfo = { key: PhaseKey; start: number };

export type SlaStatus = {
  key: PhaseKey;
  label: string;
  start: number;
  elapsed: number;
  target: number;
  max: number;
  state: SlaState;
  text: string;
};

/** Trạng thái 1 bước hồ sơ Booking: done = đã xong · wait = chờ bước trước / không có hạn. */
export type BookingStepState = 'done' | SlaState | 'wait';

export type BookingStepRow = {
  key: string;
  label: string;
  text: string;
  doneAt: number | null;
  due: number | null;
  state: BookingStepState;
};

export type AutoAction = { type: 'drop' | 'nurture'; phase: PhaseKey };

/** ISO → ms; rỗng / sai → NaN. */
export function ms(v: string | null | undefined): number {
  const t = v ? Date.parse(v) : Number.NaN;
  return Number.isNaN(t) ? Number.NaN : t;
}

/** Mốc bắt đầu SLA khách mới theo giờ đăng ký: ngoài khung làm việc → dời tới resumeAt. */
export function newLeadStart(t: number): number {
  if (Number.isNaN(t)) return Number.NaN;
  const d = new Date(t);
  const h = d.getHours();
  const w = C.workHours;
  if (h >= w.start && h < w.end) return t;
  const r = new Date(d);
  r.setHours(w.resumeAt, 0, 0, 0);
  if (h >= w.end) r.setDate(r.getDate() + 1);
  return r.getTime();
}

/** Thời điểm vào bậc hiện tại: lùi trong lịch sử khi còn cùng bậc (bậc cũ đã gộp tính là 1). */
export function stageEnteredAt(c: Customer): number {
  const st = normStage(c.care_stage);
  const h = Array.isArray(c.care_stage_history) ? c.care_stage_history : [];
  let at = Number.NaN;
  for (let i = h.length - 1; i >= 0; i--) {
    const e = h[i];
    if (!e) continue;
    if (normStage(e.stage) !== st) break;
    const t = ms(e.at);
    if (!Number.isNaN(t)) at = t;
  }
  // `||` như v1: NaN (thiếu mốc) rơi xuống mốc kế tiếp.
  if (Number.isNaN(at)) at = ms(c.care_stage_updated_at) || ms(c.qualified_at) || ms(c.created_at);
  return at;
}

/** Giai đoạn SLA hiện tại → { key, start } hoặc null (ngoài phễu / đã loại). sla_anchor_at đặt lại đồng hồ. */
export function phaseOf(c: Customer | null | undefined): PhaseInfo | null {
  if (!c) return null;
  const anchor = ms(c.sla_anchor_at);
  const withAnchor = (t: number) => (Number.isNaN(anchor) || anchor < t ? t : anchor);
  if (!c.qualified_at) {
    if (c.disqualified_at) return null;
    const first = callAttemptsOf(c)[0];
    if (!first) return { key: 'new_lead', start: withAnchor(newLeadStart(ms(c.registered_at) || ms(c.created_at))) };
    return { key: 'approach', start: withAnchor(ms(first.at)) };
  }
  const st = normStage(c.care_stage);
  const key = C.order.find((k) => (C.phases[k] as { stage?: string }).stage === st);
  if (!key) return null;
  return { key, start: withAnchor(stageEnteredAt(c)) };
}

/** Khoảng thời gian → chữ ngắn: "5 phút", "3 giờ", "12 ngày", "2,5 tháng" (≥ 60 ngày). */
export function fmt(d: number): string {
  const v = Math.max(0, d);
  if (v < HOUR) return `${Math.max(1, Math.round(v / MIN))} phút`;
  if (v < DAY) return `${Math.round(v / HOUR)} giờ`;
  const n = Math.round(v / DAY);
  return n >= 60 ? `${(Math.round(n / 3) / 10).toString().replace('.', ',')} tháng` : `${n} ngày`;
}

/** Trạng thái SLA của 1 khách tại `now` → null (ngoài phễu / không có mốc). */
export function status(c: Customer | null | undefined, now: number): SlaStatus | null {
  const p = phaseOf(c);
  if (!p || Number.isNaN(p.start)) return null;
  const cfg = C.phases[p.key];
  const elapsed = now - p.start;
  let state: SlaState = 'ok';
  let text: string;
  if (elapsed < 0) text = `SLA tính từ ${new Date(p.start).getHours()}h`;
  else if (elapsed < cfg.target) text = `mục tiêu còn ${fmt(cfg.target - elapsed)}`;
  else if (elapsed < cfg.max) {
    state = 'warn';
    text = `quá mục tiêu · còn ${fmt(cfg.max - elapsed)}`;
  } else {
    state = 'over';
    text = `quá hạn ${fmt(elapsed - cfg.max)}`;
  }
  return { key: p.key, label: cfg.label, start: p.start, elapsed, target: cfg.target, max: cfg.max, state, text };
}

/** Checklist bậc Booking: hạn mỗi bước tính từ bước trước xong (bước 1 từ lúc vào bậc); chỉ bước đầu chưa xong có hạn. */
export function bookingSteps(c: Customer, now: number): BookingStepRow[] {
  const done = c.booking_steps && typeof c.booking_steps === 'object' ? c.booking_steps : {};
  let prev = stageEnteredAt(c);
  let blocked = false;
  return C.bookingSteps.map((s) => {
    const doneAt = ms(done[s.key]);
    const row: BookingStepRow = {
      key: s.key,
      label: s.label,
      text: s.text ?? '',
      doneAt: Number.isNaN(doneAt) ? null : doneAt,
      due: null,
      state: 'wait',
    };
    if (!Number.isNaN(doneAt)) {
      row.state = 'done';
      prev = doneAt;
      return row;
    }
    if (blocked || !s.days || Number.isNaN(prev)) {
      blocked = true;
      return row;
    }
    blocked = true; // các bước sau chờ bước này
    const warnAt = prev + s.days[0] * DAY;
    const due = prev + s.days[1] * DAY;
    row.due = due;
    row.state = now >= due ? 'over' : now >= warnAt ? 'warn' : 'ok';
    return row;
  });
}

/**
 * Có cần tự xử lý quá hạn mức không → { type, phase } | null. Chỉ giai đoạn có `auto` trong cấu hình
 * (CLAUDE.md §3.6 — không tự mở rộng). Đồng hồ auto = muộn hơn giữa (bắt đầu giai đoạn, autoSince)
 * → khách cũ không bị chuyển hàng loạt. 'drop': khách đã nói chuyện được ('talked') thì không tự loại.
 */
export function autoAction(c: Customer | null | undefined, now: number): AutoAction | null {
  const p = phaseOf(c);
  if (!p || !c) return null;
  const cfg: { auto?: 'drop' | 'nurture'; max: number } = C.phases[p.key];
  if (!cfg.auto) return null;
  const since = ms(C.autoSince);
  const start = Number.isNaN(since) ? p.start : Math.max(p.start, since);
  // start NaN (khách thiếu mọi mốc) → so sánh false → coi như quá hạn, giữ đúng hành vi v1.
  if (now - start < cfg.max) return null;
  if (cfg.auto === 'drop' && callAttemptsOf(c).some((a) => a.result === 'talked')) return null;
  return { type: cfg.auto, phase: p.key };
}
