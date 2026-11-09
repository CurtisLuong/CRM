import { Dialog as DialogPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { CloseButton } from './dialog';

/** Tấm đáy dưới 1024px; ngăn kéo bên phải trên máy tính. */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

type SheetContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  width?: number;
  /** Chiều cao tấm đáy; mặc định theo nội dung, luôn giới hạn trong vùng nhìn thấy. */
  mobileHeight?: string;
};

const SheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, SheetContentProps>(
  (
    {
      className,
      children,
      width = 480,
      mobileHeight = 'auto',
      style,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
      onFocusCapture,
      ...props
    },
    ref,
  ) => {
    const contentRef = React.useRef<HTMLDivElement>(null);
    const closeRef = React.useRef<HTMLButtonElement>(null);
    const gesture = React.useRef<{ id: number; x: number; y: number } | null>(null);
    const [drag, setDrag] = React.useState<number | null>(null);
    const [viewport, setViewport] = React.useState<{ height: number; bottom: number } | null>(null);

    const setContentRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        contentRef.current = node;
        if (typeof ref === 'function') return ref(node);
        if (ref) ref.current = node;
      },
      [ref],
    );

    const revealInput = React.useCallback(() => {
      const active = document.activeElement;
      if (
        window.innerWidth < 1024 &&
        active instanceof HTMLElement &&
        active.matches('input, textarea, select, [contenteditable="true"]') &&
        contentRef.current?.contains(active)
      ) {
        active.scrollIntoView({ block: 'nearest' });
      }
    }, []);

    React.useEffect(() => {
      const visible = window.visualViewport;
      if (!visible) return;
      const update = () => {
        // dvh chưa trừ bàn phím trên một số trình duyệt; dùng đúng vùng còn nhìn thấy.
        setViewport({
          height: visible.height,
          bottom: Math.max(0, window.innerHeight - visible.height - visible.offsetTop),
        });
      };
      update();
      visible.addEventListener('resize', update);
      visible.addEventListener('scroll', update);
      return () => {
        visible.removeEventListener('resize', update);
        visible.removeEventListener('scroll', update);
      };
    }, []);

    React.useEffect(() => {
      if (!viewport?.height) return;
      const frame = window.requestAnimationFrame(revealInput);
      return () => window.cancelAnimationFrame(frame);
    }, [viewport?.height, revealInput]);

    const resetDrag = () => {
      gesture.current = null;
      setDrag(null);
    };

    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)]" />
        <DialogPrimitive.Content
          {...props}
          ref={setContentRef}
          style={
            {
              width,
              '--sheet-mobile-height': mobileHeight,
              '--sheet-drag': `${drag ?? 0}px`,
              ...(viewport && {
                '--sheet-viewport-height': `${viewport.height}px`,
                '--sheet-bottom': `${viewport.bottom}px`,
              }),
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            // Giữ phần chừa status bar và thanh điều hướng Android cả hai kích thước.
            'fixed inset-x-0 bottom-[var(--sheet-bottom,0px)] z-50 flex h-[var(--sheet-mobile-height)] max-w-full max-h-[min(calc(var(--sheet-viewport-height,100dvh)*0.9),calc(var(--sheet-viewport-height,100dvh)-env(safe-area-inset-top)))] flex-col overflow-hidden rounded-t-lg border-t border-line bg-surface-100 pb-[env(safe-area-inset-bottom)] text-ink shadow-overlay max-lg:!w-full max-lg:!max-w-full',
            'translate-y-[var(--sheet-drag)] animate-slide-up transition-transform duration-200 motion-reduce:animate-none motion-reduce:transition-none',
            'lg:inset-y-0 lg:left-auto lg:h-auto lg:max-h-none lg:translate-y-0 lg:rounded-none lg:border-t-0 lg:border-l lg:pt-[env(safe-area-inset-top)] lg:animate-slide-in lg:motion-reduce:animate-none',
            drag !== null && 'transition-none',
            className,
          )}
          onPointerDown={(event) => {
            onPointerDown?.(event);
            if (
              event.defaultPrevented ||
              gesture.current ||
              event.button !== 0 ||
              window.innerWidth >= 1024 ||
              !(event.target instanceof Element) ||
              !event.target.closest('[data-sheet-handle], [data-sheet-header]') ||
              event.target.closest('button, a, input, textarea, select, [role="button"]')
            )
              return;
            gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag(0);
          }}
          onPointerMove={(event) => {
            onPointerMove?.(event);
            const start = gesture.current;
            if (!start || start.id !== event.pointerId || event.defaultPrevented) return;
            const down = event.clientY - start.y;
            setDrag(down > Math.abs(event.clientX - start.x) ? Math.max(0, down) : 0);
          }}
          onPointerUp={(event) => {
            onPointerUp?.(event);
            const start = gesture.current;
            if (!start || start.id !== event.pointerId) return;
            const down = event.clientY - start.y;
            resetDrag();
            // Đi qua Radix Close để cơ chế hỏi bỏ bản nháp của từng tấm vẫn được gọi.
            if (!event.defaultPrevented && down > 80 && down > Math.abs(event.clientX - start.x)) {
              closeRef.current?.click();
            }
          }}
          onPointerCancel={(event) => {
            onPointerCancel?.(event);
            resetDrag();
          }}
          onLostPointerCapture={(event) => {
            onLostPointerCapture?.(event);
            resetDrag();
          }}
          onFocusCapture={(event) => {
            onFocusCapture?.(event);
            if (!event.defaultPrevented) window.requestAnimationFrame(revealInput);
          }}
        >
          <div
            data-sheet-handle=""
            aria-hidden="true"
            className="flex h-6 shrink-0 touch-none items-center justify-center lg:hidden"
          >
            <div className="h-1 w-10 rounded-full bg-line" />
          </div>
          <DialogPrimitive.Close ref={closeRef} className="hidden" tabIndex={-1} aria-hidden="true" />
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  },
);
SheetContent.displayName = 'SheetContent';

const SheetHeader = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-sheet-header=""
    className={cn('flex shrink-0 touch-none items-start gap-3 border-b border-line px-5 py-4', className)}
    {...props}
  >
    <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
    <DialogPrimitive.Close asChild>
      <CloseButton />
    </DialogPrimitive.Close>
  </div>
);
const SheetToolbar = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex shrink-0 flex-wrap gap-2 border-b border-line px-5 py-3', className)} {...props} />
);
const SheetBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-sheet-body=""
    className={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-auto overscroll-contain px-5 py-4', className)}
    {...props}
  />
);
const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-sheet-footer=""
    className={cn('flex shrink-0 items-center gap-2 border-t border-line px-5 py-3', className)}
    {...props}
  />
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
