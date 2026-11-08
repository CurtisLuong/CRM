import { useId } from 'react';
import { Field } from '@/components/crm/form-fields';
import { directionOptions, directionValue } from '@/config/directions';

/** Dùng chung cho căn trong Giỏ hàng và nhu cầu khách; mở ô không đổi giá trị đã lưu. */
export function DirectionField({
  value,
  disabled,
  onChange,
  className,
}: {
  value: string | null | undefined;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <Field id={id} label="Hướng" className={className}>
      <select
        id={id}
        value={directionValue(value)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full min-w-0 rounded-sm border border-input bg-surface-100 px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion disabled:opacity-60"
      >
        <option value="">—</option>
        {directionOptions(value).map((direction) => (
          <option key={direction} value={direction}>
            {direction}
          </option>
        ))}
      </select>
    </Field>
  );
}
