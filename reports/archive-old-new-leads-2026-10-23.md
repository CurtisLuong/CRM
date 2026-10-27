# Lưu trữ Khách mới đăng ký đến hết 19/10/2026

- Môi trường: **production** `nrqccwamwctihivpxjww`.
- Phạm vi: `qualified_at IS NULL`, `archived_at IS NULL`, `COALESCE(registered_at, created_at) < 2026-10-20 00:00:00+07`. Bao gồm khách đã đánh dấu Đã loại; SQL chỉ đặt `archived_at` (trigger cập nhật `updated_at`/`updated_by`), giữ các trường hồ sơ và lịch sử khác.
- SQL: `SQL/ops/2026-10-23_archive_old_new_leads.sql`. Giao dịch hủy nếu số dòng không còn đúng 159.
- Preview: 159 khách cần lưu trữ; 66 người trong số này đã ở trạng thái Đã loại. Không có khách bậc Đang chăm sóc trong tập chọn.
- Backup trước khi chạy: `/Users/curtis/CRM-backups/20261023-102318`, `--no-files`, checksum SHA256 đạt; có `customers.json` của 200 khách và dump database. File Storage không nằm trong backup lần này.
- Thực thi production: `SELECT 159`, `UPDATE 159`, `COMMIT`.
- Kiểm sau chạy: 160 khách khớp điều kiện ngày/nhóm có `archived_at` (159 vừa lưu trữ + 1 đã lưu trữ từ trước); **0 khách khớp điều kiện còn ở Khách mới**; 159 bản ghi audit `customer_changes` cho `archived_at` trong 15 phút sau chạy.
- Staging: chưa chạy vì `STAGING_DB_URL` trong `.env.backup` không có project ref; đã kiểm cú pháp phần chọn bằng transaction rollback trên production trước cập nhật.
