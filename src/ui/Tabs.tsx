import { RadioGroup, Tabs as RTabs } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from './cn';

export type TabItem = { value: string; label: string; content: ReactNode; count?: number };

/** Tab (Radix Tabs). Active = chữ accent + gạch dưới 2px. `sticky` cho tab dính trong hồ sơ. */
export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  label,
  sticky,
  className,
}: {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  label: string;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <RTabs.Root
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={onValueChange}
      className={cn('flex flex-col', className)}
    >
      <RTabs.List
        aria-label={label}
        className={cn(
          'flex overflow-x-auto border-b border-border [scrollbar-width:none]',
          sticky &&
            'sticky top-0 z-10 bg-surface/85 backdrop-blur-md supports-[not(backdrop-filter:blur(1px))]:bg-surface',
        )}
      >
        {items.map((t) => (
          <RTabs.Trigger
            key={t.value}
            value={t.value}
            className="-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-body-strong text-text-2 transition-colors duration-(--dur-fast) hover:text-text data-[state=active]:border-accent data-[state=active]:text-accent"
          >
            {t.label}
            {t.count !== undefined && <span className="font-data text-mono-data text-text-3">{t.count}</span>}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {items.map((t) => (
        <RTabs.Content key={t.value} value={t.value} className="pt-4 focus-visible:outline-none">
          {t.content}
        </RTabs.Content>
      ))}
    </RTabs.Root>
  );
}

export type SegmentOption<T extends string> = { value: T; label: string };

/** Chọn 1 trong vài lựa chọn ngắn (Radix RadioGroup). Active = nền accent-soft + chữ accent. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  label,
  className,
}: {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onValueChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      orientation="horizontal"
      className={cn('flex gap-1 rounded-control border border-border bg-surface-2 p-1', className)}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className="flex min-h-9 flex-1 items-center justify-center whitespace-nowrap rounded-[8px] px-3 text-body-strong text-text-2 transition-colors duration-(--dur-fast) hover:text-text data-[state=checked]:bg-accent-soft data-[state=checked]:text-accent"
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
