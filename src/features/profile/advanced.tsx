import { useEffect, useId, useRef, useState } from 'react';
import { TextField } from '@/components/crm/form-fields';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ASSET_LEGACY,
  LIFE_CONTEXT_LEGACY,
  PROFILE_ADVANCED_KEYS,
  PROFILE_ASSET_FIELDS,
  PROFILE_LIFE_CONTEXT,
} from '@/config/advanced';
import type { Customer } from '@/domain/customer';
import { displayText } from '@/ui/display';
import { Icon } from '@/ui/Icon';
import { legacyDraft, legacyValues, showLegacy } from './fields';

const FIELD =
  'min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion disabled:opacity-60';

const fieldId = (label: string) => `profile-field-${label.toLocaleLowerCase('vi').replace(/[^\p{L}\p{N}]+/gu, '-')}`;

type TextFieldProps = {
  label: string;
  value: unknown;
  disabled: boolean;
  multiline?: boolean;
  /** Gợi ý trong ô (chỉ cho ô mới của PF-01). */
  placeholder?: string;
  /** 'number' cho ô tiền VNĐ; mặc định chữ. */
  type?: 'text' | 'number';
  onSave: (value: string) => void;
};

/**
 * Ô nhập tự lưu khi rời ô, giữ nguyên hành vi cũ của hồ sơ: chỉ ghi khi giá trị đổi.
 * Dùng chung cho tab Trí nhớ, Nhu cầu & căn và khu Nâng cao.
 */
export function ProfileTextField({
  label,
  value,
  disabled,
  multiline,
  placeholder,
  type = 'text',
  onSave,
}: TextFieldProps) {
  const id = fieldId(label);
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : displayText(value);
  const [draft, setDraft] = useState(raw);
  useEffect(() => setDraft(raw), [raw]);
  const save = () => {
    if (draft !== raw) onSave(draft);
  };
  // Ô số không hiện được ghi cũ dạng chữ (vd. "2 tỷ") → hiện chỉ đọc để không tưởng là trống (D-012).
  const textInNumber = type === 'number' && raw.trim() !== '' && !Number.isFinite(Number(raw));
  return (
    <div className="space-y-1">
      {textInNumber && <p className="text-ink-muted [overflow-wrap:anywhere]">Đang lưu: {raw}</p>}
      {multiline ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="text-label text-ink-muted">
            {label}
          </label>
          <Textarea
            id={id}
            value={draft}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            className="min-h-20"
          />
        </div>
      ) : (
        <TextField
          id={id}
          label={label}
          className="[&_label]:block [&_label]:min-h-9"
          type={type}
          inputMode={type === 'number' ? 'numeric' : undefined}
          min={type === 'number' ? 0 : undefined}
          numeric={type === 'number'}
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
        />
      )}
    </div>
  );
}

type LegacyFieldProps = {
  label: string;
  value: unknown;
  disabled: boolean;
  placeholder?: string;
  legacy: ReturnType<typeof legacyValues>;
  onSave: (value: string) => void;
};

/**
 * Ô gộp (Bối cảnh sống / Điều kiện): khi đang trống thì hiện ghi cũ chỉ đọc + nút chép
 * thành chuỗi gạch đầu dòng. Chép chỉ điền vào ô đang soạn, chưa ghi DB (D-012).
 */
export function LegacyAssistField({ label, value, disabled, placeholder, legacy, onSave }: LegacyFieldProps) {
  const id = fieldId(label);
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : displayText(value);
  const [draft, setDraft] = useState(raw);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setDraft(raw), [raw]);
  const save = () => {
    if (draft !== raw) onSave(draft);
  };
  const copy = () => {
    setDraft(legacyDraft(legacy));
    // Đưa con trỏ vào ô để lần rời ô kế tiếp lưu đúng như mọi ô khác.
    ref.current?.focus();
  };
  return (
    <div className="space-y-2">
      <div className="block space-y-1 text-caption text-ink-muted">
        <label htmlFor={id}>{label}</label>
        <textarea
          id={id}
          ref={ref}
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          className={`${FIELD} min-h-20 py-2`}
        />
      </div>
      {showLegacy(legacy, draft) && (
        <div className="space-y-2 rounded-sm border border-dashed border-line bg-surface-200 p-3">
          <p className="text-caption text-ink-muted">Ghi cũ đang giữ trong hồ sơ (chưa gộp vào ô):</p>
          <dl className="space-y-1">
            {legacy.map((row) => (
              <div key={row.key}>
                <dt className="text-caption text-ink-muted">{row.label}</dt>
                <dd className="text-body [overflow-wrap:anywhere]">{row.value}</dd>
              </div>
            ))}
          </dl>
          <Button disabled={disabled} onClick={copy}>
            Chép ghi cũ vào ô
          </Button>
        </div>
      )}
    </div>
  );
}

