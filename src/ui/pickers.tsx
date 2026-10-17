import { RadioGroup } from 'radix-ui';
import { useState } from 'react';
import { CALL_RESULTS, type CallResult } from '@/config/callResults';
import { type CallSlotKey, FOLLOWUP_CONFIG } from '@/config/followup';
import type { IconName } from '@/config/icons';
import { cn } from './cn';
import { Icon } from './Icon';

const CHOICE =
  'rounded-control border border-border-strong bg-surface text-text transition-colors duration-(--dur-fast) hover:bg-surface-2 data-[state=checked]:border-accent data-[state=checked]:bg-accent-soft data-[state=checked]:text-accent';

/** 4 kết quả lớn (DESIGN_SYSTEM §3). Nhãn ngắn gộp; mã lưu lấy từ CALL_RESULTS (không đổi nghĩa). */
const MAIN: ReadonlyArray<{ value: CallResult; label: string; icon: IconName }> = [
  { value: 'talked', label: 'Nói chuyện được', icon: 'talked' },
  { value: 'no_answer', label: 'Không nghe / không liên lạc', icon: 'call_again' },
  { value: 'busy', label: 'Bận, hẹn lại', icon: 'call_sched' },
  { value: 'wrong_number', label: 'Sai số / không phù hợp', icon: 'drop' },
];

/** Chọn kết quả cuộc gọi: 4 nút lớn + "Khác" mở đủ CALL_RESULTS. */
export function OutcomePicker({
  value,
  onValueChange,
  className,
}: {
  value: CallResult | null;
  onValueChange: (v: CallResult) => void;
  className?: string;
}) {
  const inMain = MAIN.some((m) => m.value === value);
  const [more, setMore] = useState(value !== null && !inMain);
  const rest = (Object.keys(CALL_RESULTS) as CallResult[]).filter((k) => !MAIN.some((m) => m.value === k));
  return (
    <RadioGroup.Root
      aria-label="Kết quả cuộc gọi"
      value={value ?? ''}
      onValueChange={(v) => onValueChange(v as CallResult)}
      className={cn('flex flex-col gap-2', className)}
    >
      <div className="grid grid-cols-2 gap-2">
        {MAIN.map((m) => (
          <RadioGroup.Item
            key={m.value}
            value={m.value}
            className={cn(
              CHOICE,
              'flex min-h-16 flex-col items-start justify-center gap-1 px-3 py-2 text-left text-body-strong',
            )}
          >
            <Icon name={m.icon} size={20} />
            {m.label}
          </RadioGroup.Item>
        ))}
      </div>
      {more ? (
        <div className="flex flex-wrap gap-2">
          {rest.map((k) => (
            <RadioGroup.Item key={k} value={k} className={cn(CHOICE, 'min-h-11 rounded-full px-4 text-small')}>
              {CALL_RESULTS[k]}
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
