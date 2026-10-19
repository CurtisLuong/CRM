import type { ReactNode } from 'react';
import type { IconName } from '@/config/icons';
import { cn } from './cn';
import { Icon } from './Icon';

export type Tone = 'neutral' | 'danger' | 'warning' | 'success';
export type BadgeVariant = 'neutral' | 'status' | 'ai' | 'count';

export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-text-2',
  danger: 'bg-danger-bg text-danger',
  warning: 'bg-warning-bg text-warning',
  success: 'bg-success-bg text-success',
};

/**
 * `neutral` thực thể · `status` (semantic, cần `tone`) · `ai` (chỉ AI) · `count` (số đếm cảnh báo thật).
 * Màu không bao giờ là tín hiệu duy nhất — nội dung luôn có chữ.
 */
export function Badge({
  variant = 'neutral',
  tone = 'neutral',
  icon,
  className,
  children,
}: {
  variant?: BadgeVariant;
  tone?: Tone;
  icon?: IconName;
  className?: string;
  children: ReactNode;
}) {
  const color =
    variant === 'ai'
      ? 'bg-ai-bg text-ai'
      : variant === 'count'
        ? 'bg-accent text-accent-fg font-data min-w-5 justify-center px-1.5'
        : variant === 'status'
          ? TONE_CLASS[tone]
          : TONE_CLASS.neutral;
  return (
    <span
      data-badge
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-label',
        color,
        className,
      )}
    >
      {variant === 'ai' && !icon ? <Icon name="ai" size={16} /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </span>
  );
}
