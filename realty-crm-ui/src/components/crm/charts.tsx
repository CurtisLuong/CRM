import * as React from "react";
import { Bar, BarChart as RBarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_BY_ID, fmtLimit, fmtPct, type Level, type Stage } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartLegend, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Glyph, SignalBadge } from "./signal";
import { StageChip } from "./stage";

export interface Sample { n: number; /** Below this, flag "Mẫu nhỏ". Default 10. */ min?: number }

export function SampleBadge({ n, min = 10 }: Sample) {
  if (n >= min) return null;
  return (
    <span title={`Cỡ mẫu nhỏ hơn ${min}: chỉ để tham khảo, không rút bài học`} className="inline-flex h-[22px] items-center whitespace-nowrap rounded-sm border border-dashed border-ink-muted px-2 font-mono text-[11px] font-semibold text-ink-muted">
      Mẫu nhỏ · n={n}
    </span>
  );
}

/**
 * Frame for every chart. Fixed order: what it measures → takeaway sentence with a number → ("Cách tính" on demand)
 * → legend → chart → footer + link to the customers behind it. Never write a headline from a small sample.
 */
export function ChartCard({
  title, period, headline, headlineLevel, definition, sample, legend, footer, action, children, className,
}: {
  title: React.ReactNode;
  period?: React.ReactNode;
  headline?: React.ReactNode;
  headlineLevel?: Level;
  definition?: React.ReactNode;
  sample?: Sample;
  legend?: { color?: string; label: React.ReactNode; hatched?: boolean }[];
  footer?: React.ReactNode;
  action?: { label: string; onClick?: () => void };
  children?: React.ReactNode;
  className?: string;
}) {
  const [def, setDef] = React.useState(false);
  return (
    <section className={cn("flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface-100 px-5 py-4 text-ink", className)}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
          <h3 className="m-0 flex flex-wrap items-baseline gap-2 text-overline">
            {title}
            {period && <span className="normal-case tracking-[0.02em]">{period}</span>}
          </h3>
          {headline && (
            <p className="m-0 flex items-center gap-2 text-[17px] font-semibold leading-6">
              {headlineLevel && <Glyph level={headlineLevel} />}
              {headline}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sample && <SampleBadge {...sample} />}
          {definition && (
            <Button variant="ghost" size="sm" aria-expanded={def} onClick={() => setDef(!def)}>
              <Info />
              Cách tính
            </Button>
          )}
        </div>
      </header>
      {def && definition && <p className="m-0 rounded-sm border border-line bg-surface-0 px-3 py-2.5 text-[13px] leading-[19px] text-ink-muted">{definition}</p>}
      {legend && <ChartLegend items={legend} />}
      <div className="relative min-w-0">{children}</div>
      {(footer || action) && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
          {footer && <span className="text-caption text-ink-muted">{footer}</span>}
          {action && (
            <button type="button" onClick={action.onClick} className="cursor-pointer text-[13px] font-semibold text-ion hover:underline">
              {action.label} →
            </button>
          )}
        </footer>
      )}
    </section>
  );
}

/** KPI tile: value + unit, what it's a fraction of, change in words, sample size, link. value=null → "—" + reason. */
export function MetricCard({
  label, value, unit, fraction, delta, level, sample, action, emptyText = "Chưa đủ dữ liệu",
}: {
  label: string;
  value: React.ReactNode | null;
  unit?: string;
  fraction?: React.ReactNode;
  delta?: { dir: "up" | "down"; text: string; good?: boolean };
  level?: Level;
  sample?: Sample;
  action?: { label: string; onClick?: () => void };
  emptyText?: string;
}) {
  const empty = value == null || value === "";
  const good = delta ? (delta.good ?? delta.dir === "up") : false;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface-100 px-4 py-3.5", level === "alert" && "border-alert shadow-glow-alert")}>
      <span className="flex items-center gap-1.5 text-overline">
        {level && <Glyph level={level} />}
        {label}
      </span>
      <span className={cn("text-[30px] font-bold leading-9 tracking-tight tabular-nums", empty && "text-ink-muted")}>
        {empty ? "—" : value}
        {!empty && unit && <small className="ml-1 text-sm font-medium tracking-normal text-ink-muted">{unit}</small>}
      </span>
      <span className="text-caption text-ink-muted">{empty ? emptyText : fraction}</span>
      {delta && !empty && (
        <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", good ? "text-ok-text" : "text-alert-text")}>
          {delta.dir === "down" ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />}
          {delta.text}
        </span>
      )}
      {sample && <span className="self-start"><SampleBadge {...sample} /></span>}
      {action && (
        <button type="button" onClick={action.onClick} className="mt-0.5 cursor-pointer self-start text-xs font-semibold text-ion hover:underline">
          {action.label} →
        </button>
      )}
    </div>
  );
}

