import { X } from 'lucide-react';
import { Toast as RToast } from 'radix-ui';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { cn } from './cn';
import './motion.css';

export type ToastInput = {
  title: string;
  description?: string;
  /** `error` → kèm nút "Thử lại" khi có `onRetry`. */
  tone?: 'default' | 'error';
  /** Hoàn tác thao tác không phá huỷ (5 giây). */
  onUndo?: () => void;
  onRetry?: () => void;
  durationMs?: number;
};

type Item = ToastInput & { id: number; open: boolean };

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

let seq = 0;

/** Bọc app 1 lần. Toast hiện ở đáy màn, phía trên bottom nav (mobile); góc dưới (desktop). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);

  const show = useCallback((t: ToastInput) => {
    seq += 1;
    const id = seq;
    setItems((cur) => [...cur.slice(-2), { ...t, id, open: true }]);
  }, []);

  const close = (id: number) => {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, open: false } : i)));
    setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), 300);
  };

  const ctx = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={ctx}>
      <RToast.Provider swipeDirection="down" label="Thông báo">
        {children}
        {items.map((t) => (
          <RToast.Root
            key={t.id}
            open={t.open}
            onOpenChange={(o) => !o && close(t.id)}
            duration={t.durationMs ?? (t.onUndo ? 5000 : 4000)}
            type={t.tone === 'error' ? 'foreground' : 'background'}
            className={cn(
              'flex items-center gap-3 rounded-card border border-border bg-surface-3 px-4 py-3 text-text shadow-e3',
              'data-[state=open]:animate-[toast-in_var(--dur-base)_var(--ease-standard)] data-[swipe=move]:translate-y-(--radix-toast-swipe-move-y)',
            )}
          >
            <div className="min-w-0 flex-1">
              <RToast.Title className={cn('text-body-strong', t.tone === 'error' && 'text-danger')}>
                {t.title}
              </RToast.Title>
              {t.description && (
                <RToast.Description className="text-small text-text-2">{t.description}</RToast.Description>
              )}
            </div>
            {t.onUndo && (
              <RToast.Action altText="Hoàn tác" asChild>
                <button
                  type="button"
                  onClick={t.onUndo}
                  className="min-h-11 shrink-0 rounded-control px-3 text-body-strong text-accent hover:bg-accent-soft"
                >
                  Hoàn tác
                </button>
              </RToast.Action>
            )}
            {t.tone === 'error' && t.onRetry && (
              <RToast.Action altText="Thử lại" asChild>
                <button
                  type="button"
                  onClick={t.onRetry}
                  className="min-h-11 shrink-0 rounded-control px-3 text-body-strong text-accent hover:bg-accent-soft"
                >
                  Thử lại
                </button>
              </RToast.Action>
            )}
            <RToast.Close
              aria-label="Đóng"
              className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-control text-text-2 hover:bg-surface-2"
            >
              <X size={16} strokeWidth={1.75} aria-hidden />
            </RToast.Close>
          </RToast.Root>
        ))}
        <RToast.Viewport className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom)+8px)] z-[60] mx-auto flex w-full max-w-md flex-col gap-2 px-4 outline-none lg:right-4 lg:bottom-4 lg:left-auto lg:mx-0 lg:px-0" />
      </RToast.Provider>
    </ToastContext.Provider>
  );
}

/** const toast = useToast(); toast({ title: 'Đã xong', onUndo }). */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast cần <ToastProvider> bọc ngoài');
  return ctx;
}
