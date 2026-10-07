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

Cache khách và queue được tách theo tài khoản: IndexedDB `crm_khach_hang__<userId>`. Lần đầu dùng bản mới, nhập cache cũ một lần: chỉ record có `owner_id` khớp; queue có owner rõ ràng, hoặc thuộc tài khoản ghi nhớ và không trái với owner của record. Cache gốc được giữ để phục hồi; không tự gán thao tác mơ hồ cho tài khoản khác. Admin kéo lại dữ liệu được RLS cho phép, không giới hạn server vào owner của chính admin.

`js/paged-fetch.js` kéo theo khóa `id` có thứ tự và đếm chính xác, tiếp tục qua giới hạn dòng API. Chỉ thay cache khách bằng transaction sau khi toàn bộ trang thành công, queue rỗng và local không đổi trong lúc kéo. Đây không phải snapshot transaction trên server: các chỉnh sửa server đồng thời có thể cần lần đồng bộ tiếp theo.

Catalog có cache offline theo tài khoản trong `js/catalog.js` (`crm_catalog_v2:<userId>`); cache cũ không có phạm vi tài khoản được giữ nhưng không tự dùng lại. Không mặc định áp dụng mọi chi tiết của hàng đợi khách cho catalog nếu chưa kiểm tra implementation.

## Bản đồ code theo file nguồn

| Đường dẫn | Vai trò |
|---|---|
| `index.html` | Auth screen, app screen và form modal |
| `css/style.css` | Style chính |
| `js/config.js` | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `js/lunar.js` | Dương lịch → âm lịch; tra Lục Thập Hoa Giáp để tính mệnh |
| `js/db.js` | IndexedDB, queue đồng bộ; API global `window.CRM` |
| `js/paged-fetch.js` | Kéo đủ dữ liệu qua các trang, kiểm tra phiên và số lượng |
| `js/search.js`, `js/search-ui.js` | Matching, highlight, phân nhóm loại căn và phím tắt tìm kiếm |
| `js/property-search.js`, `js/catalog-search-ui.js` | Tìm giỏ hàng và ghép khách ↔ căn có giải thích |
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

## Nhật ký cuộc gọi

Quyết định D-002. Dữ liệu ở `customers.call_attempts` (không bảng riêng): `{at, result, note, duration, origin, device_id, direction}`; `result` trống = chưa ghi chú. Logic + hộp ghi chung ở `js/calls.js`:

- Web (mọi nền tảng): nút "Ghi cuộc gọi"; bấm SĐT trong CRM rồi quay lại app → tự mở hộp kèm thời gian rời app (ước lượng).
- Android (vỏ Capacitor, `android-app/`): vỏ mở `https://crm-cop.pages.dev` + plugin native `CallLog` (`CallLogPlugin.java`). `js/calls.js` tự nhận `window.Capacitor` → `CRMCallSource`; mở app / `crm:resume` (MainActivity.onResume) → `CRMCalls.sync()` đọc nhật ký máy, chỉ giữ cuộc tới SĐT khách, chống trùng theo `device_id`. Web không phụ thuộc vỏ.
- Khách Tiềm năng: lưu cuộc gọi đồng thời ghi 1 mốc vào `care_stage_history`.

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

## Tìm kiếm local

Mọi tab dùng chung matcher: chuẩn hoá dấu/Unicode/SĐT, AND giữa các từ, cụm chính xác trong dấu ngoặc kép, xếp độ liên quan và tìm tên gần đúng giới hạn một lỗi. Không ghép gần đúng số điện thoại. Truy vấn số không còn mặc định chỉ tìm SĐT; tìm mã căn / ngày sinh / SĐT qua ô tìm chung.

Query được compile một lần, tài liệu tìm kiếm cache theo object record và tạo nền theo đợt khoảng 4 ms. Input debounce 120 ms và chờ IME hoàn thành. Chỉ dựng view đang mở; danh sách 50 dòng/lần, Tổng quan 30/nhóm/lần, có Xem thêm. Count và xuất dữ liệu dựa toàn bộ kết quả lọc. Cache theo object giúp sửa note không đổi updated_at vẫn cập nhật sau refresh.

Theo điều chỉnh UI ngày 2026-10-07, bỏ panel lọc tìm kiếm chung (và các điều kiện / danh sách lưu riêng trong panel đó); dùng bộ lọc hiện có của từng trang. Thêm lọc nhóm loại căn Studio / 1N / 2N / 3N… vào Tiềm năng và Khách mới, kết hợp AND với điều kiện hiện có; 2N gồm 2N+, căn góc và các số WC. Count / export dùng cùng bộ lọc. Giữ tìm kiếm có trọng số, phím tắt và tối ưu render. finance vẫn là vốn sẵn có, không phải giá mua tối đa trong matching giỏ hàng.

Kiểm tra: `node tests/search.test.js`; test Chrome cô lập `tests/search-browser.test.cjs` cần Playwright và Chrome (NODE_PATH / CHROME_PATH theo môi trường). Chi tiết nghiệm thu: `docs/audits/search-implementation-2026-10-07.md`.