/**
 * Bars (Recharts via shadcn ChartContainer). series colors: chart-1 for one series; chart-1 + chart-prev for this vs previous;
 * max 3 series (chart-1..3); never signal colors. Bars with n < minSample are hatched + flagged in the tooltip.
 */
export function BarChart<D extends { label: string; n?: number; sub?: string }>({
  data, series = [{ key: "value", label: "Giá trị", color: "var(--chart-1)" }], layout = "vertical", height = 220, minSample, max, format = (v) => String(v ?? "—"),
}: {
  data: D[];
  series?: { key: string; label: string; color: string }[];
  /** vertical = columns; horizontal = bars with long labels (sources) */
  layout?: "vertical" | "horizontal";
  height?: number;
  minSample?: number;
  max?: number;
  format?: (v: number | null | undefined) => string;
}) {
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }])) as ChartConfig;
  const small = (d: D) => minSample != null && d.n != null && d.n < minSample;
  const horiz = layout === "horizontal";
  const tick = (props: { x: number; y: number; payload: { value: string } }) => {
    const d = data.find((x) => x.label === props.payload.value);
    return (
      <g transform={`translate(${props.x},${props.y})`}>
        <text textAnchor="middle" dy={14} className="fill-ink-muted text-xs">{props.payload.value}</text>
        {d?.sub && <text textAnchor="middle" dy={30} className="fill-ink-muted font-mono text-[11px]">{d.sub}</text>}
      </g>
    );
  };
  return (
    <ChartContainer config={config} style={{ height }}>
      <RBarChart data={data} layout={horiz ? "vertical" : "horizontal"} margin={{ top: 20, right: horiz ? 56 : 8, bottom: 8, left: horiz ? 8 : 8 }} barGap={2} barCategoryGap={horiz ? "24%" : "28%"}>
        <defs>
          {series.map((s) => (
            <pattern key={s.key} id={`hatch-${s.key}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="transparent" />
              <rect width="2" height="6" fill={s.color} />
            </pattern>
          ))}
        </defs>
        <CartesianGrid vertical={horiz} horizontal={!horiz} strokeDasharray="0" />
        {horiz ? (
          <>
            <XAxis type="number" hide domain={[0, max ?? "auto"]} />
            <YAxis type="category" dataKey="label" width={120} tickLine={false} axisLine={false} tick={{ fontSize: 13 }} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--ink-muted)" }} height={data.some((d) => d.sub) ? 40 : 24} tick={tick} interval={0} />
            <YAxis hide domain={[0, max ?? "auto"]} />
          </>
        )}
        <ChartTooltip cursor content={<ChartTooltipContent formatter={(v) => format(v as number)} note={(row) => (small(row as D) ? `Mẫu nhỏ: ${(row as D).n} — chỉ tham khảo` : null)} />} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={horiz ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={28}>
            {data.map((d, i) => (
              <Cell key={i} fill={small(d) ? `url(#hatch-${s.key})` : `var(--color-${s.key})`} stroke={small(d) ? s.color : undefined} />
            ))}
            <LabelList dataKey={s.key} position={horiz ? "right" : "top"} formatter={(v: number) => format(v)} fill="var(--ink)" className="font-mono text-[11px] font-semibold" />
          </Bar>
        ))}
      </RBarChart>
    </ChartContainer>
  );
}

