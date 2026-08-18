# CHANGELOG

Ghi lại các thay đổi đáng kể theo thời gian. Mới nhất ở trên cùng.

Định dạng mỗi mục: `Ngày — Mô tả — File bị ảnh hưởng`

---

## 2026-08-18 — Sửa cache Service Worker phục vụ nhầm bản CSS cũ

Sau khi deploy `style.css` đã sửa (mục ngay dưới) lên Cloudflare, giao diện
vẫn kẹt ở màn đăng nhập dù đăng nhập Supabase thành công (đã xác nhận qua
Console: `sb.auth.getSession()` trả về session hợp lệ). Nguyên nhân: `sw.js`
dùng chiến lược cache-first (`cached || network`), nên trình duyệt tiếp tục
phục vụ `style.css` bản cũ đã cache trước đó, đè lên bản mới đã deploy.

**Sửa:**
- Đổi chiến lược fetch trong `sw.js` từ cache-first sang **network-first**
  (luôn thử tải mạng trước, chỉ fallback cache khi mất mạng).
- Tăng `CACHE_NAME` từ `crm-khach-hang-v1` → `crm-khach-hang-v2` để buộc
  trình duyệt bỏ cache cũ ngay lập tức.
- Người dùng phải Unregister service worker cũ + Clear site data 1 lần thủ
  công để hết bị kẹt ngay (các user mới sau này không cần bước này).

File: `sw.js`

---

## 2026-08-18 — Sửa CSS chặn ẩn/hiện màn hình bằng thuộc tính `hidden`

Sau khi đăng nhập thành công (xác nhận qua Console, session hợp lệ, gọi
`onLoggedIn()` không lỗi), giao diện vẫn hiện màn đăng nhập, không chuyển
sang dashboard. Nguyên nhân: `#auth-screen { display: flex; ... }` trong
`style.css` set `display` cứng, ghi đè lên hành vi ẩn mặc định của trình
duyệt khi JS set `el.hidden = true`.

**Sửa:** thêm rule `[hidden] { display: none !important; }` ở đầu
`style.css`, đặt trước mọi rule khác để đảm bảo luôn thắng.

File: `css/style.css`

---

## 2026-08-18 — Sửa thiếu quyền GRANT ở tầng bảng Postgres

Sau khi sửa đệ quy RLS (mục dưới), qua được bước đăng nhập/đăng ký nhưng
`CRM.pull()` báo lỗi `permission denied for table customers` (code `42501`).
Nguyên nhân: bật `enable row level security` nhưng chưa `grant` quyền
select/insert/update/delete cho role `authenticated` ở tầng bảng — RLS chỉ
lọc *dòng nào* được xem, không thay thế được quyền truy cập *bảng*.

**Sửa:** thêm các câu lệnh `grant ... to authenticated` cho `customers` và
`profiles`. Đã áp dụng trực tiếp trên project Supabase qua
`fix_table_grants.sql`, đồng thời bake vào `schema.sql` gốc để các lần cài
đặt mới sau này không dính lại lỗi này.

File: `schema.sql`, `fix_table_grants.sql` (migration đã chạy)

---

## 2026-08-18 — Sửa đệ quy vô hạn trong RLS policy của bảng `profiles`

Sau khi tạo tài khoản thành công, `CRM.pull()` báo lỗi Postgres
`infinite recursion detected in policy for relation "profiles"` (code
`42P17`). Nguyên nhân: policy `profiles_select` kiểm tra "có phải admin
không" bằng cách query trực tiếp bảng `profiles` — nhưng chính query đó lại
kích hoạt lại policy đang được đánh giá, gây lặp vô hạn.

**Sửa:** tách phần kiểm tra role admin ra hàm riêng `public.is_admin()`
(`security definer`, `stable`), các policy gọi hàm này thay vì tự query lại
bảng. Đã áp dụng qua `fix_rls_recursion.sql`, đồng thời bake vào
`schema.sql` gốc.

File: `schema.sql`, `fix_rls_recursion.sql` (migration đã chạy)

---

## 2026-08-18 — Sửa xung đột biến global `supabase`

Sau khi deploy lần đầu (cả Cloudflare Workers lẫn Cloudflare Pages), nút
"Tạo tài khoản mới" / "Đăng nhập" hoàn toàn không phản hồi, không có lỗi
hiện ra trên UI. Console báo `Uncaught SyntaxError: Identifier 'supabase'
has already been declared (at app.js:1:1)`. Nguyên nhân: thư viện
`@supabase/supabase-js` (UMD build từ CDN) tự khai báo biến global
`supabase`; `app.js` cũng khai báo `let supabase = null;` ở top-level — 2
khai báo `let`/`var` trùng tên trong cùng global lexical scope của classic
script khiến toàn bộ `app.js` bị lỗi cú pháp, không chạy được dòng nào.

**Sửa:** đổi tên biến client cục bộ từ `supabase` → `sb` trong toàn bộ
`app.js`.

File: `js/app.js`

---

## 2026-08-18 — Build lần đầu

Dựng toàn bộ CRM: schema Supabase (`profiles`, `customers`, RLS, trigger
auto-profile), frontend PWA thuần HTML/CSS/JS (đăng nhập, CRUD khách,
filter/sort/search theo SĐT/tên/tiến độ chăm sóc/đánh giá/mức độ quan tâm),
offline-first qua IndexedDB + hàng đợi đồng bộ, tính "Mệnh" tự động từ ngày
sinh dương lịch (convert âm lịch chuẩn VN + tra Lục Thập Hoa Giáp — đã test
đối chiếu với vài mốc năm thực tế), deep-link SĐT → Zalo, PWA manifest +
service worker để cài lên Android/Mac.

Deploy thử nghiệm ban đầu qua Cloudflare Workers domain (`*.workers.dev`),
sau đó chuyển sang Cloudflare Pages (`crm-cop.pages.dev`) theo đúng kiến
trúc dự định ban đầu.

File: toàn bộ dự án
