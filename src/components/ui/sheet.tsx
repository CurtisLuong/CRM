import { Dialog as DialogPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { CloseButton } from './dialog';

/** Slide-over from the right (the customer Drawer). shadcn name: Sheet. */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { width?: number }
>(({ className, children, width = 480, style, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)]" />
    <DialogPrimitive.Content
      ref={ref}
      style={{ width, ...style }}
      className={cn(
        'fixed inset-y-0 right-0 z-50 flex max-w-full flex-col border-l border-line bg-surface-100 text-ink shadow-overlay animate-slide-in max-[560px]:!w-full max-[560px]:border-l-0',
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';

const SheetHeader = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-start gap-3 border-b border-line px-5 py-4', className)} {...props}>
    <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
    <DialogPrimitive.Close asChild>
      <CloseButton />
    </DialogPrimitive.Close>
  </div>
);
const SheetToolbar = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-wrap gap-2 border-b border-line px-5 py-3', className)} {...props} />
);
const SheetBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-1 flex-col gap-4 overflow-auto px-5 py-4', className)} {...props} />
);
const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center gap-2 border-t border-line px-5 py-3', className)} {...props} />
);
const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('m-0 text-title', className)} {...props} />
));
SheetTitle.displayName = 'SheetTitle';
const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('m-0 flex flex-wrap items-center gap-2 text-[13px] text-ink-muted', className)}
    {...props}
  />
));
SheetDescription.displayName = 'SheetDescription';

export {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetToolbar,
  SheetTrigger,
};
