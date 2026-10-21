import { useId } from 'react';
import type { UseFormRegister } from 'react-hook-form';
import { ADVANCED_GROUPS } from '@/config/advanced';
import { calcCungFromDOB, calcMenhFromSolarDOB } from '@/domain/lunar/lunar';
import { Button, Icon } from '@/ui';
import type { IntakeValues } from './schema';
import { safeDob } from './view';

const FIELD =
  'min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body text-text focus-visible:outline-2 focus-visible:outline-focus';
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

  const input = (text: string, name: keyof IntakeValues, type = 'text', props: Record<string, unknown> = {}) => (
    <label className="flex flex-col gap-1 text-small text-text-2" key={name}>
      {text}
      <input
        {...register(name)}
        type={type}
        value={String(values[name] ?? '')}
        onChange={(e) => set(name, e.target.value)}
        aria-invalid={!!fieldErrors[name]}
        className={FIELD}
        {...props}
      />
      {fieldErrors[name] && <span className="text-small text-danger">{fieldErrors[name]}</span>}
    </label>
  );

  const select = (text: string, name: keyof IntakeValues, options: readonly string[]) => (
    <label className="flex flex-col gap-1 text-small text-text-2" key={name}>
      {text}
      <select
        {...register(name)}
        value={String(values[name] ?? '')}
        onChange={(e) => set(name, e.target.value)}
        aria-invalid={!!fieldErrors[name]}
        className={FIELD}
      >
        <option value="">— Chưa rõ —</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {fieldErrors[name] && <span className="text-small text-danger">{fieldErrors[name]}</span>}
    </label>
  );

  return (
    <section aria-label="Thông tin thêm" className="flex flex-col gap-3">
      <Button variant="secondary" block aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className="flex-1 text-left">{label}</span>
        <Icon name={open ? 'up' : 'expand'} size={20} className="text-text-2" />
      </Button>
      {open && (
        <div id={panelId} className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 shadow-e1">
          <section className="flex flex-col gap-3">
            <h2 className="text-section">Cá nhân</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {select('Giới tính', 'gender', ['nam', 'nữ', 'khác'])}
              {input('Ngày sinh (ngày/tháng/năm)', 'dob', 'text', { placeholder: '15/08/1988' })}
              <p className="text-small text-text-2 sm:col-span-2">
                Mệnh: {values.dob ? calcMenhFromSolarDOB(safeDob(values.dob)) || 'Chưa xác định' : 'Chưa biết'} · Cung:{' '}
                {values.dob ? calcCungFromDOB(safeDob(values.dob)) || 'Chưa xác định' : 'Chưa biết'}
              </p>
              {select('Tình trạng hôn nhân', 'marital_status', ['đã kết hôn', 'chưa kết hôn'])}
              {select('Công việc', 'occupation', ['Tự do', 'Công ty, DN', 'Công, viên chức', 'Công an, Bộ đội'])}
              {input('Thu nhập', 'income')}
              {input('Thường trú', 'residence')}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-section">Đăng ký</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {input('Thời gian đăng ký', 'registered_at', 'datetime-local')}
              {input('Chiến dịch', 'campaign')}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-section">Chi tiết căn hộ</h2>
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

          <label className="flex flex-col gap-1 text-small text-text-2">
            Ghi chú đăng ký
            <textarea
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              className={TEXTAREA}
            />
          </label>

          {ADVANCED_GROUPS.map((group) => (
            <details key={group.title} className="rounded-card border border-border bg-surface-2 p-4">
              <summary className="cursor-pointer text-section">{group.title}</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {group.fields.map((field) => (
                  <div key={field.key} className="flex flex-col gap-1 text-small text-text-2">
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
