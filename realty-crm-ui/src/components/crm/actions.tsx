import { cn } from "@/lib/utils";
import { ACTION_BY_ID, initials, type ActionId, type Level } from "@/lib/crm";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SignalBadge } from "./signal";

/** Fixed icon per action (Lucide). Color = currentColor; never a signal color. Stroke 2 at 16px, 1.75 at 20px+. */
export function ActionIcon({ action, size = 20, className, title }: { action: ActionId; size?: number; className?: string; title?: string }) {
  const Icon = ACTION_BY_ID[action].icon;
  return <Icon size={size} strokeWidth={size <= 16 ? 2 : 1.75} className={cn("shrink-0", className)} aria-hidden={title ? undefined : true} aria-label={title} role={title ? "img" : undefined} />;
}

/** display: "inline" icon + label · "icon" icon only (label → aria-label + tooltip) · "stacked" icon over short label (mobile). */
export function ActionButton({
  action, display = "inline", label, variant = "secondary", size = "md", className, ...props
}: Omit<ButtonProps, "size"> & { action: ActionId; display?: "inline" | "icon" | "stacked"; label?: string; size?: "md" | "sm" }) {
  const a = ACTION_BY_ID[action];
  const text = label ?? (display === "stacked" ? a.short : a.label);
  const iconSize = size === "sm" ? 16 : 20;
  if (display === "icon") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant={variant} size={size === "sm" ? "icon-sm" : "icon"} aria-label={label ?? a.label} className={className} {...props}>
            <ActionIcon action={action} size={iconSize} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label ?? a.label}</TooltipContent>
      </Tooltip>
    );
  }
  if (display === "stacked") {
    return (
      <Button variant={variant} className={cn("h-auto min-h-16 w-[72px] flex-col gap-1 px-1 py-2.5 text-[11px] leading-[14px] whitespace-normal", className)} {...props}>
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
      className={cn("grid shrink-0 place-items-center rounded-full border border-line bg-surface-200 font-semibold text-ink", className)}
    >
      {initials(name)}
    </span>
  );
}

const BTN_FOR: Record<Level, ButtonProps["variant"]> = { alert: "alert", soon: "primary", ok: "secondary" };

/** One thing to do, with its urgency — the heart of the action-based home screen. Sort red → yellow → green. */
export function ActionItem({
  level, title, customer, context, time, action, actionLabel, compact, onAction,
}: {
  level: Level;
  /** Verb-first: "Gọi lại", "Gửi bảng giá" */
  title: React.ReactNode;
  customer: string;
  context?: string;
  time?: string;
  action?: ActionId;
  actionLabel?: string;
  /** Icon-only quick button for narrow rows */
  compact?: boolean;
  onAction?: () => void;
}) {
  return (
    <div
      className={cn(
        "grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-line bg-surface-100 px-4 py-3",
        level === "alert" && "border-alert shadow-glow-alert",
      )}
    >
      <Avatar name={customer} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 truncate text-[15px] font-semibold leading-[22px]">
          {action && <ActionIcon action={action} size={16} className="text-ink-muted" />}
          {title}
        </span>
        <span className="truncate text-caption text-ink-muted">{[customer, context].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <SignalBadge level={level}>{time}</SignalBadge>
        {action ? (
          <ActionButton action={action} size="sm" variant={BTN_FOR[level]} display={compact ? "icon" : "inline"} label={actionLabel ?? ACTION_BY_ID[action].short} onClick={onAction} />
        ) : (
          actionLabel && (
            <Button size="sm" variant={BTN_FOR[level]} onClick={onAction}>
              {actionLabel}
            </Button>
          )
        )}
      </div>
    </div>
  );
}
