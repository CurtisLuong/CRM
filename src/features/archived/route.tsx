import { useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { ARCHIVED_PATH, archivedDate, canArchive, useArchiveActions } from '@/features/profile/archive';
import { Avatar, Button, EmptyState } from '@/ui';
import { archivedCustomers } from './model';

const FIELD =
  'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text focus-visible:outline-2 focus-visible:outline-focus';
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
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 lg:p-6" data-testid="archived-customers">
      <div className="flex items-center justify-between gap-2">
        <Button onClick={() => navigate('/khach-hang')}>← Danh sách khách</Button>
      </div>
      <header className="space-y-1">
        <h1 className="text-title">Khách đã lưu trữ</h1>
        <p className="text-small text-text-2">
          Khách ở đây đã ẩn khỏi danh sách và nhắc việc; dữ liệu còn nguyên. Người phụ trách bấm “Khôi phục” để đưa
          khách trở lại.
        </p>
      </header>
      {total > 0 && (
        <input
          aria-label="Tìm khách đã lưu trữ"
          placeholder="Tìm theo tên hoặc SĐT"
          className={FIELD}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {list.length ? (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
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
          icon="history"
          title={total ? 'Không có khách khớp' : 'Chưa có khách nào được lưu trữ'}
          hint={total ? 'Thử tên hoặc số điện thoại khác.' : 'Lưu trữ khách ở cuối hồ sơ khách.'}
        />
      )}
    </main>
  );
}

function ArchivedRow({ customer, owner, onOpen }: { customer: Customer; owner: boolean; onOpen: () => void }) {
  const { busy, run } = useArchiveActions(customer);
  const date = archivedDate(customer.archived_at);
  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <Avatar name={customer.full_name} size={40} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="truncate text-body-strong">{customer.full_name}</p>
        <p className="text-small text-text-2">
          <span className="font-data">{customer.phone}</span>
          {date ? ` · lưu trữ ${date}` : ''}
          {owner ? '' : ' · người phụ trách khác'}
        </p>
      </button>
      {owner && (
        <Button loading={busy} onClick={() => void run(false)} aria-label={`Khôi phục ${customer.full_name}`}>
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
