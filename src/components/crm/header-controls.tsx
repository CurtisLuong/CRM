import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Level } from '@/lib/crm';
import { cn } from '@/lib/utils';
import { Icon } from '@/ui/Icon';

/** Ô mở bảng tìm chung; giữ tên truy cập cũ dù gợi ý đổi theo khổ màn. Điện thoại (Curtis 11/11): icon + "Tìm" vừa khít để tiêu đề màn hiện đủ. */
export function HeaderSearch({ onOpen, className }: { onOpen: () => void; className?: string }) {
  return (
    <button
      type="button"
      title="Tìm (⌘K)"
      onClick={onOpen}
      className={cn(
        'inline-flex h-11 w-auto min-w-11 shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface-100 px-2.5 text-ink-muted hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ion md:w-80 md:gap-2 md:px-3',
        className,
      )}
    >
      <Search className="size-5 shrink-0" aria-hidden />
      {/* Tên truy cập lấy từ chữ trong nút (axe: chữ hiện phải nằm trong tên); không dùng aria-label để khỏi trùng nhãn "Dự án" ở màn khác. */}
      <span className="sr-only">Tìm khách, lệnh</span>
      <span className="min-w-0 flex-1 truncate text-left text-label">
        <span className="md:hidden">Tìm</span>
        <span className="hidden md:inline">Tìm khách, SĐT, dự án…</span>
      </span>
      <kbd aria-hidden className="hidden rounded-sm border border-line bg-surface-200 px-1 text-caption md:inline">
        ⌘K
      </kbd>
    </button>
  );
}

export type SyncState =
  | { kind: 'synced'; at: string }
  | { kind: 'pending'; count: number }
  | { kind: 'offline' }
  | { kind: 'error' };

const SYNC_TONE: Record<Level, string> = { ok: 'text-ink-muted', soon: 'text-soon-text', alert: 'text-alert-text' };

/** Chỉ trình bày trạng thái do hàng đợi cung cấp, không suy lại luật đồng bộ. */
export function SyncStatusButton({
  state,
  onOpen,
  className,
}: {
  state: SyncState;
  onOpen?: () => void;
  className?: string;
}) {
  const label =
    state.kind === 'synced'
      ? `Đã đồng bộ ${state.at}`
      : state.kind === 'pending'
        ? `Chờ ${state.count} thay đổi`
        : state.kind === 'offline'
          ? 'Ngoại tuyến'
          : 'Lỗi đồng bộ';
  const level: Level = state.kind === 'error' ? 'alert' : state.kind === 'pending' ? 'soon' : 'ok';
  const props = {
    'data-state': state.kind,
    title: label,
    className: cn(
      'inline-flex size-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ion',
      onOpen && 'hover:bg-surface-200',
      className,
      SYNC_TONE[level],
      state.kind === 'offline' && 'opacity-50',
    ),
  };
  const content = (
    <>
      <Icon
        name="sync"
        size={20}
        className={
          state.kind === 'pending' ? 'animate-spin [animation-duration:2s] motion-reduce:animate-none' : undefined
        }
      />
      <span className="sr-only">{label}</span>
    </>
  );
  return (
    <span aria-live="polite" className="inline-flex shrink-0">
      {onOpen ? (
        <button type="button" onClick={onOpen} {...props}>
          {content}
        </button>
      ) : (
        <span {...props}>{content}</span>
      )}
    </span>
  );
}

/** Một nội dung truy cập duy nhất; hiệu ứng vào ngắn, tắt khi người dùng giảm chuyển động. */
export function ScrollTitle({
  title,
  replacement,
  detail,
  active,
}: {
  title: ReactNode;
  replacement?: ReactNode;
  detail?: ReactNode;
  active: boolean;
}) {
  const swapped = active && replacement != null;
  return (
    <span
      key={swapped ? 'replacement' : 'title'}
      data-scroll-title={swapped ? 'replacement' : 'title'}
      className="flex min-w-0 items-baseline gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
    >
      {swapped ? (
        <>
          {/* Tên truy cập của thanh giữ nguyên tiêu đề màn: tránh hai heading cùng tên khách. */}
          <span className="sr-only">{title}</span>
          <span aria-hidden className="min-w-0 truncate">
            {replacement}
          </span>
          {detail != null && (
            <span aria-hidden className="shrink-0 text-label font-normal text-ink-muted">
              {detail}
            </span>
          )}
        </>
      ) : (
        <span className="min-w-0 truncate">{title}</span>
      )}
    </span>
  );
}
