import { AlarmClock, CheckCheck, ChevronDown, Info, Settings, UserRound } from 'lucide-react';
import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { type Level, NOTIF_TYPES, type NotifType } from '@/lib/crm';
import { cn } from '@/lib/utils';
import { ActionButton, ActionIcon, Avatar } from './actions';
import { EmptyState } from './empty-state';
import { Glyph, SignalBadge } from './signal';

const ICO: Record<Level, string> = {
  alert: 'bg-alert-tint text-alert-text border-transparent',
  soon: 'bg-soon-tint text-soon-text border-transparent',
  ok: 'bg-ok-tint text-ok-text border-transparent',
};
const BTN: Record<Level, ButtonProps['variant']> = { alert: 'alert', soon: 'primary', ok: 'secondary' };

function NotifIcon({ type, level }: { type: NotifType; level?: Level | null }) {
  const t = NOTIF_TYPES[type];
  return (
    <span
      className={cn(
        'relative grid size-8 place-items-center rounded-[10px] border border-line bg-surface-200 text-ink',
        level && ICO[level],
      )}
    >
      {t.action ? <ActionIcon action={t.action} size={16} /> : <Info className="size-4" />}
      {level && (
        <span className="absolute -bottom-1 -right-1 grid size-3.5 place-items-center rounded-full bg-surface-100">
          <Glyph level={level} className="size-2" />
        </span>
      )}
    </span>
  );
}

function IconBtn({ label, children, onClick }: { label: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-8 cursor-pointer place-items-center rounded-sm border border-transparent text-ink-muted hover:border-line hover:bg-surface-100 hover:text-ink [@media(hover:hover)]:opacity-0 group-hover/nt:opacity-100 group-focus-within/nt:opacity-100"
    >
      {children}
    </button>
  );
}

export interface NotificationItemProps {
  type: NotifType;
  level?: Level | null;
  customer?: string;
  /** In the badge: "Trễ 1 ngày", "Còn 45m" */
  reason?: string;
  context?: React.ReactNode;
  time?: string;
  read?: boolean;
  title?: string;
  cta?: string;
  onPrimary?: (() => void) | false;
  onOpen?: () => void;
  onSnooze?: () => void;
  compact?: boolean;
  nested?: boolean;
}

