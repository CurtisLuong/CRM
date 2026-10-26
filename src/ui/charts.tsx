import type { ReactNode } from 'react';
import { lazy, Suspense } from 'react';
import type { TooltipContentProps } from 'recharts';

export type InsightChartRow = {
  label: string;
  value?: number | null;
  previous?: number;
  retention?: number | null;
  numerator?: number;
  denominator?: number;
  percent?: number | null;
  onTime?: number;
  near?: number;
  overdue?: number;
};

export type InsightChartColumn = {
  key: keyof InsightChartRow;
  label: string;
  unit?: string;
};

export type InsightChartKind = 'funnel' | 'weekly' | 'rate' | 'sla' | 'source';

type InsightChartProps = {
  kind: InsightChartKind;
  title: string;
  data: readonly InsightChartRow[];
  columns: readonly InsightChartColumn[];
  className?: string;
};

const LazyPlot = lazy(() =>
  import('recharts').then((charts) => ({
    default: function RechartsPlot({ kind, data }: Pick<InsightChartProps, 'kind' | 'data'>) {
      const { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } = charts;
      const rows = [...data];
      const fmt = (value: number) => value.toLocaleString('vi-VN');
      const renderTooltip = (props: TooltipContentProps) => (
        <ChartTooltip active={props.active} payload={props.payload} label={props.label} kind={kind} />
      );

      if (kind === 'weekly')
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 22, right: 8, bottom: 2, left: 0 }} barGap={3}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--text-3)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                interval={0}
              />
              <YAxis hide allowDecimals={false} />
              <Tooltip content={renderTooltip} cursor={{ fill: 'var(--surface-2)' }} />
              <Legend
                verticalAlign="top"
                align="right"
                height={24}
                formatter={(value) => <span style={{ color: 'var(--text-2)', fontSize: 12 }}>{value}</span>}
              />
              <Bar dataKey="value" name="Tuần này" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={22}>
                <LabelList
                  dataKey="value"
                  position="top"
                  fill="var(--text)"
                  fontSize={11}
                  formatter={(value) => fmt(Number(value))}
                />
              </Bar>
              <Bar dataKey="previous" name="Tuần trước" fill="var(--text-3)" radius={[4, 4, 0, 0]} maxBarSize={22}>
                <LabelList
                  dataKey="previous"
                  position="top"
                  fill="var(--text-2)"
                  fontSize={11}
                  formatter={(value) => fmt(Number(value))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      if (kind === 'funnel' || kind === 'source')
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 84, bottom: 4, left: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                width={124}
                tick={{ fill: 'var(--text-2)', fontSize: 11.5 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={renderTooltip} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar
                dataKey="value"
                name={kind === 'funnel' ? 'Khách đã tới bậc' : 'Khách'}
                fill="var(--accent)"
                radius={[0, 5, 5, 0]}
              >
                <LabelList
                  position="right"
                  fill="var(--text)"
                  fontSize={11}
                  valueAccessor={(_entry, index) => {
                    const value = rows[index]?.value;
                    const row = rows[index];
                    if (kind === 'funnel' && value != null) {
                      const retention = row?.retention;
                      return `${fmt(value)}${retention == null ? ' khách' : ` · ${retention}%`}`;
                    }
                    const percent = row?.percent;
                    return `${fmt(value ?? 0)} · ${percent == null ? '—' : `${percent}%`}`;
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      if (kind === 'sla')
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 10, bottom: 4, left: 0 }} barSize={20}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                width={124}
                tick={{ fill: 'var(--text-2)', fontSize: 11.5 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={renderTooltip} cursor={{ fill: 'var(--surface-2)' }} />
              <Legend
                verticalAlign="top"
                align="right"
                height={26}
                formatter={(value) => <span style={{ color: 'var(--text-2)', fontSize: 11 }}>{value}</span>}
              />
              <Bar dataKey="onTime" name="Trong mục tiêu" stackId="sla" fill="var(--success)" isAnimationActive={false}>
                <LabelList dataKey="onTime" position="inside" fill="var(--surface)" fontSize={10} />
              </Bar>
              <Bar dataKey="near" name="Sắp hạn" stackId="sla" fill="var(--warning)" isAnimationActive={false}>
                <LabelList dataKey="near" position="inside" fill="var(--text)" fontSize={10} />
              </Bar>
              <Bar
                dataKey="overdue"
                name="Quá hạn"
                stackId="sla"
                fill="var(--danger)"
                radius={[0, 5, 5, 0]}
                isAnimationActive={false}
              >
                <LabelList dataKey="overdue" position="inside" fill="var(--surface)" fontSize={10} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 16, right: 10, bottom: 2, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--text-3)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              interval={0}
            />
            <YAxis hide domain={[0, 100]} />
            <Tooltip content={renderTooltip} cursor={{ fill: 'var(--surface-2)' }} />
            <Bar dataKey="value" name="Tỉ lệ" fill="var(--accent)" radius={[5, 5, 0, 0]} maxBarSize={42}>
              <LabelList
                dataKey="value"
                position="top"
                fill="var(--text)"
                fontSize={11}
                formatter={(value) => (value == null ? '—' : `${value}%`)}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    },
  })),
);

function ChartTooltip({
  active,
  payload,
  label,
  kind,
}: Pick<TooltipContentProps, 'active' | 'payload' | 'label'> & { kind: InsightChartKind }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as InsightChartRow | undefined;
  if (!row) return null;
  let details: ReactNode;
  if (kind === 'weekly') {
    details = (
      <>
        <p>Tuần này: {row.value ?? 0}</p>
        <p>Tuần trước: {row.previous ?? 0}</p>
      </>
    );
  } else if (kind === 'funnel') {
    details = (
      <p>
        {fmt(row.value ?? 0)} khách · giữ lại {row.retention == null ? '—' : `${row.retention}%`}
      </p>
    );
  } else if (kind === 'sla') {
    details = (
      <>
        <p>Trong mục tiêu: {row.onTime ?? 0}</p>
        <p>Sắp hạn: {row.near ?? 0}</p>
        <p>Quá hạn: {row.overdue ?? 0}</p>
      </>
    );
  } else if (kind === 'source') {
    details = (
      <p>
        {row.numerator ?? 0}/{row.denominator ?? 0} Đạt · {row.percent ?? '—'}%
      </p>
    );
  } else {
    details = (
      <p>
        {row.numerator ?? 0}/{row.denominator ?? 0} · {row.percent ?? '—'}%
      </p>
    );
  }
  return (
    <div className="rounded-control border border-border bg-surface px-3 py-2 text-small text-text shadow-e1">
      <p className="mb-1 text-body-strong">{label}</p>
      {details}
    </div>
  );
}

function fmt(value: number) {
  return value.toLocaleString('vi-VN');
}

function hasEnoughData(kind: InsightChartKind, rows: readonly InsightChartRow[]) {
  const populated = rows.filter((row) => {
    if (kind === 'weekly') return (row.value ?? 0) > 0 || (row.previous ?? 0) > 0;
    if (kind === 'sla') return (row.onTime ?? 0) + (row.near ?? 0) + (row.overdue ?? 0) > 0;
    if (kind === 'rate') return row.denominator != null && row.denominator > 0 && row.value != null;
    return (row.value ?? 0) > 0;
  });
  return populated.length > 1;
}

export function InsightChart({ kind, title, data, columns, className }: InsightChartProps) {
  if (!hasEnoughData(kind, data))
    return <p className={className ?? 'text-small text-text-3'}>{title} · Chưa đủ dữ liệu để vẽ biểu đồ.</p>;

  const height = kind === 'funnel' || kind === 'sla' || kind === 'source' ? 236 : 224;
  return (
    <figure className={`min-w-0 ${className ?? ''}`} data-testid={`insights-chart-${kind}`}>
      <figcaption className="mb-2 text-body-strong">{title}</figcaption>
      <div className="w-full min-w-0" style={{ height }}>
        <Suspense
          fallback={
            <div
              role="status"
              aria-label="Đang tải biểu đồ"
              className="h-full animate-pulse rounded-control bg-surface-2"
            />
          }
        >
          <div role="img" aria-label={title} className="h-full w-full min-w-0">
            <LazyPlot kind={kind} data={data} />
          </div>
        </Suspense>
      </div>
      <div className="sr-only">
        <table className="w-full table-fixed">
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Mốc</th>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.label}>
                {kind === 'funnel' ? <th scope="row">{row.label}</th> : <td>{row.label}</td>}
                {columns.map((column) => {
                  const value = row[column.key];
                  return <td key={column.key}>{value == null ? '—' : `${value}${column.unit ?? ''}`}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
