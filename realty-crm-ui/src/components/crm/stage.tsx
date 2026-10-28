import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_BY_ID, STAGES, fmtDur, fmtLimit, hoursBetween, slaFor, type Stage } from "@/lib/crm";
import { Glyph } from "./signal";

/** Where a deal is: 5 ion segments + name. Neutral on purpose — urgency lives in SignalBadge / SlaMeter. */
export function StageChip({ stage, children, className }: { stage: Stage; children?: React.ReactNode; className?: string }) {
  const st = STAGE_BY_ID[stage];
  const lost = st.end === "lost";
  const won = st.end === "won";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-2 whitespace-nowrap rounded-sm border border-line bg-surface-100 px-2 text-xs font-medium text-ink",
        st.branch && "border-dashed",
        won && "border-ion",
        lost && "text-ink-muted",
        className,
      )}
    >
      {lost ? (
        <X className="size-3" strokeWidth={3} />
      ) : (
        <span className="inline-flex gap-0.5" aria-hidden>
          {[1, 2, 3, 4, 5].map((n) => (
            <i
              key={n}
              className={cn(
                "h-2 w-1.5 rounded-[1px]",
                n <= st.step ? (st.branch && n === 3 ? "outline-1 -outline-offset-1 outline-dashed outline-ion" : "bg-ion") : "bg-surface-200 outline-1 -outline-offset-1 outline-line",
              )}
            />
          ))}
        </span>
      )}
      {won && <Check className="size-3 text-ion" strokeWidth={3} />}
      {children ?? st.label}
    </span>
  );
}

const SLA_TONE = {
  ok: { fill: "bg-ok", text: "text-ok-text" },
  soon: { fill: "bg-soon", text: "text-soon-text" },
  alert: { fill: "bg-alert", text: "text-alert-text" },
} as const;

/** Time in stage against the stage SLA: green ideal, yellow within deadline, red overdue with the overrun counting up. */
export function SlaMeter({
  stage, elapsed, since, now, ideal, max, total, compact,
}: {
  stage: Stage;
  /** Hours in stage (nurture: since last touch). Or pass `since`. */
  elapsed?: number;
  since?: Date | string;
  now?: Date | string;
  ideal?: number;
  max?: number;
  /** Cycle time in hours, shown on ended deals. */
  total?: number;
  compact?: boolean;
}) {
  const st = STAGE_BY_ID[stage];
  const hrs = elapsed ?? (since ? hoursBetween(since, now ?? new Date()) : 0);
  const s = slaFor(stage, hrs, { ideal, max });
  if (s.status === "none" || !s.level) {
    return (
      <span className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-muted">
        {st.end === "won" ? "Đã chốt" : "Đã đóng"}
        {total != null && <span className="font-mono">tổng {fmtDur(total)}</span>}
      </span>
    );
  }
  const scale = s.max! * 1.25;
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const tone = SLA_TONE[s.level];
  const bar = (
    <span aria-hidden className={cn("relative block rounded-[3px] bg-surface-200 outline-1 -outline-offset-1 outline-line", compact ? "h-1 w-12" : "h-1.5 w-full")}>
      <span className={cn("absolute inset-y-0 left-0 rounded-[3px]", tone.fill)} style={{ width: pct(hrs) }} />
      <span className="absolute -inset-y-[3px] w-0.5 -translate-x-1/2 rounded-[1px] bg-ink-muted" style={{ left: pct(s.ideal!) }} />
      <span className="absolute -inset-y-[3px] w-0.5 -translate-x-1/2 rounded-[1px] bg-ink" style={{ left: pct(s.max!) }} />
    </span>
  );
  const label = `${st.measure === "touch" ? "Từ lần chạm cuối" : "Ở stage"} · ${fmtDur(hrs)}`;
  if (compact) {
    return (
      <span className={cn("inline-flex items-center gap-1.5", tone.text)} title={`${s.word} · ${label} · SLA ${fmtLimit(s.ideal!)} / ${fmtLimit(s.max!)}`}>
        <Glyph level={s.level} pulse />
        <span className="text-countdown">{s.time}</span>
        {bar}
      </span>
    );
  }
  return (
    <div className="flex min-w-56 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-semibold", tone.text)}>
          <Glyph level={s.level} pulse />
          {s.word}
          <span className="text-countdown">{s.time}</span>
        </span>
        <span className="font-mono text-[11px] text-ink-muted">
          SLA {fmtLimit(s.ideal!)} · {fmtLimit(s.max!)}
        </span>
      </div>
      {bar}
      <span className="font-mono text-[11px] text-ink-muted">{label}</span>
    </div>
  );
}

