import { Bell, type LucideIcon, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import * as React from 'react';
import { NAV_TABS } from '@/app/layout.nav';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Level } from '@/lib/crm';
import { cn } from '@/lib/utils';
import { iconGlyph } from '@/ui/Icon';
import { Avatar } from './actions';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  count?: number /** alert = overdue, soon = today */;
  level?: Level;
}

/** 4 khu vực chính của app (D-013) — nguồn: NAV_TABS (src/app/layout.nav.ts), icon theo src/config/icons.ts. */
export const NAV_DEFAULT: NavItem[] = NAV_TABS.map((t) => ({
  id: t.value,
  label: t.label,
  icon: iconGlyph(t.icon),
  href: t.path,
}));

const BADGE: Record<Level, string> = {
  alert: 'bg-alert-tint text-alert-text',
  soon: 'bg-soon-tint text-soon-text',
  ok: 'bg-ok-tint text-ok-text',
};
const DOT: Record<Level, string> = { alert: 'bg-alert', soon: 'bg-soon', ok: 'bg-ok' };

/** Menu trái cố định (≥ 768px). Mở 232px; thu gọn 64px chỉ icon (nhãn → tooltip, số → chấm). Dưới 768px dùng <BottomNav>. */
export function Sidebar({
  items = NAV_DEFAULT,
  footerItems,
  active,
  onNavigate,
  onCreate,
  createLabel = 'Thêm khách',
  user,
  brand = 'Sổ Khách',
  mark = 'SK',
  collapsed: ctl,
  defaultCollapsed,
  onCollapsedChange,
}: {
  items?: NavItem[];
  footerItems?: NavItem[];
  active?: string;
  onNavigate?: (id: string) => void;
  onCreate?: (() => void) | false;
  createLabel?: string;
  user?: { name: string; sync?: string };
  brand?: string;
  mark?: string;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (c: boolean) => void;
}) {
  const [inner, setInner] = React.useState(!!defaultCollapsed);
  const collapsed = ctl ?? inner;
  const toggle = () => {
    onCollapsedChange?.(!collapsed);
    if (ctl === undefined) setInner(!collapsed);
  };
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '[' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) toggle();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });
  const item = (it: NavItem) => {
    const on = it.id === active;
    const Icon = it.icon;
    const linkClass = cn(
      'relative flex h-10 w-full items-center gap-3 rounded-sm px-2.5 text-left text-sm font-medium text-ink-muted no-underline hover:bg-surface-200 hover:text-ink',
      on && 'bg-ion-tint font-semibold text-ink hover:bg-ion-tint',
      collapsed && 'size-11 justify-center px-0',
    );
    const label = collapsed && it.count != null ? `${it.label} · ${it.count}` : it.label;
    const content = (
      <>
        <span className="relative grid place-items-center">
          <Icon className={cn('size-5', on && 'text-ion')} />
          {collapsed && it.count != null && (
            <span
              className={cn(
                'absolute -right-1 -top-1 size-2 rounded-full bg-ink-muted shadow-[0_0_0_2px_var(--surface-100)]',
                it.level && DOT[it.level],
              )}
            />
          )}
        </span>
        {!collapsed && <span className="min-w-0 flex-1 truncate">{it.label}</span>}
        {!collapsed && it.count != null && (
          <span
            className={cn(
              'grid h-5 min-w-[22px] place-items-center rounded-full bg-surface-200 px-1.5 font-mono text-[11px] font-semibold text-ink',
              it.level && BADGE[it.level],
            )}
          >
            {it.count}
          </span>
        )}
      </>
    );
    const link = onNavigate ? (
      <button
        type="button"
        aria-current={on ? 'page' : undefined}
        aria-label={collapsed ? label : undefined}
        onClick={() => onNavigate(it.id)}
        className={linkClass}
      >
        {content}
      </button>
    ) : (
      <a
        href={it.href ?? '#'}
        aria-current={on ? 'page' : undefined}
        aria-label={collapsed ? label : undefined}
        className={linkClass}
      >
        {content}
      </a>
    );
    return (
      <li key={it.id}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">
              {it.label}
              {it.count != null && ` · ${it.count}`}
            </TooltipContent>
          </Tooltip>
        ) : (
          link
        )}
      </li>
    );
  };
  return (
    <nav
      aria-label="Điều hướng chính"
      className={cn(
        'sticky top-0 flex h-dvh shrink-0 self-start flex-col gap-2 overflow-hidden border-r border-line bg-surface-100 p-3 transition-[width] duration-200',
        collapsed ? 'w-16 items-center px-2' : 'w-[232px]',
      )}
    >
      <div className="mb-1 flex h-10 items-center gap-2.5 px-1">
        <span className="grid size-8 shrink-0 place-items-center rounded-[8px] border border-line bg-surface-200 font-mono text-xs font-bold tracking-wider text-ion">
          {mark}
        </span>
        {!collapsed && <span className="whitespace-nowrap text-[15px] font-bold tracking-tight">{brand}</span>}
      </div>
      {onCreate !== false && (
        <Button
          variant="primary"
          onClick={onCreate || undefined}
          aria-label={collapsed ? createLabel : undefined}
          className={cn('mb-2', collapsed ? 'size-11 px-0' : 'h-10 w-full')}
        >
          <Plus className="size-[18px]" />
          {!collapsed && createLabel}
        </Button>
      )}
      <ul className="m-0 flex w-full list-none flex-col gap-0.5 p-0">{items.map(item)}</ul>
      <div className={cn('mt-auto flex w-full flex-col gap-1 border-t border-line pt-2', collapsed && 'items-center')}>
        {footerItems && <ul className="m-0 flex w-full list-none flex-col gap-0.5 p-0">{footerItems.map(item)}</ul>}
        {user && (
          <div className="flex items-center gap-2.5 px-1 py-1.5" title={collapsed ? user.name : undefined}>
            <Avatar name={user.name} size={32} />
            {!collapsed && (
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-semibold">{user.name}</span>
                {user.sync && (
                  <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] text-ink-muted">
                    <i className="size-1.5 rounded-full bg-ok" />
                    {user.sync}
                  </span>
                )}
              </span>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
          aria-expanded={!collapsed}
          className={cn(
            'flex h-10 w-full cursor-pointer items-center gap-3 rounded-sm px-2.5 text-sm font-medium text-ink-muted hover:bg-surface-200 hover:text-ink',
            collapsed && 'size-11 justify-center px-0',
          )}
        >
          {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          {!collapsed && <span className="flex-1 text-left">Thu gọn</span>}
          {!collapsed && <kbd className="rounded-[4px] border border-line px-1.5 font-mono text-[11px]">[</kbd>}
        </button>
      </div>
    </nav>
  );
}

/** Every page: LEFT title + total count (+ subtitle/signals), RIGHT 1–3 actions with the single primary LAST. Optional toolbar row + tabs. */
export function PageHeader({
  title,
  count,
  noun = 'mục',
  subtitle,
  overline,
  signals,
  actions,
  toolbar,
  tabs,
  activeTab,
  onTab,
  sticky = true,
  compact = false,
}: {
  title: React.ReactNode;
  count?: number;
  noun?: string;
  subtitle?: React.ReactNode;
  overline?: React.ReactNode;
  signals?: React.ReactNode;
  actions?: React.ReactNode;
  toolbar?: React.ReactNode;
  tabs?: { id: string; label: string; count?: number }[];
  activeTab?: string;
  onTab?: (id: string) => void;
  sticky?: boolean;
  /** Header khung app gọn 56px để giữ chỗ cho nội dung trên điện thoại. */
  compact?: boolean;
}) {
  return (
    <header
      className={cn(
        cn(
          'flex flex-col gap-3 border-b border-line bg-surface-0 px-6 py-4 max-sm:px-4 max-sm:py-3',
          compact && 'h-14 flex-row flex-nowrap gap-2 px-2 py-0 pt-[env(safe-area-inset-top)] max-sm:px-2',
        ),
        sticky && 'sticky top-0 z-[5]',
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-x-6 gap-y-3',
          compact && 'min-w-0 flex-1 flex-nowrap gap-1',
        )}
      >
        <div className={cn('flex min-w-0 flex-col gap-0.5', compact && 'flex-1 flex-row items-center')}>
          {overline && <span className="text-overline">{overline}</span>}
          <div className="flex flex-wrap items-center gap-2.5">
            <h1
              className={cn(
                'm-0 text-2xl font-bold leading-8 tracking-tight max-sm:text-xl',
                compact && 'truncate text-base leading-5',
              )}
            >
              {title}
            </h1>
            {count != null && (
              <span
                role="img"
                aria-label={`${count} ${noun}`}
                className="inline-grid h-6 place-items-center rounded-[6px] border border-line bg-surface-200 px-2 font-mono text-[13px] font-semibold tabular-nums"
              >
                {count}
              </span>
            )}
            {signals && <span className="inline-flex gap-1.5">{signals}</span>}
          </div>
          {subtitle && <span className="text-[13px] text-ink-muted">{subtitle}</span>}
        </div>
        {actions && (
          <div className={cn('flex flex-wrap items-center gap-2', compact && 'shrink-0 flex-nowrap gap-1')}>
            {actions}
          </div>
        )}
      </div>
      {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
      {tabs && (
        <div role="tablist" className="-mx-1 -mb-4 flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const on = t.id === activeTab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onTab?.(t.id)}
                className={cn(
                  'inline-flex h-10 cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-ink-muted hover:text-ink',
                  on && 'border-ion font-semibold text-ink',
                )}
              >
                {t.label}
                {t.count != null && <span className="font-mono text-[11px] text-ink-muted">{t.count}</span>}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}

/**
 * Khung mọi màn: menu trái (≥ 768px) hoặc thanh tab dưới (< 768px); nội dung đi theo cuộn cửa sổ.
 * Gắn Sheet khách + <Toaster/> một lần ở cấp này.
 */
export function AppShell({
  sidebar,
  bottomNav,
  header,
  children,
  className,
  mainClassName,
  wide = false,
  aside = false,
  asideRef,
}: {
  sidebar: React.ReactNode;
  /** <BottomNav> cho điện thoại; bỏ trống thì điện thoại không có điều hướng. */
  bottomNav?: React.ReactNode;
  header?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  mainClassName?: string;
  /** Màn rộng như Hồ sơ được dùng thêm chiều ngang trên desktop. */
  wide?: boolean;
  aside?: boolean;
  asideRef?: (el: HTMLElement | null) => void;
}) {
  return (
    <div className={cn('flex min-h-dvh bg-surface-0 text-ink', className)}>
      <div className="contents max-md:hidden">{sidebar}</div>
      <div className="flex min-w-0 flex-1 bg-grid">
        <div className="flex min-w-0 flex-1 flex-col">
          {header}
          <main
            id="main"
            className={cn(
              'mx-auto flex w-full min-w-0 flex-1 flex-col gap-4 px-4 pb-24 pt-4 md:px-6 md:pb-8',
              wide ? 'max-w-[1360px]' : 'max-w-[760px]',
              mainClassName,
            )}
          >
            {children}
          </main>
        </div>
        {aside && (
          <aside
            ref={asideRef}
            aria-label="Ngữ cảnh"
            className="sticky top-0 hidden h-dvh w-[360px] shrink-0 overflow-y-auto border-l border-line bg-surface-100 lg:block"
          />
        )}
      </div>
      {bottomNav && <div className="md:hidden">{bottomNav}</div>}
    </div>
  );
}

/** Thanh tab dưới cho điện thoại (< 768px): tối đa 5 mục, icon + nhãn, mục đang mở màu ion; số đếm theo mức gấp. */
export function BottomNav({
  items = NAV_DEFAULT,
  active,
  onNavigate,
  onCreate,
  createLabel = 'Ghi nhanh',
}: {
  items?: NavItem[];
  active?: string;
  onNavigate?: (id: string) => void;
  onCreate?: () => void;
  createLabel?: string;
}) {
  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-100 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="m-0 grid list-none auto-cols-fr grid-flow-col p-0">
        {items.map((it, index) => {
          const on = it.id === active;
          const Icon = it.icon;
          const tab = (
            <li key={it.id}>
              {onNavigate ? (
                <button
                  type="button"
                  aria-current={on ? 'page' : undefined}
                  onClick={() => onNavigate(it.id)}
                  className={cn(
                    'flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-caption font-medium text-ink-muted',
                    on && 'text-ion',
                  )}
                >
                  <span className="relative">
                    <Icon className="size-5" />
                    {it.count != null && it.count > 0 && (
                      <span
                        className={cn(
                          'absolute -top-1.5 left-3 min-w-4 rounded-full px-1 text-center font-mono text-[10px] font-semibold leading-4',
                          BADGE[it.level ?? 'ok'],
                        )}
                      >
                        {it.count}
                      </span>
                    )}
                  </span>
                  <span className="truncate">{it.label}</span>
                </button>
              ) : (
                <a
                  href={it.href ?? '#'}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-caption font-medium text-ink-muted',
                    on && 'text-ion',
                  )}
                >
                  <span className="relative">
                    <Icon className="size-5" />
                    {it.count != null && it.count > 0 && (
                      <span
                        className={cn(
                          'absolute -top-1.5 left-3 min-w-4 rounded-full px-1 text-center font-mono text-[10px] font-semibold leading-4',
                          BADGE[it.level ?? 'ok'],
                        )}
                      >
                        {it.count}
                      </span>
                    )}
                  </span>
                  <span className="truncate">{it.label}</span>
                </a>
              )}
            </li>
          );
          const half = Math.ceil(items.length / 2);
          return (
            <React.Fragment key={it.id}>
              {index === half && onCreate && (
                <li key="create" className="flex min-w-0 items-center justify-center">
                  <button
                    type="button"
                    onClick={onCreate}
                    aria-label={createLabel}
                    className="grid size-12 place-items-center rounded-full bg-ion text-on-ion shadow-glow-ion"
                  >
                    <Plus className="size-5" />
                  </button>
                </li>
              )}
              {tab}
            </React.Fragment>
          );
        })}
        {onCreate && items.length % 2 === 1 && (
          <li className="flex min-w-0 items-center justify-center">
            <button
              type="button"
              onClick={onCreate}
              aria-label={createLabel}
              className="grid size-12 place-items-center rounded-full bg-ion text-on-ion shadow-glow-ion"
            >
              <Plus className="size-5" />
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}

/** Bell for the top bar: count in the color of the most urgent unread signal. */
export function NotificationBell({
  count,
  level = 'alert',
  active,
  onClick,
}: {
  count?: number;
  level?: Level;
  active?: boolean;
  onClick?: () => void;
}) {
  const COUNT: Record<Level, string> = {
    alert: 'bg-alert text-on-alert',
    soon: 'bg-soon text-on-soon',
    ok: 'bg-ion text-on-ion',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      aria-label={`Thông báo${count ? `: ${count} chưa đọc` : ''}`}
      className={cn(
        'relative grid size-10 cursor-pointer place-items-center rounded-md border border-line bg-surface-100 text-ink hover:border-ink-muted hover:bg-surface-200',
        active && 'border-ink-muted bg-surface-200',
      )}
    >
      <Bell className="size-[18px]" />
      {!!count && (
        <span
          className={cn(
            'absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-[5px] font-mono text-[10px] font-bold shadow-[0_0_0_2px_var(--surface-0)]',
            COUNT[level],
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
