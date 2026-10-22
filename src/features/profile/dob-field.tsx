import { useEffect, useId, useState } from 'react';
import { dobView, parseDobInput } from './dob';

const FIELD =
  'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60';

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
    <fieldset className="min-w-0 space-y-1 text-small text-text-2">
      <legend>Ngày sinh</legend>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        aria-label="Ngày sinh — ngày/tháng/năm"
        aria-invalid={error ? true : undefined}
        className={FIELD}
        disabled={disabled}
        value={draft}
        placeholder="15/08/1985 hoặc 15/08"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
      {!view.known && view.raw && <p className="text-text-3 [overflow-wrap:anywhere]">Đang lưu: {view.raw}</p>}
      {view.known && (view.age != null || view.menhShort || view.cung) && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-small">
          {view.age != null && <span>{view.age} tuổi</span>}
          {view.menhShort && (
            <span>
              {view.menhShort}
              {view.menhNapAm && <span className="text-text-3"> · {view.menhNapAm}</span>}
            </span>
          )}
          {view.cung && <span>Cung {view.cung}</span>}
        </p>
      )}
    </fieldset>
  );
}
