# CLAUDE.md — Bối cảnh dự án cho AI coding assistant

> File này dành cho các công cụ AI hỗ trợ code (Claude Code, Cursor, v.v.) đọc để
> hiểu nhanh dự án trước khi chỉnh sửa. Người dùng chính (chủ dự án) không có
> background lập trình — luôn ưu tiên giải pháp đơn giản, ít bước thủ công,
> giải thích rõ trước khi đổi kiến trúc.

## 1. Dự án là gì

CRM quản lý khách hàng cho 1 sale bất động sản (dự án nhà ở xã hội tại Hải
Phòng/Hưng Yên). Mục tiêu: thay thế việc ghi chú khách hàng rời rạc (giấy,
Excel, note điện thoại) bằng 1 app web dùng chung được trên cả Android và
Macbook, đồng bộ dữ liệu qua lại, dùng được cả khi mất mạng.

**Không phải yêu cầu:** không cần app native, không cần multi-tenant SaaS,
không cần thanh toán — đây là công cụ nội bộ cho 1 người (mở rộng dần cho vài
đồng nghiệp).

## 2. Kiến trúc & lý do chọn

| Thành phần | Lựa chọn | Vì sao |
|---|---|---|
| Backend/DB | Supabase (Postgres + Auth) | Cần filter/search mạnh hơn Google Sheets khi data lớn, có RLS multi-user sẵn |
| Frontend | HTML/CSS/JS thuần, không build step | Chủ dự án không có background code, cần deploy = kéo thả file, sửa file trực tiếp dễ hiểu |
| Hosting | Cloudflare Pages, auto-deploy từ GitHub | Chủ dự án đã quen quy trình này từ project trước (Marquee Homes) |
| Offline | IndexedDB (cache local) + hàng đợi đồng bộ trong `js/db.js` | Sale đi xem dự án/công trường hay mất mạng, vẫn cần nhập được khách |
| PWA | `manifest.json` + `sw.js` | Cài lên màn hình Android như app thật |

**Nguyên tắc dữ liệu:** mọi thao tác đọc luôn đọc từ IndexedDB local trước
(nhanh, chạy offline được). Mọi thao tác ghi vào local ngay + đẩy vào hàng đợi
`queue` trong IndexedDB, tự đồng bộ lên Supabase khi có mạng. Xung đột xử lý
kiểu **last-write-wins** theo `updated_at` — chấp nhận được vì đây là CRM cho
rất ít người dùng, xác suất 2 thiết bị sửa cùng 1 khách cùng lúc gần như bằng 0.

## 3. Cấu trúc file

```
index.html          giao diện chính (auth screen + app screen + form modal)
css/style.css        toàn bộ style (tông màu be/xanh rêu/cam đất, kiểu "báo cáo BĐS trang trọng")
js/config.js          SUPABASE_URL + SUPABASE_ANON_KEY (điền tay, không phải secret nguy hiểm)
js/lunar.js            convert dương lịch → âm lịch + tra Lục Thập Hoa Giáp để tính "Mệnh"
js/db.js                lớp lưu local (IndexedDB) + hàng đợi đồng bộ (biến toàn cục `window.CRM`)
js/app.js               logic UI: đăng nhập, CRUD khách, filter/sort/search, render dashboard
schema.sql              schema Supabase gốc (đã vá đầy đủ — xem mục 5)
fix_rls_recursion.sql   migration đã áp dụng — giữ lại để tham khảo, KHÔNG cần chạy lại
fix_table_grants.sql    migration đã áp dụng — giữ lại để tham khảo, KHÔNG cần chạy lại
manifest.json + sw.js   cấu hình PWA + cache app-shell (chiến lược network-first, xem mục 5)
README.md               hướng dẫn setup ban đầu cho người không biết code
CHANGELOG.md            nhật ký thay đổi/lỗi đã sửa — ĐỌC TRƯỚC khi sửa cùng khu vực code
FEATURE_IDEAS.md        danh sách tính năng đề xuất, chưa làm
```

## 4. Data model (bảng `customers` trong Supabase)

Xem chi tiết đầy đủ trong `schema.sql`. Tóm tắt các field đặc biệt:

- `phone` — "master key" hiển thị cho người dùng, nhưng **không phải primary
  key thật** (primary key là `id` uuid). Unique theo cặp `(phone, owner_id)`,
  không unique toàn cục — vì multi-user sau này, 2 sale có thể tự lưu cùng 1
  số nếu đó là 2 khách độc lập của họ.
- `menh` — tính sẵn ở **client** (trong `js/lunar.js`) từ `dob`, rồi mới lưu
  xuống DB dạng text để search/filter nhanh. Không tính lại ở server.
- `owner_id` — user sở hữu khách này (`default auth.uid()`). Dùng cho RLS.
- Mọi field trừ `phone`, `full_name`, `owner_id` đều **nullable** — đúng yêu
  cầu gốc "thông tin thu thập dần, trống mặc định".

Bảng `profiles` lưu `role` (`admin` | `sale`) của mỗi user, tự tạo qua trigger
khi có user mới đăng ký (mặc định `sale`). Nâng admin bằng tay qua SQL Editor
(xem cuối `schema.sql`).

