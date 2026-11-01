import { useState } from 'react';
import { useNavigate } from 'react-router';
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
import { LEAD_DROP_REASONS } from '@/config/reasons';
import { useRepositoryAccount } from '@/data/hooks';
import type { Customer, Interaction } from '@/domain/customer';
import { appendInteractionPatch } from '@/domain/customer/interactions';

export const ARCHIVED_PATH = '/khach-hang/luu-tru';

/** D-003: chỉ người phụ trách được lưu trữ/khôi phục. */
export const canArchive = (customer: Pick<Customer, 'owner_id'>, userId: string | null | undefined) =>
  !!userId && customer.owner_id === userId;

export const archivedDate = (at: string | null | undefined) => {
  const date = at ? new Date(at) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('vi-VN') : '';
};

export function archiveReason(customer: Pick<Customer, 'interactions'>): string {
  const item = (customer.interactions ?? []).find((entry) => entry?.kind === 'archived');
  return item?.reason && typeof item.reason === 'string' ? LEAD_DROP_REASONS[item.reason] || '' : '';
}

type ArchiveTarget = Pick<Customer, 'id' | 'owner_id' | 'interactions'>;

export function useArchiveActions(customer: ArchiveTarget) {
  const account = useRepositoryAccount();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    title: string;
    description?: string;
    tone?: 'default' | 'error';
    onUndo?: () => void;
  } | null>(null);
  const toast = (input: { title: string; description?: string; tone?: 'default' | 'error'; onUndo?: () => void }) =>
    setNotice(input);
  const run = async (archive: boolean, reason?: string, note?: string) => {
    if (!account || busy) return false;
    const userId = account.sync.local.userId;
    if (!canArchive({ owner_id: customer.owner_id ?? undefined }, userId)) return false;
    if (archive && (!reason || !(reason in LEAD_DROP_REASONS) || (reason === 'khac' && !note?.trim()))) return false;
    setBusy(true);
    const at = new Date().toISOString();
    const interaction: Interaction = archive
      ? {
          at,
          kind: 'archived',
          channel: 'other',
          reason,
          ...(note?.trim() ? { note: note.trim() } : {}),
          by: userId,
          origin: 'v2',
        }
      : { at, kind: 'restored', channel: 'other', by: userId, origin: 'v2' };
    try {
      await account.customers.update(customer.id, {
        archived_at: archive ? at : null,
        ...appendInteractionPatch(customer, interaction),
      });
      const sync = account.sync.isOnline() ? 'Đang đồng bộ.' : 'Ngoại tuyến · chờ đồng bộ.';
      toast(
        archive
          ? {
              title: 'Đã lưu trữ khách',
              description: `Khách đã ẩn khỏi danh sách. ${sync}`,
              onUndo: () => {
                const restoredAt = new Date().toISOString();
                const restored: Interaction = {
                  at: restoredAt,
                  kind: 'restored',
                  channel: 'other',
                  by: userId,
                  origin: 'v2',
                };
                void account.customers.update(customer.id, {
                  archived_at: null,
                  ...appendInteractionPatch(
                    { interactions: [interaction, ...(customer.interactions ?? [])] },
                    restored,
                  ),
                });
              },
            }
          : { title: 'Đã khôi phục khách', description: `Khách hiện lại trong danh sách. ${sync}` },
      );
      return true;
    } catch (error) {
      toast({
        title: archive ? 'Chưa lưu trữ được' : 'Chưa khôi phục được',
        description: error instanceof Error ? error.message : 'Thử lại.',
        tone: 'error',
      });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { account, busy, run, notice, dismissNotice: () => setNotice(null) };
}

/** Cuối hồ sơ, xa thanh thao tác thường; mở sheet xác nhận trước khi lưu trữ. */
export function ArchiveCustomerSection({ customer }: { customer: Customer }) {
  const navigate = useNavigate();
  const { account, busy, run, notice, dismissNotice } = useArchiveActions(customer);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const ready = !!reason && (reason !== 'khac' || !!note.trim());
  if (customer.archived_at || !canArchive(customer, account?.sync.local.userId)) return null;
  return (
    <section
      className="space-y-2 rounded-md border border-line bg-surface-100 p-4"
      aria-labelledby="archive-customer-title"
    >
      <h2 id="archive-customer-title" className="text-title">
        Lưu trữ khách
      </h2>
      <p className="text-caption text-ink-muted">
        Dùng cho khách nhập nhầm, khách thử hoặc không còn chăm sóc. Dữ liệu được giữ nguyên và khôi phục được.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setOpen(true)}>Lưu trữ khách…</Button>
        <Button variant="ghost" onClick={() => navigate(ARCHIVED_PATH)}>
          Xem khách đã lưu trữ
        </Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent aria-describedby="archive-description">
          <SheetHeader>
            <SheetTitle>{`Lưu trữ khách ${customer.full_name}?`}</SheetTitle>
            <SheetDescription id="archive-description">Khách sẽ ẩn khỏi danh sách, không xoá dữ liệu.</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <div className="space-y-3">
              <label className="block space-y-1 text-label text-ink-muted">
                <span>Lý do lưu trữ</span>
                <select
                  aria-label="Lý do lưu trữ"
                  value={reason}
                  disabled={busy}
                  onChange={(event) => setReason(event.target.value)}
                  className="min-h-11 w-full rounded-md border border-line bg-surface-100 px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion"
                >
                  <option value="">Chọn lý do</option>
                  {Object.entries(LEAD_DROP_REASONS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-label text-ink-muted">
                <span>Ghi chú {reason === 'khac' ? '(bắt buộc)' : '(tuỳ chọn)'}</span>
                <textarea
                  aria-label="Ghi chú lý do lưu trữ"
                  value={note}
                  disabled={busy}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  className="min-h-20 w-full rounded-md border border-line bg-surface-100 px-3 py-2 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion"
                />
              </label>
              <ul className="list-disc space-y-2 pl-5 text-body">
                <li>Khách ẩn khỏi Danh sách khách, Hôm nay, Công việc và Thông báo; không còn nhắc gọi.</li>
                <li>Ghi chú, cuộc gọi, lịch sử và tài liệu được giữ nguyên.</li>
                <li>Khôi phục bất cứ lúc nào ở “Khách đã lưu trữ” (Tiện ích hoặc Bảng lệnh).</li>
              </ul>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button className="flex-1" onClick={() => setOpen(false)} autoFocus>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={!ready || busy}
              onClick={async () => {
                if (await run(true, reason, note)) setOpen(false);
              }}
            >
              Lưu trữ khách
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className="mt-3 flex items-center gap-3 rounded-md border border-line bg-surface-200 p-3 text-ink"
        >
          <span className="min-w-0 flex-1">
            <strong className="block text-body-strong">{notice.title}</strong>
            {notice.description && <span className="text-caption text-ink-muted">{notice.description}</span>}
          </span>
          {notice.onUndo && (
            <Button variant="ghost" onClick={notice.onUndo}>
              Hoàn tác
            </Button>
          )}
          <Button variant="ghost" aria-label="Đóng thông báo" onClick={dismissNotice}>
            Đóng
          </Button>
        </div>
      )}
    </section>
  );
}

