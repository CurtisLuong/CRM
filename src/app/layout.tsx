import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useMatches, useNavigate } from 'react-router';
import {
  AppShell,
  BottomNav,
  HeaderSearch,
  NAV_DEFAULT,
  PageHeader,
  ScrollTitle,
  Sidebar,
  useScrolledPast,
} from '@/components/crm';
import { syncLabel, syncNeedsAttention } from '@/components/crm/header-controls';
import { TooltipProvider } from '@/components/ui';
import { NotificationBell } from '@/features/notifications/Bell';
import { QuickActionsHost } from '@/features/quick-actions/QuickActions';
import { CustomerSearchBridge } from '@/features/search/SearchBridge';
import { SyncIssuesSheet } from '@/features/sync/SyncIssuesSheet';
import { BlockBoundary, ToastProvider, useToast } from '@/ui';
import { CommandPalette, type PaletteItem } from '@/ui/CommandPalette';
import { SyncIndicator } from '@/ui/chrome';
import { AppUpdatePrompt } from './AppUpdatePrompt';
import { type AppCommand, appCommands, type CommandContext } from './commands';
import { installCRMBack } from './layout.back';
import { QuickAddSheet, ToolsMenu } from './layout.menus';
import { NAV_TABS, tabForPath } from './layout.nav';
import { setAsideElement, useAsideVisible, useCustomerSearch, useShellSync, useShellTitle } from './layout.slots';
import { UpdatePrompt } from './UpdatePrompt';

const RAIL_KEY = 'sk-rail-expanded';

function readRail(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === '1';
  } catch {
    return false;
  }
}

/** Back của vỏ Android: đóng lớp nổi trên cùng → lùi trong app → về Hôm nay → hỏi trước khi thoát. Nằm trong ToastProvider để báo. */
function AndroidBack() {
  const navigate = useNavigate();
  const toast = useToast();
  useEffect(
    () =>
      installCRMBack({
        pathname: () => window.location.pathname,
        canGoBack: () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0,
        goBack: () => navigate(-1),
        goHome: () => navigate('/', { replace: true }),
        warnExit: () => toast({ title: 'Bấm back lần nữa để thoát', durationMs: 2000 }),
      }),
    [navigate, toast],
  );
  return null;
}

/** Route có thể đặt tiêu đề header: `{ path, element, handle: { title: 'Hồ sơ khách' } }`. */
function useTitle(fallback: string): string {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const h = matches[i]?.handle as { title?: string } | undefined;
    if (h?.title) return h.title;
  }
  return fallback;
}

/** Route ẩn thanh điều hướng dưới (mobile): `handle: { hideNav: true }`. */
function useHideNav(): boolean {
  return useMatches().some((m) => (m.handle as { hideNav?: boolean } | undefined)?.hideNav === true);
}

/** Route cần khổ rộng trên desktop: `handle: { wide: true }`. */
function useWide(): boolean {
  return useMatches().some((m) => (m.handle as { wide?: boolean } | undefined)?.wide === true);
}

function toPaletteItem(c: AppCommand, ctx: CommandContext): PaletteItem {
  return {
    id: c.id,
    label: c.label,
    sub: c.sub,
    icon: c.icon,
    group: c.group ?? 'Lệnh',
    keywords: c.keywords,
    shortcut: c.shortcut,
    onSelect: () => c.run(ctx),
  };
}

/** Khung gốc: AppShell mới (4 tab, Sidebar, Bảng lệnh, Back Android, Toast). */
export function RootLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = tabForPath(pathname);
  const title = useTitle(NAV_TABS.find((t) => t.value === active)?.label ?? 'Sổ Khách');
  const hideNav = useHideNav();
  const wide = useWide();
  const sync = useShellSync();
  const search = useCustomerSearch();
  const aside = useAsideVisible();
  const shellTitle = useShellTitle();
  const [headerElement, setHeaderElement] = useState<HTMLElement | null>(null);
  const titlePast = useScrolledPast(shellTitle?.target ?? null, {
    boundary: headerElement,
    mediaQuery: '(min-width: 1280px)',
  });

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(readRail);

  const ctx = useMemo<CommandContext>(() => ({ navigate: (to) => navigate(to) }), [navigate]);
  const items = useMemo(() => appCommands.map((c) => toPaletteItem(c, ctx)), [ctx]);

  // Cmd/Ctrl+K mở/đóng Bảng lệnh ở mọi màn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    const expanded = !collapsed;
    setRailExpanded(expanded);
    try {
      localStorage.setItem(RAIL_KEY, expanded ? '1' : '0');
    } catch {
      // Không lưu được → chỉ áp cho phiên này.
    }
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <ToastProvider>
        <AppShell
          sidebar={
            <Sidebar
              items={NAV_DEFAULT}
              active={active ?? undefined}
              onNavigate={(value) => {
                const tab = NAV_TABS.find((t) => t.value === value);
                if (tab) navigate(tab.path);
              }}
              onCreate={() => setQuickOpen(true)}
              createLabel="Ghi nhanh"
              collapsed={!railExpanded}
              onCollapsedChange={setSidebarCollapsed}
            />
          }
          bottomNav={
            hideNav ? undefined : (
              <BottomNav
                items={NAV_DEFAULT}
                active={active ?? undefined}
                onNavigate={(value) => {
                  const tab = NAV_TABS.find((t) => t.value === value);
                  if (tab) navigate(tab.path);
                }}
                onCreate={() => setQuickOpen(true)}
                createLabel="Ghi nhanh"
              />
            )
          }
          header={
            <PageHeader
              title={
                <ScrollTitle
                  title={title}
                  replacement={shellTitle?.title}
                  detail={shellTitle?.detail}
                  active={titlePast}
                />
              }
              headerRef={setHeaderElement}
              compact
              actions={
                <>
                  <HeaderSearch onOpen={() => setPaletteOpen(true)} />
                  <NotificationBell />
                  {sync && syncNeedsAttention(sync) && (
                    <SyncIndicator
                      state={sync}
                      onOpen={() => setSyncOpen(true)}
                      className="size-11 min-w-11 rounded-md px-0"
                    />
                  )}
                  <ToolsMenu
                    commands={appCommands}
                    ctx={ctx}
                    sync={sync ? { label: syncLabel(sync), onOpen: () => setSyncOpen(true) } : undefined}
                  />
                </>
              }
            />
          }
          mainClassName="block px-0 pt-0 md:px-0"
          wide={wide}
          aside={aside}
          asideRef={setAsideElement}
        >
          <BlockBoundary label="màn này" resetKey={pathname}>
            <Outlet />
          </BlockBoundary>
        </AppShell>
        <CustomerSearchBridge />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={items} search={search} />
        <QuickAddSheet open={quickOpen} onOpenChange={setQuickOpen} commands={appCommands} ctx={ctx} />
        <UpdatePrompt />
        <AppUpdatePrompt />
        <QuickActionsHost />
        <SyncIssuesSheet open={syncOpen} onOpenChange={setSyncOpen} />
        <AndroidBack />
      </ToastProvider>
    </TooltipProvider>
  );
}
