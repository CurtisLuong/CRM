import { useState } from 'react';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { appendInteractionPatch, createInteraction, type InteractionKind } from '@/domain/customer/interactions';
import { Button, Sheet, useToast } from '@/ui';

export function InteractionRecorder({
  account,
  customer,
  trigger = false,
}: {
  account: RepositoryAccount;
  customer: Customer;
  trigger?: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const writable = customer.owner_id === account.sync.local.userId && !customer.archived_at;
  const record = async (kind: InteractionKind) => {
    if (!writable || busy) return;
    setBusy(true);
    setError('');
    try {
      await account.customers.update(
        customer.id,
        appendInteractionPatch(customer, createInteraction(kind, account.sync.local.userId)),
      );
      if (account.sync.local.isClosed) return;
      setOpen(false);
      toast({
        title: kind === 'meeting' ? 'Đã ghi cuộc gặp' : 'Đã ghi xem dự án',
        description: account.sync.isOnline() ? 'Đang đồng bộ.' : 'Ngoại tuyến · chờ đồng bộ.',
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa lưu được tương tác. Thử lại.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {trigger ? (
        <Button disabled={!writable} onClick={() => setOpen(true)}>
          Ghi tương tác
        </Button>
      ) : (
        <section className="flex flex-wrap items-center gap-2" aria-label="Ghi tương tác">
          <span className="text-small text-text-2">Ghi tương tác:</span>
          <Button
            className="min-h-9 px-3"
            disabled={!writable || busy}
            loading={busy}
            onClick={() => void record('meeting')}
          >
            Đã gặp
          </Button>
          <Button
            className="min-h-9 px-3"
            disabled={!writable || busy}
            loading={busy}
            onClick={() => void record('project_view')}
          >
            Đã xem dự án
          </Button>
          {error && (
            <p role="alert" className="w-full text-small text-danger">
              {error}
            </p>
          )}
        </section>
      )}
      {trigger && (
        <Sheet open={open} onOpenChange={setOpen} title={`Ghi tương tác · ${customer.full_name}`}>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!writable || busy} loading={busy} onClick={() => void record('meeting')}>
              Đã gặp
            </Button>
            <Button disabled={!writable || busy} loading={busy} onClick={() => void record('project_view')}>
              Đã xem dự án
            </Button>
            {error && (
              <p role="alert" className="w-full text-small text-danger">
                {error}
              </p>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}