/** The whole pipeline map with the Chăm dài hạn branch and both endings; marks the current stage. ~640px wide. */
export function StagePath({ stage }: { stage: Stage }) {
  const cur = STAGE_BY_ID[stage];
  const main: Stage[] = ["new", "approach", "caring", "booking", "contract"];
  const state = (id: Stage): "done" | "current" | "todo" => {
    const st = STAGE_BY_ID[id];
    if (id === stage) return "current";
    if (cur.end === "lost" && id === "contract") return "todo";
    if (cur.branch) return st.step < 3 || id === "caring" ? "done" : "todo";
    if (cur.end && id !== "nurture" && id !== "lost") return st.step <= cur.step ? "done" : "todo";
    return !st.branch && !st.end && st.step < cur.step ? "done" : "todo";
  };
  const Node = ({ id }: { id: Stage }) => {
    const st = STAGE_BY_ID[id];
    const ss = state(id);
    const mark =
      ss === "done" || (ss === "current" && st.end === "won") ? <Check className="size-3.5" strokeWidth={3} /> : st.end === "lost" ? <X className="size-3.5" strokeWidth={3} /> : st.branch ? "3b" : st.step;
    return (
      <div className="flex max-w-36 flex-col items-center gap-1 text-center" aria-current={ss === "current" ? "step" : undefined}>
        <span
          className={cn(
            "relative z-[1] grid size-8 place-items-center rounded-full border-2 border-line bg-surface-100 font-mono text-xs font-semibold text-ink-muted",
            st.branch && "border-dashed",
            ss === "done" && "border-ion bg-ion text-on-ion",
            ss === "current" && "border-ion text-ion shadow-glow-ion",
            ss === "current" && st.end === "won" && "bg-ion text-on-ion",
            ss === "current" && st.end === "lost" && "border-ink-muted bg-surface-200 text-ink shadow-none",
          )}
        >
          {mark}
        </span>
        <span className={cn("text-[13px] font-semibold", ss === "todo" ? "text-ink-muted" : ss === "current" && !st.end ? "text-ion" : "text-ink")}>{st.label}</span>
        <span className="font-mono text-[11px] text-ink-muted">
          {st.sla ? `${st.measure === "touch" ? "chạm ≤ " : ""}${fmtLimit(st.sla.ideal)} · ${fmtLimit(st.sla.max)}` : st.end === "won" ? "Kết thúc · chốt" : "Kết thúc · không chốt"}
        </span>
      </div>
    );
  };
  return (
    <div className="flex min-w-[640px] flex-col gap-1 p-4">
      <div className="grid grid-cols-5">
        {main.map((id, i) => (
          <div key={id} className="relative flex justify-center">
            {i < main.length - 1 && (
              <span className={cn("absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-[15px] h-0.5", state(id) === "done" ? "bg-ion" : "bg-line")} />
            )}
            <Node id={id} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5">
        <div />
        <div />
        <div className="relative flex justify-center pt-5 before:absolute before:top-0 before:left-1/2 before:h-5 before:border-l-2 before:border-dashed before:border-line">
          <Node id="nurture" />
        </div>
        <div />
        <div className="relative flex justify-center pt-5 before:absolute before:top-0 before:left-1/2 before:h-5 before:border-l-2 before:border-dashed before:border-line">
          <Node id="lost" />
        </div>
      </div>
    </div>
  );
}

export { STAGES };
