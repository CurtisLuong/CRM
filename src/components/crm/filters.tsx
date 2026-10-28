import { ArrowDownWideNarrow, ArrowUpNarrowWide, Bookmark, BookmarkPlus, Check, ListFilter, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { Level, Stage } from '@/lib/crm';
import { cn } from '@/lib/utils';
import { Glyph } from './signal';
import { StageChip } from './stage';

const count =
  'inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-surface-200 px-[5px] font-mono text-[11px] font-semibold text-ink-muted';

export interface ChoiceOption {
  value: string;
  label?: string;
  count?: number;
  level?: Level;
  stage?: Stage;
}

/** Selectable chips for short lists — the default filter control (no truncated dropdowns). Every option shows its count. */
export function ChipGroup(
  props: { options: ChoiceOption[]; label?: string; allowEmpty?: boolean } & (
    | { multiple: true; value?: string[]; defaultValue?: string[]; onChange?: (v: string[]) => void }
    | { multiple?: false; value?: string | null; defaultValue?: string | null; onChange?: (v: string | null) => void }
  ),
) {
  const { options, label, allowEmpty = true } = props;
  const [inner, setInner] = React.useState<string[] | string | null>(
    props.defaultValue ?? (props.multiple ? [] : null),
  );
  const val = props.value !== undefined ? props.value : inner;
  const isOn = (v: string) => (props.multiple ? ((val as string[]) ?? []).includes(v) : val === v);
  const toggle = (v: string) => {
    let next: string[] | string | null;
    if (props.multiple) {
      const a = [...((val as string[]) ?? [])];
      const i = a.indexOf(v);
      if (i >= 0) a.splice(i, 1);
      else a.push(v);
      next = a;
      if (props.value === undefined) setInner(next);
      props.onChange?.(next);
    } else {
      next = isOn(v) && allowEmpty ? null : v;
      if (props.value === undefined) setInner(next);
      props.onChange?.(next);
    }
  };
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = isOn(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(o.value)}
            className={cn(
              'inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface-100 px-3 text-[13px] font-medium text-ink hover:border-ink-muted hover:bg-surface-200',
              on && 'border-ion bg-ion-tint hover:border-ion hover:bg-ion-tint',
              o.count === 0 && !on && 'text-ink-muted',
            )}
          >
            {on && props.multiple && <Check className="size-3.5 text-ion" />}
            {o.level && <Glyph level={o.level} />}
            {o.stage ? (
              <StageChip stage={o.stage} className="h-5 border-0 bg-transparent px-0" />
            ) : (
              <span>{o.label}</span>
            )}
            {o.count != null && <span className={cn(count, on && 'bg-surface-100 text-ink')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Exactly one of 2–4 always-set options: scope, period, direction. */
export function Segmented({
  options,
  value,
  defaultValue,
  onChange,
  label,
  size = 'md',
  block,
}: {
  options: { value: string; label: React.ReactNode; count?: number; icon?: React.ReactNode }[];
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  label?: string;
  size?: 'md' | 'sm';
  block?: boolean;
}) {
  const [inner, setInner] = React.useState(defaultValue ?? options[0]?.value);
  const v = value ?? inner;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex gap-0.5 rounded-md border border-line bg-surface-0 p-[3px]', block && 'flex')}
    >
      {options.map((o) => {
        const on = o.value === v;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              if (value === undefined) setInner(o.value);
              onChange?.(o.value);
            }}
            className={cn(
              'inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 font-medium text-ink-muted hover:text-ink [&_svg]:size-4',
              size === 'sm' ? 'min-h-7 px-2.5 text-xs' : 'min-h-[34px] text-[13px]',
              block && 'flex-1',
              on && 'bg-surface-200 font-semibold text-ink shadow-[0_0_0_1px_var(--line)] [&_svg]:text-ion',
            )}
          >
            {o.icon}
            {o.label}
            {o.count != null && <span className={count}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface SortField {
  value: string;
  label: string;
  desc: string;
  asc: string;
  hint?: string;
  defaultDir?: 'asc' | 'desc';
}
export interface SortValue {
  field: string;
  dir: 'asc' | 'desc';
}

/** Default fields. "Độ gấp · Gấp nhất trước" is the default sort of an action-based CRM. */
export const SORT_FIELDS: SortField[] = [
  {
    value: 'urgency',
    label: 'Độ gấp',
    desc: 'Gấp nhất trước',
    asc: 'Thong thả nhất trước',
    hint: 'Quá hạn → sắp tới → đúng hẹn',
  },
  { value: 'registered', label: 'Ngày đăng ký', desc: 'Mới nhất trước', asc: 'Cũ nhất trước' },
  { value: 'lastTouch', label: 'Lần chạm gần nhất', desc: 'Vừa chạm trước', asc: 'Lâu chưa chạm trước' },
  { value: 'touches', label: 'Số lần tương tác', desc: 'Nhiều nhất trước', asc: 'Ít nhất trước' },
  { value: 'name', label: 'Tên', desc: 'Z → A', asc: 'A → Z' },
];

export function sortLabel(v: SortValue, fields = SORT_FIELDS): string {
  const f = fields.find((x) => x.value === v.field);
  return f ? `${f.label} · ${v.dir === 'asc' ? f.asc : f.desc}` : '';
}

/** Sort by ONE field, then its direction in words that fit the field. */
export function SortControl({
  value,
  defaultValue,
  onChange,
  fields = SORT_FIELDS,
  label = 'Sắp xếp theo',
}: {
  value?: SortValue;
  defaultValue?: SortValue;
  onChange?: (v: SortValue) => void;
  fields?: SortField[];
  label?: string;
}) {
  const [inner, setInner] = React.useState<SortValue>(defaultValue ?? { field: fields[0]?.value ?? '', dir: 'desc' });
  const v = value ?? inner;
  const set = (n: SortValue) => {
    if (value === undefined) setInner(n);
    onChange?.(n);
  };
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col overflow-hidden rounded-md border border-line">
      {fields.map((f) => {
        const on = f.value === v.field;
        return (
          <div
            key={f.value}
            className={cn(
              'flex flex-wrap items-center gap-2 border-t border-line bg-surface-100 py-1 pr-2 first:border-t-0',
              on && 'bg-surface-200 pb-2.5',
            )}
          >
            <button
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => set({ field: f.value, dir: on ? v.dir : (f.defaultDir ?? 'desc') })}
              className={cn(
                'flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 text-left text-sm font-medium text-ink',
                on && 'font-semibold',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'size-4 shrink-0 rounded-full border-2 border-ink-muted',
                  on && 'border-[5px] border-ion',
                )}
              />
              <span className="flex flex-col">
                {f.label}
                {f.hint && <span className="text-caption font-normal text-ink-muted">{f.hint}</span>}
              </span>
            </button>
            {on && (
              <div className="ml-[42px]">
                <Segmented
                  size="sm"
                  label={`Chiều sắp xếp ${f.label}`}
                  value={v.dir}
                  onChange={(d) => set({ field: f.value, dir: d as 'asc' | 'desc' })}
                  options={[
                    { value: 'desc', label: f.desc, icon: <ArrowDownWideNarrow /> },
                    { value: 'asc', label: f.asc, icon: <ArrowUpNarrowWide /> },
                  ]}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Section of the filter panel: overline title, "n đã chọn", "Bỏ chọn". */
export function FilterSection({
  title,
  summary,
  onReset,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  onReset?: (() => void) | null;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
      <legend className="mb-2.5 flex w-full items-center gap-2 p-0">
        <span className="text-overline">{title}</span>
        {summary && <span className="flex-1 text-xs font-medium text-ion">{summary}</span>}
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto cursor-pointer rounded-[4px] px-1 py-0.5 text-xs font-medium text-ink-muted hover:text-ink hover:underline"
          >
            Bỏ chọn
          </button>
        )}
      </legend>
      {children}
    </fieldset>
  );
}

export function FilterChip({ label, value, onRemove }: { label?: string; value: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border border-ion bg-ion-tint pl-2.5 pr-1 text-xs font-medium text-ink">
      {label && <span className="text-ink-muted">{label}:</span>}
      <span className="font-semibold">{value}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Bỏ lọc ${label ?? ''} ${value}`}
          onClick={onRemove}
          className="grid size-[22px] cursor-pointer place-items-center rounded-full text-ink-muted hover:bg-surface-100 hover:text-ink"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

/** Saved filter + sort ("tệp khách"), one tap to apply, live counts. Name by the job: "Khách nóng", "FB tuần này". */
export function SavedViews({
  views,
  active,
  onApply,
  onSave,
  saveLabel = 'Lưu bộ lọc này',
  onDelete,
}: {
  views: { id: string; label: string; count?: number }[];
  active?: string;
  onApply?: (id: string) => void;
  onSave?: () => void;
  saveLabel?: string;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {views.map((v) => {
        const on = v.id === active;
        return (
          <span
            key={v.id}
            className={cn(
              'inline-flex items-center rounded-sm border border-line bg-surface-100 hover:border-ink-muted',
              on && 'border-ion bg-ion-tint pr-1 hover:border-ion',
            )}
          >
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onApply?.(v.id)}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 px-2.5 text-[13px] font-medium text-ink"
            >
              <Bookmark className={cn('size-3.5 text-ink-muted', on && 'text-ion')} />
              {v.label}
              {v.count != null && <span className={count}>{v.count}</span>}
            </button>
            {onDelete && on && (
              <button
                type="button"
                aria-label={`Xoá tệp ${v.label}`}
                onClick={() => onDelete(v.id)}
                className="grid size-[22px] cursor-pointer place-items-center rounded-full text-ink-muted hover:bg-surface-100 hover:text-ink"
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        );
      })}
      {onSave && (
        <button
          type="button"
          onClick={onSave}
          className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-sm border border-dashed border-line px-2.5 text-[13px] font-medium text-ion hover:border-ion"
        >
          <BookmarkPlus className="size-3.5" />
          {saveLabel}
        </button>
      )}
    </div>
  );
}

/** Above a list: "Bộ lọc (n)", one removable chip per choice, result count, current sort. */
export function FilterBar({
  chips = [],
  onOpen,
  onClearAll,
  result,
  noun = 'khách',
  sort,
  sortFields,
  onSort,
}: {
  chips?: { label?: string; value: string; onRemove?: () => void }[];
  onOpen?: () => void;
  onClearAll?: () => void;
  result?: number;
  noun?: string;
  sort?: SortValue;
  sortFields?: SortField[];
  onSort?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <Button size="sm" onClick={onOpen} aria-haspopup="dialog" className={cn(chips.length > 0 && 'border-ion')}>
        <ListFilter />
        Bộ lọc
        {chips.length > 0 && (
          <span className="inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ion px-[5px] font-mono text-[11px] font-semibold text-on-ion">
            {chips.length}
          </span>
        )}
      </Button>
      {chips.map((c, i) => (
        <FilterChip key={i} {...c} />
      ))}
      {chips.length > 1 && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="cursor-pointer px-1 text-xs font-medium text-ink-muted hover:text-ink hover:underline"
        >
          Xoá tất cả
        </button>
      )}
      <span className="flex-1" />
      {result != null && (
        <span className="text-[13px] text-ink-muted">
          <b className="font-mono font-semibold text-ink">{result}</b> {noun}
        </span>
      )}
      {sort && (
        <Button variant="ghost" size="sm" onClick={onSort} aria-haspopup="dialog">
          {sort.dir === 'asc' ? <ArrowUpNarrowWide /> : <ArrowDownWideNarrow />}
          {sortLabel(sort, sortFields)}
        </Button>
      )}
    </div>
  );
}
