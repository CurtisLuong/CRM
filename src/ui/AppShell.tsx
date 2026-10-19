import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { BottomNav, Header, type NavTab, SyncIndicator, type SyncState } from './chrome';
import { cn } from './cn';
import { Icon } from './Icon';

/**
 * Khung app (DESIGN_SYSTEM §3 AppShell). Chỉ trình bày — điều hướng/trạng thái do src/app/layout.tsx truyền vào.
 * Mobile: header 56px + bottom nav 64px + safe-area. Desktop ≥1024: rail trái 72px (mở rộng 240px),
 * vùng chính tối đa 760px, panel ngữ cảnh phải 360px (khi có `aside`). Không đổi màu nền theo tab.
 */
export function AppShell({
  title,
  tabs,
  active,
  onNavigate,
  onAdd,
  onSearch,
  sync,
  onSyncOpen,
  menu,
  railExpanded,
  onToggleRail,
  aside,
  asideRef,
  children,
}: {
  title: string;
  tabs: NavTab[];
  /** value của tab đang chọn; null khi đang ở màn ngoài 4 tab. */
  active: string | null;
  onNavigate: (value: string) => void;
  onAdd: () => void;
  onSearch: () => void;
  /** null = chưa nối nguồn trạng thái đồng bộ → không hiện. */
  sync: SyncState | null;
  onSyncOpen?: () => void;
  /** Nút avatar/menu Tiện ích ở header (mobile) và chân rail (desktop). */
  menu?: ReactNode;
  railExpanded: boolean;
  onToggleRail: () => void;
  /** Có nội dung panel phải (desktop) hay không. */
  aside?: boolean;
  /** Phần tử đích cho panel phải (feature portal nội dung vào đây). */
  asideRef?: (el: HTMLElement | null) => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-bg lg:flex">
      <Rail
        tabs={tabs}
        active={active}
        onNavigate={onNavigate}
        onAdd={onAdd}
        expanded={railExpanded}
        onToggle={onToggleRail}
        menu={menu}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={title}
          onSearch={onSearch}
          sync={sync && <SyncIndicator state={sync} onOpen={onSyncOpen} className="max-w-[40vw]" />}
          trailing={<span className="lg:hidden">{menu}</span>}
        />
        <div className="flex min-h-0 flex-1">
          <main
            id="main"
            className="mx-auto w-full max-w-[760px] min-w-0 flex-1 pb-[calc(64px+env(safe-area-inset-bottom)+16px)] lg:pb-8"
          >
            {children}
          </main>
          <aside
            ref={asideRef}
            aria-label="Ngữ cảnh"
            className={cn(
              'sticky top-14 hidden h-[calc(100dvh-56px)] w-[360px] shrink-0 overflow-y-auto border-l border-hairline bg-surface',
              aside && 'lg:block',
            )}
          />
        </div>
      </div>
      <BottomNav
        tabs={tabs}
        active={active ?? ''}
        onSelect={onNavigate}
        onAdd={onAdd}
        addLabel="Ghi nhanh"
        className="lg:hidden"
      />
    </div>
  );
}

function Rail({
  tabs,
  active,
  onNavigate,
  onAdd,
  expanded,
  onToggle,
  menu,
}: {
  tabs: NavTab[];
  active: string | null;
  onNavigate: (value: string) => void;
  onAdd: () => void;
  expanded: boolean;
  onToggle: () => void;
  menu?: ReactNode;
}) {
  return (
    <nav
      aria-label="Điều hướng chính"
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col gap-1 border-r border-hairline bg-surface px-2 py-3 lg:flex',
        'transition-[width] duration-(--dur-base) ease-standard',
        expanded ? 'w-60' : 'w-[72px]',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={expanded ? 'Thu gọn thanh bên' : 'Mở rộng thanh bên'}
        aria-expanded={expanded}
        className="mx-1.5 inline-flex size-11 items-center justify-center self-start rounded-control text-text-2 hover:bg-surface-2"
      >
        {expanded ? (
          <PanelLeftClose size={20} strokeWidth={1.75} aria-hidden />
        ) : (
          <PanelLeftOpen size={20} strokeWidth={1.75} aria-hidden />
        )}
      </button>
      <button
        type="button"
        onClick={onAdd}
        aria-label={expanded ? undefined : 'Ghi nhanh'}
        className={cn(
          'mb-2 inline-flex h-11 items-center gap-2 rounded-control bg-accent text-body-strong text-accent-fg shadow-e2 hover:brightness-110',
          expanded ? 'px-3' : 'mx-1.5 w-11 justify-center',
        )}
      >
        <Plus size={20} strokeWidth={2} aria-hidden />
        {expanded && 'Ghi nhanh'}
      </button>
      {tabs.map((t) => {
        const on = t.value === active;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onNavigate(t.value)}
            aria-current={on ? 'page' : undefined}
            title={expanded ? undefined : t.label}
            className={cn(
              'relative flex items-center rounded-control text-label transition-colors duration-(--dur-fast)',
              expanded ? 'h-11 gap-3 px-3 text-body-strong' : 'min-h-14 flex-col justify-center gap-0.5 py-1.5',
              on ? 'bg-accent-soft text-accent' : 'text-text-2 hover:bg-surface-2 hover:text-text',
            )}
          >
            <span className="relative">
              <Icon name={t.icon} size={24} />
              {t.badge ? (
                <span className="absolute -top-1.5 -right-2.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-data text-label leading-none text-surface">
                  {t.badge}
                  <span className="sr-only"> cảnh báo</span>
                </span>
              ) : null}
            </span>
            <span className={expanded ? 'whitespace-nowrap' : 'text-center leading-tight'}>{t.label}</span>
          </button>
        );
      })}
      <div className="mt-auto">{menu}</div>
    </nav>
  );
}