/** One signal about one customer: what happened · customer · why · the action that clears it. */
export function NotificationItem({
  type,
  level,
  customer,
  reason,
  context,
  time,
  read,
  title,
  cta,
  onPrimary,
  onOpen,
  onSnooze,
  compact,
  nested,
}: NotificationItemProps) {
  const t = NOTIF_TYPES[type];
  const unread = !read;
  return (
    <div
      className={cn(
        'group/nt relative grid min-h-14 grid-cols-[32px_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 rounded-md border border-line bg-surface-100 px-3 py-2.5 hover:bg-surface-200 max-sm:grid-cols-[32px_minmax(0,1fr)_auto]',
        nested && 'min-h-12 grid-cols-[minmax(0,1fr)_auto_auto] rounded-none border-0 border-t bg-transparent py-1.5',
        compact && 'grid-cols-[32px_minmax(0,1fr)_auto]',
      )}
    >
      {!nested && <NotifIcon type={type} level={level} />}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-medium text-ink-muted">
          {!nested && (
            <span className={cn(unread && 'text-ink')}>
              {title ?? t.title}
              {customer && ' ·'}
            </span>
          )}
          {customer && (
            <button
              type="button"
              onClick={onOpen}
              className="cursor-pointer text-left font-semibold text-ink hover:text-ion hover:underline"
            >
              {customer}
            </button>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {reason &&
            (level ? (
              <SignalBadge level={level} size="sm">
                {reason}
              </SignalBadge>
            ) : (
              <span className="text-caption text-ink-muted">{reason}</span>
            ))}
          {context && <span className="truncate text-caption text-ink-muted">{context}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 self-start pt-0.5">
        {time && <span className="whitespace-nowrap font-mono text-xs text-ink-muted">{time}</span>}
        {unread && <span role="img" aria-label="Chưa đọc" className="size-2 rounded-full bg-ion shadow-glow-ion" />}
      </div>
      <div
        className={cn(
          'flex items-center justify-end gap-1 max-sm:col-span-2 max-sm:col-start-2 max-sm:justify-start',
          compact && 'col-span-2 col-start-2 justify-start',
        )}
      >
        {onSnooze && (
          <IconBtn label="Nhắc lại sau" onClick={onSnooze}>
            <AlarmClock className="size-4" />
          </IconBtn>
        )}
        {onOpen && !nested && (
          <IconBtn label="Mở hồ sơ" onClick={onOpen}>
            <UserRound className="size-4" />
          </IconBtn>
        )}
        {(t.ctaAction ?? t.action) && onPrimary !== false && (
          <ActionButton
            action={(t.ctaAction ?? t.action)!}
            size="sm"
            variant={level ? BTN[level] : 'secondary'}
            display={compact || nested ? 'icon' : 'inline'}
            label={cta ?? t.cta}
            onClick={onPrimary || undefined}
          />
        )}
      </div>
    </div>
  );
}

export interface NotificationGroupProps {
  type: NotifType;
  level?: Level;
  items: { customer: string; reason?: string; context?: React.ReactNode; time?: string }[];
  count?: number;
  reason?: string;
  time?: string;
  unread?: boolean;
  bulkLabel?: string;
  onBulk?: () => void;
  onSeeAll?: () => void;
  preview?: number;
  defaultOpen?: boolean;
}

/** Same-type signals collapsed into one card with a bulk action ("Gọi lần lượt 38") and an expandable list. */
export function NotificationGroup({
  type,
  level,
  items,
  count: cnt,
  reason,
  time,
  unread,
  bulkLabel,
  onBulk,
  onSeeAll,
  preview = 5,
  defaultOpen,
}: NotificationGroupProps) {
  const t = NOTIF_TYPES[type];
  const [open, setOpen] = React.useState(!!defaultOpen);
  const count = cnt ?? items.length;
  const names =
    items
      .slice(0, 3)
      .map((x) => x.customer)
      .join(', ') + (count > 3 ? ` và ${count - 3} khách khác` : '');
  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-line bg-surface-100',
        level === 'alert' && 'border-alert shadow-glow-alert',
      )}
    >
      <div className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-3 pb-2 pt-3">
        <NotifIcon type={type} level={level} />
        <div className="flex min-w-0 flex-col gap-1">
          <div className={cn('flex items-center gap-1.5 text-sm font-medium text-ink-muted', unread && 'text-ink')}>
            {t.title}
            <span className="grid h-5 place-items-center rounded-full border border-line bg-surface-200 px-[7px] font-mono text-xs font-semibold text-ink">
              {count}
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {reason && level && (
              <SignalBadge level={level} size="sm">
                {reason}
              </SignalBadge>
            )}
            <span className="truncate text-caption text-ink-muted">{names}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start pt-0.5">
          {time && <span className="font-mono text-xs text-ink-muted">{time}</span>}
          {unread && <span role="img" aria-label="Chưa đọc" className="size-2 rounded-full bg-ion shadow-glow-ion" />}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pb-3 pl-14 pr-3">
        <span className="flex" aria-hidden>
          {items.slice(0, 5).map((x, i) => (
            <Avatar key={i} name={x.customer} size={26} className="-mr-1.5 shadow-[0_0_0_2px_var(--surface-100)]" />
          ))}
          {count > 5 && (
            <span className="grid size-[26px] place-items-center rounded-full border border-line bg-surface-100 font-mono text-[10px] text-ink-muted shadow-[0_0_0_2px_var(--surface-100)]">
              +{count - 5}
            </span>
          )}
        </span>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Thu gọn' : `Xem ${count} khách`}
          <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
        </Button>
        {(bulkLabel ?? t.bulk) && t.action && (
          <ActionButton
            action={t.action}
            size="sm"
            variant={level ? BTN[level] : 'secondary'}
            label={`${bulkLabel ?? t.bulk} ${count}`}
            onClick={onBulk}
          />
        )}
      </div>
      {open && (
        <div className="bg-surface-0">
          {items.slice(0, preview).map((x, i) => (
            <NotificationItem key={i} type={type} level={level} nested read {...x} />
          ))}
          {count > preview && (
            <button
              type="button"
              onClick={onSeeAll}
              className="block w-full cursor-pointer border-t border-line px-3 py-3 text-left text-[13px] font-medium text-ion hover:bg-surface-200"
            >
              Xem tất cả {count} khách trong danh sách →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface NotificationSection {
  level?: Level;
  title: string;
  entries: (NotificationItemProps | NotificationGroupProps)[];
}

/** Page or bell popover: tabs by signal, sections red → yellow → other, groups not repeats. */
export function NotificationCenter({
  sections,
  variant = 'page',
  subtitle,
  onMarkAllRead,
  onSettings,
  onSeeAll,
}: {
  sections: NotificationSection[];
  variant?: 'page' | 'popover';
  subtitle?: React.ReactNode;
  onMarkAllRead?: () => void;
  onSettings?: () => void;
  onSeeAll?: () => void;
}) {
  const [tab, setTab] = React.useState<'all' | Level>('all');
  const n = (e: NotificationItemProps | NotificationGroupProps) => ('items' in e ? (e.count ?? e.items.length) : 1);
  const by = { alert: 0, soon: 0, ok: 0 } as Record<Level, number>;
  let total = 0;
  for (const s of sections)
    for (const e of s.entries) {
      total += n(e);
      if (s.level) by[s.level] += n(e);
    }
  const tabs: { id: 'all' | Level; label: string; count: number }[] = [
    { id: 'all', label: 'Tất cả', count: total },
    { id: 'alert', label: 'Cần làm ngay', count: by.alert },
    { id: 'soon', label: 'Sắp tới', count: by.soon },
    { id: 'ok', label: 'Khác', count: by.ok },
  ];
  const visible = sections.filter((s) => tab === 'all' || s.level === tab);
  const TITLE: Record<Level, string> = { alert: 'text-alert-text', soon: 'text-soon-text', ok: 'text-ok-text' };
  const pop = variant === 'popover';
  return (
    <section
      aria-label="Thông báo"
      className={cn(
        'flex flex-col text-ink',
        pop &&
          'max-h-[640px] w-[420px] max-w-full rounded-lg border border-line bg-surface-100 px-4 pt-4 shadow-overlay',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {pop ? (
            <h2 className="m-0 text-lg font-bold">Thông báo</h2>
          ) : (
            <h1 className="m-0 text-2xl font-bold tracking-tight">Thông báo</h1>
          )}
          <span className="inline-grid h-6 place-items-center rounded-[6px] border border-line bg-surface-200 px-2 font-mono text-[13px] font-semibold">
            {total}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onMarkAllRead && (
            <Button variant="ghost" size="sm" onClick={onMarkAllRead}>
              <CheckCheck />
              Đánh dấu đã đọc
            </Button>
          )}
          {onSettings && (
            <Button variant="ghost" size="icon-sm" aria-label="Cài đặt thông báo" onClick={onSettings}>
              <Settings />
            </Button>
          )}
        </div>
      </div>
      {subtitle && <p className="m-0 mt-1 text-[13px] text-ink-muted">{subtitle}</p>}
      <div role="tablist" className="mt-2 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'inline-flex h-10 cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-ink-muted hover:text-ink',
              tab === t.id && 'border-ion font-semibold text-ink',
            )}
          >
            {t.id !== 'all' && <Glyph level={t.id} />}
            {t.label}
            <span className="font-mono text-[11px] text-ink-muted">{t.count}</span>
          </button>
        ))}
      </div>
      <div className={cn('flex flex-col gap-5 pt-4', pop && 'gap-4 overflow-auto pb-3')}>
        {visible.length ? (
          visible.map((s, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <span className={cn('flex items-center gap-2 px-1 text-overline', s.level && TITLE[s.level])}>
                {s.level && <Glyph level={s.level} />}
                {s.title}
              </span>
              {s.entries.map((e, j) =>
                'items' in e ? (
                  <NotificationGroup key={j} level={s.level} {...e} />
                ) : (
                  <NotificationItem key={j} level={e.level !== undefined ? e.level : s.level} compact={pop} {...e} />
                ),
              )}
            </div>
          ))
        ) : (
          <EmptyState kind="done" compact title="Không có thông báo nào ở đây" />
        )}
      </div>
      {pop && onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="-mx-4 block cursor-pointer border-t border-line py-3 text-center text-[13px] font-medium text-ion hover:bg-surface-200"
        >
          Mở trang Thông báo →
        </button>
      )}
    </section>
  );
}
