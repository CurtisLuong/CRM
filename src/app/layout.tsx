import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useMatches, useNavigate } from 'react-router';
import { QuickActionsHost } from '@/features/quick-actions/QuickActions';
import { ToastProvider } from '@/ui';
import { AppShell } from '@/ui/AppShell';
import { CommandPalette, type PaletteItem } from '@/ui/CommandPalette';
import { type AppCommand, appCommands, type CommandContext } from './commands';
import { installCRMBack } from './layout.back';
import { QuickAddSheet, ToolsMenu } from './layout.menus';
import { NAV_TABS, tabForPath } from './layout.nav';
import { setAsideElement, useAsideVisible, useCustomerSearch, useShellSync } from './layout.slots';
import { UpdatePrompt } from './UpdatePrompt';

const RAIL_KEY = 'sk-rail-expanded';

function readRail(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === '1';
  } catch {
    return false;
  }
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

const TABS = NAV_TABS.map((t) => ({ value: t.value, label: t.label, icon: t.icon }));

/** Khung gốc: AppShell (4 tab + ＋, rail desktop, panel phải), Bảng lệnh, Back Android, Toast. */
export function RootLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = tabForPath(pathname);
  const title = useTitle(NAV_TABS.find((t) => t.value === active)?.label ?? 'Sổ Khách');
  const sync = useShellSync();
  const search = useCustomerSearch();
  const aside = useAsideVisible();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [rail, setRail] = useState(readRail);

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

  // Back của vỏ Android: đóng lớp nổi trên cùng → lùi trong app → về Hôm nay.
  useEffect(
    () =>
      installCRMBack({
        pathname: () => window.location.pathname,
        canGoBack: () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0,
        goBack: () => navigate(-1),
        goHome: () => navigate('/', { replace: true }),
      }),
    [navigate],
  );

  const toggleRail = useCallback(() => {
    setRail((r) => {
      try {
        localStorage.setItem(RAIL_KEY, r ? '0' : '1');
      } catch {
        // Không lưu được → chỉ áp cho phiên này.
      }
      return !r;
    });
  }, []);

  return (
    <ToastProvider>
      <AppShell
        title={title}
        tabs={TABS}
        active={active}
        onNavigate={(v) => {
          const tab = NAV_TABS.find((t) => t.value === v);
          if (tab) navigate(tab.path);
        }}
        onAdd={() => setQuickOpen(true)}
        onSearch={() => setPaletteOpen(true)}
        sync={sync}
        menu={<ToolsMenu commands={appCommands} ctx={ctx} />}
        railExpanded={rail}
        onToggleRail={toggleRail}
        aside={aside}
        asideRef={setAsideElement}
      >
        <Outlet />
      </AppShell>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={items} search={search} />
      <QuickAddSheet open={quickOpen} onOpenChange={setQuickOpen} commands={appCommands} ctx={ctx} />
      <UpdatePrompt />
      <QuickActionsHost />
    </ToastProvider>
  );
}
