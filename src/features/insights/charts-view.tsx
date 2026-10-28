import type { ReactNode } from 'react';
import { BarChart, ChartCard, FunnelChart, MetricCard, StageAgingChart } from '@/components/crm/charts';
import type { Stage } from '@/lib/crm';

type Point = {
  label: string;
  value?: number | null;
  previous?: number;
  numerator?: number;
  denominator?: number;
  percent?: number | null;
  retention?: number | null;
  n?: number;
  sub?: string;
};
const n = (value: number) => value.toLocaleString('vi-VN');

export function MetricView({
  label,
  value,
  unit,
  fraction,
  delta,
}: {
  label: string;
  value: ReactNode | null;
  unit?: string;
  fraction: ReactNode;
  delta?: { dir: 'up' | 'down'; text: string; good?: boolean };
}) {
  return (
    <div className="pointer-events-none">
      <MetricCard label={label} value={value} unit={unit} fraction={fraction} delta={delta} />
    </div>
  );
}

export function FunnelView({
  data,
  headline,
  total,
  outside,
}: {
  data: Point[];
  headline: string;
  total: number;
  outside: { label: string; count: number }[];
}) {
  return (
    <ChartCard
      title="Phễu và tốc độ"
      headline={`${headline} · ${n(total)} khách`}
      definition="Số khách đã tới từng bậc trên tổng khách vào phễu; tỉ lệ chuyển tiếp so với bậc liền trước. Nuôi dài hạn nằm ngoài phễu."
      legend={[{ color: 'var(--chart-1)', label: 'Khách đã tới bậc' }]}
    >
      <div data-testid="insights-funnel-kit">
        <FunnelChart
          total={total}
          steps={data.map((row) => ({ label: row.label, count: row.value ?? 0 }))}
          outside={outside}
        />
      </div>
      <svg aria-label="Số khách theo bậc" className="h-5 w-full overflow-visible text-caption text-ink-muted">
        {data.map((row, index) => (
          <text key={row.label} x={`${(index / Math.max(data.length - 1, 1)) * 94}%`} y="15">
            {n(row.value ?? 0)} khách
          </text>
        ))}
      </svg>
      <table className="sr-only">
        <tbody>
          {data.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{n(row.value ?? 0)} khách</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ChartCard>
  );
}

export function WeeklyView({ data, headline, period }: { data: Point[]; headline: string; period: string }) {
  return (
    <ChartCard
      title="Hiệu suất tuần"
      period={period}
      headline={headline}
      definition="So sánh tuần hiện tại với tuần trước cùng số ngày đã trôi qua. Số chuyển bậc là milestone được ghi trong lịch sử."
      legend={[
        { color: 'var(--chart-1)', label: 'Tuần này' },
        { color: 'var(--chart-prev)', label: 'Tuần trước' },
      ]}
    >
      <BarChart
        data={data.map((row) => ({ ...row, value: row.value ?? 0 }))}
        series={[
          { key: 'value', label: 'Tuần này', color: 'var(--chart-1)' },
          { key: 'previous', label: 'Tuần trước', color: 'var(--chart-prev)' },
        ]}
        format={(value) => n(value ?? 0)}
      />
    </ChartCard>
  );
}

export function RateView({
  title,
  headline,
  definition,
  data,
  label = 'Tỉ lệ',
  minSample = 5,
}: {
  title: string;
  headline: string;
  definition: string;
  data: Point[];
  label?: string;
  minSample?: number;
}) {
  const best = data
    .filter((row) => row.percent != null)
    .reduce<Point | null>(
      (current, row) => (!current || (row.percent ?? 0) > (current.percent ?? 0) ? row : current),
      null,
    );
  const small = best != null && (best.denominator ?? 0) < minSample;
  return (
    <ChartCard
      title={title}
      headline={small ? 'Chưa đủ mẫu để kết luận' : headline}
      sample={best ? { n: best.denominator ?? 0, min: minSample } : undefined}
      definition={definition}
      legend={[{ color: 'var(--chart-1)', label }]}
    >
      <BarChart
        data={data.map((row) => ({ ...row, value: row.percent ?? 0, n: row.denominator }))}
        series={[{ key: 'value', label, color: 'var(--chart-1)' }]}
        minSample={minSample}
        max={100}
        format={(v) => `${n(Number(v))}%`}
        layout="horizontal"
      />
    </ChartCard>
  );
}

export function SourceView({ data, headline }: { data: Point[]; headline: string }) {
  return (
    <ChartCard
      title="Nguồn khách"
      headline={headline}
      definition="Một khách có thể có nhiều nguồn đã lưu, nên tổng theo nguồn có thể lớn hơn số khách duy nhất. Tỉ lệ Đạt = khách Đạt / khách theo nguồn."
      legend={[{ color: 'var(--chart-1)', label: 'Khách theo nguồn' }]}
    >
      <BarChart
        data={data.map((row) => ({
          ...row,
          value: row.denominator ?? 0,
          sub: row.percent == null ? '—' : `${row.numerator}/${row.denominator} · ${row.percent}%`,
        }))}
        layout="horizontal"
        format={(value) => n(value ?? 0)}
      />
    </ChartCard>
  );
}

export function StageView({
  rows,
  headline,
}: {
  rows: { stage: Stage; ok: number; soon: number; alert: number; onClick: () => void }[];
  headline: string;
}) {
  return (
    <ChartCard
      title="Phân bố khách theo SLA"
      headline={headline}
      definition="Số khách mỗi bậc theo trạng thái so với mục tiêu và hạn mức SLA của bậc."
      legend={[
        { color: 'var(--ok)', label: 'Trong mục tiêu' },
        { color: 'var(--soon)', label: 'Sắp hạn' },
        { color: 'var(--alert)', label: 'Quá hạn' },
      ]}
    >
      <StageAgingChart rows={rows} />
    </ChartCard>
  );
}

export function CareMetric({
  label,
  value,
  fraction,
  delta,
  sample,
}: {
  label: string;
  value: ReactNode | null;
  fraction: ReactNode;
  delta?: { dir: 'up' | 'down'; text: string; good?: boolean };
  sample?: { n: number; min?: number };
}) {
  return <MetricCard label={label} value={value} fraction={fraction} delta={delta} sample={sample} />;
}
