import { type FormEvent, useEffect, useState } from 'react';
import { FormSection, FormSubsection, LONG_FIELD, SHORT_FIELD } from '@/components/crm/form-section';
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
import {
  TASK_ACTION_KINDS,
  TASK_KIND_PICK,
  TASK_KINDS,
  type TaskActionKind,
  type TaskKind,
  taskKindOf,
} from '@/config/taskKinds';
import type { Task } from '@/domain/customer';
import { Icon } from '@/ui/Icon';
import { type TaskDueValue, taskDueFromInput } from './model';

const ACTION_ROW =
  'flex min-h-12 w-full min-w-0 items-center gap-3 rounded-md border border-line bg-surface-100 px-3 text-left transition-colors hover:bg-surface-200 focus-visible:outline-2 focus-visible:outline-ion';

type SaveKind = Exclude<TaskActionKind, 'call'>;

const dueInputs = (task?: Task) => {
  const date = task?.due ? new Date(task.due) : null;
  const valid = date && !Number.isNaN(date.getTime()) ? date : null;
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    day: valid ? `${valid.getFullYear()}-${pad(valid.getMonth() + 1)}-${pad(valid.getDate())}` : '',
    time: valid ? `${pad(valid.getHours())}:${pad(valid.getMinutes())}` : '09:00',
    allDay: task?.due_allday === true,
  };
};

/**
 * CP-03: "Thêm việc" luôn mở danh sách 5 hành động trước; Gọi điện rẽ sang lịch hẹn gọi (next_call_at),
 * bốn loại còn lại mới mở form nội dung + hạn và ghi next_tasks qua repository.
 */
type SheetProps = {
  open: boolean;
  customerName: string;
  onOpenChange: (open: boolean) => void;
  onScheduleCall: () => void;
} & (
  | {
      task?: undefined;
      onSave: (kind: SaveKind, text: string, due: TaskDueValue) => Promise<void>;
    }
  | {
      task: Task;
      onSave: (kind: string | undefined, text: string, due: TaskDueValue) => Promise<void>;
    }
);

export function AddTaskSheet(props: SheetProps) {
  const { open, customerName, task, onOpenChange, onScheduleCall } = props;
  const [kind, setKind] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [day, setDay] = useState('');
  const [time, setTime] = useState('09:00');
  const [allDay, setAllDay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const editing = !!task;
  const hasKind = kind !== null;
  const dirty = !editing && hasKind && (!!text.trim() || !!day || allDay);
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
    const initial = dueInputs(task);
    setKind(task ? (task.kind ?? '') : null);
    setText(task?.text ?? '');
    setDay(initial.day);
    setTime(initial.time);
    setAllDay(initial.allDay);
    setBusy(false);
    setError('');
    setConfirming(false);
  }, [open, task]);

  const pick = (action: TaskKind) => {
    setError('');
    if (action === 'call' && !editing) {
      onScheduleCall();
      return;
    }
    setKind(action);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (kind === null || busy) return;
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
      const initial = dueInputs(task);
      // Không đổi hạn thì giữ nguyên mốc đã lưu, kể cả giây và thuộc tính cả ngày cũ.
      const unchangedDue = task && day === initial.day && time === initial.time && allDay === initial.allDay;
      const savedDue = unchangedDue
        ? task.due
          ? { due: task.due, due_allday: task.due_allday === true }
          : null
        : due.due;
      if (props.task) await props.onSave(kind || undefined, clean, savedDue);
      else {
        const action = TASK_ACTION_KINDS.find((action) => action === kind);
        if (!action || action === 'call') return;
        await props.onSave(action, clean, savedDue);
      }
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa lưu được việc. Thử lại sau.');
    } finally {
      setBusy(false);
    }
  };

  const selected = hasKind ? taskKindOf(kind) : null;

  return (
    <Sheet open={open} onOpenChange={requestOpenChange}>
      <SheetContent aria-describedby="add-task-description">
        <SheetHeader className="[&_button]:size-11">
          <SheetTitle>{`${editing ? 'Sửa việc' : 'Thêm việc'} · ${customerName}`}</SheetTitle>
          <SheetDescription id="add-task-description">
            {hasKind ? 'Nhập nội dung và hạn, sau đó bấm Lưu.' : 'Chọn loại việc trước khi nhập nội dung.'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {hasKind ? (
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
              <p
                className="flex min-w-0 items-center gap-2 text-body font-semibold"
                data-task-form-kind={kind ?? undefined}
              >
                <Icon name={selected?.icon ?? 'task'} size={20} className="shrink-0 text-ink-muted" />
                <span className="min-w-0">{selected?.label}</span>
              </p>
              <FormSection title="Thông tin việc">
                <label
                  htmlFor="profile-task-text"
                  className={`${LONG_FIELD} flex flex-col gap-1 text-label text-ink-muted`}
                >
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
                <FormSubsection title="Hạn" className={LONG_FIELD}>
                  <label
                    htmlFor="profile-task-day"
                    className={`${SHORT_FIELD} sm:basis-[calc(50%_-_0.375rem)] xl:basis-[calc(50%_-_0.375rem)] self-end flex flex-col gap-1 text-label text-ink-muted`}
                  >
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
                      <label
                        className={`${LONG_FIELD} order-last flex min-h-11 items-center gap-2 text-label text-ink-muted`}
                      >
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
                          className={`${SHORT_FIELD} sm:basis-[calc(50%_-_0.375rem)] xl:basis-[calc(50%_-_0.375rem)] self-end flex flex-col gap-1 text-label text-ink-muted`}
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
                </FormSubsection>
              </FormSection>
              {error && (
                <p role="alert" className="text-label text-alert-text">
                  {error}
                </p>
              )}
            </form>
          ) : (
            <ul className="flex flex-col gap-2" aria-label={editing ? 'Loại việc cần sửa' : 'Loại việc cần thêm'}>
              {(editing ? TASK_KIND_PICK : TASK_ACTION_KINDS).map((action) => {
                const item = TASK_KINDS[action];
                return (
                  <li key={action}>
                    <button type="button" data-task-action={action} className={ACTION_ROW} onClick={() => pick(action)}>
                      <Icon name={item.icon} size={24} className="shrink-0 text-ink-muted" />
                      <span className="text-body-strong min-w-0 flex-1">{item.label}</span>
                      <span aria-hidden="true" className="shrink-0 text-caption text-ink-muted">
                        {action === 'call' && !editing ? 'Lịch hẹn gọi' : ''}
                      </span>
                      <Icon name="open" size={20} className="shrink-0 text-ink-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SheetBody>
        {hasKind && (
          <SheetFooter>
            <Button className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button type="button" variant="primary" className="flex-1" disabled={busy} onClick={() => void submit()}>
              {editing ? 'Lưu' : 'Lưu việc'}
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
