// scripts/verify/idb-counts.js — đếm dữ liệu khách mà app v2 đang giữ trong máy (IndexedDB), cùng định nghĩa
// với scripts/verify/counts.sql, để so "số v2 hiện" với "số trong DB" (T5.2).
// CHỈ ĐỌC. Chạy trong tab crm-v2-9hf.pages.dev đã đăng nhập: agent chạy qua trình duyệt trong app,
// hoặc dán vào Console (F12 → Console). Không in tên/SĐT khách.
(async () => {
  const arr = (v) => (Array.isArray(v) ? v : []);
  const dbs = (await indexedDB.databases()).filter((d) => d.name?.startsWith('crm_khach_hang__'));
  const read = (name, store) =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open(name);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains(store)) {
          db.close();
          resolve([]);
          return;
        }
        const req = db.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = () => {
          db.close();
          resolve(req.result);
        };
        req.onerror = () => {
          db.close();
          reject(req.error);
        };
      };
    });
  const out = [];
  for (const { name } of dbs) {
    const rows = await read(name, 'customers');
    const queue = await read(name, 'queue');
    const byOwner = {};
    for (const c of rows) {
      const o = (byOwner[String(c.owner_id).slice(0, 8)] ??= {
        khach: 0, khach_dang_dung: 0, khach_moi: 0, viec_mo: 0, cuoc_goi: 0, ghi_chu: 0,
      });
      o.khach++;
      if (!c.archived_at) o.khach_dang_dung++;
      if (!c.qualified_at && !c.disqualified_at && !c.archived_at) o.khach_moi++;
      o.viec_mo += arr(c.next_tasks).filter((t) => t && t.done_at == null).length;
      o.cuoc_goi += arr(c.call_attempts).length;
      o.ghi_chu += arr(c.notes_manual).length;
    }
    const sum = (k) => rows.reduce((n, c) => n + arr(c[k]).length, 0);
    out.push({
      db: name.replace(/__(.{8}).*/, '__$1…'),
      tong: {
        '01 khách (tổng)': rows.length,
        '02 khách đang dùng': rows.filter((c) => !c.archived_at).length,
        '03 khách đã lưu trữ': rows.filter((c) => c.archived_at).length,
        '04 khách mới (chưa phân loại)': rows.filter((c) => !c.qualified_at && !c.disqualified_at && !c.archived_at).length,
        '05 việc (tổng)': sum('next_tasks'),
        '06 việc đang mở': rows.reduce((n, c) => n + arr(c.next_tasks).filter((t) => t && t.done_at == null).length, 0),
        '07 cuộc gọi (tổng)': sum('call_attempts'),
        '08 cuộc gọi chưa ghi kết quả': rows.reduce((n, c) => n + arr(c.call_attempts).filter((t) => t && t.result == null).length, 0),
        '09 ghi chú hồ sơ': sum('notes_manual'),
        '10 khách có ghi chú đăng ký': rows.filter((c) => (c.notes ?? '') !== '').length,
        '11 mốc lịch sử bậc': sum('care_stage_history'),
        '12 tương tác ngoài cuộc gọi': sum('interactions'),
      },
      theo_nguoi_phu_trach: byOwner,
      hang_doi_chua_gui: queue.length,
    });
  }
  return out;
})();
