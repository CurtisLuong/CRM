import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';
import { type CustomerSearch, setCustomerSearch } from '@/app/layout.slots';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { searchable } from '@/features/customers/model';
import { customerPaletteItems, searchCustomers } from './model';

const noRows: Customer[] = [];
const noop = () => () => {};

/**
 * Khách để tìm: danh sách đang dùng (useCustomers) + khách đã lưu trữ đọc thẳng snapshot repository.
 * useCustomers() bỏ `archived_at`, nhưng luật 5 vẫn cần nhóm "Đã lưu trữ / Đã loại" cuối cùng.
 */
export function useSearchCustomers(): Customer[] {
  const active = useCustomers();
  const account = useRepositoryAccount();
  const rows = useSyncExternalStore(
    account?.customers.subscribe ?? noop,
    account ? account.customers.getSnapshot : () => noRows,
    () => noRows,
  );
  return useMemo(() => {
    const archived = rows.filter((customer) => !!customer.archived_at);
    return archived.length ? [...active, ...archived] : active;
  }, [active, rows]);
}

/**
 * Nối tìm khách vào "cổng cắm" của khung app (layout.slots) — Bảng lệnh đọc qua useCustomerSearch.
 * Tài liệu tìm tính một lần cho mỗi danh sách khách, không tính lại mỗi phím (luật 9).
 */
export function CustomerSearchBridge() {
  const navigate = useNavigate();
  const customers = useSearchCustomers();
  const docs = useMemo(() => new Map(customers.map((customer) => [customer.id, searchable(customer)])), [customers]);
  const search = useCallback<CustomerSearch>(
    (query) =>
      customerPaletteItems(searchCustomers(customers, docs, query), (customer) => navigate(`/ho-so/${customer.id}`)),
    [customers, docs, navigate],
  );

  useEffect(() => {
    setCustomerSearch(search);
    return () => setCustomerSearch(undefined);
  }, [search]);

  return null;
}
