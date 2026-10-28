/** The three urgency signals. Color in this app means time and urgency, nothing else. */
export type Level = "ok" | "soon" | "alert";

export const LEVEL_WORD: Record<Level, string> = {
  ok: "Đúng hẹn",
  soon: "Sắp tới",
  alert: "Quá hạn",
};

/** Signal for a due date: past → alert, within `soonHours` (default 24) → soon, else ok. */
export function signalFor(due: Date | string | number, now: Date | string | number = new Date(), soonHours = 24): Level {
  const d = new Date(due).getTime();
  const n = new Date(now).getTime();
  if (d < n) return "alert";
  return d - n <= soonHours * 3600e3 ? "soon" : "ok";
}

/** Sort weight: alert first, then soon, then ok. */
export const LEVEL_ORDER: Record<Level, number> = { alert: 0, soon: 1, ok: 2 };

/** Tailwind classes per level, so components never hand-pick signal colors. */
export const LEVEL_CLASS: Record<Level, { text: string; fill: string; tint: string; on: string; border: string }> = {
  ok: { text: "text-ok-text", fill: "fill-ok bg-ok", tint: "bg-ok-tint", on: "text-on-ok", border: "border-ok" },
  soon: { text: "text-soon-text", fill: "fill-soon bg-soon", tint: "bg-soon-tint", on: "text-on-soon", border: "border-soon" },
  alert: { text: "text-alert-text", fill: "fill-alert bg-alert", tint: "bg-alert-tint", on: "text-on-alert", border: "border-alert" },
};
