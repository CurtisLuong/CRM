/**
 * Bậc phễu cho component giao diện mới (DESIGN.md §2). KHÔNG phải nguồn luật: tên bậc lấy từ
 * src/config/stages.ts, mục tiêu/hạn mức SLA từ src/config/velocity.ts (D-008), trạng thái SLA của một
 * khách từ src/domain/velocity (status). File này chỉ đổi chúng sang dạng component cần (giờ, bước, nhánh).
 */
import {
  CARE_STAGE_BRANCH,
  CARE_STAGE_DISPLAY,
  CARE_STAGE_DROPPED,
  CARE_STAGE_LEGACY,
  CARE_STAGE_NURTURE,
  CARE_STAGE_PICKER_ORDER,
  CARE_STAGE_WON,
  CARE_STAGES,
} from '@/config/stages';
import { HOUR, VELOCITY_CONFIG } from '@/config/velocity';
import type { Customer } from '@/domain/customer';
import { status } from '@/domain/velocity';
import { fmtDur } from './format';
import type { Level } from './signals';

/** Giá trị care_stage đã lưu (D-012: không đổi nghĩa). Kiểu string để chịu được bậc cũ/lạ trong dữ liệu. */
export type Stage = string;

export interface StageDef {
  id: Stage;
  label: string;
  /** 1…FUNNEL_STEPS trong phễu; bậc kết thúc = FUNNEL_STEPS + 1. */
  step: number;
  /** Nhánh rẽ (Nuôi dài hạn) — không tính SLA. */
  branch?: boolean;
  end?: 'won' | 'lost';
  /** Giờ: ideal = mục tiêu, max = hạn mức (VELOCITY_CONFIG). */
  sla?: { ideal: number; max: number };
}

/** Số bậc trong phễu chính (5). */
export const FUNNEL_STEPS = CARE_STAGES.length;

const SLA_BY_STAGE: Record<string, { ideal: number; max: number }> = Object.fromEntries(
  VELOCITY_CONFIG.order.map((key, i) => {
    const p = VELOCITY_CONFIG.phases[key];
    return [CARE_STAGES[i], { ideal: p.target / HOUR, max: p.max / HOUR }];
  }),
);

function build(id: Stage): StageDef {
  const label = CARE_STAGE_DISPLAY[id] ?? id;
  if (id === CARE_STAGE_WON) return { id, label, step: FUNNEL_STEPS + 1, end: 'won' };
  if (id === CARE_STAGE_DROPPED) return { id, label, step: FUNNEL_STEPS + 1, end: 'lost' };
  const branchOf = CARE_STAGE_BRANCH[id]?.of;
  if (branchOf) return { id, label, step: (CARE_STAGES as readonly string[]).indexOf(branchOf) + 1, branch: true };
  return { id, label, step: (CARE_STAGES as readonly string[]).indexOf(id) + 1, sla: SLA_BY_STAGE[id] };
}

/** Mọi bậc theo thứ tự ô chọn (Nuôi dài hạn ngay sau Đang chăm sóc). */
export const STAGES: readonly StageDef[] = CARE_STAGE_PICKER_ORDER.map(build);
const BY_ID = new Map(STAGES.map((s) => [s.id, s]));

/** Định nghĩa bậc; bậc cũ đã gộp → bậc mới; bậc lạ → nhãn = giá trị gốc, bước 0 (không vỡ màn). */
export function stageDef(stage: Stage | null | undefined): StageDef {
  const id = stage ? (CARE_STAGE_LEGACY[stage] ?? stage) : '';
  return BY_ID.get(id) ?? { id, label: id || 'Chưa có bậc', step: 0 };
}

export { CARE_STAGE_DROPPED as STAGE_LOST, CARE_STAGE_NURTURE as STAGE_NURTURE, CARE_STAGE_WON as STAGE_WON };
/** Phễu chính + bậc chốt, theo thứ tự (StagePath). */
export const STAGE_PATH: readonly Stage[] = [...CARE_STAGES, CARE_STAGE_WON];

export type SlaStatus = 'ideal' | 'within' | 'over' | 'none';
export interface SlaState {
  status: SlaStatus;
  level: Level | null;
  word: string;
  /** "1n 04h" (đã qua), "còn 2n 20h" (còn lại), "+2n 16h" (quá hạn) */
  time: string;
  ideal?: number;
  max?: number;
}

/** Trạng thái SLA sau `elapsedHours` ở `stage`. Ngưỡng giống src/domain/velocity: < mục tiêu → ok, < hạn mức → soon. */
export function slaFor(stage: Stage, elapsedHours: number, override?: { ideal?: number; max?: number }): SlaState {
  const st = stageDef(stage);
  if (!st.sla) return { status: 'none', level: null, word: 'Không tính SLA', time: fmtDur(elapsedHours) };
  const ideal = override?.ideal ?? st.sla.ideal;
  const max = override?.max ?? st.sla.max;
  if (elapsedHours < ideal)
    return { status: 'ideal', level: 'ok', word: 'Đúng mục tiêu', time: fmtDur(elapsedHours), ideal, max };
  if (elapsedHours < max)
    return {
      status: 'within',
      level: 'soon',
      word: 'Trong hạn',
      time: `còn ${fmtDur(max - elapsedHours)}`,
      ideal,
      max,
    };
  return { status: 'over', level: 'alert', word: 'Quá hạn', time: `+${fmtDur(elapsedHours - max)}`, ideal, max };
}

/**
 * Props cho <SlaMeter> của MỘT khách, tính bằng src/domain/velocity (khách mới đăng ký đêm, mốc sla_anchor_at…).
 * null = khách ngoài phễu / thiếu mốc → không hiện đồng hồ.
 */
export function slaMeterFor(
  c: Customer,
  now: number,
): { stage: Stage; elapsed: number; ideal: number; max: number } | null {
  const s = status(c, now);
  if (!s) return null;
  const i = VELOCITY_CONFIG.order.indexOf(s.key);
  return { stage: CARE_STAGES[i] ?? s.label, elapsed: s.elapsed / HOUR, ideal: s.target / HOUR, max: s.max / HOUR };
}

export function hoursBetween(from: Date | string | number, to: Date | string | number = new Date()): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 3600e3;
}
