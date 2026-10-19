/** Ô chỉ số màn Hiệu quả — DESIGN_SYSTEM v4 §3 (D-023). Cả ô bấm được → danh sách/trang con. */
import { cn } from './cn';
import { Icon } from './Icon';

export type StatTrend = { dir: 'up' | 'down' | 'flat'; text: string; tone: 'good' | 'bad' | 'neutral' };

export function StatTile({
  label,
  value,
  unit,
  sub,
  trend,
  onClick,
  className,
}: {
  label: string;
  /** Số chính; null → "—" + "Chưa đủ dữ liệu". */
  value: string | number | null;
  unit?: string;
  sub?: string;
  trend?: StatTrend;
  onClick?: () => void;
  className?: string;
}) {
  const empty = value == null || value === '';
  const body = (
    <>
      <span className="text-label text-text-2">{label}</span>
      <span className="font-mono text-[28px] leading-[34px] font-medium tracking-[-0.03em] tabular-nums">
        {empty ? '—' : value}
        {!empty && unit && (
          <small className="ml-1 font-sans text-[15px] font-medium tracking-normal text-text-2">{unit}</small>
        )}
      </span>
      <span className="text-small text-text-2">{empty ? 'Chưa đủ dữ liệu' : sub}</span>
      {!empty && trend && (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-label',
            trend.tone === 'good' ? 'text-success' : trend.tone === 'bad' ? 'text-warning' : 'text-text-2',
          )}
        >
          {trend.dir !== 'flat' && <Icon name={trend.dir === 'up' ? 'up' : 'expand'} size={16} />}
          {trend.text}
        </span>
      )}
    </>
  );
  const cls = cn(
    'flex flex-col gap-1 rounded-card border border-hairline bg-surface p-3 text-left shadow-e1',
    onClick && 'transition-colors duration-(--dur-fast) hover:bg-surface-2',
    className,
  );
  return onClick ? (
    <button type="button" data-tile className={cls} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div data-tile className={cls}>
      {body}
    </div>
  );
}
