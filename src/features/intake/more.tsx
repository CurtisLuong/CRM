import type { InputHTMLAttributes } from 'react';
import type { UseFormRegister } from 'react-hook-form';
import { DatePicker, SelectField, TextField } from '@/components/crm';
import {
  CollapsibleFormSection,
  FormGrid,
  FormSubsection,
  LONG_FIELD,
  SHORT_FIELD,
} from '@/components/crm/form-section';
import { IncomeField, MoneyField } from '@/components/crm/money-field';
import { ADVANCED_GROUPS } from '@/config/advanced';
import { dobView } from '@/features/profile/dob';
import { DobDerivedFields } from '@/features/profile/dob-field';
import { displayText, moneyValue } from '@/ui/display';
import type { IntakeValues } from './schema';
import { safeDob } from './view';

const FIELD =
  'min-h-11 rounded-sm border border-line bg-surface-100 px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion';
const TEXTAREA = `${FIELD} py-2`;

export type IntakeSetValue = (key: keyof IntakeValues, value: unknown) => void;

type Props = {
  /** Mặc định đóng mỗi lần mở form; OCR điền trường ẩn thì màn tự mở. */
  open: boolean;
  onToggle: () => void;
  values: IntakeValues;
  register: UseFormRegister<IntakeValues>;
  set: IntakeSetValue;
  fieldErrors: Record<string, string>;
  onMoneyValidityChange?: (key: string, valid: boolean) => void;
  /** Mã căn gợi ý theo dự án đã chọn (datalist). */
  unitCodes: readonly string[];
  /** Số trường đã điền, hiện trên nhãn nút. */
  filledCount: number;
};

/**
 * PF-03: khu "Thêm thông tin" — mọi trường không thiết yếu nằm sau một nút, mặc định ẩn.
 * Đóng khu không xoá giá trị: các ô vẫn nằm trong state của form và được lưu y như trước.
 */
