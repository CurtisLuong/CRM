-- Bucket PUBLIC "app-releases" chứa file APK của app Android Sổ Khách (D-002, nút cập nhật app).
--
-- Cách dùng: mỗi lần phát bản mới, tải file android-app/dist/SoKhach-<phiên bản>.apk lên bucket này
-- (Supabase → Storage → app-releases → Upload). Link tải công khai có dạng:
--   https://nrqccwamwctihivpxjww.supabase.co/storage/v1/object/public/app-releases/SoKhach-1.1.apk
-- Banner "Có bản app mới" trong CRM đọc phiên bản mới nhất từ file /android-app-version.json (repo web).
--
-- BẢO MẬT:
--   • Ai có link đều TẢI được APK — APK không chứa dữ liệu khách hay mật khẩu (muốn dùng vẫn phải đăng nhập).
--   • KHÔNG tạo policy ghi cho anon/authenticated → chỉ tải lên được qua trang Supabase (quyền quản trị).
--   • Chỉ nhận file APK (trình duyệt có thể gửi dạng octet-stream khi tải lên), tối đa 50 MB.
--
-- Cách chạy: Supabase → SQL Editor → dán cả file → Run. An toàn chạy lại nhiều lần.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-releases', 'app-releases', true, 52428800, array['application/vnd.android.package-archive', 'application/octet-stream'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
