import { useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { EmptyState, LeadRow, PageHeader } from '@/components/crm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { ARCHIVED_PATH, archivedDate, archiveReason, canArchive, useArchiveActions } from '@/features/profile/archive';
import { archivedCustomers } from './model';

const FIELD =
  'min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion';
const noRows: Customer[] = [];
const noop = () => () => {};

function ArchivedPage() {
  const navigate = useNavigate();
  const account = useRepositoryAccount();
  // useCustomers() bỏ khách đã lưu trữ — màn này đọc thẳng snapshot repository (local-first).
  const rows = useSyncExternalStore(
    account?.customers.subscribe ?? noop,
    account ? account.customers.getSnapshot : () => noRows,
    () => noRows,
  );
  const [query, setQuery] = useState('');
  const list = archivedCustomers(rows, query);
  const total = archivedCustomers(rows).length;
  const userId = account?.sync.local.userId;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 p-4 lg:p-6" data-testid="archived-customers">
      <div className="flex items-center justify-between gap-2">
        <Button onClick={() => navigate('/khach-hang')}>← Danh sách khách</Button>
      </div>
      <PageHeader title="Khách đã lưu trữ" count={total} noun="khách" sticky={false} />
      <p className="text-caption text-ink-muted">
        Khách ở đây đã ẩn khỏi danh sách và nhắc việc; dữ liệu còn nguyên. Người phụ trách bấm “Khôi phục” để đưa khách
        trở lại.
      </p>
      {total > 0 && (
        <Input
          aria-label="Tìm khách đã lưu trữ"
          placeholder="Tìm theo tên hoặc SĐT"
          className={FIELD}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {list.length ? (
        <ul className="overflow-hidden rounded-md border border-line bg-surface-100">
          {list.map((customer) => (
            <ArchivedRow
              key={customer.id}
              customer={customer}
              owner={canArchive(customer, userId)}
              onOpen={() => navigate(`/ho-so/${customer.id}`)}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          title={total ? 'Không có khách khớp' : 'Chưa có khách nào được lưu trữ'}
          text={total ? 'Thử tên hoặc số điện thoại khác.' : 'Lưu trữ khách ở cuối hồ sơ khách.'}
        />
      )}
    </main>
  );
}

function ArchivedRow({ customer, owner, onOpen }: { customer: Customer; owner: boolean; onOpen: () => void }) {
  const { busy, run } = useArchiveActions(customer);
  const date = archivedDate(customer.archived_at);
  return (
    <li className="flex items-center gap-2 border-b border-line last:border-b-0">
      <div className="min-w-0 flex-1">
        <LeadRow
          name={customer.full_name}
          phone={customer.phone}
          onClick={onOpen}
          nextStep={[date ? `Lưu trữ ${date}` : '', archiveReason(customer), owner ? '' : 'Người phụ trách khác']
            .filter(Boolean)
            .join(' · ')}
        />
      </div>
      {owner && (
        <Button disabled={busy} onClick={() => void run(false)} aria-label={`Khôi phục ${customer.full_name}`}>
          Khôi phục
        </Button>
      )}
    </li>
  );
}

export const route: FeatureRoute = {
  path: ARCHIVED_PATH,
  element: <ArchivedPage />,
  handle: { title: 'Khách đã lưu trữ' },
};
