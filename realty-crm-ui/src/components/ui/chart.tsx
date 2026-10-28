import * as React from "react";
import * as Recharts from "recharts";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui chart primitives (Recharts underneath), wired to the Realty chart tokens.
 * config = { now: { label: "Tuần này", color: "var(--chart-1)" }, prev: { label: "Tuần trước", color: "var(--chart-prev)" } }
 * → each key becomes --color-<key> inside the container; use fill="var(--color-now)".
 */
export type ChartConfig = Record<string, { label: React.ReactNode; color: string }>;

const ChartContext = React.createContext<ChartConfig | null>(null);
export function useChart() {
  const c = React.useContext(ChartContext);
  if (!c) throw new Error("useChart must be used inside <ChartContainer>");
  return c;
}

export function ChartContainer({
  config,
  className,
  children,
  style: styleProp,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { config: ChartConfig; children: React.ComponentProps<typeof Recharts.ResponsiveContainer>["children"] }) {
  const style = Object.fromEntries(Object.entries(config).map(([k, v]) => [`--color-${k}`, v.color])) as React.CSSProperties;
  return (
    <ChartContext.Provider value={config}>
      <div
        className={cn(
          "aspect-auto h-56 w-full text-xs",
          "[&_.recharts-cartesian-grid_line]:stroke-line [&_.recharts-cartesian-axis-tick_text]:fill-ink-muted [&_.recharts-cartesian-axis-tick_text]:font-sans",
          "[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-surface-200 [&_.recharts-label]:fill-ink [&_.recharts-label-list_text]:fill-ink [&_.recharts-label-list_text]:font-mono",
          className,
        )}
        {...props}
        style={{ ...style, ...styleProp }}
      >
        <Recharts.ResponsiveContainer>{children}</Recharts.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = Recharts.Tooltip;

interface TooltipPayloadItem { dataKey?: string | number; name?: string; value?: number | string; payload?: Record<string, unknown> }
export function ChartTooltipContent({
  active,
  payload,
  label,
  formatter,
  note,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: React.ReactNode;
  formatter?: (v: number | string | undefined, key: string) => React.ReactNode;
  note?: (row: Record<string, unknown>) => React.ReactNode;
}) {
  const config = useChart();
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  return (
    <div className="flex min-w-36 flex-col gap-1 rounded-sm border border-line bg-surface-200 px-2.5 py-2 text-xs text-ink shadow-overlay">
      <span className="font-semibold">{label}</span>
      {payload.map((p) => {
        const key = String(p.dataKey ?? p.name);
        return (
          <span key={key} className="flex items-center gap-1.5">
            <i className="size-2 rounded-[2px]" style={{ background: `var(--color-${key})` }} />
            <span className="flex-1 text-ink-muted">{config[key]?.label ?? key}</span>
            <b className="font-mono font-semibold">{formatter ? formatter(p.value, key) : p.value}</b>
          </span>
        );
      })}
      {note && note(row) && <span className="text-[11px] text-soon-text">{note(row)}</span>}
    </div>
  );
}

export function ChartLegend({ items }: { items: { color?: string; label: React.ReactNode; hatched?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-medium text-ink-muted">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <i
            className={cn("size-2.5 rounded-[2px]", it.hatched && "bg-hatch text-ink-muted shadow-[inset_0_0_0_1px_currentColor]")}
            style={it.hatched ? undefined : { background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
