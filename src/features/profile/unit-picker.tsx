import { useId, useState } from 'react';
import { Field, TextField } from '@/components/crm/form-fields';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Icon } from '@/ui/Icon';

type CodeRow = { id: string; code: string };
const codeKey = (value: string) => value.trim().toLocaleLowerCase('vi');

/** Danh sách có tìm kiếm, giữ mã cũ và cho chọn lưu tay hoặc thêm vào Giỏ hàng. */
export function UnitPicker({
  label,
  kind,
  value,
  rows,
  disabled,
  onSelect,
  onAdd,
}: {
  label: string;
  kind: 'toà' | 'căn';
  value: string | null | undefined;
  rows: CodeRow[];
  disabled: boolean;
  onSelect: (code: string) => Promise<boolean>;
  onAdd: (code: string) => Promise<boolean>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const legacy = value && !rows.some((row) => codeKey(row.code) === codeKey(value));
  const options = legacy ? [{ id: 'legacy', code: value }, ...rows] : rows;
  const filtered = options.filter((row) => codeKey(row.code).includes(codeKey(draft)));
  const newCode = draft.trim();
  const unknown = newCode && !rows.some((row) => codeKey(row.code) === codeKey(newCode));

  const choose = async (code: string, add = false) => {
    if (saving || disabled) return;
    setSaving(true);
    try {
      if (await (add ? onAdd(code) : onSelect(code))) setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Field id={id} label={label} className="[&_label]:min-h-9">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setDraft('');
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="secondary"
            disabled={disabled || saving}
            className="min-h-11 w-full min-w-0 justify-between border border-input bg-surface-100 font-normal"
          >
            <span className="truncate">{value || '—'}</span>
            <span aria-hidden="true" className="text-ink-muted">
              <Icon name="expand" size={16} />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 max-w-[calc(100vw-2rem)] space-y-2">
          <TextField
            label={`Tìm hoặc nhập mã ${kind}`}
            value={draft}
            disabled={disabled || saving}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && newCode) {
                event.preventDefault();
                void choose(rows.find((row) => codeKey(row.code) === codeKey(newCode))?.code ?? newCode);
              }
            }}
          />
          {!rows.length && <p className="text-caption text-ink-muted">Chưa có</p>}
          <fieldset aria-label={`${label} trong Giỏ hàng`} className="max-h-60 overflow-y-auto">
            <Button
              variant="ghost"
              className="min-h-11 w-full justify-start"
              disabled={disabled || saving}
              onClick={() => void choose('')}
            >
              —
            </Button>
            {filtered.map((row) => (
              <Button
                key={row.id}
                variant="ghost"
                className="min-h-11 w-full justify-start whitespace-normal text-left [overflow-wrap:anywhere]"
                disabled={disabled || saving}
                onClick={() => void choose(row.code)}
              >
                {row.code}
              </Button>
            ))}
            {!filtered.length && rows.length > 0 && <p className="text-caption text-ink-muted">Không có mã phù hợp.</p>}
          </fieldset>
          {(unknown || !rows.length) && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-2">
              <Button
                variant="primary"
                disabled={disabled || saving || !newCode}
                onClick={() => void choose(newCode, true)}
              >
                Thêm
              </Button>
              {newCode && (
                <Button variant="ghost" disabled={disabled || saving} onClick={() => void choose(newCode)}>
                  Lưu mã vào hồ sơ
                </Button>
              )}
            </div>
          )}
          {!newCode && !rows.length && <p className="text-caption text-ink-muted">Nhập mã để thêm.</p>}
        </PopoverContent>
      </Popover>
    </Field>
  );
}
