import { useEffect, useId, useState } from 'react';
import { Field, TextField } from '@/components/crm/form-fields';
import { type DobView, dobView, parseDobInput } from './dob';
import { SHORT_FIELD } from './fields';

type Props = {
  value: unknown;
  disabled: boolean;
  now: number;
  onSave: (dob: string | null) => void;
};

// Nhãn cao bằng nhãn các ô khác của Thông tin chính để khung ô thẳng hàng.
const LABEL_ROW = '[&_label]:block [&_label]:min-h-9';

/**
 * Ô ngày sinh: một ô gõ "15/08/1985" hoặc "15/08" (năm không bắt buộc), tự lưu khi rời ô.
 * Tuổi, mệnh (nạp âm), cung là ô chỉ đọc riêng đứng ngay sau, tính lại từ dob mỗi lần hiện.
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
    // `contents`: ô ngày sinh và các ô tính từ nó xếp chung hàng với các ô khác (Curtis 30/10: mỗi thuộc tính một ô).
    <fieldset className="contents">
      <legend className="sr-only">Ngày sinh</legend>
      <div className={`${SHORT_FIELD} space-y-1`}>
        <TextField
          id={id}
          label="Ngày sinh"
          className={LABEL_ROW}
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
        {!view.known && view.raw && (
          <p className="text-caption text-ink-muted [overflow-wrap:anywhere]">Đang lưu: {view.raw}</p>
        )}
      </div>
      <DobDerivedFields view={view} cellClassName={SHORT_FIELD} />
    </fieldset>
  );
}

/**
 * Tuổi / Mệnh / Cung, mỗi thứ một ô chỉ đọc; thiếu năm sinh thì chỉ còn Cung.
 * labelClassName: theo nhãn các ô xung quanh (hồ sơ nhãn cao 36px, form Thêm khách nhãn thường).
 */
export function DobDerivedFields({
  view,
  cellClassName,
  labelClassName = LABEL_ROW,
}: {
  view: DobView;
  cellClassName: string;
  labelClassName?: string;
}) {
  if (!view.known) return null;
  const cells: [string, string | null][] = [
    ['Tuổi', view.age == null ? null : String(view.age)],
    // Nạp âm đã kết thúc bằng hành ("Thạch Lựu Mộc") nên đủ nghĩa; tên dài ("Thiên Thượng Hỏa") xuống 2 dòng ở 360px.
    ['Mệnh', view.menhNapAm ?? view.menhShort],
    ['Cung', view.cung],
  ];
  return cells.map(([label, text]) =>
    text ? (
      <div key={label} className={cellClassName}>
        <DerivedField label={label} value={text} labelClassName={labelClassName} />
      </div>
    ) : null,
  );
}

/** Ô chỉ đọc, khung giống ô nhập; chữ dài xuống dòng thì ô cùng hàng giãn cao bằng nhau. */
function DerivedField({ label, value, labelClassName }: { label: string; value: string; labelClassName: string }) {
  const id = useId();
  return (
    <Field id={id} label={label} className={`${labelClassName} h-full`}>
      <output
        id={id}
        className="flex min-h-11 flex-1 items-center rounded-sm border border-input bg-surface-100 px-3 py-2 text-body text-ink"
      >
        {value}
      </output>
    </Field>
  );
}
