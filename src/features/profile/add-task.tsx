import { type FormEvent, useEffect, useState } from 'react';
import { TASK_ACTION_KINDS, TASK_KINDS, type TaskActionKind } from '@/config/taskKinds';
import { Button, Icon, Sheet } from '@/ui';
import { type TaskDueValue, taskDueFromInput } from './model';

const FIELD = 'min-h-11 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 text-body text-text';
const ACTION_ROW =
  'flex min-h-12 w-full min-w-0 items-center gap-3 rounded-control border border-border bg-surface px-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus';

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

  const dirty = kind !== null && (!!text.trim() || !!day || allDay);
  const selected = kind ? TASK_KINDS[kind] : null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Thêm việc · ${customerName}`}
      description={kind ? 'Nhập nội dung và hạn, sau đó bấm Lưu việc.' : 'Chọn loại việc trước khi nhập nội dung.'}
      dirty={dirty && !busy}
      footer={
        kind ? (
          <>
            <Button className="flex-1" disabled={busy} onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button type="button" variant="primary" className="flex-1" loading={busy} onClick={() => void submit()}>
              Lưu việc
            </Button>
          </>
        ) : undefined
      }
    >
      {!kind ? (
        <ul className="flex flex-col gap-2" aria-label="Loại việc cần thêm">
          {TASK_ACTION_KINDS.map((action) => {
            const item = TASK_KINDS[action];
            return (
              <li key={action}>
                <button type="button" data-task-action={action} className={ACTION_ROW} onClick={() => pick(action)}>
                  <Icon name={item.icon} size={24} className="shrink-0 text-text-2" />
                  <span className="min-w-0 flex-1 text-body-strong">{item.label}</span>
                  <span aria-hidden="true" className="shrink-0 text-small text-text-3">
                    {action === 'call' ? 'Lịch hẹn gọi' : ''}
                  </span>
                  <Icon name="open" size={20} className="shrink-0 text-text-3" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <form className="flex min-w-0 flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <button
            type="button"
            className="inline-flex min-h-9 w-fit items-center gap-1 rounded-control px-1 text-small text-text-2 hover:bg-surface-2"
            disabled={busy}
            onClick={() => {
              setKind(null);
              setError('');
            }}
          >
            <Icon name="back" size={16} />
            Đổi loại
          </button>
          <p className="flex min-w-0 items-center gap-2 text-body-strong" data-task-form-kind={kind}>
            <Icon name={selected?.icon ?? 'task'} size={20} className="shrink-0 text-text-2" />
            <span className="min-w-0">{selected?.label}</span>
          </p>
          <label className="flex min-w-0 flex-col gap-1 text-small text-text-2">
            Nội dung việc
            <textarea
              aria-label="Nội dung việc"
              className={`${FIELD} min-h-20 py-2`}
              rows={3}
              required
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
              placeholder="Ví dụ: Gửi bảng giá căn 2 phòng ngủ"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-small text-text-2">
            Hạn (để trống nếu chưa có hạn)
            <input
              aria-label="Ngày hạn"
              className={FIELD}
              type="date"
              value={day}
              disabled={busy}
              onChange={(event) => setDay(event.target.value)}
            />
          </label>
          {day && (
            <>
              <label className="flex min-h-11 items-center gap-2 text-small text-text-2">
                <input
                  type="checkbox"
                  checked={allDay}
                  disabled={busy}
                  onChange={(event) => setAllDay(event.target.checked)}
                />
                Cả ngày (không cần giờ)
              </label>
              {!allDay && (
                <label className="flex min-w-0 flex-col gap-1 text-small text-text-2">
                  Giờ hạn
                  <input
                    aria-label="Giờ hạn"
                    className={FIELD}
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
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          )}
        </form>
      )}
    </Sheet>
  );
}