## 5. Các bẫy đã gặp — ĐỌC KỸ trước khi sửa

Đây là các lỗi thật đã xảy ra lúc build, đã sửa xong nhưng **rất dễ lặp lại**
nếu sửa code mà không biết:

1. **Không được đặt tên biến JS global trùng `supabase`.** Thư viện
   `@supabase/supabase-js` (load qua CDN, không phải module) tự tạo biến
   global `supabase`. Trong `app.js`, biến client cục bộ phải đặt tên khác
   (hiện đang là `sb`), nếu không sẽ bị `SyntaxError: Identifier 'supabase'
   has already been declared` và **toàn bộ app.js không chạy được câu nào**
   (kể cả gắn event listener) — lỗi này rất khó đoán vì không có gì hiện ra,
   nút bấm "im lặng" hoàn toàn.

2. **RLS policy không được tự tham chiếu bảng của chính nó.** Nếu viết policy
   kiểu `using (id = auth.uid() OR exists (select 1 from profiles where
   role='admin'))` ngay trên bảng `profiles`, Postgres báo `infinite
   recursion detected in policy`. Cách đúng: tách phần kiểm tra role ra hàm
   `security definer` riêng (xem `public.is_admin()` trong `schema.sql`).

3. **RLS không thay thế GRANT ở tầng bảng.** Bật `enable row level security`
   xong mà quên `grant select/insert/update/delete ... to authenticated` thì
   vẫn bị `permission denied for table`. Cả 2 lớp (GRANT + RLS policy) đều
   cần có.

4. **Service worker cache CSS/JS cũ đè lên bản deploy mới.** Ban đầu
   `sw.js` dùng chiến lược "trả cache trước, revalidate sau" (cache-first) —
   khiến sau khi deploy code mới lên Cloudflare, trình duyệt vẫn âm thầm dùng
   bản JS/CSS cũ trong Service Worker cache, F5 không ăn thua, phải
   Unregister service worker thủ công mới hết. Đã đổi sang **network-first**
   trong `sw.js` (luôn thử tải mạng trước, chỉ rơi về cache khi mất mạng).
   Mỗi lần sửa APP_SHELL trong `sw.js`, **phải tăng số version của
   `CACHE_NAME`** (vd `v2` → `v3`) để buộc trình duyệt bỏ cache cũ.

5. **CSS không được set `display` cứng cho phần tử điều khiển bằng thuộc
   tính `hidden`.** Đã thêm rule `[hidden] { display: none !important; }`
   ở đầu `style.css` để đảm bảo mọi phần tử dùng `el.hidden = true/false`
   trong JS luôn ẩn/hiện đúng, bất kể rule `display` nào khác ở dưới.

6. **Cẩn thận font cho tiếng Việt — tránh "Iowan Old Style".** Font tiêu đề
   `h1, h2` từng để `"Iowan Old Style"` (có sẵn trên macOS) khiến các nguyên
   âm "râu" (ư/ơ + dấu: ường, ưởng, ữ, ự...) hiển thị vỡ dấu — chỉ lộ ở tên
   khách trong `<h1>/<h2>`, còn thân bài dùng font sans hệ thống nên không
   thấy. Khi chọn/đổi font BẤT KỲ, phải thử với tên có ư/ơ + dấu. Hiện dùng
   `"Georgia", "Times New Roman", serif` (Georgia + serif hệ thống đều render
   tiếng Việt chuẩn).

## 6. Trạng thái hiện tại

- Đã deploy thành công tại `https://crm-cop.pages.dev`, kết nối GitHub →
  Cloudflare Pages tự động deploy khi push lên nhánh `main`.
- Đăng nhập/đăng ký, tạo khách, filter/sort, offline sync đều đã chạy được
  và được xác nhận thủ công qua nhiều vòng test.
- Đang có 1 tài khoản (role mặc định `sale`), chưa có khách hàng thật nào
  được nhập.
- Icon PWA (`icons/icon-192.png`, `icons/icon-512.png`) là icon tạm (chữ
  "KH" trên nền màu), chưa phải logo thật.
- Chưa test kỹ deep-link SĐT → Zalo trên môi trường thật (mới chỉ code theo
  tài liệu, chưa xác nhận trên máy chủ dự án).

## 7. Quy ước khi sửa code tiếp

- Giữ nguyên triết lý "không build step" — mọi file JS/CSS/HTML phải chạy
  thẳng được khi mở qua `<script src>` / `<link>` thường, không cần bundler.
- Mọi thay đổi schema Supabase → viết thành 1 file migration SQL riêng (như
  `fix_rls_recursion.sql`), **không sửa trực tiếp `schema.sql` mà không ghi
  chú lại trong `CHANGELOG.md`**, vì `schema.sql` đại diện cho trạng thái
  "chạy từ đầu trên project Supabase mới", còn project hiện tại đã áp dụng
  các migration lẻ.
- Ghi lại mọi thay đổi đáng kể vào `CHANGELOG.md` theo đúng định dạng đang
  dùng (ngày — mô tả — file bị ảnh hưởng).
- Trước khi thêm tính năng mới, xem qua `FEATURE_IDEAS.md` — có thể tính
  năng đó đã được note sẵn kèm gợi ý cách làm.
