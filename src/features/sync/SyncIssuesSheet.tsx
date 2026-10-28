import { useEffect, useState } from 'react';
import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui';
import { useCustomers, useRepositoryAccount, useSyncStatus } from '@/data/hooks';
import { type QueueOp, queueGetAll, type SyncError } from '@/data/queue';
import { fieldLabel, rejectionReason } from '@/data/syncStatus';

const HIDDEN_FIELDS = new Set(['updated_at', 'care_stage_updated_at', 'id', 'owner_id_prev']);

function changedFields(op: QueueOp | undefined) {
  if (!op) return '';
  if (op.type === 'insert') return 'thêm khách mới';
  if (op.type === 'delete') return 'xoá khách';
  const keys = Object.keys(op.payload ?? {}).filter((k) => !HIDDEN_FIELDS.has(k));
  return keys.map(fieldLabel).join(', ');
}

/**
 * Chi tiết đồng bộ (T5.9): lỗi tạm thời → lý do + Thử lại; op server từ chối vĩnh viễn → lý do dễ hiểu
 * + "Bỏ thao tác này" (xác nhận; khách quay về dữ liệu máy chủ; bản sao giữ trong máy).
 */
export function SyncIssuesSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const account = useRepositoryAccount();
  const status = useSyncStatus();
  const customers = useCustomers();
  const [ops, setOps] = useState<QueueOp[]>([]);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  const rejectedKey = status.rejected.map((r) => r.opId).join(',');
  useEffect(() => {
    if (!open || !account || account.sync.local.isClosed || !rejectedKey) return;
    let active = true;
    void queueGetAll(account.sync.local)
      .then((all) => active && setOps(all))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, account, rejectedKey]);

  const retry = async () => {
    if (!account) return;
    setBusy(true);
    setFailure('');
    try {
      await account.sync.flushQueue();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : 'Chưa đồng bộ được.');
    } finally {
      setBusy(false);
    }
  };

  const discard = async (item: SyncError) => {
    if (!account || item.opId == null) return;
    setBusy(true);
    setFailure('');
    try {
      await account.sync.discardRejected(item.opId);
      await account.customers.refresh();
      setConfirming(null);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : 'Không bỏ được thao tác.');
    } finally {
      setBusy(false);
    }
  };

  const online = account?.sync.isOnline() ?? false;
  const nameOf = (id: string) => customers.find((c) => c.id === id)?.full_name || 'Khách';

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirming(null);
        onOpenChange(next);
      }}
    >
      <SheetContent aria-label="Đồng bộ">
        <SheetHeader>
          <SheetTitle>Đồng bộ</SheetTitle>
          <SheetDescription>
            {status.rejected.length
              ? `${status.rejected.length} thay đổi bị máy chủ từ chối`
              : status.pending
                ? `Chờ đồng bộ ${status.pending} thay đổi`
                : 'Dữ liệu trên máy này đã khớp máy chủ'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="flex flex-col gap-3 pb-2">
            {!online && (
              <p className="text-body text-ink-muted">
                Đang ngoại tuyến — thay đổi được giữ trong máy và tự gửi khi có mạng.
              </p>
            )}
            {status.error && (
              <div className="rounded-lg border border-line p-3">
                <p className="text-body-strong">Chưa gửi được lên máy chủ</p>
                <p className="text-caption text-ink-muted">{status.error.message}</p>
                <p className="text-caption text-ink-muted">App tự thử lại khi có mạng; không mất thay đổi nào.</p>
              </div>
            )}
            {status.rejected.map((item) => {
              const op = ops.find((o) => o.opId === item.opId);
              const fields = changedFields(op);
              return (
                <div key={item.opId} className="flex flex-col gap-2 rounded-lg border border-alert bg-alert-tint p-3">
                  <div>
                    <p className="text-body-strong">{nameOf(item.recordId)}</p>
                    {fields && <p className="text-caption text-ink-muted">Thay đổi: {fields}</p>}
                  </div>
                  <p className="text-body text-alert-text">{rejectionReason(item)}</p>
                  <p className="text-caption text-ink-muted">
                    Các thay đổi khác của khách này đang chờ phía sau; khách khác vẫn đồng bộ bình thường.
                  </p>
                  {confirming === item.opId ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-caption">
                        Bỏ thay đổi này? Khách sẽ quay về dữ liệu đang có trên máy chủ. Bản sao thay đổi vẫn được lưu
                        trong máy.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="destructive" disabled={busy} onClick={() => discard(item)}>
                          Xác nhận bỏ
                        </Button>
                        <Button variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>
                          Giữ lại
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Button
                        variant="secondary"
                        disabled={busy || !online}
                        onClick={() => setConfirming(item.opId ?? null)}
                      >
                        Bỏ thao tác này
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            {failure && <p className="text-caption text-alert-text">{failure}</p>}
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" disabled={(busy && confirming == null) || !online} onClick={retry}>
            Thử lại
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
