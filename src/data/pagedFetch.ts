import type { SupabaseClient } from '@supabase/supabase-js';

/** Ordered cursor reads with exact counts: never replace cache with a capped/partial response. */
export async function pagedFetch<T extends { id: string }>(
  client: SupabaseClient,
  table = 'customers',
  columns = '*',
  isCurrent = () => true,
): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;
  let cursor: string | null = null;
  while (true) {
    if (!isCurrent()) throw new Error('Phiên dữ liệu đã thay đổi; vui lòng tải lại.');
    let query = client.from(table).select(columns, { count: 'exact' }).order('id', { ascending: true }).limit(500);
    if (cursor) query = query.gt('id', cursor);
    const { data, error, count } = await query;
    if (error) throw error;
    if (!Array.isArray(data) || !Number.isInteger(count)) throw new Error('Không xác nhận được dữ liệu đầy đủ.');
    if (total === null) total = count;
    if (count !== (total ?? 0) - rows.length) throw new Error('Dữ liệu thay đổi trong lúc tải; vui lòng tải lại.');
    if (!data.length) {
      if (rows.length !== total) throw new Error('Dữ liệu tải về chưa đầy đủ.');
      break;
    }
    for (const raw of data) {
      const row = raw as unknown as T;
      if (!row.id || (cursor && row.id <= cursor)) throw new Error('Thứ tự dữ liệu tải về không hợp lệ.');
      cursor = row.id;
      rows.push(row);
    }
    if (rows.length > (total ?? 0)) throw new Error('Số lượng dữ liệu tải về không hợp lệ.');
    if (rows.length === total) break;
  }
  if (!isCurrent()) throw new Error('Phiên dữ liệu đã thay đổi; vui lòng tải lại.');
  return rows;
}
