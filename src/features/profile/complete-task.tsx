import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { taskKindOf } from '@/config/taskKinds';
import type { Task } from '@/domain/customer';
import { taskDueInfo } from '@/domain/deadlines';
import { Icon } from '@/ui/Icon';
import { useToast } from '@/ui/Toast';

export type TaskCompletionTarget = { customerId: string; task: Task };

/** Chỉ ghi khi xác nhận; ba màn dùng chung trạng thái lưu và báo lỗi. */
export function CompleteTaskDialog({
  task,
  now,
  onClose,
  onConfirm,
  onUndo,
}: {
  task: Task;
  now: number;
  onClose: () => void;
  onConfirm: (note?: string) => Promise<unknown>;
  onUndo?: () => void;
}) {
  const noteId = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const kind = taskKindOf(task.kind);
  const due = taskDueInfo(task, now);
  const confirm = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await onConfirm(note.trim() || undefined);
      toast({ title: 'Đã xong việc', ...(onUndo ? { onUndo } : {}) });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa hoàn tất được việc. Thử lại sau.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !saving.current && onClose()}>
      <DialogContent
        size="sm"
        className="[&>button]:size-11"
        onEscapeKeyDown={(event) => busy && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Hoàn thành việc</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="break-words text-body-strong">{task.text}</p>
          <DialogDescription className="flex flex-wrap items-center gap-1">
            <Icon name={kind.icon} size={16} />
            {kind.label} · {due?.label || 'Chưa có hạn'}
          </DialogDescription>
          <label htmlFor={noteId} className="flex flex-col gap-1 text-label text-ink-muted">
            Ghi chú (tuỳ chọn)
            <Textarea
              id={noteId}
              value={note}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
            />
          </label>
          {error && (
            <p role="alert" className="text-label text-alert-text">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button disabled={busy} onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" disabled={busy} aria-busy={busy} onClick={() => void confirm()}>
            {busy ? 'Đang lưu…' : 'Xác nhận xong'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
