import * as React from "react";
import { CalendarDays, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate, parseDateVN } from "@/lib/crm";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Glyph } from "./signal";

export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  /** Replaces hint, red border + ▲. Say what to fix: "Số điện thoại cần 10 chữ số". */
  error?: string;
  required?: boolean;
  /** Adds "· tuỳ chọn" */
  optional?: boolean;
  className?: string;
}

/** Shared shell: label (+ * / tuỳ chọn), control, hint or error. 44px controls; `rc-form` grid below for layout. */
export function Field({ id, label, hint, error, required, optional, className, children }: FieldProps & { id: string; children: React.ReactNode }) {
  return (
    <div className={cn("relative flex min-w-0 flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="text-alert-text" aria-hidden> *</span>}
          {optional && <span className="font-normal text-ink-muted"> · tuỳ chọn</span>}
        </Label>
      )}
      {children}
      {error ? (
        <span id={`${id}-msg`} role="alert" className="flex items-center gap-1.5 text-caption text-alert-text">
          <Glyph level="alert" />
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-msg`} className="text-caption text-ink-muted">
            {hint}
          </span>
        )
      )}
    </div>
  );
}

const shell =
  "flex h-11 items-center rounded-sm border border-input bg-surface-100 text-ink hover:border-ink focus-within:border-ion focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ion";

/** Text input: plain, with prefix/suffix (unit or icon), or numeric (mono + decimal keyboard). */
export function TextField({
  label, hint, error, required, optional, className, prefix, suffix, numeric, size = "md", id: idProp, inputMode, ...props
}: FieldProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> & { prefix?: React.ReactNode; suffix?: React.ReactNode; numeric?: boolean; size?: "md" | "sm" }) {
  const auto = React.useId();
  const id = idProp ?? auto;
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} optional={optional} className={className}>
      <div className={cn(shell, size === "sm" && "h-9", error && "border-alert", props.disabled && "bg-surface-200 opacity-50")}>
        {prefix && <span className="shrink-0 pl-3 font-mono text-[13px] font-medium text-ink-muted">{prefix}</span>}
        <input
          id={id}
          required={required}
          inputMode={inputMode ?? (numeric ? "decimal" : undefined)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent px-3 text-body outline-none placeholder:text-ink-muted",
            prefix && "pl-2",
            numeric && "font-mono text-sm tabular-nums tracking-[0.02em]",
            size === "sm" && "text-sm",
          )}
          {...props}
        />
        {suffix && <span className="shrink-0 pr-3 font-mono text-[13px] font-medium text-ink-muted">{suffix}</span>}
      </div>
    </Field>
  );
}

/** Select for 3–12 options (Radix, styled). Two options → Segmented; long or searchable lists → a combobox. */
export function SelectField({
  label, hint, error, required, optional, className, options, placeholder, value, defaultValue, onValueChange, disabled,
}: FieldProps & {
  options: (string | { value: string; label: string })[];
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  disabled?: boolean;
}) {
  const id = React.useId();
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} optional={optional} className={className}>
      <Select value={value} defaultValue={defaultValue} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id} aria-invalid={error ? true : undefined} className={cn(error && "border-alert")}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {opts.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** Type dd/mm/yyyy (slashes added) or pick from the calendar. Derived facts (tuổi, mệnh) go in `hint`. Store ISO in data. */
export function DatePicker({
  label, hint, error, required, optional, className, value, defaultValue, onChange, placeholder = "dd/mm/yyyy", fromYear = 1940, toYear,
}: FieldProps & { value?: string; defaultValue?: string; onChange?: (text: string, date: Date | null) => void; placeholder?: string; fromYear?: number; toYear?: number }) {
  const id = React.useId();
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const text = value ?? inner;
  const [open, setOpen] = React.useState(false);
  const date = parseDateVN(text) ?? undefined;
  const commit = (t: string) => {
    if (value === undefined) setInner(t);
    onChange?.(t, parseDateVN(t));
  };
  const mask = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 8);
    return d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} optional={optional} className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className={cn(shell, error && "border-alert", open && "border-ion outline-2 outline-offset-1 outline-ion")}>
            <input
              id={id}
              value={text}
              placeholder={placeholder}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              onChange={(e) => commit(mask(e.target.value))}
              className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-sm tabular-nums outline-none placeholder:text-ink-muted"
            />
            <PopoverTrigger asChild>
              <button type="button" aria-label="Mở lịch" className="grid h-full w-10 cursor-pointer place-items-center text-ink-muted hover:text-ion">
                <CalendarDays className="size-[18px]" />
              </button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>
        <PopoverContent className="w-auto">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date}
            startMonth={new Date(fromYear, 0)}
            endMonth={new Date(toYear ?? new Date().getFullYear() + 5, 11)}
            onSelect={(d) => {
              if (d) commit(fmtDate(d));
              setOpen(false);
            }}
          />
          <div className="mt-2 flex justify-between border-t border-line pt-2">
            <button type="button" className="cursor-pointer rounded-sm px-2 py-1 text-[13px] font-medium text-ion hover:bg-ion-tint" onClick={() => { commit(fmtDate(new Date())); setOpen(false); }}>
              Hôm nay
            </button>
            <button type="button" className="cursor-pointer rounded-sm px-2 py-1 text-[13px] font-medium text-ink-muted hover:bg-surface-200" onClick={() => commit("")}>
              Xoá
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

/** Search: magnifier, shortcut hint while empty, clear button once there is text. */
export function SearchBar({
  value, defaultValue, onChange, onClear, placeholder = "Tìm khách, số điện thoại…", shortcut, size = "md", className, label,
}: { value?: string; defaultValue?: string; onChange?: (v: string) => void; onClear?: () => void; placeholder?: string; shortcut?: string; size?: "md" | "sm"; className?: string; label?: string }) {
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const v = value ?? inner;
  const set = (t: string) => {
    if (value === undefined) setInner(t);
    onChange?.(t);
  };
  return (
    <div role="search" className={cn(shell, "w-full max-w-[480px] rounded-md border-line bg-surface-200", size === "sm" && "h-9", className)}>
      <Search className="ml-3 size-[18px] shrink-0 text-ink-muted" aria-hidden />
      <input
        type="search"
        value={v}
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {v ? (
        <button type="button" aria-label="Xoá tìm kiếm" onClick={() => { set(""); onClear?.(); }} className="grid h-full w-10 cursor-pointer place-items-center text-ink-muted hover:text-ion">
          <X className="size-4" />
        </button>
      ) : (
        shortcut && <kbd className="mr-2.5 rounded-[4px] border border-line bg-surface-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">{shortcut}</kbd>
      )}
    </div>
  );
}
