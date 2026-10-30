import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';
import type { UseFormRegister } from 'react-hook-form';
import { DatePicker, SelectField, TextField } from '@/components/crm';
import { Button } from '@/components/ui/button';
import { ADVANCED_GROUPS } from '@/config/advanced';
import { dobView } from '@/features/profile/dob';
import { DobDerivedFields } from '@/features/profile/dob-field';
import { SHORT_FIELD } from '@/features/profile/fields';
import { Icon } from '@/ui/Icon';
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
  /** Mã căn gợi ý theo dự án đã chọn (datalist). */
  unitCodes: readonly string[];
  /** Số trường đã điền, hiện trên nhãn nút. */
  filledCount: number;
};

/**
 * PF-03: khu "Thêm thông tin" — mọi trường không thiết yếu nằm sau một nút, mặc định ẩn.
 * Đóng khu không xoá giá trị: các ô vẫn nằm trong state của form và được lưu y như trước.
 */
export function IntakeMore({ open, onToggle, values, register, set, fieldErrors, unitCodes, filledCount }: Props) {
  const panelId = useId();
  const label = filledCount > 0 ? `Thêm thông tin · đã điền ${filledCount}` : 'Thêm thông tin';

  const input = (
    text: string,
    name: keyof IntakeValues,
    type = 'text',
    props: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> = {},
  ) => (
    <TextField
      key={name}
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
      label={text}
      options={[{ value: '__none', label: '— Chưa rõ —' }, ...options]}
      placeholder="— Chưa rõ —"
      value={String(values[name] || '__none')}
      onValueChange={(value) => set(name, value === '__none' ? '' : value)}
      error={fieldErrors[name]}
    />
  );

  return (
    <section aria-label="Thông tin thêm" className="flex flex-col gap-3">
      <Button
        type="button"
        className="w-full justify-between"
        variant="secondary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="flex-1 text-left">{label}</span>
        <Icon name={open ? 'up' : 'expand'} size={20} className="text-ink-muted" />
      </Button>
      {open && (
        <div id={panelId} className="flex flex-col gap-4 rounded-lg border border-line bg-surface-100 p-4">
          <section className="flex flex-col gap-3">
            <h2 className="text-title">Cá nhân</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1.5 text-label text-ink-muted">
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
                label="Ngày sinh (ngày/tháng/năm)"
                value={values.dob}
                onChange={(value) => set('dob', value)}
                error={fieldErrors.dob}
              />
              <div className="flex flex-wrap gap-3 empty:hidden sm:col-span-2">
                <DobDerivedFields
                  view={dobView(safeDob(values.dob), Date.now())}
                  cellClassName={SHORT_FIELD}
                  labelClassName=""
                />
              </div>
              {select('Tình trạng hôn nhân', 'marital_status', ['đã kết hôn', 'chưa kết hôn'])}
              {select('Công việc', 'occupation', ['Tự do', 'Công ty, DN', 'Công, viên chức', 'Công an, Bộ đội'])}
              {input('Thu nhập', 'income')}
              {input('Thường trú', 'residence')}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-title">Đăng ký</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {input('Thời gian đăng ký', 'registered_at', 'datetime-local')}
              {input('Chiến dịch', 'campaign')}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-title">Chi tiết căn hộ</h2>
            <div className="grid gap-3 sm:grid-cols-2">
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
              {input('Giá căn (VNĐ)', 'apt_price', 'number', { min: 0, step: 'any' })}
              {input('Vốn sẵn có (VNĐ)', 'finance', 'number', { min: 0, step: 'any' })}
              {select('Mục đích', 'purpose', ['Ở', 'Đầu tư', 'Cho tặng'])}
            </div>
          </section>

          <label className="flex flex-col gap-1.5 text-label text-ink-muted">
            Ghi chú đăng ký
            <textarea
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              className={`${TEXTAREA} w-full`}
            />
          </label>

          {ADVANCED_GROUPS.map((group) => (
            <details key={group.title} className="rounded-lg border border-line bg-surface-200 p-4">
              <summary className="cursor-pointer text-title">{group.title}</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {group.fields.map((field) => (
                  <div key={field.key} className="flex flex-col gap-1 text-caption text-ink-muted">
                    <label htmlFor={`advanced-${field.key}`}>{field.label}</label>
                    {field.type === 'textarea' ? (
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
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={String(values.advanced[field.key] ?? '')}
                        onChange={(e) =>
                          set('advanced', {
                            ...values.advanced,
                            [field.key]:
                              field.type === 'number' && e.target.value ? Number(e.target.value) : e.target.value,
                          })
                        }
                        placeholder={field.ph}
                        className={FIELD}
                      />
                    )}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
