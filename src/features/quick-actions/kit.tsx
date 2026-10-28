import { RadioGroup } from 'radix-ui';
import { type ButtonHTMLAttributes, type ReactNode, useState } from 'react';
import { Button as KitButton } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { toast } from '@/components/ui/sonner';
import { Textarea } from '@/components/ui/textarea';
import { CALL_RESULTS, type CallResult } from '@/config/callResults';
import { type CallSlotKey, FOLLOWUP_CONFIG } from '@/config/followup';
import type { IconName } from '@/config/icons';
import { cn } from '@/lib/utils';
import { Icon } from '@/ui/Icon';

export function Button({
  loading,
  block,
  variant,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  block?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return (
    <KitButton
      variant={variant === 'danger' ? 'destructive' : variant}
      className={cn(block && 'w-full', className)}
      aria-busy={loading || undefined}
      disabled={props.disabled || loading}
      {...props}
    />
  );
}

export function IconButton({
  icon,
  label,
  variant,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; variant?: 'accent' }) {
  return (
    <KitButton
      size="icon"
      aria-label={label}
      title={label}
      className={cn(variant === 'accent' && 'bg-ion-tint text-ion hover:bg-ion-tint', className)}
      {...props}
    >
      <Icon name={icon} size={20} />
    </KitButton>
  );
}

export function notify(info: { title: string; description?: string; tone?: 'error' }) {
  if (info.tone === 'error') toast.error(info.title, { description: info.description, duration: Infinity });
  else toast.success(info.title, { description: info.description });
  // Giữ phản hồi đọc được trong môi trường nhúng không mount Toaster (ví dụ test màn độc lập).
  if (!document.querySelector('[data-sonner-toaster]')) {
    document.getElementById('quick-actions-notice')?.remove();
    const notice = document.createElement('div');
    notice.id = 'quick-actions-notice';
    notice.setAttribute('role', info.tone === 'error' ? 'alert' : 'status');
    notice.className =
      'fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-md border border-line bg-surface-200 px-4 py-3 text-ink shadow-overlay';
    const title = document.createElement('span');
    title.textContent = info.title;
    notice.append(title);
    if (info.description) {
      const description = document.createElement('span');
      description.className = 'ml-2 text-ink-muted';
      description.textContent = info.description;
      notice.append(description);
    }
    document.body.append(notice);
    window.setTimeout(() => notice.remove(), info.tone === 'error' ? 10_000 : 4_000);
  }
}

export function ActionSheet({
  open = true,
  onOpenChange,
  title,
  description,
  dirty,
  footer,
  children,
}: {
  open?: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  dirty?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [confirm, setConfirm] = useState(false);
  const requestClose = () => (dirty ? setConfirm(true) : onOpenChange(false));
  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
        <SheetContent
          onEscapeKeyDown={(event) => {
            if (dirty) {
              event.preventDefault();
              setConfirm(true);
            }
          }}
          onPointerDownOutside={(event) => {
            if (dirty) {
              event.preventDefault();
              setConfirm(true);
            }
          }}
        >
          <SheetHeader>
            <div>
              <SheetTitle>{title}</SheetTitle>
              {description && <SheetDescription>{description}</SheetDescription>}
            </div>
          </SheetHeader>
          <SheetBody>{children}</SheetBody>
          {footer && <SheetFooter>{footer}</SheetFooter>}
        </SheetContent>
      </Sheet>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Bỏ nội dung đang nhập?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p>Bản nháp chưa được lưu.</p>
          </DialogBody>
          <DialogFooter>
            <KitButton onClick={() => setConfirm(false)}>Tiếp tục nhập</KitButton>
            <KitButton
              variant="destructive"
              onClick={() => {
                setConfirm(false);
                onOpenChange(false);
              }}
            >
              Bỏ nháp
            </KitButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const choice =
  'cursor-pointer rounded-md border border-line bg-surface-100 text-ink hover:bg-surface-200 data-[state=checked]:border-ion data-[state=checked]:bg-ion-tint data-[state=checked]:text-ink';
const MAIN: ReadonlyArray<{ value: CallResult; label: string; icon: IconName }> = [
  { value: 'talked', label: 'Nói chuyện được', icon: 'talked' },
  { value: 'no_answer', label: 'Không nghe / không liên lạc', icon: 'call_again' },
  { value: 'busy', label: 'Bận, hẹn lại', icon: 'call_sched' },
  { value: 'wrong_number', label: 'Sai số / không phù hợp', icon: 'drop' },
];
export function OutcomePicker({
  value,
  onValueChange,
}: {
  value: CallResult | null;
  onValueChange: (value: CallResult) => void;
}) {
  const inMain = MAIN.some((item) => item.value === value);
  const [more, setMore] = useState(value !== null && !inMain);
  const rest = (Object.keys(CALL_RESULTS) as CallResult[]).filter((key) => !MAIN.some((item) => item.value === key));
  return (
    <RadioGroup.Root
      aria-label="Kết quả cuộc gọi"
      value={value ?? ''}
      onValueChange={(v) => onValueChange(v as CallResult)}
      className="flex flex-col gap-2"
    >
      <div className="grid grid-cols-2 gap-2">
        {MAIN.map((item) => (
          <RadioGroup.Item
            key={item.value}
            value={item.value}
            className={cn(
              choice,
              'flex min-h-16 flex-col items-start justify-center gap-1 px-3 py-2 text-left text-body-strong',
            )}
          >
            <Icon name={item.icon} size={20} />
            {item.label}
          </RadioGroup.Item>
        ))}
      </div>
      {more ? (
        <div className="flex flex-wrap gap-2">
          {rest.map((key) => (
            <RadioGroup.Item key={key} value={key} className={cn(choice, 'min-h-11 rounded-full px-4 text-caption')}>
              {CALL_RESULTS[key]}
            </RadioGroup.Item>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMore(true)}
          className="min-h-11 self-start rounded-md px-3 font-semibold text-ion hover:bg-ion-tint"
        >
          Khác…
        </button>
      )}
    </RadioGroup.Root>
  );
}

export function SlotPicker({
  days,
  day,
  onDayChange,
  slot,
  onSlotChange,
  suggested,
}: {
  days: { value: string; label: string }[];
  day: string;
  onDayChange: (day: string) => void;
  slot: CallSlotKey | null;
  onSlotChange: (slot: CallSlotKey) => void;
  suggested?: CallSlotKey;
}) {
  const slots = Object.entries(FOLLOWUP_CONFIG.callSlots) as Array<[CallSlotKey, { range: string; name: string }]>;
  return (
    <div className="flex flex-col gap-3">
      <RadioGroup.Root
        aria-label="Ngày"
        value={day}
        onValueChange={onDayChange}
        orientation="horizontal"
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]"
      >
        {days.map((item) => (
          <RadioGroup.Item
            key={item.value}
            value={item.value}
            className={cn(choice, 'min-h-11 shrink-0 rounded-full px-4 text-body-strong')}
          >
            {item.label}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      <RadioGroup.Root
        aria-label="Khung giờ gọi"
        value={slot ?? ''}
        onValueChange={(v) => onSlotChange(v as CallSlotKey)}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {slots.map(([key, item]) => (
          <RadioGroup.Item
            key={key}
            value={key}
            className={cn(choice, 'relative flex min-h-14 flex-col items-start justify-center px-3 py-2 text-left')}
          >
            <span className="text-body-strong">
              {item.name}
              {suggested === key && <span className="ml-1.5 text-label text-ion">· Gợi ý</span>}
            </span>
            <span className="font-mono text-caption text-ink-muted">{item.range.replace('-', '–')}</span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  );
}

export { Input, Textarea };
