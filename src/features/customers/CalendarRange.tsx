import { useState } from 'react';
import { Button, cn } from '@/ui';
import { customDateLabel, dayKey, parseDayKey } from './model';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;
const pad = (n: number) => String(n).padStart(2, '0');

type Props = {
  /** Ngày đầu/cuối dạng 'YYYY-MM-DD' (đang soạn, chưa áp dụng). */
  from: string;
  to: string;
  now: Date;
  onPick: (from: string, to: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Lịch chọn một ngày hoặc một khoảng cho "Ngày đăng ký" (CL-01 L4).
 * Bấm lần đầu = ngày đầu (một ngày); bấm lần nữa = ngày cuối. Chỉ áp dụng khi bấm Xác nhận.
 */
export function CalendarRange({ from, to, now, onPick, onConfirm, onCancel }: Props) {
  const initial = parseDayKey(from) ?? now;
  const [view, setView] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  // true = lần bấm tới là ngày đầu của khoảng mới.
  const [pickingStart, setPickingStart] = useState(true);

  const start = parseDayKey(from);
  const end = parseDayKey(to) ?? start;
  const low = start && end ? Math.min(start.getTime(), end.getTime()) : null;
  const high = start && end ? Math.max(start.getTime(), end.getTime()) : null;

  const year = view.getFullYear();
  const month = view.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();

  const pick = (day: number) => {
    const key = dayKey(new Date(year, month, day));
    if (pickingStart) {
      onPick(key, key);
      setPickingStart(false);
    } else {
      onPick(from, key);
      setPickingStart(true);
    }
  };

  return (
    <div className="space-y-2 rounded-card border border-hairline p-0">
      <div className="flex items-center justify-between gap-2">
        <Button
          aria-label="Tháng trước"
          variant="ghost"
          onClick={() => setView(new Date(year, month - 1, 1))}
          className="size-11 px-0"
        >
          ‹
        </Button>
        <p className="text-body-strong">
          Tháng {month + 1}/{year}
        </p>
        <Button
          aria-label="Tháng sau"
          variant="ghost"
          onClick={() => setView(new Date(year, month + 1, 1))}
          className="size-11 px-0"
        >
          ›
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((label) => (
          <span key={label} className="py-1 text-center text-small text-text-3">
            {label}
          </span>
        ))}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const at = new Date(year, month, day);
          const t = at.getTime();
          const selected = low !== null && high !== null && t >= low && t <= high;
          const edge = !!((start && t === start.getTime()) || (end && t === end.getTime()));
          return (
            <button
              key={day}
              type="button"
              aria-label={`Chọn ${pad(day)}/${pad(month + 1)}/${year}`}
              aria-pressed={edge}
              onClick={() => pick(day)}
              style={index === 0 ? { gridColumnStart: offset + 1 } : undefined}
              className={cn(
                'flex h-11 w-full items-center justify-center rounded-control text-small font-semibold transition-colors duration-(--dur-fast) focus-visible:outline-2 focus-visible:outline-focus',
                edge
                  ? 'bg-accent text-accent-fg'
                  : selected
                    ? 'bg-accent-tonal text-accent'
                    : 'text-text hover:bg-surface-2',
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="text-small text-text-2">
        {pickingStart ? 'Chọn ngày đầu' : 'Chọn ngày cuối'} ·{' '}
        <span className="text-body-strong text-text">{customDateLabel(from, to, now)}</span>
      </p>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onCancel}>
          Huỷ
        </Button>
        <Button className="flex-1" variant="primary" onClick={onConfirm}>
          Xác nhận
        </Button>
      </div>
    </div>
  );
}
