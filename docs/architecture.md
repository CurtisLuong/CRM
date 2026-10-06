# Kiến trúc và dữ liệu CRM

## Phạm vi sản phẩm

CRM quản lý khách cho một sale bất động sản, chủ yếu dự án nhà ở xã hội tại Hải Phòng/Hưng Yên. App thay thế giấy, Excel và note điện thoại; dùng chung trên Android và MacBook; hỗ trợ nhập thông tin khi mất mạng.

Có thể mở rộng cho vài đồng nghiệp. Không đặt mục tiêu app native, multi-tenant SaaS hoặc thanh toán.

## Thành phần và lý do lựa chọn

| Thành phần | Lựa chọn | Lý do theo đặc tả gốc |
|---|---|---|
| Backend/DB | Supabase Postgres + Auth | Filter/search khi dữ liệu lớn; hỗ trợ phân quyền RLS |
| Frontend | HTML/CSS/JS thuần, không build step | Dễ sửa file trực tiếp; ít bước vận hành cho chủ dự án |
| Hosting | Cloudflare Pages, auto-deploy từ GitHub | Chủ dự án quen quy trình từ Marquee Homes |
| Offline | IndexedDB và hàng đợi trong `js/db.js` | Sale có thể mất mạng khi đi dự án/công trường |
| PWA | `manifest.json` và `sw.js` | Cài lên màn hình Android |

Không build step là nguyên tắc của frontend; không có nghĩa mọi thay đổi đều được deploy bằng kéo thả. Theo file nguồn, đường triển khai đang được mô tả là GitHub → Cloudflare Pages; cần kiểm tra cấu hình khi thao tác.

## Luồng dữ liệu khách

```text
Đọc: UI → IndexedDB local → hiển thị
Ghi: UI → ghi IndexedDB + queue → Supabase khi có mạng
Xung đột: last-write-wins theo updated_at
```

Giữ cơ chế local-first hiện có. File nguồn chấp nhận last-write-wins cho nhóm rất ít người dùng; đây là đánh đổi đã chọn, không phải bảo đảm không mất một chỉnh sửa đồng thời. Nếu mở rộng cộng tác hoặc đổi cơ chế xung đột, áp dụng quy trình thay đổi nguyên tắc.

Luồng cụ thể, retry và việc kéo dữ liệu từ server phải được đối chiếu với `js/db.js`; tài liệu nguồn không mô tả đầy đủ các chi tiết đó.

Catalog có cache offline trong `js/catalog.js`. Không mặc định áp dụng mọi chi tiết của hàng đợi khách cho catalog nếu chưa kiểm tra implementation.

## Bản đồ code theo file nguồn

| Đường dẫn | Vai trò |
|---|---|
| `index.html` | Auth screen, app screen và form modal |
| `css/style.css` | Style chính |
| `js/config.js` | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `js/lunar.js` | Dương lịch → âm lịch; tra Lục Thập Hoa Giáp để tính mệnh |
| `js/db.js` | IndexedDB, queue đồng bộ; API global `window.CRM` |
| `js/app.js` | Đăng nhập, CRUD, filter/sort/search, dashboard |
| `js/catalog.js` | Dự án → Tòa → Căn; dữ liệu cho form khách/bảng tính vay; cache offline |
| `js/catalog-ui.js` | Giỏ hàng qua menu avatar, sửa trực tiếp, nhập Excel, file mẫu |
| `js/loan/` | Engine → store → PDF → UI; `loan-crm.js` tích hợp CRM |
| `css/loan.css` | Style vay, class tiền tố `.lm-` |
| `tests/` | Test Node; có `loan-engine.test.js` |
| `dev/loan-demo.html` | Demo module vay không cần đăng nhập |
| `schema.sql` | Baseline schema Supabase theo đường dẫn gốc |
| `SQL/` | Migration; `add_loan_module.sql` tạo bảng module vay |
| `fix_rls_recursion.sql` | Bản sửa RLS; file nguồn ghi đã áp dụng |
| `fix_table_grants.sql` | Bản sửa GRANT; file nguồn ghi đã áp dụng |
| `manifest.json`, `sw.js` | PWA và cache app-shell |
| `icons/` | Icon PWA và asset nguồn |

