import { setThemePref, THEME_OPTIONS } from '@/app/theme';
import { NAV_TABS } from '../layout.nav';
import { type AppCommand, type CommandModule, collectCommands } from './registry';

export type { AppCommand, CommandContext } from './registry';
export { collectCommands } from './registry';

// Lệnh sẵn có của khung app: đi tới 4 màn chính + đổi giao diện.
const builtin: AppCommand[] = [
  ...NAV_TABS.map(
    (t, i): AppCommand => ({
      id: `nav.${t.value}`,
      label: t.label,
      sub: t.question,
      icon: t.icon,
      group: 'Màn',
      order: i,
      run: ({ navigate }) => navigate(t.path),
    }),
  ),
  ...THEME_OPTIONS.map(
    (o, i): AppCommand => ({
      id: `theme.${o.value}`,
      label: `Giao diện: ${o.label}`,
      icon: 'settings',
      group: 'Cài đặt',
      keywords: 'theme giao dien sang toi dark light',
      order: i,
      run: () => setThemePref(o.value),
    }),
  ),
];

const modules = import.meta.glob<CommandModule>('../../features/*/commands.ts', { eager: true });

/** Mọi lệnh: sẵn có + lệnh các tính năng tự đăng ký. */
export const appCommands: AppCommand[] = collectCommands({ 'src/app/commands': { commands: builtin }, ...modules });