/** Funnel: reached / total, step conversion, the worst drop flagged, avg time in stage, SLA breaches (the only red). */
export function FunnelChart({ steps, total: totalIn, outside }: { steps: { label: string; count: number; avg?: string; overdue?: number }[]; total?: number; outside?: { label: string; count: number }[] }) {
  const total = totalIn ?? steps[0]?.count ?? 1;
  let worst = -1;
  let worstRate = 2;
  steps.forEach((s, i) => {
    if (i > 0 && steps[i - 1].count > 0) {
      const r = s.count / steps[i - 1].count;
      if (r < worstRate) { worstRate = r; worst = i; }
    }
  });
  return (
    <div className="flex flex-col">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].count : null;
        const w = (s.count / total) * 100;
        return (
          <React.Fragment key={s.label}>
            {i > 0 && (
              <div className={cn("flex h-[22px] items-center gap-2 pl-[148px] font-mono text-[11px] text-ink-muted max-sm:pl-28", i === worst && "text-alert-text")}>
                <span aria-hidden className="text-line">↓</span>
                <span className={cn("font-semibold text-ink", i === worst && "text-alert-text")}>{prev ? fmtPct((s.count / prev) * 100) : "—"}</span>
                <span>{prev ? `rơi ${prev - s.count}` : ""}</span>
                {i === worst && (
                  <span className="inline-flex items-center gap-1 rounded-[4px] bg-alert-tint px-1.5 font-sans font-semibold text-alert-text">
                    <Glyph level="alert" className="size-2" />
                    Rơi nhiều nhất
                  </span>
                )}
              </div>
            )}
            <div className="grid min-h-9 grid-cols-[132px_minmax(0,1fr)_76px_108px] items-center gap-3 rounded-sm px-1 hover:bg-surface-200/60 max-sm:grid-cols-[96px_minmax(0,1fr)]">
              <span className="text-right text-[13px] font-semibold">{s.label}</span>
              <span className="flex h-6 items-center gap-2">
                <span className="h-full rounded-r-[4px] bg-chart-1" style={{ width: `${Math.max(w, s.count ? 1.5 : 0)}%` }} />
                <span className="whitespace-nowrap font-mono text-xs text-ink-muted">
                  <b className="font-semibold text-ink">{s.count}</b> · {fmtPct(w)}
                </span>
              </span>
              <span className="text-right font-mono text-xs text-ink-muted max-sm:hidden">{s.avg ?? "—"}</span>
              <span className="flex justify-end text-xs max-sm:hidden">
                {s.overdue ? <SignalBadge level="alert" size="sm">{s.overdue} quá SLA</SignalBadge> : <span className="text-ink-muted">0 quá SLA</span>}
              </span>
            </div>
          </React.Fragment>
        );
      })}
      {outside && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3">
          <span className="text-overline">Ngoài phễu</span>
          {outside.map((o) => (
            <span key={o.label} className="inline-flex h-6 items-center gap-1.5 rounded-sm bg-surface-200 px-2 text-xs font-medium text-ink-muted">
              {o.label}
              <b className="font-mono text-ink">{o.count}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Customers per stage split by SLA state. Signal colors are right here — this chart IS the SLA signal. */
export function StageAgingChart({ rows }: { rows: { stage: Stage; ok?: number; soon?: number; alert?: number; onClick?: () => void }[] }) {
  const max = Math.max(1, ...rows.map((r) => (r.ok ?? 0) + (r.soon ?? 0) + (r.alert ?? 0)));
  const parts = [
    { k: "ok" as const, label: "Lý tưởng", cls: "bg-ok text-on-ok" },
    { k: "soon" as const, label: "Trong hạn", cls: "bg-soon text-on-soon" },
    { k: "alert" as const, label: "Quá hạn", cls: "bg-alert text-on-alert" },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => {
        const st = STAGE_BY_ID[r.stage];
        const tot = (r.ok ?? 0) + (r.soon ?? 0) + (r.alert ?? 0);
        return (
          <button key={r.stage} type="button" onClick={r.onClick} title={parts.map((p) => `${p.label}: ${r[p.k] ?? 0}`).join(" · ")}
            className="grid min-h-[34px] cursor-pointer grid-cols-[180px_minmax(0,1fr)_80px] items-center gap-3 rounded-sm px-1 text-left hover:bg-surface-200/60 max-sm:grid-cols-[140px_minmax(0,1fr)]">
            <StageChip stage={r.stage} />
            <span className="flex h-[22px] items-stretch gap-0.5">
              {tot ? parts.map((p) => (r[p.k] ? (
                <span key={p.k} className={cn("grid min-w-[22px] place-items-center rounded-[3px] font-mono text-[11px] font-bold", p.cls)} style={{ width: `${((r[p.k] ?? 0) / max) * 100}%` }}>{r[p.k]}</span>
              ) : null)) : <span className="self-center text-xs text-ink-muted">0 khách</span>}
            </span>
            <span className="text-right font-mono text-[11px] text-ink-muted max-sm:hidden">{st.sla ? `${fmtLimit(st.sla.ideal)} · ${fmtLimit(st.sla.max)}` : ""}</span>
          </button>
        );
      })}
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-medium text-ink-muted">
        {parts.map((p) => <span key={p.k} className="inline-flex items-center gap-1.5"><Glyph level={p.k} />{p.label}</span>)}
      </div>
    </div>
  );
}

/** Rate table (source × step, cohort × outcome): "13/56" + %, tint grows with the rate (chart-1, 6–50%), small samples muted. */
export function MatrixTable({ columns, rows, rowHeader = "", minSample = 5, caption }: {
  columns: string[];
  rows: { label: string; meta?: string; cells: ({ num: number; den: number } | { status: string } | null)[] }[];
  rowHeader?: string;
  minSample?: number;
  caption?: string;
}) {
  return (
    <div className="overflow-auto rounded-md border border-line bg-surface-100">
      <table className="w-full border-separate border-spacing-0 text-[13px] text-ink">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            <th className="h-8 border-b border-line bg-surface-200 px-3 text-left text-overline">{rowHeader}</th>
            {columns.map((c) => <th key={c} className="h-8 border-b border-line bg-surface-200 px-3 text-right text-overline">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="[&:last-child>*]:border-b-0">
              <th scope="row" className="h-11 border-b border-line px-3 text-left font-normal">
                <span className="font-semibold">{r.label}</span>
                {r.meta && <span className="block font-mono text-[11px] text-ink-muted">{r.meta}</span>}
              </th>
              {r.cells.map((c, i) => {
                if (!c || "status" in c) return <td key={i} className="border-b border-line px-3 text-right text-ink-muted">{c?.status ?? "—"}</td>;
                const rate = c.den ? c.num / c.den : null;
                const small = c.den < minSample;
                const mix = rate != null && !small ? Math.round(6 + rate * 44) : 0;
                return (
                  <td key={i} title={small ? `Mẫu nhỏ: ${c.den}` : undefined} className="border-b border-line px-3 text-right"
                    style={mix ? { background: `color-mix(in srgb, var(--chart-1) ${mix}%, transparent)` } : undefined}>
                    <span className={cn("block font-mono text-[13px]", small && "text-ink-muted")}>{c.num}/{c.den}</span>
                    <span className={cn("block font-mono text-[11px]", small ? "text-ink-muted" : "text-ink/80")}>{rate == null ? "—" : fmtPct(rate * 100)}{small && " · ít"}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Rule-based observations: the problem with its number, the evidence, one action. Max 3, worst first, enough sample only. */
export function InsightList({ items }: { items: { level?: Level; title: React.ReactNode; evidence?: React.ReactNode; action?: { label: string; onClick?: () => void } }[] }) {
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {items.map((it, i) => (
        <li key={i} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line py-3 first:border-t-0 first:pt-1">
          <Glyph level={it.level ?? "soon"} className="mt-1.5 self-start" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold">{it.title}</span>
            {it.evidence && <span className="text-[13px] text-ink-muted">{it.evidence}</span>}
          </div>
          {it.action && <Button size="sm" variant={it.level === "alert" ? "alert" : "secondary"} onClick={it.action.onClick}>{it.action.label}</Button>}
        </li>
      ))}
    </ul>
  );
}
