import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LEAD_DROP_REASONS } from '@/config/reasons';
import { useRepositoryAccount } from '@/data/hooks';
import type { Customer, Interaction } from '@/domain/customer';
import { appendInteractionPatch } from '@/domain/customer/interactions';
import { Button, Sheet, useToast } from '@/ui';

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
  const toast = useToast();
  const [busy, setBusy] = useState(false);
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
  return { account, busy, run };
}

/** Cuối hồ sơ, xa thanh thao tác thường; mở sheet xác nhận trước khi lưu trữ. */
export function ArchiveCustomerSection({ customer }: { customer: Customer }) {
  const navigate = useNavigate();
  const { account, busy, run } = useArchiveActions(customer);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const ready = !!reason && (reason !== 'khac' || !!note.trim());
  if (customer.archived_at || !canArchive(customer, account?.sync.local.userId)) return null;
  return (
    <section className="space-y-2 rounded-card border border-border p-4" aria-labelledby="archive-customer-title">
      <h2 id="archive-customer-title" className="text-section">
        Lưu trữ khách
      </h2>
      <p className="text-small text-text-2">
        Dùng cho khách nhập nhầm, khách thử hoặc không còn chăm sóc. Dữ liệu được giữ nguyên và khôi phục được.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setOpen(true)}>Lưu trữ khách…</Button>
        <Button variant="ghost" onClick={() => navigate(ARCHIVED_PATH)}>
          Xem khách đã lưu trữ
        </Button>
      </div>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`Lưu trữ khách ${customer.full_name}?`}
        description="Khách sẽ ẩn khỏi danh sách, không xoá dữ liệu."
        footer={
          <>
            <Button className="flex-1" onClick={() => setOpen(false)} autoFocus>
              Huỷ
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={busy}
              disabled={!ready || busy}
              onClick={async () => {
                if (await run(true, reason, note)) setOpen(false);
              }}
            >
              Lưu trữ khách
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block space-y-1 text-small text-text-2">
            <span>Lý do lưu trữ</span>
            <select
              aria-label="Lý do lưu trữ"
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text focus-visible:outline-2 focus-visible:outline-focus"
            >
              <option value="">Chọn lý do</option>
              {Object.entries(LEAD_DROP_REASONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-small text-text-2">
            <span>Ghi chú {reason === 'khac' ? '(bắt buộc)' : '(tuỳ chọn)'}</span>
            <textarea
              aria-label="Ghi chú lý do lưu trữ"
              value={note}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="min-h-20 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-text focus-visible:outline-2 focus-visible:outline-focus"
            />
          </label>
          <ul className="list-disc space-y-2 pl-5 text-body">
            <li>Khách ẩn khỏi Danh sách khách, Hôm nay, Công việc và Thông báo; không còn nhắc gọi.</li>
            <li>Ghi chú, cuộc gọi, lịch sử và tài liệu được giữ nguyên.</li>
            <li>Khôi phục bất cứ lúc nào ở “Khách đã lưu trữ” (Tiện ích hoặc Bảng lệnh).</li>
          </ul>
        </div>
      </Sheet>
    </section>
  );
}

/** Đầu hồ sơ khi khách đã lưu trữ: giải thích vì sao chỉ xem + nút Khôi phục cho người phụ trách. */
export function ArchivedBanner({ customer }: { customer: Customer }) {
  const navigate = useNavigate();
  const { account, busy, run } = useArchiveActions(customer);
  if (!customer.archived_at) return null;
  const owner = canArchive(customer, account?.sync.local.userId);
  const date = archivedDate(customer.archived_at);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border-strong bg-surface-2 p-3"
    >
      <div className="min-w-0">
        <p className="text-body-strong">Khách đã lưu trữ{date ? ` ngày ${date}` : ''}</p>
        <p className="text-small text-text-2">
          Đang ẩn khỏi danh sách và nhắc việc; hồ sơ chỉ xem.
          {owner ? '' : ' Chỉ người phụ trách khôi phục được.'}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => navigate(ARCHIVED_PATH)}>
          Đã lưu trữ
        </Button>
        {owner && (
          <Button variant="primary" loading={busy} onClick={() => void run(false)}>
            Khôi phục
          </Button>
        )}
      </div>
    </div>
  );
}
