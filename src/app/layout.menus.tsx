import { type ReactNode, useState } from 'react';
import { THEME_OPTIONS, useThemePref } from '@/app/theme';
import { MENU_GROUPS, MENU_THEME_GROUP } from '@/config/menu';
import { EmptyState, Icon, SegmentedControl, Sheet } from '@/ui';
import type { AppCommand, CommandContext } from './commands';
import { buildMenu, type MenuItem, type MenuSection } from './menu.model';

/** Nền icon thống nhất toàn menu: ô lưới 44px, hàng 40px, cùng token surface-2. */
const ICON_TILE = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-2';
const ICON_ROW = 'inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-2';

function GridItem({ item, onSelect }: { item: MenuItem; onSelect: (item: MenuItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-card border border-hairline bg-surface px-2 py-3 text-center hover:bg-surface-2"
    >
      <span className={ICON_TILE}>
        <Icon name={item.icon} size={24} />
      </span>
      <span className="text-small leading-snug font-medium">{item.label}</span>
    </button>
  );
}

function RowItem({ item, onSelect }: { item: MenuItem; onSelect: (item: MenuItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="flex min-h-12 w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-surface-2"
    >
      <span className={ICON_ROW}>
        <Icon name={item.icon} size={20} />
      </span>
      <span className="min-w-0 flex-1 truncate text-body-strong">{item.label}</span>
      <Icon name="open" size={20} className="shrink-0 text-text-3" />
    </button>
  );
}

/** Hàng cuối nhóm Cài đặt: chọn Sáng | Tối | Tự động ngay trong menu, không đóng sheet. */
function ThemeRow() {
  const [pref, setPref] = useThemePref();
  return (
    <li className="flex min-h-12 items-center gap-2 py-1.5 pr-2 pl-3">
      <span className={ICON_ROW}>
        <Icon name="theme" size={20} />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-body-strong">Giao diện</span>
        {/* Nút phân đoạn thu về một hàng; mỗi lựa chọn chạm đủ 44×44. */}
        <SegmentedControl
          options={THEME_OPTIONS}
          value={pref}
          onValueChange={setPref}
          label="Giao diện"
          className="shrink-0 [&>button]:min-h-11 [&>button]:min-w-11 [&>button]:px-2 [&>button]:text-small"
        />
      </div>
    </li>
  );
}

function Section({
  section,
  onSelect,
  extra,
}: {
  section: MenuSection;
  onSelect: (item: MenuItem) => void;
  extra?: ReactNode;
}) {
  return (
    <section aria-labelledby={`menu-group-${section.key}`} className="flex flex-col gap-2">
      <h3 id={`menu-group-${section.key}`} className="px-1 text-label text-text-2">
        {section.title}
      </h3>
      {section.kind === 'grid' ? (
        <ul className="grid grid-cols-2 gap-2">
          {section.items.map((item) => (
            <li key={item.id}>
              <GridItem item={item} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-surface">
          {section.items.map((item) => (
            <li key={item.id}>
              <RowItem item={item} onSelect={onSelect} />
            </li>
          ))}
          {extra}
        </ul>
      )}
    </section>
  );
}

/** Menu ⋮ (PF-04): sheet có nhóm — lối tắt dạng ô (Khách hàng, Công cụ) + hàng (Cài đặt, Giao diện). */
export function ToolsMenu({ commands, ctx }: { commands: AppCommand[]; ctx: CommandContext }) {
  const [open, setOpen] = useState(false);
  const sections = buildMenu(commands);
  const themeGroup = MENU_GROUPS.find((g) => g.key === MENU_THEME_GROUP);

  // Chọn mục → đóng sheet rồi điều hướng (Sheet giữ focus, trả focus về nút Menu).
  const select = (item: MenuItem) => {
    setOpen(false);
    item.run(ctx);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-text-2 hover:bg-surface-2"
      >
        <Icon name="more" size={20} />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Menu">
        <div className="flex flex-col gap-5 pt-1 pb-2">
          {sections.map((section) => (
            <Section
              key={section.key}
              section={section}
              onSelect={select}
              extra={section.key === MENU_THEME_GROUP ? <ThemeRow /> : undefined}
            />
          ))}
          {!sections.some((s) => s.key === MENU_THEME_GROUP) && themeGroup && (
            <Section
              section={{ key: themeGroup.key, title: themeGroup.title, kind: themeGroup.kind, items: [] }}
              onSelect={select}
              extra={<ThemeRow />}
            />
          )}
        </div>
      </Sheet>
    </>
  );
}

/** Sheet ＋ Ghi nhanh: các lệnh `quickAdd` (Khách mới, Ghi chú, Việc, Chụp phiếu… do tính năng đăng ký). */
export function QuickAddSheet({
  open,
  onOpenChange,
  commands,
  ctx,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: AppCommand[];
  ctx: CommandContext;
}) {
  const items = commands.filter((c) => c.quickAdd);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Ghi nhanh">
      {items.length ? (
        <ul className="grid grid-cols-2 gap-2">
          {items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  c.run(ctx);
                }}
                className="flex min-h-20 w-full flex-col items-start justify-center gap-1 rounded-control border border-border-strong bg-surface px-3 py-2 text-left text-body-strong hover:bg-surface-2"
              >
                <Icon name={c.icon ?? 'task'} size={24} />
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="note" title="Chưa có mục ghi nhanh" hint="Khách mới, Ghi chú, Việc sẽ xuất hiện ở đây." />
      )}
    </Sheet>
  );
}