Đường dẫn trên phản ánh CLAUDE.md đầu vào. Nếu di chuyển theo `docs/README.md`, cập nhật bảng này và các tham chiếu sau khi di chuyển thực tế.

## Bảng customers

Đối chiếu schema thực tế trước khi sửa dữ liệu hoặc migration.

- Primary key là `id` UUID. `phone` là mã nhận diện thuận tiện cho người dùng, không phải primary key.
- Unique theo `(phone, owner_id)`, không unique phone toàn cục. Hai sale có thể lưu cùng một số trong danh sách riêng.
- `menh` được tính ở client từ `dob` bằng `js/lunar.js`, lưu text để search/filter; không chuyển sang tính ở server nếu chưa duyệt.
- `owner_id` xác định chủ sở hữu, mặc định `auth.uid()`, được dùng cho RLS.
- Theo đặc tả thông tin khách gốc, `phone`, `full_name`, `owner_id` là bắt buộc; thông tin khác nullable, để thu thập dần. Đây không phải mô tả nullability của mọi cột hệ thống; xem schema để biết constraint chính xác.

## Lớp khách và nguồn khách

Quyết định D-001 tại `docs/decisions.md`. Tóm tắt:

- `qualified_at` trống = lớp 1 "Khách mới" (tab riêng, chỉ ghi cuộc gọi `call_attempts`, Đạt/Loại); có giá trị = lớp 2 (trang chủ, trang hồ sơ). `openDetail()` với lead tự mở hộp Khách mới.
- `source` = kênh (`facebook_ads` | `website` | `referral` | …), `intake_method` = cách nhập, `campaign` = chiến dịch. Danh mục kênh: `SOURCES` trong `js/app.js`.
- Lead từ landing page được API repo Marquee_Homes ghi thẳng vào bảng (service role, `source ["website"]`, cột `web_*` cho UTM) và tự vào lớp 1.
- `owner_id` của lead landing = `WEB_OWNER_ID` trong API (mặc định `a70e8d12…`). Kiểm tra 2026-10-06: đây chính là tài khoản sale duy nhất của chủ dự án (role `sale`), không có tài khoản "Website" riêng — chú thích "tài khoản Website" trong `lead.js` là tên gọi cũ. Khi thêm đồng nghiệp, lead landing vẫn chỉ vào tài khoản này (người khác không thấy do RLS) — cần quyết định cách giao lead trước khi mở rộng.

## Bảng profiles và phân quyền

- `role`: `admin` hoặc `sale`.
- Trigger tạo profile khi user đăng ký, mặc định role `sale`.
- File nguồn chỉ dẫn nâng admin thủ công qua SQL Editor ở cuối `schema.sql`.
- Kiểm tra role cho policy theo helper `public.is_admin()` hiện có, tránh policy tự truy vấn lại chính bảng `profiles`.
- RLS và quyền GRANT ở tầng bảng đều cần thiết. Khi sửa quyền, đọc phần Supabase tại `docs/pitfalls.md`.

## Cấu hình và migration

`js/config.js` chứa URL và anon key dùng ở client. Anon key được thiết kế cho client; việc bảo vệ dữ liệu vẫn phụ thuộc quyền truy cập/RLS. Không đưa khóa đặc quyền hoặc service-role key vào frontend.

Mọi thay đổi schema phải có migration SQL riêng cho DB đã tồn tại. Baseline phục vụ cài mới cần được giữ nhất quán khi phù hợp; ghi thay đổi đáng kể trong changelog và ghi rõ migration liên quan.

Không coi thư mục SQL là lịch sử đã áp dụng. Trước khi chạy migration, xác minh DB đích và trạng thái áp dụng. Không chạy lại hai file fix cũ chỉ vì chúng được nhắc trong tài liệu.

## Kiểm chứng phù hợp

- Engine vay: `node tests/loan-engine.test.js`.
- UI vay độc lập: `dev/loan-demo.html` khi môi trường cho phép.
- Auth/CRUD/offline: kiểm tra luồng bị ảnh hưởng qua app; test engine không thay thế kiểm tra này.
- Migration, quyền DB và production: cần xác minh tại môi trường liên quan; local pass không chứng minh production đã cập nhật.

Tài liệu chuyên sâu về vay/giỏ hàng giữ tại `docs/loan-module.md` và `docs/gio-hang.md` hiện có.
