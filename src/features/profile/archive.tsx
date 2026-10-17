import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { Button, Sheet, useToast } from '@/ui';

export const ARCHIVED_PATH = '/khach-hang/luu-tru';

/** D-003: chỉ người phụ trách được lưu trữ/khôi phục. */
export const canArchive = (customer: Pick<Customer, 'owner_id'>, userId: string | null | undefined) =>
  !!userId && customer.owner_id === userId;

export const archivedDate = (at: string | null | undefined) => {
  const date = at ? new Date(at) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('vi-VN') : '';
};

export function useArchiveActions(customer: Pick<Customer, 'id'>) {
  const account = useRepositoryAccount();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (archive: boolean) => {
    if (!account || busy) return false;
    setBusy(true);
    try {
      // Xoá mềm (D-012): chỉ đặt/bỏ archived_at qua hàng đợi; không xoá dữ liệu khách.
      if (archive) await account.customers.remove(customer.id);
      else await account.customers.restore(customer.id);
      const sync = account.sync.isOnline() ? 'Đang đồng bộ.' : 'Ngoại tuyến · chờ đồng bộ.';
      toast(
        archive
          ? {
              title: 'Đã lưu trữ khách',
              description: `Khách đã ẩn khỏi danh sách. ${sync}`,
              onUndo: () => void account.customers.restore(customer.id),
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
              onClick={async () => {
                if (await run(true)) setOpen(false);
              }}
            >
              Lưu trữ khách
            </Button>
          </>
        }
      >
        <ul className="list-disc space-y-2 pl-5 text-body">
          <li>Khách ẩn khỏi Danh sách khách, Hôm nay, Công việc và Thông báo; không còn nhắc gọi.</li>
          <li>Ghi chú, cuộc gọi, lịch sử và tài liệu được giữ nguyên.</li>
          <li>Khôi phục bất cứ lúc nào ở “Khách đã lưu trữ” (Tiện ích hoặc Bảng lệnh).</li>
        </ul>
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
