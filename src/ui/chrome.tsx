import { Plus, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import type { IconName } from '@/config/icons';
import { cn } from './cn';
import { Icon } from './Icon';
import { Kbd } from './Kbd';

/** Nền mờ chỉ cho 3 thanh dính (header, bottom nav, action bar); fallback nền đặc. */
const STICKY_BG = 'bg-surface/85 backdrop-blur-md supports-[not(backdrop-filter:blur(1px))]:bg-surface';

export type ActionItem = { icon: IconName; label: string; onClick: () => void; disabled?: boolean };

/** Thanh dính đáy hồ sơ/sheet: Gọi · Zalo · Ghi chú · Hẹn — 4 ô đều, icon + nhãn. */
/**
 * Thanh 4 hành động liên hệ (DESIGN_SYSTEM v4 §4, D-023). Hành động đầu (Gọi) là chính: nền accent, rộng hơn.
 * Mobile: cố định ở đáy, thay thanh điều hướng (route đặt `handle.hideNav`). Desktop ≥1024: hàng nút trong nội dung.
 */
export function ActionBar({ actions, className }: { actions: ActionItem[]; className?: string }) {
  return (
    <nav
      aria-label="Hành động nhanh"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 grid gap-2 border-t border-hairline px-3 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))]',
        STICKY_BG,
        'lg:static lg:z-auto lg:flex lg:flex-wrap lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none',
        className,
      )}
      style={{ gridTemplateColumns: `1.4fr repeat(${Math.max(0, actions.length - 1)}, minmax(0, 1fr))` }}
    >
      {actions.map((a, i) => (
        <button
          key={a.label}
          type="button"
          onClick={a.onClick}
          disabled={a.disabled}
          className={cn(
            'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-control text-label font-medium disabled:opacity-50',
            'lg:min-h-10 lg:flex-row lg:gap-2 lg:px-4 lg:text-body-strong',
            i === 0 ? 'bg-accent text-accent-fg hover:brightness-110' : 'bg-surface-2 text-text hover:bg-surface-3',
          )}
        >
          <Icon name={a.icon} size={20} />
          {a.label}
        </button>
      ))}
    </nav>
  );
}

export type SyncState =
  | { kind: 'synced'; at: string }
  | { kind: 'pending'; count: number }
  | { kind: 'offline' }
  | { kind: 'error' };

/** Chấm + chữ ngắn. Lỗi → nhấn xem chi tiết (`onOpen`). Nối `useSyncStatus` ở T2.C3. */
export function SyncIndicator({
  state,
  onOpen,
  className,
}: {
  state: SyncState;
  onOpen?: () => void;
  className?: string;
}) {
  const { dot, text } =
    state.kind === 'synced'
      ? { dot: 'bg-success', text: `Đã đồng bộ ${state.at}` }
      : state.kind === 'pending'
        ? { dot: 'bg-warning', text: `Chờ ${state.count} thay đổi` }
        : state.kind === 'offline'
          ? { dot: 'border border-border-strong', text: 'Ngoại tuyến' }
          : { dot: 'bg-danger', text: 'Lỗi đồng bộ' };
  const content = (
    <>
      <span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden />
      {state.kind === 'offline' && <Icon name="offline" size={16} />}
      {/* v4 (D-023): mobile chỉ hiện chấm — chữ vẫn là tên truy cập, không chiếm chỗ tiêu đề. */}
      <span className={cn('sr-only lg:not-sr-only lg:truncate', state.kind === 'synced' && 'font-data')}>{text}</span>
    </>
  );
  const cls = cn(
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 whitespace-nowrap text-small text-text-2 lg:justify-start',
    state.kind === 'error' && 'text-danger',
    className,
  );
  return (
    <span aria-live="polite" className="inline-flex">
      {onOpen ? (
        <button type="button" onClick={onOpen} className={cn(cls, 'rounded-control px-2 hover:bg-surface-2')}>
          {content}
        </button>
      ) : (
        <span className={cls}>{content}</span>
      )}
    </span>
  );
}

/** Header màn: tiêu đề · ô tìm/lệnh (⌘K) · chuông thông báo · SyncIndicator · avatar. `compact` khi đã cuộn. */
export function Header({
  title,
  onSearch,
  notifications,
  sync,
  trailing,
  compact,
  className,
}: {
  title: string;
  onSearch?: () => void;
  /** Chuông Thông báo (PF-06) — đứng giữa Tìm và Đồng bộ theo thứ tự cụm phải. */
  notifications?: ReactNode;
  sync?: ReactNode;
  trailing?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex items-center gap-2 border-b border-hairline px-4 pt-[env(safe-area-inset-top)]',
        compact ? 'h-12' : 'h-14',
        STICKY_BG,
        className,
      )}
    >
      <h1 className={cn('min-w-0 flex-1 truncate', compact ? 'text-section' : 'text-title')}>{title}</h1>
      {onSearch && (
        <button
          type="button"
          onClick={onSearch}
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control text-text-2 hover:bg-surface-2 lg:min-w-56 lg:justify-start lg:border lg:border-border lg:bg-surface lg:px-3"
        >
          <Search size={20} strokeWidth={1.75} aria-hidden />
          <span className="sr-only flex-1 text-left text-small lg:not-sr-only">Tìm khách, lệnh…</span>
          <Kbd keys={['⌘', 'K']} />
        </button>
      )}
      {notifications}
      {sync}
      {trailing}
    </header>
  );
}

export type NavTab = { value: string; label: string; icon: IconName; badge?: number };

/** Bottom nav mobile: 4 tab + nút ＋ ở giữa (56px, accent). Tab active: icon + chữ accent, chỉ báo 2px. */
export function BottomNav({
  tabs,
  active,
  onSelect,
  onAdd,
  addLabel = 'Thêm',
  className,
}: {
  tabs: NavTab[];
  active: string;
  onSelect: (value: string) => void;
  onAdd: () => void;
  addLabel?: string;
  className?: string;
}) {
  const half = Math.ceil(tabs.length / 2);
  const tab = (t: NavTab) => {
    const on = t.value === active;
    return (
      <button
        key={t.value}
        type="button"
        onClick={() => onSelect(t.value)}
        aria-current={on ? 'page' : undefined}
        className={cn(
          'relative flex min-h-16 flex-col items-center justify-center gap-0.5 whitespace-nowrap text-label',
          on ? 'text-accent' : 'text-text-2 hover:text-text',
        )}
      >
        {on && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" aria-hidden />}
        <span className="relative">
          <Icon name={t.icon} size={24} />
          {t.badge ? (
            <span className="absolute -top-1.5 -right-2.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-data text-label leading-none text-surface">
              {t.badge}
              <span className="sr-only"> cảnh báo</span>
            </span>
          ) : null}
        </span>
        {t.label}
      </button>
    );
  };
  return (
    <nav
      aria-label="Điều hướng chính"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-center border-t border-hairline pb-[env(safe-area-inset-bottom)]',
        STICKY_BG,
        className,
      )}
    >
      {tabs.slice(0, half).map(tab)}
      <span className="flex justify-center">
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          className="inline-flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-e2 hover:brightness-110"
        >
          <Plus size={24} strokeWidth={2} aria-hidden />
        </button>
      </span>
      {tabs.slice(half).map(tab)}
    </nav>
  );
}
