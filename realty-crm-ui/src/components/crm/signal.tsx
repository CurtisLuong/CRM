import { cn } from "@/lib/utils";
import { LEVEL_WORD, type Level } from "@/lib/crm";

const FILL: Record<Level, string> = { ok: "fill-ok", soon: "fill-soon", alert: "fill-alert" };

/** Shape carries meaning without color: ● ok, ◆ soon, ▲ alert. Alert pulses (stops under reduced motion). */
export function Glyph({ level, className, pulse }: { level: Level; className?: string; pulse?: boolean }) {
  return (
    <svg viewBox="0 0 10 10" aria-hidden className={cn("size-2.5 shrink-0", FILL[level], pulse && level === "alert" && "animate-signal-pulse", className)}>
      {level === "alert" ? <path d="M5 0.5 L9.6 9.2 L0.4 9.2 Z" /> : level === "soon" ? <path d="M5 0 L10 5 L5 10 L0 5 Z" /> : <circle cx="5" cy="5" r="4.5" />}
    </svg>
  );
}

const BADGE: Record<Level, string> = {
  ok: "bg-ok-tint text-ok-text",
  soon: "bg-soon-tint text-soon-text",
  alert: "bg-alert-tint text-alert-text",
};

/** The traffic light: glyph + short time text ("Trễ 2 ngày", "Còn 45:00"). Compute level with signalFor()/slaFor(). */
export function SignalBadge({ level, children, className, size = "md" }: { level: Level; children?: React.ReactNode; className?: string; size?: "md" | "sm" }) {
  return (
    <span
      title={LEVEL_WORD[level]}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 font-mono font-semibold tabular-nums",
        size === "md" ? "h-[26px] text-[13px]" : "h-[22px] text-xs",
        BADGE[level],
        className,
      )}
    >
      <Glyph level={level} pulse />
      <span>{children ?? LEVEL_WORD[level]}</span>
    </span>
  );
}
