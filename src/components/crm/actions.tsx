import { Button, type ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ACTION_BY_ID, type ActionId, initials, LEVEL_WORD, type Level } from '@/lib/crm';
import { cn } from '@/lib/utils';
import { iconGlyph } from '@/ui/Icon';
import { SignalBadge } from './signal';

/** Icon cố định cho mỗi hành động (src/config/icons.ts, D-006). Color = currentColor; never a signal color. Stroke 2 at 16px, 1.75 at 20px+. */
export function ActionIcon({
  action,
  size = 20,
  className,
  title,
}: {
  action: ActionId;
  size?: number;
  className?: string;
  title?: string;
}) {
  const Icon = iconGlyph(ACTION_BY_ID[action].icon);
  return (
    <Icon
      size={size}
      strokeWidth={size <= 16 ? 2 : 1.75}
      className={cn('shrink-0', className)}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? 'img' : undefined}
    />
  );
}

/** display: "inline" icon + label · "icon" icon only (label → aria-label + tooltip) · "stacked" icon over short label (mobile). */
export function ActionButton({
  action,
  display = 'inline',
  label,
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: Omit<ButtonProps, 'size'> & {
  action: ActionId;
  display?: 'inline' | 'icon' | 'stacked';
  label?: string;
  size?: 'md' | 'sm';
}) {
  const a = ACTION_BY_ID[action];
  const text = label ?? (display === 'stacked' ? a.short : a.label);
  const iconSize = size === 'sm' ? 16 : 20;
  if (display === 'icon') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={size === 'sm' ? 'icon-sm' : 'icon'}
            aria-label={label ?? a.label}
            className={className}
            {...props}
          >
            <ActionIcon action={action} size={iconSize} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label ?? a.label}</TooltipContent>
      </Tooltip>
    );
  }
  if (display === 'stacked') {
    return (
      <Button
        variant={variant}
        className={cn(
          'h-auto min-h-16 w-[72px] flex-col gap-1 px-1 py-2.5 text-[11px] leading-[14px] whitespace-normal',
          className,
        )}
        {...props}
      >
        <ActionIcon action={action} size={20} />
        {text}
      </Button>
    );
  }
  return (
    <Button variant={variant} size={size} className={className} {...props}>
      <ActionIcon action={action} size={iconSize} />
      {text}
    </Button>
  );
}

export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.35) }}
      className={cn(
        'grid shrink-0 place-items-center rounded-full border border-line bg-surface-200 font-semibold text-ink',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

const BTN_FOR: Record<Level, ButtonProps['variant']> = { alert: 'alert', soon: 'primary', ok: 'secondary' };

/** One thing to do, with its urgency — the heart of the action-based home screen. Sort red → yellow → green. */
export function ActionItem({
  level,
  title,
  customer,
  context,
  time,
  action,
  actionLabel,
  actionAriaLabel,
  disabled,
  compact,
  onAction,
  onOpen,
  tone,
  dataCard,
  children,
}: {
  level: Level;
  /** Tên việc, luôn xuống dòng đầy đủ trên màn hẹp. */
  title: React.ReactNode;
  customer: string;
  context?: string;
  time?: string;
  action?: ActionId;
  actionLabel?: string;
  actionAriaLabel?: string;
  disabled?: boolean;
  /** Dòng nhóm thu gọn, ẩn phần bằng chứng. */
  compact?: boolean;
  onAction?: () => void;
  /** Chạm bất kỳ vùng trống nào trong dòng để mở khách. */
  onOpen?: () => void;
  tone?: 'over' | 'soon';
  dataCard?: boolean;
  /** Bằng chứng bổ sung của dòng; không hiển thị trong nhóm gọn. */
  children?: React.ReactNode;
}) {
  return (
    <article
      data-card={dataCard ? '' : undefined}
      data-tone={dataCard ? tone : undefined}
      className={cn(
        'relative min-w-0 rounded-md border border-line bg-surface-100 p-2',
        level === 'alert' && 'border-alert shadow-glow-alert',
      )}
    >
      {onOpen && (
        <button
          type="button"
          aria-label={`Mở ${customer}`}
          onClick={onOpen}
          className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ion"
        />
      )}
      <div className="relative z-10 flex min-w-0 items-start gap-2.5 pointer-events-none">
        <Avatar name={customer} size={compact ? 32 : 36} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1 break-words text-[15px] font-semibold leading-5">{title}</div>
            <span className="shrink-0">
              <SignalBadge level={level}>{time ?? LEVEL_WORD[level]}</SignalBadge>
            </span>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0 break-words text-caption leading-5 text-ink-muted">
              <span className="font-semibold text-ink">{customer}</span>
              {context && <> · {context}</>}
            </div>
            {(action || actionLabel) && (
              <div className="shrink-0 pointer-events-auto">
                {action ? (
                  <ActionButton
                    action={action}
                    size="sm"
                    variant={BTN_FOR[level]}
                    display="inline"
                    label={level === 'alert' ? 'Làm ngay' : (actionLabel ?? ACTION_BY_ID[action].short)}
                    disabled={disabled}
                    aria-label={
                      actionAriaLabel ??
                      `${level === 'alert' ? 'Làm ngay' : (actionLabel ?? ACTION_BY_ID[action].short)} ${customer}`
                    }
                    onClick={onAction}
                  />
                ) : (
                  <Button
                    size="sm"
                    variant={BTN_FOR[level]}
                    disabled={disabled}
                    aria-label={actionAriaLabel ?? `${level === 'alert' ? 'Làm ngay' : actionLabel} ${customer}`}
                    onClick={onAction}
                  >
                    {level === 'alert' ? 'Làm ngay' : actionLabel}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {children && <div className="relative z-10 mt-2.5 border-line border-t pt-2 pointer-events-none">{children}</div>}
    </article>
  );
}
