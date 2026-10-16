import { Search } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { IconName } from '@/config/icons';
import { cn } from './cn';
import { Icon } from './Icon';
import { Kbd } from './Kbd';

export type PaletteItem = {
  id: string;
  label: string;
  /** Dòng phụ: bậc, dự án, mô tả lệnh… */
  sub?: string;
  icon?: IconName;
  /** Tên nhóm hiển thị: "Khách hàng", "Lệnh", "Màn"… */
  group: string;
  /** Từ khoá tìm thêm (không hiển thị). */
  keywords?: string;
  shortcut?: string[];
  onSelect: () => void;
};

/** Bỏ dấu + chữ thường để so khớp lệnh/màn (khách dùng matcher của domain/search qua `search`). */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

export function filterItems(items: PaletteItem[], query: string): PaletteItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((it) => {
    const hay = fold(`${it.label} ${it.sub ?? ''} ${it.keywords ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
}

/**
 * Bảng lệnh (Radix Dialog): một ô tìm cho khách + lệnh + màn. Mũi tên lên/xuống chọn, Enter chạy, Esc đóng.
 * Mobile mở toàn màn; desktop hộp giữa trên. `search` trả khách khớp (async được) — nối domain/search ở feature.
 */
export function CommandPalette({
  open,
  onOpenChange,
  items,
  search,
  placeholder = 'Tìm khách, lệnh, màn…',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
  search?: (query: string) => PaletteItem[] | Promise<PaletteItem[]>;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<PaletteItem[]>([]);
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setFound([]);
    }
  }, [open]);

  useEffect(() => {
    if (!search || !query.trim()) {
      setFound([]);
      return;
    }
    let live = true;
    Promise.resolve(search(query)).then(
      (r) => live && setFound(r),
      () => live && setFound([]),
    );
    return () => {
      live = false;
    };
  }, [query, search]);

  const results = useMemo(() => [...found, ...filterItems(items, query)], [found, items, query]);
  // Kết quả đổi (gõ thêm, khách trả về) → về dòng đầu.
  const [seen, setSeen] = useState(results);
  if (seen !== results) {
    setSeen(results);
    setActive(0);
  }

  const groups = useMemo(() => {
    const map = new Map<string, Array<{ item: PaletteItem; index: number }>>();
    results.forEach((item, index) => {
      const g = map.get(item.group) ?? [];
      g.push({ item, index });
      map.set(item.group, g);
    });
    return [...map.entries()];
  }, [results]);

  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    onOpenChange(false);
    item.onSelect();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      const next = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      setActive(next);
      listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[active]);
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 hidden bg-text/40 lg:block dark:bg-bg/75" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-50 flex flex-col bg-surface text-text outline-none',
            'inset-0 pt-[env(safe-area-inset-top)]',
            'lg:inset-x-0 lg:top-[12vh] lg:bottom-auto lg:mx-auto lg:max-h-[70vh] lg:w-[640px] lg:rounded-card lg:border lg:border-border lg:pt-0 lg:shadow-e3',
          )}
        >
          <Dialog.Title className="sr-only">Bảng lệnh</Dialog.Title>
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4">
            <Search size={20} strokeWidth={1.75} className="shrink-0 text-text-2" aria-hidden />
            <input
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results.length ? optionId(active) : undefined}
              aria-autocomplete="list"
              aria-label="Tìm khách, lệnh, màn"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="h-14 min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-text-3"
            />
            <Dialog.Close className="min-h-11 shrink-0 rounded-control px-2 text-body-strong text-accent hover:bg-accent-soft lg:hidden">
              Đóng
            </Dialog.Close>
            <Kbd keys={['Esc']} />
          </div>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Kết quả"
            className="min-h-0 flex-1 overflow-y-auto p-2"
          >
            {groups.map(([group, rows]) => (
              // biome-ignore lint/a11y/useSemanticElements: nhóm trong listbox ARIA, không phải form (<fieldset>).
              <div key={group} role="group" aria-label={group} className="pb-2">
                <div className="px-2 pt-2 pb-1 text-label text-text-2" aria-hidden>
                  {group}
                </div>
                {rows.map(({ item, index }) => (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: phím do ô combobox xử lý (aria-activedescendant).
                  <div
                    key={item.id}
                    id={optionId(index)}
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === active}
                    data-index={index}
                    onMouseMove={() => setActive(index)}
                    onClick={() => run(item)}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 py-1.5',
                      index === active && 'bg-surface-2',
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-2">
                      <Icon name={item.icon ?? 'task'} size={16} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body-strong">{item.label}</span>
                      {item.sub && <span className="truncate text-small text-text-2">{item.sub}</span>}
                    </span>
                    {item.shortcut && <Kbd keys={item.shortcut} />}
                  </div>
                ))}
              </div>
            ))}
            {!results.length && (
              <p role="status" className="px-2 py-8 text-center text-small text-text-2">
                {query.trim() ? `Không thấy “${query.trim()}”` : 'Gõ để tìm khách, lệnh hoặc màn'}
              </p>
            )}
          </div>
          <p className="sr-only" aria-live="polite">
            {query.trim() ? `${results.length} kết quả` : ''}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
