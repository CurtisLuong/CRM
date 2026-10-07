/* Complete, ordered reads under RLS. Never treat the API row cap as the total. */
(function (root) {
  'use strict';
  async function all(client, table, columns = '*', isCurrent = () => true) {
    const rows = []; let total = null, cursor = null;
    while (true) {
      if (!isCurrent()) throw new Error('Phiên dữ liệu đã thay đổi; vui lòng tải lại.');
      let query = client.from(table).select(columns, { count: 'exact' }).order('id', { ascending: true }).limit(500);
      if (cursor) query = query.gt('id', cursor);
      const { data, error, count } = await query;
      if (error) throw error;
      if (!Array.isArray(data) || !Number.isInteger(count)) throw new Error('Không xác nhận được dữ liệu đầy đủ.');
      if (total === null) total = count;
      // The count is for records after the cursor. A changing set must be retried,
      // rather than replacing the offline cache with a partial result.
      if (count !== total - rows.length) throw new Error('Dữ liệu thay đổi trong lúc tải; vui lòng tải lại.');
      if (!data.length) {
        if (rows.length !== total) throw new Error('Dữ liệu tải về chưa đầy đủ.');
        break;
      }
      for (const row of data) {
        if (!row.id || (cursor && row.id <= cursor)) throw new Error('Thứ tự dữ liệu tải về không hợp lệ.');
        cursor = row.id; rows.push(row);
      }
      if (rows.length > total) throw new Error('Số lượng dữ liệu tải về không hợp lệ.');
      if (rows.length === total) break;
    }
    if (!isCurrent()) throw new Error('Phiên dữ liệu đã thay đổi; vui lòng tải lại.');
    return rows;
  }
  root.CRMFetch = { all };
  if (typeof module !== 'undefined') module.exports = root.CRMFetch;
})(typeof window !== 'undefined' ? window : globalThis);