type Props = {
  customer: Customer;
  writable: boolean;
  now?: number;
  /** Giữ trong chữ ký cũ; Ngày sinh đã chuyển lên Thông tin chính (CL-03). */
  onSaveField?: (field: string, value: unknown) => void;
  /** Lưu một khoá trong cột JSONB advanced, luôn giữ khoá cũ + khoá lạ. */
  onSaveAdvanced: (key: string, value: unknown) => void;
};

/**
 * Khu "Nâng cao" cuối tab Trí nhớ: mặc định đóng mỗi lần mở hồ sơ.
 * Gồm Bối cảnh sống (ô gộp), Tài sản (3 ô), trường cũ khác. Ngày sinh không còn ở đây (CL-03).
 */
export function ProfileAdvanced({ customer, writable, onSaveAdvanced }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const advanced = customer.advanced || {};
  const assetLegacy = legacyValues(advanced, ASSET_LEGACY);
  const unknown = Object.entries(advanced).filter(([key]) => !PROFILE_ADVANCED_KEYS.includes(key));
  const saveNumber = (key: string, raw: string) => {
    if (raw === '') return onSaveAdvanced(key, null);
    const value = Number(raw);
    onSaveAdvanced(key, Number.isFinite(value) ? value : raw);
  };

  return (
    <section aria-label="Hồ sơ nâng cao" className="space-y-3">
      <Button
        variant="secondary"
        className="w-full"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span className="flex-1 text-left">Nâng cao</span>
        <Icon name={open ? 'up' : 'expand'} size={20} className="text-ink-muted" />
      </Button>
      {open && (
        <div id={panelId} className="space-y-4">
          <LegacyAssistField
            label={PROFILE_LIFE_CONTEXT.label}
            value={advanced[PROFILE_LIFE_CONTEXT.key]}
            disabled={!writable}
            placeholder={PROFILE_LIFE_CONTEXT.ph}
            legacy={legacyValues(advanced, LIFE_CONTEXT_LEGACY)}
            onSave={(value) => onSaveAdvanced(PROFILE_LIFE_CONTEXT.key, value)}
          />
          <fieldset className="space-y-2">
            <legend className="text-body font-semibold">Tài sản</legend>
            {PROFILE_ASSET_FIELDS.map((field) => (
              <ProfileTextField
                key={field.key}
                label={field.label}
                value={advanced[field.key]}
                disabled={!writable}
                type="number"
                placeholder={field.ph}
                onSave={(value) => saveNumber(field.key, value)}
              />
            ))}
            {assetLegacy.map((row) => (
              <p key={row.key} className="text-caption text-ink-muted">
                {row.label}: <span className="text-body">{row.value}</span>{' '}
                <span className="text-ink-muted">(ghi cũ được giữ nguyên)</span>
              </p>
            ))}
          </fieldset>
          {/* "Nguồn và độ mới" (field_meta) Curtis cho ẩn 2026-10-21: dữ liệu vẫn ghi cho AI/độ mới, không hiện. */}
          {unknown.length > 0 && (
            <div className="space-y-1">
              <h2 className="text-section-head">Trường cũ khác</h2>
              {unknown.map(([key, value]) => (
                <p key={key} className="text-caption text-ink-muted">
                  {key}: {displayText(value)} <span className="text-ink-muted">(trường cũ được giữ nguyên)</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
