import { LoaderCircle } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { IconName } from '@/config/icons';
import { cn } from './cn';
import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95',
  secondary: 'bg-surface text-text border border-border-strong hover:bg-surface-2',
  ghost: 'text-text hover:bg-surface-2',
  // Chỉ cho hành động phá huỷ (xoá, loại).
  danger: 'bg-danger text-surface hover:brightness-110',
  // Chỉ cho hành động AI.
  ai: 'bg-surface text-ai border border-ai hover:bg-ai-bg',
};

const BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-control text-body-strong transition-[background-color,filter,color] duration-(--dur-fast) ease-standard disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Đang xử lý: khoá nút, hiện vòng quay, giữ nguyên chiều rộng chữ. */
  loading?: boolean;
  icon?: IconName;
  /** Giãn hết chiều ngang. */
  block?: boolean;
  /** Bọc phần tử con (vd. <Link>) thay vì <button>. */
  asChild?: boolean;
  children?: ReactNode;
};

/** Cao 44px trên mobile, 36px trên desktop (DESIGN_SYSTEM §3). */
export function Button({
  variant = 'secondary',
  loading = false,
  icon,
  block,
  asChild,
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = cn(BASE, VARIANT[variant], 'min-h-11 px-4 lg:min-h-9 lg:px-3', block && 'w-full', className);
  if (asChild) {
    return (
      <Slot.Root className={cls} {...rest}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? (
        <LoaderCircle size={20} strokeWidth={1.75} className="animate-spin motion-reduce:animate-none" aria-hidden />
      ) : icon ? (
        <Icon name={icon} size={20} />
      ) : null}
      {children}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: IconName;
  /** Bắt buộc: nút chỉ có icon phải có nhãn cho screen reader + tooltip. */
  label: string;
  variant?: Exclude<ButtonVariant, 'danger'>;
};

/** Vùng chạm 44×44. Gọi/Zalo/Ghi chú dùng `secondary`, không tô màu trạng thái. */
export function IconButton({
  icon,
  label,
  variant = 'secondary',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(BASE, VARIANT[variant], 'size-11 shrink-0', className)}
      {...rest}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}
