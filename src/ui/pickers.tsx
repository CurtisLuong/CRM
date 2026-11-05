import { RadioGroup } from 'radix-ui';
import { useState } from 'react';
import { CALL_RESULTS, type CallResult } from '@/config/callResults';
import { type CallSlotKey, FOLLOWUP_CONFIG } from '@/config/followup';
import type { IconName } from '@/config/icons';
import { cn } from './cn';
import { Icon } from './Icon';

const CHOICE =
  'rounded-control border border-border-strong bg-surface text-text transition-colors duration-(--dur-fast) hover:bg-surface-2 data-[state=checked]:border-accent data-[state=checked]:bg-accent-soft data-[state=checked]:text-accent';

/** Nhãn ngắn trên tấm kết quả; nhãn lịch sử vẫn lấy nguyên CALL_RESULTS. */
const MAIN: ReadonlyArray<{ value: CallResult; label: string; icon: IconName }> = [
  { value: 'talked', label: CALL_RESULTS.talked, icon: 'talked' },
  { value: 'busy', label: 'Bận, hẹn lại', icon: 'call_sched' },
  { value: 'no_answer', label: 'Không nghe', icon: 'call_again' },
];
const OTHER: ReadonlyArray<{ value: CallResult; label: string }> = [
  { value: 'unreachable', label: 'Thuê bao' },
  { value: 'wrong_number', label: CALL_RESULTS.wrong_number },
  { value: 'hung_up', label: CALL_RESULTS.hung_up },
  { value: 'line_busy', label: CALL_RESULTS.line_busy },
];

/** Chọn kết quả cuộc gọi: 3 nút lớn + "Khác…" mở các ca hiếm (D-030). */
export function OutcomePicker({
  value,
  onValueChange,
  className,
}: {
  value: CallResult | null;
  onValueChange: (v: CallResult) => void;
  className?: string;
}) {
  const [more, setMore] = useState(false);
  const showMore = more || OTHER.some((item) => item.value === value);
  return (
    <RadioGroup.Root
      aria-label="Kết quả cuộc gọi"
      value={value ?? ''}
      onValueChange={(v) => onValueChange(v as CallResult)}
      className={cn('flex flex-col gap-2', className)}
    >
      <div className="flex flex-col gap-2">
        {MAIN.map((m) => (
          <RadioGroup.Item
            key={m.value}
            value={m.value}
            className={cn(
              CHOICE,
              'flex min-h-14 w-full items-center gap-3 whitespace-nowrap px-3 py-2 text-left text-body-strong',
            )}
          >
            <Icon name={m.icon} size={20} />
            {m.label}
          </RadioGroup.Item>
        ))}
      </div>
      {showMore ? (
        <div className="flex flex-wrap gap-2">
          {OTHER.map((item) => (
            <RadioGroup.Item
              key={item.value}
              value={item.value}
              className={cn(CHOICE, 'min-h-11 rounded-full px-4 text-small')}
            >
              {item.label}
            </RadioGroup.Item>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMore(true)}
          className="min-h-11 self-start rounded-control px-3 text-body-strong text-accent hover:bg-accent-soft"
        >
          Khác…
        </button>
      )}
    </RadioGroup.Root>
  );
}

export type DayOption = { value: string; label: string };

/** Chọn ngày (chip) + khung gọi `callSlots` (A/B/C/D, tên + giờ mono). Khung gợi ý có nhãn "Gợi ý". */
export function SlotPicker({
  days,
  day,
  onDayChange,
  slot,
  onSlotChange,
  suggested,
  className,
}: {
  days: DayOption[];
  day: string;
  onDayChange: (v: string) => void;
  slot: CallSlotKey | null;
  onSlotChange: (v: CallSlotKey) => void;
  suggested?: CallSlotKey;
  className?: string;
}) {
  const slots = Object.entries(FOLLOWUP_CONFIG.callSlots) as Array<[CallSlotKey, { range: string; name: string }]>;
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <RadioGroup.Root
        aria-label="Ngày"
        value={day}
        onValueChange={onDayChange}
        orientation="horizontal"
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]"
      >
        {days.map((d) => (
          <RadioGroup.Item
            key={d.value}
            value={d.value}
            className={cn(CHOICE, 'min-h-11 shrink-0 rounded-full px-4 text-body-strong')}
          >
            {d.label}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      <RadioGroup.Root
        aria-label="Khung giờ gọi"
        value={slot ?? ''}
        onValueChange={(v) => onSlotChange(v as CallSlotKey)}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {slots.map(([key, s]) => (
          <RadioGroup.Item
            key={key}
            value={key}
            className={cn(CHOICE, 'relative flex min-h-14 flex-col items-start justify-center px-3 py-2 text-left')}
          >
            <span className="text-body-strong">
              {s.name}
              {suggested === key && <span className="ml-1.5 text-label text-accent">· Gợi ý</span>}
            </span>
            <span className="font-data text-mono-data text-text-2">{s.range.replace('-', '–')}</span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  );
}
