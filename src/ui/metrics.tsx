import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Ô chỉ số: giá trị (display, mono) · nhãn · tử/mẫu · kỳ · xu hướng (▲▼ + chữ) · cảnh báo cỡ mẫu.
 * `value` null → "—" + "Chưa đủ dữ liệu" (không trí tuệ giả).
 */
export function MetricTile({
  label,
  value,
  ratio,
  period,
  trend,
  smallSample,
  className,
}: {
  label: string;
  value: string | null;
  /** Tử/mẫu, vd "12/18 khách". */
  ratio?: string;
  period?: string;
  trend?: { dir: 'up' | 'down' | 'flat'; text: string };
  /** Cỡ mẫu nhỏ, vd "n=4 — chưa chắc". */
  smallSample?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-card border border-border bg-surface p-4 shadow-e1', className)}>
      <span className="text-label text-text-2">{label}</span>
      <span className={cn('min-w-0 font-data text-display break-words tabular-nums', value === null && 'text-text-3')}>
        {value ?? '—'}
      </span>
      {value === null ? (
        <span className="text-small text-text-3">Chưa đủ dữ liệu</span>
      ) : (
        <>
          {(ratio || period) && (
            <span className="text-small text-text-2">{[ratio, period].filter(Boolean).join(' · ')}</span>
          )}
          {trend && (
            <span className="text-small text-text-2">
              <span aria-hidden>{trend.dir === 'up' ? '▲ ' : trend.dir === 'down' ? '▼ ' : '– '}</span>
              {trend.text}
            </span>
          )}
          {smallSample && <span className="text-label text-warning">{smallSample}</span>}
        </>
      )}
    </div>
  );
}

export type ChartPoint = { label: string; value: number };

/**
 * Biểu đồ nhỏ SVG tự vẽ: `spark` (đường), `bar` (cột), `funnel` (thanh ngang giảm dần).
 * Chuỗi chính accent, so sánh text-3; nhãn trực tiếp; luôn kèm bảng dữ liệu ẩn cho screen reader.
 */
export function MiniChart({
  kind,
  data,
  compare,
  title,
  unit = '',
  className,
}: {
  kind: 'spark' | 'bar' | 'funnel';
  data: ChartPoint[];
  compare?: ChartPoint[];
  title: string;
  unit?: string;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value), ...(compare ?? []).map((d) => d.value));
  const fmt = (v: number) => `${v.toLocaleString('vi-VN')}${unit}`;

  let chart: ReactNode = null;
  if (kind === 'spark') {
    const W = 120;
    const H = 32;
    const pts = (s: ChartPoint[]) =>
      s.map((d, i) => `${(i / Math.max(1, s.length - 1)) * W},${H - 2 - (d.value / max) * (H - 4)}`).join(' ');
    const last = data[data.length - 1];
    chart = (
      <div className="flex items-center gap-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-full max-w-40" preserveAspectRatio="none" aria-hidden>
          {compare && (
            <polyline
              points={pts(compare)}
              fill="none"
              stroke="var(--text-3)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          )}
          <polyline points={pts(data)} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        {last && <span className="font-data text-mono-data text-text">{fmt(last.value)}</span>}
      </div>
    );
  } else if (kind === 'bar') {
    chart = (
      <div className="flex h-24 items-end gap-1.5" aria-hidden>
        {data.map((d) => (
          <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="font-data text-label text-text-2">{d.value}</span>
            <span className="w-full rounded-t-[4px] bg-accent" style={{ height: `${(d.value / max) * 56}px` }} />
            <span className="w-full truncate text-center text-label text-text-3">{d.label}</span>
          </div>
        ))}
      </div>
    );
  } else {
    chart = (
      <ol className="flex flex-col gap-1.5" aria-hidden>
        {data.map((d) => (
          <li key={d.label} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2">
            <span className="truncate text-small text-text-2">{d.label}</span>
            <span className="h-3 rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${(d.value / max) * 100}%` }} />
            </span>
            <span className="font-data text-mono-data">{d.value}</span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <figcaption className="text-label text-text-2">{title}</figcaption>
      {chart}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Mốc</th>
            <th scope="col">Giá trị</th>
            {compare && <th scope="col">So sánh</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{fmt(d.value)}</td>
              {compare && <td>{compare[i] ? fmt(compare[i].value) : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
