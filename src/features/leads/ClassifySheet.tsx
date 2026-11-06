import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { LEAD_DROP_REASONS, LEAD_DROP_TOP } from '@/config/reasons';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { useToast } from '@/ui/Toast';
import { disqualifyLead, hasTalked, isLead, type LeadDropReason, qualifyLead } from './model';

const FIELD =
  'min-h-11 w-full rounded-md border border-line bg-surface-100 px-3 text-body text-ink focus:outline-2 focus:outline-ion';
// Lý do hay gặp lên đầu danh sách.
const REASONS = [
  ...LEAD_DROP_TOP,
  ...Object.keys(LEAD_DROP_REASONS).filter((key) => !(LEAD_DROP_TOP as readonly string[]).includes(key)),
];

/** Khách mới của mình, chưa loại → được phân loại Đạt / Loại. */
export function canClassify(customer: Customer | null | undefined, userId: string) {
  return (
    !!customer && customer.owner_id === userId && !customer.archived_at && isLead(customer) && !customer.disqualified_at
  );
}

/** Ô chọn lý do loại (+ ghi chú khi "Khác") — dùng chung hộp Phân loại và hộp Kết quả cuộc gọi. */
export function DropReasonFields({
  reason,
  note,
  onReason,
  onNote,
  disabled,
}: {
  reason: LeadDropReason | '';
  note: string;
  onReason: (reason: LeadDropReason | '') => void;
  onNote: (note: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <label className="flex flex-col gap-1 text-label">
        Lý do loại
        <select
          aria-label="Lý do loại"
          className={FIELD}
          value={reason}
          disabled={disabled}
          onChange={(event) => onReason(event.target.value as LeadDropReason | '')}
        >
          <option value="">Chọn lý do</option>
          {REASONS.map((key) => (
            <option key={key} value={key}>
              {LEAD_DROP_REASONS[key]}
            </option>
          ))}
        </select>
      </label>
      {reason === 'khac' && (
        <label className="flex flex-col gap-1 text-label">
          Ghi chú lý do khác
          <textarea
            aria-label="Ghi chú lý do khác"
            className={`${FIELD} min-h-20 py-2`}
            value={note}
            disabled={disabled}
            onChange={(event) => onNote(event.target.value)}
          />
        </label>
      )}
    </>
  );
}

/**
 * Phân loại khách mới (Curtis 06/11): Đạt → lên Tiềm năng, hoặc Loại kèm lý do. Mở từ hồ sơ và từ thẻ
 * "Đã nói chuyện — chọn Đạt hay Loại" ở Hôm nay. Luật giữ nguyên màn Khách mới: Đạt cần ≥ 1 cuộc "Nói chuyện được".
 */
export function ClassifyLeadSheet({
  account,
  customer,
  open,
  onOpenChange,
}: {
  account: RepositoryAccount | null | undefined;
  customer: Customer | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState<LeadDropReason | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setReason('');
    setNote('');
    setError('');
  }, [open]);
  const talked = !!customer && hasTalked(customer);
  const run = async (work: () => Promise<unknown>, title: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
      onOpenChange(false);
      toast({ title, description: account?.sync.isOnline() ? 'Đang đồng bộ.' : 'Ngoại tuyến · chờ đồng bộ.' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa lưu được. Thử lại.');
    } finally {
      setBusy(false);
    }
  };
  const title = `Phân loại${customer ? ` · ${customer.full_name}` : ''}`;
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <SheetContent aria-label={title}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            Đạt: khách quan tâm thật, chuyển sang Tiềm năng để chăm sóc. Loại: không chăm tiếp, ghi lý do.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {customer && (
            <div className="flex flex-col gap-4">
              <Button
                variant="primary"
                className="w-full"
                disabled={!talked || busy}
                onClick={() =>
                  account && void run(() => qualifyLead(account.customers, customer.id), 'Đã chuyển sang Tiềm năng')
                }
              >
                {talked ? 'Đạt → Tiềm năng' : 'Đạt · cần một cuộc "Nói chuyện được"'}
              </Button>
              <div className="flex flex-col gap-3 border-t border-line pt-4">
                <DropReasonFields reason={reason} note={note} onReason={setReason} onNote={setNote} disabled={busy} />
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={!reason || busy}
                  onClick={() =>
                    account &&
                    reason &&
                    void run(() => disqualifyLead(account.customers, customer.id, reason, note), 'Đã loại khách')
                  }
                >
                  Loại
                </Button>
              </div>
              {error && (
                <p role="alert" className="text-caption text-alert-text">
                  {error}
                </p>
              )}
            </div>
          )}
        </SheetBody>
        <SheetFooter>
          <Button className="w-full" onClick={() => onOpenChange(false)} disabled={busy}>
            Để sau
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
