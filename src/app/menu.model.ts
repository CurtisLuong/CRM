import type { IconName } from '@/config/icons';
import { MENU_DEFAULT_GROUP, MENU_GROUPS, type MenuGroupKey, type MenuGroupKind } from '@/config/menu';
import type { AppCommand, CommandContext } from './commands/registry';

export type MenuItem = {
  id: string;
  /** Nhãn ngắn trong menu (không đổi nhãn ở Bảng lệnh). */
  label: string;
  icon: IconName;
  run: (ctx: CommandContext) => void;
};

export type MenuSection = {
  key: MenuGroupKey;
  title: string;
  kind: MenuGroupKind;
  items: MenuItem[];
};

/** Thứ tự trong nhóm: `menu.order` → `order` của lệnh → 100 (như `collectCommands`), rồi nhãn. */
function orderOf(c: AppCommand) {
  return c.menu?.order ?? c.order ?? 100;
}

function labelOf(c: AppCommand) {
  return c.menu?.label ?? c.label;
}

/**
 * Gom lệnh `tools` thành nhóm menu theo `MENU_GROUPS` (PF-04).
 * Nhóm rỗng ẩn; lệnh chưa khai báo nhóm vào Công cụ; nhãn/icon của menu lấy từ `command.menu` để
 * Bảng lệnh giữ nguyên nhãn cũ.
 */
export function buildMenu(commands: AppCommand[]): MenuSection[] {
  const buckets = new Map<MenuGroupKey, AppCommand[]>();
  for (const c of commands) {
    if (!c.tools) continue;
    const key = c.menu?.group ?? MENU_DEFAULT_GROUP;
    const list = buckets.get(key);
    if (list) list.push(c);
    else buckets.set(key, [c]);
  }

  return [...MENU_GROUPS]
    .sort((a, b) => a.order - b.order)
    .map((group) => {
      const items = (buckets.get(group.key) ?? [])
        .slice()
        .sort((a, b) => orderOf(a) - orderOf(b) || labelOf(a).localeCompare(labelOf(b), 'vi'))
        .map(
          (c): MenuItem => ({
            id: c.id,
            label: labelOf(c),
            icon: c.menu?.icon ?? c.icon ?? 'apps',
            run: c.run,
          }),
        );
      return { key: group.key, title: group.title, kind: group.kind, items };
    })
    .filter((group) => group.items.length > 0);
}