/** Đầu hồ sơ khi khách đã lưu trữ: giải thích vì sao chỉ xem + nút Khôi phục cho người phụ trách. */
export function ArchivedBanner({ customer }: { customer: Customer }) {
  const navigate = useNavigate();
  const { account, busy, run, notice, dismissNotice } = useArchiveActions(customer);
  if (!customer.archived_at) return null;
  const owner = canArchive(customer, account?.sync.local.userId);
  const date = archivedDate(customer.archived_at);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-200 p-3"
    >
      <div className="min-w-0">
        <p className="text-body-strong">Khách đã lưu trữ{date ? ` ngày ${date}` : ''}</p>
        <p className="text-caption text-ink-muted">
          Đang ẩn khỏi danh sách và nhắc việc; hồ sơ chỉ xem.
          {owner ? '' : ' Chỉ người phụ trách khôi phục được.'}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => navigate(ARCHIVED_PATH)}>
          Đã lưu trữ
        </Button>
        {owner && (
          <Button variant="primary" disabled={busy} onClick={() => void run(false)}>
            Khôi phục
          </Button>
        )}
      </div>
      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className="mt-3 flex items-center gap-3 rounded-md border border-line bg-surface-200 p-3 text-ink"
        >
          <span className="min-w-0 flex-1">
            <strong className="block text-body-strong">{notice.title}</strong>
            {notice.description && <span className="text-caption text-ink-muted">{notice.description}</span>}
          </span>
          {notice.onUndo && (
            <Button variant="ghost" onClick={notice.onUndo}>
              Hoàn tác
            </Button>
          )}
          <Button variant="ghost" aria-label="Đóng thông báo" onClick={dismissNotice}>
            Đóng
          </Button>
        </div>
      )}
    </div>
  );
}
