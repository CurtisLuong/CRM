import { useEffect, useId, useState } from 'react';
import { TextField } from '@/components/crm/form-fields';
import { dobView, parseDobInput } from './dob';

type Props = {
  value: unknown;
  disabled: boolean;
  now: number;
  onSave: (dob: string | null) => void;
};

/**
 * Ô ngày sinh: một ô gõ "15/08/1985" hoặc "15/08" (năm không bắt buộc), tự lưu khi rời ô.
 * Cạnh ô là tuổi + mệnh (ngắn, kèm nạp âm) + cung, tính lại từ dob mỗi lần hiện.
 */
export function DobField({ value, disabled, now, onSave }: Props) {
  const view = dobView(value, now);
  const [draft, setDraft] = useState(view.input);
  const [error, setError] = useState('');
  const id = useId();
  useEffect(() => setDraft(view.input), [view.input]);

  const commit = () => {
    const parsed = parseDobInput(draft);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    setError('');
    // Giá trị chưa đổi thì không ghi DB; dob cũ dạng lạ không bị xoá khi chỉ mở hồ sơ.
    if (parsed.dob === (view.known ? view.raw : null)) return;
    onSave(parsed.dob);
  };

  return (
    <fieldset className="min-w-0 space-y-1 text-caption text-ink-muted">
      <legend className="sr-only">Ngày sinh</legend>
      <TextField
        id={id}
        label="Ngày sinh"
        type="text"
        inputMode="numeric"
        aria-label="Ngày sinh — ngày/tháng/năm"
        error={error || undefined}
        disabled={disabled}
        value={draft}
        placeholder="15/08/1985 hoặc 15/08"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      {!view.known && view.raw && <p className="text-ink-muted [overflow-wrap:anywhere]">Đang lưu: {view.raw}</p>}
      {view.known && (view.age != null || view.menhShort || view.cung) && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-caption">
          {view.age != null && <span>{view.age} tuổi</span>}
          {view.menhShort && (
            <span>
              {view.menhShort}
              {view.menhNapAm && <span className="text-ink-muted"> · {view.menhNapAm}</span>}
            </span>
          )}
          {view.cung && <span>Cung {view.cung}</span>}
        </p>
      )}
    </fieldset>
  );
}
