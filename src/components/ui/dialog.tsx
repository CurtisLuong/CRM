import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-50 bg-[var(--scrim)]', className)} {...props} />
));
DialogOverlay.displayName = 'DialogOverlay';

export const CloseButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label="Đóng"
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-sm border border-line text-ink-muted hover:bg-surface-200 hover:text-ink cursor-pointer',
        className,
      )}
      {...props}
    >
      <X className="size-[18px]" />
    </button>
  ),
);
CloseButton.displayName = 'CloseButton';

/** Centered dialog for decisions and short forms. size: sm 400 · md 520 · lg 720. tone="alert" for destructive confirms. */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { size?: 'sm' | 'md' | 'lg'; tone?: 'alert' }
>(({ className, children, size = 'md', tone, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-[calc(50%+(env(safe-area-inset-top)-env(safe-area-inset-bottom))/2)] z-50 flex max-h-[calc(100%-32px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-line bg-surface-100 text-ink shadow-overlay animate-pop',
        size === 'sm' && 'max-w-[400px]',
        size === 'md' && 'max-w-[520px]',
        size === 'lg' && 'max-w-[720px]',
        tone === 'alert' && 'border-alert shadow-glow-alert',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close asChild>
        <CloseButton className="absolute right-5 top-5" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1 px-5 pr-16 pt-5', className)} {...props} />
);
const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-4 overflow-auto px-5 py-4', className)} {...props} />
);
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-wrap justify-end gap-2 px-5 pb-5 pt-3', className)} {...props} />
);
const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('m-0 text-lg font-semibold leading-[26px]', className)} {...props} />
));
DialogTitle.displayName = 'DialogTitle';
const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('m-0 text-sm text-ink-muted', className)} {...props} />
));
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
