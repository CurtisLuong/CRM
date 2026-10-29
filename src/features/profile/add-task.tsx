import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { TASK_ACTION_KINDS, TASK_KINDS, type TaskActionKind } from '@/config/taskKinds';
import { Icon } from '@/ui/Icon';
import { type TaskDueValue, taskDueFromInput } from './model';

const ACTION_ROW =
  'flex min-h-12 w-full min-w-0 items-center gap-3 rounded-md border border-line bg-surface-100 px-3 text-left transition-colors hover:bg-surface-200 focus-visible:outline-2 focus-visible:outline-ion';

type SaveKind = Exclude<TaskActionKind, 'call'>;

/**
 * CP-03: "Thêm việc" luôn mở danh sách 5 hành động trước; Gọi điện rẽ sang lịch hẹn gọi (next_call_at),
 * bốn loại còn lại mới mở form nội dung + hạn và ghi next_tasks qua repository.
 */
export function AddTaskSheet({
  open,
  customerName,
  onOpenChange,
  onScheduleCall,
  onSave,
}: {
  open: boolean;
  customerName: string;
  onOpenChange: (open: boolean) => void;
  onScheduleCall: () => void;
  onSave: (kind: SaveKind, text: string, due: TaskDueValue) => Promise<void>;
}) {
  const [kind, setKind] = useState<SaveKind | null>(null);
  const [text, setText] = useState('');
  const [day, setDay] = useState('');
  const [time, setTime] = useState('09:00');
  const [allDay, setAllDay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const dirty = kind !== null && (!!text.trim() || !!day || allDay);
  const requestOpenChange = (next: boolean) => {
    if (!next && dirty && !busy) {
      setConfirming(true);
      return;
    }
    onOpenChange(next);
  };

  // Mỗi lần mở "Thêm việc" đều bắt đầu ở danh sách loại, không nhớ bản nháp lần trước.
  useEffect(() => {
    if (!open) return;
    setKind(null);
    setText('');
    setDay('');
    setTime('09:00');
    setAllDay(false);
    setBusy(false);
    setError('');
    setConfirming(false);
  }, [open]);

  const pick = (action: TaskActionKind) => {
    setError('');
    if (action === 'call') {
      onScheduleCall();
      return;
    }
    setKind(action);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!kind || busy) return;
    const clean = text.trim();
    if (!clean) {
      setError('Nhập nội dung việc trước khi lưu.');
      return;
    }
    const due = taskDueFromInput({ day, time, allDay });
    if (!due.ok) {
      setError(due.error);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(kind, clean, due.due);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa lưu được việc. Thử lại sau.');
    } finally {
      setBusy(false);
    }
  };

  const selected = kind ? TASK_KINDS[kind] : null;

  return (
    <Sheet open={open} onOpenChange={requestOpenChange}>
      <SheetContent aria-describedby="add-task-description">
        <SheetHeader>
          <SheetTitle>{`Thêm việc · ${customerName}`}</SheetTitle>
          <SheetDescription id="add-task-description">
            {kind ? 'Nhập nội dung và hạn, sau đó bấm Lưu việc.' : 'Chọn loại việc trước khi nhập nội dung.'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {kind ? (
            <form className="flex min-w-0 flex-col gap-3" onSubmit={(event) => void submit(event)}>
              <button
                type="button"
                className="min-h-11 w-fit px-2 text-label text-ink-muted hover:bg-surface-200"
                disabled={busy}
                onClick={() => {
                  setKind(null);
                  setError('');
                }}
              >
                <Icon name="back" size={16} /> Đổi loại
              </button>
              <p className="flex min-w-0 items-center gap-2 text-body font-semibold" data-task-form-kind={kind}>
                <Icon name={selected?.icon ?? 'task'} size={20} className="shrink-0 text-ink-muted" />
                <span className="min-w-0">{selected?.label}</span>
              </p>
              <label htmlFor="profile-task-text" className="flex min-w-0 flex-col gap-1 text-label text-ink-muted">
                Nội dung việc
                <Textarea
                  id="profile-task-text"
                  aria-label="Nội dung việc"
                  className="min-h-20"
                  rows={3}
                  required
                  value={text}
                  disabled={busy}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Ví dụ: Gửi bảng giá căn 2 phòng ngủ"
                />
              </label>
              <label htmlFor="profile-task-day" className="flex min-w-0 flex-col gap-1 text-label text-ink-muted">
                Hạn (để trống nếu chưa có hạn)
                <Input
                  id="profile-task-day"
                  aria-label="Ngày hạn"
                  type="date"
                  value={day}
                  disabled={busy}
                  onChange={(event) => setDay(event.target.value)}
                />
              </label>
              {day && (
                <>
                  <label className="flex min-h-11 items-center gap-2 text-label text-ink-muted">
                    <input
                      type="checkbox"
                      checked={allDay}
                      disabled={busy}
                      onChange={(event) => setAllDay(event.target.checked)}
                    />{' '}
                    Cả ngày (không cần giờ)
                  </label>
                  {!allDay && (
                    <label
                      htmlFor="profile-task-time"
                      className="flex min-w-0 flex-col gap-1 text-label text-ink-muted"
                    >
                      Giờ hạn
                      <Input
                        id="profile-task-time"
                        aria-label="Giờ hạn"
                        type="time"
                        required
                        value={time}
                        disabled={busy}
                        onChange={(event) => setTime(event.target.value)}
                      />
                    </label>
                  )}
                </>
              )}
              {error && (
                <p role="alert" className="text-label text-alert-text">
                  {error}
                </p>
              )}
            </form>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Loại việc cần thêm">
              {TASK_ACTION_KINDS.map((action) => {
                const item = TASK_KINDS[action];
                return (
                  <li key={action}>
                    <button type="button" data-task-action={action} className={ACTION_ROW} onClick={() => pick(action)}>
                      <Icon name={item.icon} size={24} className="shrink-0 text-ink-muted" />
                      <span className="text-body-strong min-w-0 flex-1">{item.label}</span>
                      <span aria-hidden="true" className="shrink-0 text-caption text-ink-muted">
                        {action === 'call' ? 'Lịch hẹn gọi' : ''}
                      </span>
                      <Icon name="open" size={20} className="shrink-0 text-ink-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SheetBody>
        {kind && (
          <SheetFooter>
            <Button className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button type="button" variant="primary" className="flex-1" disabled={busy} onClick={() => void submit()}>
              Lưu việc
            </Button>
          </SheetFooter>
        )}
        {confirming && (
          <div
            role="alertdialog"
            aria-label="Bỏ bản nháp?"
            className="flex flex-col gap-2 border-t border-line bg-surface-200 px-5 py-3"
          >
            <p className="text-body-strong">Bỏ nội dung đang nhập?</p>
            <div className="flex gap-2">
              <Button className="flex-1" autoFocus onClick={() => setConfirming(false)}>
                Tiếp tục nhập
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  setConfirming(false);
                  onOpenChange(false);
                }}
              >
                Bỏ nội dung
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
