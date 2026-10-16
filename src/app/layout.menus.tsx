import { Check, EllipsisVertical } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { THEME_OPTIONS, type ThemePref, useThemePref } from '@/app/theme';
import { EmptyState, Icon, Sheet } from '@/ui';
import type { AppCommand, CommandContext } from './commands';

const ITEM =
  'flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-control px-3 text-body text-text outline-none data-[highlighted]:bg-surface-2';

/** Menu Tiện ích (D-013): lệnh có `tools` + chọn Giao diện. Header (mobile) và chân rail (desktop). */
export function ToolsMenu({ commands, ctx }: { commands: AppCommand[]; ctx: CommandContext }) {
  const [pref, setPref] = useThemePref();
  const tools = commands.filter((c) => c.tools);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Tiện ích"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-control text-text-2 hover:bg-surface-2 data-[state=open]:bg-surface-2"
      >
        <EllipsisVertical size={20} strokeWidth={1.75} aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 min-w-56 rounded-card border border-border bg-surface-3 p-1 text-text shadow-e3"
        >
          {tools.length > 0 && (
            <>
              <DropdownMenu.Label className="px-3 pt-2 pb-1 text-label text-text-2">Tiện ích</DropdownMenu.Label>
              {tools.map((c) => (
                <DropdownMenu.Item key={c.id} className={ITEM} onSelect={() => c.run(ctx)}>
                  <Icon name={c.icon ?? 'apps'} size={20} />
                  {c.label}
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
            </>
          )}
          <DropdownMenu.Label className="px-3 pt-2 pb-1 text-label text-text-2">Giao diện</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={pref} onValueChange={(v) => setPref(v as ThemePref)}>
            {THEME_OPTIONS.map((o) => (
              <DropdownMenu.RadioItem key={o.value} value={o.value} className={ITEM}>
                <span className="inline-flex size-5 items-center justify-center text-accent">
                  <DropdownMenu.ItemIndicator>
                    <Check size={16} strokeWidth={2} aria-hidden />
                  </DropdownMenu.ItemIndicator>
                </span>
                {o.label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
