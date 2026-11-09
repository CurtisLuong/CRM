import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { formatMoney, incomeText, parseIncome, parseMoneyInput } from '@/ui/display';
import { type FieldProps, TextField } from './form-fields';

type MoneyFieldProps = FieldProps & {
  id?: string;
  value: number | null;
  disabled?: boolean;
  monthly?: boolean;
  placeholder?: string;
  /** Form nhập khách/lọc: cập nhật state, giá trị luôn theo đồng. */
  onChange?: (value: number | null) => void;
  /** Hồ sơ: chỉ ghi khi đã sửa và rời ô với số hợp lệ. */
  onCommit?: (value: number | null) => void;
  onValidityChange?: (valid: boolean) => void;
  unparsedValue?: string;
};

const millions = (value: number | null) =>
  value == null ? '' : (value / 1_000_000).toLocaleString('vi-VN', { useGrouping: false, maximumFractionDigits: 6 });

/** Giao diện theo triệu/tỷ; hợp đồng với form/repository luôn theo đồng. */
export function MoneyField({
  value,
  monthly = false,
  onChange,
  onCommit,
  onValidityChange,
  unparsedValue,
  hint,
  error,
  ...props
}: MoneyFieldProps) {
  const [focused, setFocused] = useState(false);
  const [amount, setAmount] = useState(value);
  const [draft, setDraft] = useState(unparsedValue ?? millions(value));
  const [invalid, setInvalid] = useState(false);
  const changed = useRef(false);
  const original = useRef(value);
  useEffect(() => {
    if (!changed.current) {
      setDraft(unparsedValue ?? millions(value));
      setAmount(value);
      setInvalid(false);
    }
  }, [value, unparsedValue]);
  const display = formatMoney(amount, monthly);
  const unit = !focused && !invalid && amount != null && amount >= 1_000_000_000 ? 'tỷ' : 'triệu';
  const message = invalid ? 'Nhập số triệu, ví dụ 500 hoặc 12,5.' : error;
  return (
    <TextField
      {...props}
      numeric
      type="text"
      inputMode="decimal"
      suffix={`${unit}${monthly ? '/tháng' : ''}`}
      value={focused || invalid || unparsedValue ? draft : (display.split(' ')[0] ?? '')}
      hint={hint}
      error={message}
      onFocus={(event) => {
        const input = event.currentTarget;
        original.current = value;
        // Hoàn tất đổi đơn vị trước thao tác chọn/dán kế tiếp của trình duyệt.
        flushSync(() => {
          if (!invalid) {
            changed.current = false;
            setDraft(unparsedValue ?? millions(amount));
          }
          setFocused(true);
        });
        input.select();
      }}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        changed.current = true;
        const parsed = parseMoneyInput(raw);
        const valid = parsed !== undefined;
        setInvalid(!valid);
        event.currentTarget.setCustomValidity(valid ? '' : 'Nhập số triệu hợp lệ.');
        onValidityChange?.(valid);
        if (valid) {
          setAmount(parsed);
          onChange?.(parsed);
        }
      }}
      onBlur={() => {
        const parsed = parseMoneyInput(draft);
        if (changed.current && parsed !== undefined) {
          if (parsed !== original.current || unparsedValue) onCommit?.(parsed);
          changed.current = false;
        }
        setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

/** Adapter duy nhất cho income: giữ nguyên chữ cũ nếu chưa đọc được số. */
export function IncomeField({
  value,
  onChange,
  onCommit,
  ...props
}: Omit<MoneyFieldProps, 'value' | 'onChange' | 'onCommit' | 'monthly' | 'unparsedValue'> & {
  value: string | null | undefined;
  onChange?: (value: string | null) => void;
  onCommit?: (value: string | null) => void;
}) {
  const parsed = parseIncome(value);
  return (
    <MoneyField
      {...props}
      value={parsed ?? null}
      monthly
      unparsedValue={parsed === undefined ? (value ?? '') : undefined}
      hint={parsed === undefined ? 'Chưa đọc được số — nhập lại theo triệu/tháng' : props.hint}
      onChange={onChange ? (amount) => onChange(incomeText(amount)) : undefined}
      onCommit={onCommit ? (amount) => onCommit(incomeText(amount)) : undefined}
    />
  );
}