export function IntakeMore({
  open,
  onToggle,
  values,
  register,
  set,
  fieldErrors,
  unitCodes,
  filledCount,
  onMoneyValidityChange,
}: Props) {
  const label = filledCount > 0 ? `Thêm thông tin · đã điền ${filledCount}` : 'Thêm thông tin';

  const input = (
    text: string,
    name: keyof IntakeValues,
    type = 'text',
    props: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> = {},
  ) => (
    <TextField
      key={name}
      className={`${name === 'residence' ? LONG_FIELD : SHORT_FIELD} self-end`}
      {...register(name)}
      label={text}
      type={type}
      value={String(values[name] ?? '')}
      onChange={(e) => set(name, e.target.value)}
      error={fieldErrors[name]}
      {...props}
    />
  );

  const select = (text: string, name: keyof IntakeValues, options: readonly string[]) => (
    <SelectField
      key={name}
      className={`${SHORT_FIELD} self-end`}
      label={text}
      options={[{ value: '__none', label: '— Chưa rõ —' }, ...options]}
      placeholder="— Chưa rõ —"
      value={String(values[name] || '__none')}
      onValueChange={(value) => set(name, value === '__none' ? '' : value)}
      error={fieldErrors[name]}
    />
  );

  return (
    <CollapsibleFormSection aria-label="Thông tin thêm" title={label} open={open} onOpenChange={onToggle}>
      <FormSubsection title="Cá nhân">
        <label className={`${SHORT_FIELD} self-end flex flex-col gap-1.5 text-label text-ink-muted`}>
          Giới tính
          <select
            {...register('gender')}
            value={values.gender}
            onChange={(event) => set('gender', event.target.value)}
            className={`${FIELD} w-full`}
          >
            <option value="">— Chưa rõ —</option>
            {['nam', 'nữ', 'khác'].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <DatePicker
          className={`${SHORT_FIELD} self-end`}
          label="Ngày sinh (ngày/tháng/năm)"
          value={values.dob}
          onChange={(value) => set('dob', value)}
          error={fieldErrors.dob}
        />
        <div className={`${LONG_FIELD} flex flex-wrap gap-3 empty:hidden`}>
          <DobDerivedFields
            view={dobView(safeDob(values.dob), Date.now())}
            cellClassName={SHORT_FIELD}
            labelClassName=""
          />
        </div>
        {select('Tình trạng hôn nhân', 'marital_status', ['đã kết hôn', 'chưa kết hôn'])}
        {select('Công việc', 'occupation', ['Tự do', 'Công ty, DN', 'Công, viên chức', 'Công an, Bộ đội'])}
        <IncomeField
          className={`${SHORT_FIELD} self-end`}
          label="Thu nhập"
          value={values.income}
          onChange={(value) => set('income', value ?? '')}
          onValidityChange={(valid) => onMoneyValidityChange?.('income', valid)}
          error={fieldErrors.income}
        />
        {input('Thường trú', 'residence')}
      </FormSubsection>

      <FormSubsection title="Đăng ký">
        {input('Thời gian đăng ký', 'registered_at', 'datetime-local')}
        {input('Chiến dịch', 'campaign')}
      </FormSubsection>

      <FormSubsection title="Chi tiết căn hộ">
        {input('Diện tích (m²)', 'apt_area', 'number', { min: 0, step: 'any' })}
        {input('Mã toà', 'building_code')}
        {input('Mã căn', 'apt_code', 'text', { list: 'intake-units' })}
        <datalist id="intake-units">
          {unitCodes.map((code) => (
            <option key={code} value={code} />
          ))}
        </datalist>
        {select('Hướng căn', 'apt_direction', [
          'Đông',
          'Tây',
          'Nam',
          'Bắc',
          'Đông Bắc',
          'Đông Nam',
          'Tây Bắc',
          'Tây Nam',
        ])}
        {input('Tầng', 'apt_floor', 'number', { min: 1, step: 1 })}
        {(['apt_price', 'finance'] as const).map((key) => (
          <MoneyField
            key={key}
            className={`${SHORT_FIELD} self-end`}
            label={key === 'apt_price' ? 'Giá căn' : 'Vốn sẵn có'}
            value={moneyValue(values[key])}
            onChange={(value) => set(key, value ?? '')}
            onValidityChange={(valid) => onMoneyValidityChange?.(key, valid)}
            error={fieldErrors[key]}
          />
        ))}
        {select('Mục đích', 'purpose', ['Ở', 'Đầu tư', 'Cho tặng'])}
      </FormSubsection>

      <FormSubsection title="Ghi chú đăng ký">
        <label className={`${LONG_FIELD} flex flex-col gap-1.5 text-label text-ink-muted`}>
          Ghi chú đăng ký
          <textarea
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            className={`${TEXTAREA} w-full`}
          />
        </label>
      </FormSubsection>

      {ADVANCED_GROUPS.map((group) => (
        <details data-form-subsection key={group.title} className="min-w-0 space-y-3 pl-3 sm:pl-4">
          <summary className="cursor-pointer text-section-head">{group.title}</summary>
          <FormGrid className="mt-3 items-end">
            {group.fields.map((field) => (
              <div
                key={field.key}
                className={`${field.type === 'number' ? SHORT_FIELD : LONG_FIELD} flex flex-col gap-1 text-caption text-ink-muted`}
              >
                {field.type !== 'number' && <label htmlFor={`advanced-${field.key}`}>{field.label}</label>}
                {field.type === 'number' ? (
                  <MoneyField
                    id={`advanced-${field.key}`}
                    label={field.label}
                    value={moneyValue(values.advanced[field.key])}
                    unparsedValue={
                      moneyValue(values.advanced[field.key]) == null
                        ? displayText(values.advanced[field.key]) || undefined
                        : undefined
                    }
                    monthly={field.key === 'monthly_payment'}
                    error={fieldErrors[`advanced.${field.key}`]}
                    onChange={(value) => set('advanced', { ...values.advanced, [field.key]: value })}
                    onValidityChange={(valid) => onMoneyValidityChange?.(`advanced.${field.key}`, valid)}
                    placeholder={field.ph}
                  />
                ) : field.type === 'textarea' ? (
                  <textarea
                    id={`advanced-${field.key}`}
                    value={String(values.advanced[field.key] ?? '')}
                    onChange={(e) => set('advanced', { ...values.advanced, [field.key]: e.target.value })}
                    placeholder={field.ph}
                    rows={2}
                    className={TEXTAREA}
                  />
                ) : (
                  <input
                    id={`advanced-${field.key}`}
                    type="text"
                    value={String(values.advanced[field.key] ?? '')}
                    onChange={(e) =>
                      set('advanced', {
                        ...values.advanced,
                        [field.key]: e.target.value,
                      })
                    }
                    placeholder={field.ph}
                    className={FIELD}
                  />
                )}
              </div>
            ))}
          </FormGrid>
        </details>
      ))}
    </CollapsibleFormSection>
  );
}
