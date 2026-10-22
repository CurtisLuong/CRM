import type { ReactNode } from 'react';
import { useState } from 'react';
import { OCCUPATIONS } from '@/config/occupations';
import type { Customer } from '@/domain/customer';
import { ProfileTextField } from './advanced';
import { DobField } from './dob-field';
import { LONG_FIELD, SHORT_FIELD } from './fields';

const FIELD =
  'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60';

export const GENDER_OPTIONS = [
  { value: 'nam', label: 'Nam' },
  { value: 'nữ', label: 'Nữ' },
  { value: 'khác', label: 'Khác' },
];
export const MARITAL_STATUS_OPTIONS = [
  { value: 'đã kết hôn', label: 'Đã kết hôn' },
  { value: 'chưa kết hôn', label: 'Chưa kết hôn' },
];

/** Ô đã có giá trị: chuỗi khác rỗng, số, hoặc mảng còn phần tử. */
export function hasFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

// Ô ngắn có thể ẩn dưới "Bổ sung"; Họ tên + SĐT luôn hiện (bắt buộc).
const HIDEABLE_KEYS = ['dob', 'gender', 'marital_status', 'occupation', 'income', 'residence'] as const;

/** Số ô Thông tin chính đang trống (để ghi trên nút "Bổ sung"). */
export function infoHiddenCount(customer: Customer): number {
  return HIDEABLE_KEYS.filter((key) => !hasFieldValue(customer[key])).length;
}

type InfoProps = {
  customer: Customer;
  writable: boolean;
  busy: boolean;
  now: number;
  /** Mở "Bổ sung": hiện cả ô trống. */
  showEmpty: boolean;
  onSaveField: (key: keyof Customer, value: unknown) => void;
  onSaveDob: (dob: string | null) => void;
};

/** Khu "Thông tin chính" của tab Trí nhớ: ô ngắn nửa hàng, ô dài cả hàng, ô trống ẩn sau "Bổ sung". */
export function ProfileInfoFields({ customer, writable, busy, now, showEmpty, onSaveField, onSaveDob }: InfoProps) {
  const rows: { key: string; short: boolean; always?: boolean; node: ReactNode }[] = [
    {
      key: 'full_name',
      short: false,
      always: true,
      node: (
        <ProfileTextField
          label="Họ tên"
          value={customer.full_name}
          disabled={!writable}
          onSave={(value) => onSaveField('full_name', value)}
        />
      ),
    },
    {
      key: 'phone',
      short: true,
      always: true,
      node: (
        <ProfileTextField
          label="Số điện thoại"
          value={customer.phone}
          disabled={!writable}
          onSave={(value) => onSaveField('phone', value)}
        />
      ),
    },
    {
      key: 'gender',
      short: true,
      node: (
        <ChoiceField
          label="Giới tính"
          value={customer.gender}
          disabled={!writable || busy}
          options={GENDER_OPTIONS}
          onSave={(value) => onSaveField('gender', value)}
        />
      ),
    },
    {
      key: 'dob',
      short: true,
      node: <DobField value={customer.dob} disabled={!writable} now={now} onSave={onSaveDob} />,
    },
    {
      key: 'marital_status',
      short: true,
      node: (
        <ChoiceField
          label="Hôn nhân"
          value={customer.marital_status}
          disabled={!writable || busy}
          options={MARITAL_STATUS_OPTIONS}
          onSave={(value) => onSaveField('marital_status', value)}
        />
      ),
    },
    {
      key: 'occupation',
      short: true,
      node: (
        <ChoiceField
          label="Nghề nghiệp"
          value={customer.occupation}
          disabled={!writable || busy}
          options={OCCUPATIONS.map((value) => ({ value, label: value }))}
          onSave={(value) => onSaveField('occupation', value)}
        />
      ),
    },
    {
      key: 'income',
      short: true,
      node: (
        <ProfileTextField
          label="Thu nhập"
          value={customer.income}
          disabled={!writable}
          onSave={(value) => onSaveField('income', value)}
        />
      ),
    },
    {
      key: 'residence',
      short: false,
      node: (
        <ProfileTextField
          label="Nơi ở"
          value={customer.residence}
          disabled={!writable}
          onSave={(value) => onSaveField('residence', value)}
        />
      ),
    },
  ];
  const [inherited] = useState<Set<string>>(() => new Set(HIDEABLE_KEYS.filter((key) => hasFieldValue(customer[key]))));
  const visible = rows.filter(
    (row) => row.always || showEmpty || inherited.has(row.key) || hasFieldValue(customer[row.key as keyof Customer]),
  );
  return (
    <div className="flex flex-wrap gap-3">
      {visible.map((row) => (
        <div key={row.key} className={row.short ? SHORT_FIELD : LONG_FIELD}>
          {row.node}
        </div>
      ))}
    </div>
  );
}

/** Ô chọn từ danh sách cố định; giữ giá trị cũ không nằm trong danh sách (D-012). */
export function ChoiceField({
  label,
  value,
  disabled,
  options,
  onSave,
}: {
  label: string;
  value: unknown;
  disabled: boolean;
  options: readonly { value: string; label: string }[];
  onSave: (value: string | null) => void;
}) {
  const id = `profile-field-${label.toLocaleLowerCase('vi').replace(/[^\p{L}\p{N}]+/gu, '-')}`;
  const current = value == null ? '' : String(value);
  const preservesUnknown = current !== '' && !options.some((option) => option.value === current);
  return (
    <div className="block space-y-1 text-small text-text-2">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={current}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          if (next !== current) onSave(next || null);
        }}
        className={FIELD}
      >
        <option value="">— Chưa chọn —</option>
        {preservesUnknown && <option value={current}>{current} (giá trị hiện có)</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
