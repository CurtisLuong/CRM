import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { type ReactNode, useState } from 'react';
import { Button } from './Button';
import { cn } from './cn';
import './motion.css';

/**
 * Bottom sheet (mobile) / side sheet (desktop ≥1024) trên Radix Dialog: bẫy focus, trả focus, Esc đóng.
 * `dirty` = đang có bản nháp → đóng ngoài ý muốn (chạm nền, Esc, nút Đóng) hỏi lại trước khi bỏ.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  dirty = false,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  dirty?: boolean;
  /** Hàng nút cuối sheet (CTA chính bên phải/cuối). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);

  const requestClose = () => {
    if (dirty) setConfirming(true);
    else onOpenChange(false);
  };
  const guard = (e: Event) => {
    if (dirty) {
      e.preventDefault();
      setConfirming(true);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (o) onOpenChange(true);
        else requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-text/40 data-[state=open]:animate-[sheet-fade_var(--dur-slow)_var(--ease-standard)]" />
        <Dialog.Content
          onPointerDownOutside={guard}
          onEscapeKeyDown={guard}
          onCloseAutoFocus={() => setConfirming(false)}
          className={cn(
            'fixed z-50 flex flex-col bg-surface text-text shadow-e3 outline-none',
            // Mobile: đáy màn, bo 20px góc trên, cao tối đa 90%.
            'inset-x-0 bottom-0 max-h-[90dvh] rounded-t-sheet border-t border-border pb-[env(safe-area-inset-bottom)]',
            'data-[state=open]:animate-[sheet-up_var(--dur-slow)_var(--ease-standard)]',
            // Desktop: cạnh phải, rộng 420px, cao hết màn.
            'lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[420px] lg:rounded-none lg:border-t-0 lg:border-l',
            'lg:data-[state=open]:animate-[sheet-left_var(--dur-slow)_var(--ease-standard)]',
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong lg:hidden" aria-hidden />
          <header className="flex shrink-0 items-start gap-2 px-4 pt-3 pb-2 lg:pt-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-section">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="text-small text-text-2">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Đóng"
              className="-mt-1 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-text-2 hover:bg-surface-2"
            >
              <X size={20} strokeWidth={1.75} aria-hidden />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
          {confirming ? (
            <div
              role="alertdialog"
              aria-label="Bỏ bản nháp?"
              className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface-2 px-4 py-3"
            >
              <p className="text-body-strong">Bỏ nội dung đang nhập?</p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => setConfirming(false)} autoFocus>
                  Tiếp tục nhập
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() => {
                    setConfirming(false);
                    onOpenChange(false);
                  }}
                >
                  Bỏ nháp
                </Button>
              </div>
            </div>
          ) : (
            footer && <footer className="flex shrink-0 gap-2 border-t border-border px-4 py-3">{footer}</footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
