# CRM Khách hàng BĐS — hướng dẫn cài đặt

App web (PWA) — dùng được trên Android (cài lên màn hình như app thật) và
trên Macbook (mở bằng Chrome/Safari). Dữ liệu lưu ở Supabase, đồng bộ tự
động; vẫn nhập được khi mất mạng, tự đẩy lên khi có mạng lại.

## Bước 1 — Tạo project Supabase (5 phút, free)

1. Vào https://supabase.com → **New project**. Đặt tên tuỳ ý, chọn region gần VN (Singapore).
2. Vào **SQL Editor** → dán toàn bộ nội dung file `schema.sql` → **Run**.
   Bước này tạo bảng `customers`, `profiles`, và các luật bảo mật (RLS).
3. Vào **Project Settings → API**, copy 2 giá trị:
   - **Project URL**
   - **anon public key**
4. Mở file `js/config.js`, dán 2 giá trị đó vào `SUPABASE_URL` và `SUPABASE_ANON_KEY`.

## Bước 2 — Deploy lên Cloudflare Pages (giống Marquee Homes)

1. Đưa cả thư mục này lên 1 repo GitHub.
2. Cloudflare Dashboard → **Pages → Create project → Connect to Git** → chọn repo.
   - Build command: để trống (không cần build)
   - Output directory: `/` (thư mục gốc)
3. Deploy xong sẽ có link dạng `https://ten-app.pages.dev`.

## Bước 3 — Tạo tài khoản đăng nhập đầu tiên

1. Mở link app → bấm **Tạo tài khoản mới** → nhập email/mật khẩu của anh.
2. Nếu Supabase project đang bật "Confirm email", vào hộp thư xác nhận rồi đăng nhập lại.
   (Có thể tắt yêu cầu xác nhận email ở Supabase → Authentication → Providers → Email, để đăng nhập ngay không cần chờ mail, phù hợp vì đây là app nội bộ.)
3. Đăng nhập lần đầu này tự động là role `sale`. Muốn nâng lên `admin`
   (xem được khách của tất cả mọi người sau này), vào Supabase → SQL Editor, chạy:
   ```sql
   update public.profiles set role = 'admin' where id = '<user_uuid>';
   ```
   Lấy `user_uuid` ở Supabase → Authentication → Users.

## Bước 4 — Cài lên điện thoại / Mac

- **Android (Chrome)**: mở link app → menu (⋮) → **Add to Home screen**. App sẽ mở như app thật, không có thanh địa chỉ.
- **Mac (Chrome/Safari)**: mở link → biểu tượng "Install app" trên thanh địa chỉ (Chrome), hoặc dùng thẳng qua trình duyệt.

## Thêm người dùng thứ 2 sau này

Chỉ cần họ tự **Tạo tài khoản mới** bằng email riêng — không cần sửa code.
Mặc định họ chỉ thấy khách của chính họ; anh (admin) thấy hết tất cả.

## Những điều cần biết / giới hạn

- **Offline**: nhập/sửa khách khi mất mạng vẫn lưu được (trên máy đó), tự
  động đẩy lên khi có mạng lại. Nếu đóng hẳn app trước khi kịp đồng bộ,
  lần sau mở lại app sẽ tự đẩy tiếp — không mất dữ liệu.
- **Xung đột hiếm gặp**: nếu cùng 1 khách bị sửa ở 2 thiết bị **cùng lúc lúc
  cả 2 đều offline**, bản sửa sau (theo thời gian) sẽ thắng, bản sửa trước
  có thể bị ghi đè. Với 1 người dùng thì gần như không xảy ra.
- **Bấm SĐT mở Zalo**: trên điện thoại Android link sẽ cố mở đúng cuộc trò
  chuyện Zalo với số đó; trên Mac thì Zalo không có chuẩn deep-link giống
  nhau nên chỉ mở trang `zalo.me/<số>` — có thể cần bấm thêm 1 bước trong Zalo Web.
  Nên test thử với số của chính anh trước khi dùng thật.
- **"Mệnh"**: tự tính từ ngày sinh dương lịch (convert âm lịch + tra Lục
  Thập Hoa Giáp / Nạp Âm) — không cần nhập tay. Bảng tra đã đối chiếu với
  nhiều nguồn cùng ăn khớp, nhưng đây là kiến thức truyền thống, nếu khách
  thắc mắc thì nên double-check thêm bằng nguồn khác.
- **Icon app** (`icons/icon-192.png`, `icons/icon-512.png`) hiện là icon
  tạm — anh có thể thay bằng logo riêng, giữ nguyên tên file.

## Cấu trúc file

```
index.html          giao diện chính
css/style.css        toàn bộ style
js/config.js          điền Supabase URL + key vào đây
js/lunar.js            convert âm lịch + tính Mệnh
js/db.js                lớp lưu local (IndexedDB) + hàng đợi đồng bộ
js/app.js               logic UI: đăng nhập, CRUD, filter, dashboard
schema.sql             chạy 1 lần trong Supabase SQL Editor
manifest.json + sw.js   cấu hình PWA (cài lên điện thoại, cache offline)
```
