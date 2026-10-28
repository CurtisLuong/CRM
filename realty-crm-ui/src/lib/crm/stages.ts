import { fmtDur } from "./format";
import type { Level } from "./signals";

/**
 * Pipeline: 5 steps; "nurture" (Chăm dài hạn) is a parallel branch off step 3;
 * "contract" (won) and "lost" both end the process at step 5.
 * SLA in hours: ideal = target, max = deadline. Nurture measures time since the last touch.
 * These are defaults — teams tune them (load from settings in the app).
 */
export type Stage = "new" | "approach" | "caring" | "nurture" | "booking" | "contract" | "lost";

export interface StageDef {
  id: Stage;
  label: string;
  step: 1 | 2 | 3 | 4 | 5;
  branch?: boolean;
  end?: "won" | "lost";
  sla?: { ideal: number; max: number };
  measure?: "stage" | "touch";
}

export const STAGES: StageDef[] = [
  { id: "new", label: "Đăng ký mới", step: 1, sla: { ideal: 0.25, max: 2 } },
  { id: "approach", label: "Đang tiếp cận", step: 2, sla: { ideal: 72, max: 168 } },
  { id: "caring", label: "Đang chăm sóc", step: 3, sla: { ideal: 336, max: 720 } },
  { id: "nurture", label: "Chăm dài hạn", step: 3, branch: true, sla: { ideal: 720, max: 1440 }, measure: "touch" },
  { id: "booking", label: "Booking & hồ sơ", step: 4, sla: { ideal: 168, max: 336 } },
  { id: "contract", label: "Ký HĐMB", step: 5, end: "won" },
  { id: "lost", label: "Loại", step: 5, end: "lost" },
];

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<Stage, StageDef>;

/** Allowed moves. Caring ⇄ nurture both ways; booking ends in contract or lost; anything open can go to lost. */
export const STAGE_MOVES: Record<Stage, Stage[]> = {
  new: ["approach", "lost"],
  approach: ["caring", "nurture", "lost"],
  caring: ["booking", "nurture", "lost"],
  nurture: ["caring", "lost"],
  booking: ["contract", "lost"],
  contract: [],
  lost: ["approach"],
};

export type SlaStatus = "ideal" | "within" | "over" | "none";
export interface SlaState {
  status: SlaStatus;
  level: Level | null;
  word: string;
  /** "1n 04h" (so far), "còn 2n 20h" (left), "+2n 16h" (overrun) */
  time: string;
  ideal?: number;
  max?: number;
}

/** SLA state after `elapsedHours` in `stage` (nurture: since the last touch). */
export function slaFor(stage: Stage, elapsedHours: number, override?: { ideal?: number; max?: number }): SlaState {
  const st = STAGE_BY_ID[stage];
  if (!st?.sla) return { status: "none", level: null, word: "Kết thúc", time: fmtDur(elapsedHours) };
  const ideal = override?.ideal ?? st.sla.ideal;
  const max = override?.max ?? st.sla.max;
  if (elapsedHours <= ideal) return { status: "ideal", level: "ok", word: "Lý tưởng", time: fmtDur(elapsedHours), ideal, max };
  if (elapsedHours <= max) return { status: "within", level: "soon", word: "Trong hạn", time: `còn ${fmtDur(max - elapsedHours)}`, ideal, max };
  return { status: "over", level: "alert", word: "Quá hạn", time: `+${fmtDur(elapsedHours - max)}`, ideal, max };
}

export function hoursBetween(from: Date | string, to: Date | string = new Date()): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 3600e3;
}
