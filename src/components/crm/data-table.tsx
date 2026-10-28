import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { EmptyState } from './empty-state';

export interface Column<R> {
  key: string;
  label: React.ReactNode;
  width?: number | string;
  numeric?: boolean;
  align?: 'left' | 'right';
  sortable?: boolean;
  sortValue?: (row: R) => string | number;
  render?: (row: R) => React.ReactNode;
}
export interface PaginationProps {
  page: number;
  total: number;
  pageSize?: number;
  onPage?: (p: number) => void;
  onPageSize?: ((s: number) => void) | false;
  noun?: string;
}

function pageList(cur: number, last: number): (number | string)[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  let lo = Math.max(2, cur - 1);
  let hi = Math.min(last - 1, cur + 1);
  if (cur <= 3) {
    lo = 2;
    hi = 4;
  }
  if (cur >= last - 2) {
    lo = last - 3;
    hi = last - 1;
  }
  const out: (number | string)[] = [1];
  if (lo > 2) out.push('…a');
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < last - 1) out.push('…b');
  out.push(last);
  return out;
}

const pagerBtn =
  'grid h-8 min-w-8 cursor-pointer place-items-center rounded-sm border border-transparent px-2 font-mono text-[13px] font-medium text-ink hover:border-line hover:bg-surface-200 disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent';

/** "41–60 / 248 khách", ≤7 page buttons with gaps, page size 20/50/100. */
export function Pagination({ page, total, pageSize = 20, onPage, onPageSize, noun = 'khách' }: PaginationProps) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(page, last);
  const from = total ? (cur - 1) * pageSize + 1 : 0;
  const to = Math.min(total, cur * pageSize);
  const go = (n: number) => n >= 1 && n <= last && n !== cur && onPage?.(n);
  return (
    <nav
      aria-label="Phân trang"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2 text-[13px] text-ink-muted"
    >
      <span>
        <span className="font-mono text-ink">
          {from}–{to}
        </span>{' '}
        / <span className="font-mono text-ink">{total}</span> {noun}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Trang trước"
          disabled={cur === 1}
          onClick={() => go(cur - 1)}
          className={pagerBtn}
        >
          <ChevronLeft className="size-4" />
        </button>
        {pageList(cur, last).map((n) =>
          typeof n === 'string' ? (
            <span key={n} className="w-5 text-center">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              aria-current={n === cur ? 'page' : undefined}
              onClick={() => go(n)}
              className={cn(pagerBtn, n === cur && 'border-ion bg-ion-tint hover:bg-ion-tint')}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Trang sau"
          disabled={cur === last}
          onClick={() => go(cur + 1)}
          className={pagerBtn}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      {onPageSize !== false && (
        <label className="flex items-center gap-2">
          Hiển thị
          <select
            value={pageSize}
            onChange={(e) => onPageSize?.(+e.target.value)}
            className="h-8 rounded-sm border border-line bg-surface-200 px-2 font-mono text-[13px] text-ink"
          >
            {[20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
    </nav>
  );
}

/** Customer table: compact 40px rows, sticky header, sort, hover, selected row (open in the Drawer), skeleton, empty state, pagination. */
export function DataTable<R extends { id: string | number }>({
  columns,
  rows,
  density = 'compact',
  onRowClick,
  selectedId,
  sortKey,
  sortDir = 'asc',
  onSort,
  loading,
  skeletonRows = 8,
  empty,
  pagination,
  maxHeight,
  caption,
  className,
}: {
  columns: Column<R>[];
  rows: R[];
  density?: 'compact' | 'comfortable';
  onRowClick?: (row: R) => void;
  selectedId?: string | number;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  /** Server sorting; omit to sort locally. */
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  loading?: boolean;
  skeletonRows?: number;
  empty?: React.ReactNode;
  pagination?: PaginationProps;
  maxHeight?: number | string;
  caption?: string;
  className?: string;
}) {
  const [local, setLocal] = React.useState<{ key?: string; dir: 'asc' | 'desc' }>({ key: sortKey, dir: sortDir });
  const sort = onSort ? { key: sortKey, dir: sortDir } : local;
  const toggle = (c: Column<R>) => {
    if (!c.sortable) return;
    const next = { key: c.key, dir: sort.key === c.key && sort.dir === 'asc' ? ('desc' as const) : ('asc' as const) };
    if (onSort) onSort(next.key, next.dir);
    else setLocal(next);
  };
  const data = React.useMemo(() => {
    if (onSort || !sort.key) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const get = col?.sortValue ?? ((r: R) => (r as Record<string, unknown>)[sort.key!] as string | number);
    return [...rows].sort((a, b) => {
      const x = get(a),
        y = get(b);
      return (x > y ? 1 : x < y ? -1 : 0) * (sort.dir === 'asc' ? 1 : -1);
    });
  }, [rows, columns, sort.key, sort.dir, onSort]);

  return (
    <div className={cn('overflow-hidden rounded-md border border-line bg-surface-100', className)}>
      <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
        <Table density={density} aria-busy={loading || undefined}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <TableHeader>
            <tr>
              {columns.map((c) => {
                const on = sort.key === c.key;
                return (
                  <TableHead
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    className={cn(c.align === 'right' && 'text-right')}
                    aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggle(c)}
                        className={cn(
                          'inline-flex cursor-pointer items-center gap-1 uppercase hover:text-ink',
                          on && 'text-ink',
                        )}
                      >
                        {c.label}
                        {on ? (
                          sort.dir === 'asc' ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3" />
                        )}
                      </button>
                    ) : (
                      c.label
                    )}
                  </TableHead>
                );
              })}
            </tr>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: skeletonRows }, (_, i) => (
                <TableRow key={i} className="[&:hover>td]:bg-transparent">
                  {columns.map((c, j) => (
                    <TableCell key={c.key}>
                      <Skeleton
                        className="h-2.5"
                        style={{ width: j === 0 ? '70%' : `${40 + ((i * 7 + j * 13) % 45)}%` }}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>{empty ?? <EmptyState kind="results" compact />}</td>
              </tr>
            ) : (
              data.map((r) => {
                const sel = selectedId != null && selectedId === r.id;
                return (
                  <TableRow
                    key={r.id}
                    data-state={sel ? 'selected' : undefined}
                    aria-selected={sel || undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
                    className={cn(
                      onRowClick &&
                        'cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ion',
                    )}
                  >
                    {columns.map((c) => (
                      <TableCell
                        key={c.key}
                        style={c.width ? { width: c.width } : undefined}
                        className={cn(c.numeric && 'font-mono tabular-nums', c.align === 'right' && 'text-right')}
                      >
                        {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '')}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {pagination && <Pagination {...pagination} />}
    </div>
  );
}
