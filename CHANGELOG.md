# CHANGELOG

Ghi lại các thay đổi đáng kể theo thời gian. Mới nhất ở trên cùng.

Định dạng mỗi mục: `Ngày — Mô tả — File bị ảnh hưởng`

---

## 2026-08-19 — Tìm kiếm bỏ dấu tiếng Việt

Trước đây tìm kiếm so khớp có dấu: khách "Nguyễn Thị Hương" gõ "huong" không
ra, phải gõ đúng "hương" mới ra.

**Sửa:** thêm hàm `removeVietnameseTones()` (NFD tách dấu + xoá ký tự dấu tổ
hợp, đ→d) trong `app.js`, áp vào cả từ khoá lẫn chuỗi tên/SĐT trong
`matchesFilters()`. Giờ gõ "huong" ra "Hương", gõ "hu" đã ra ngay — không cần
gõ dấu. Vẫn cập nhật tức thời khi gõ (đã có sẵn qua sự kiện `input`).

Chưa xử lý gõ SAI dấu kiểu typo (vd "huowng") — chỉ bỏ dấu, đủ cho nhu cầu.

File: `js/app.js`

---

## 2026-08-19 — Sửa lỗi font tiếng Việt ở tên khách (trang chi tiết / tiêu đề)

Một số tên khách có nguyên âm "râu" (ư/ơ + dấu: ường, ưởng, ữ, ự...) hiển thị
vỡ dấu ở tiêu đề trang chi tiết và tiêu đề modal.

**Nguyên nhân:** `h1, h2` dùng `font-family: "Iowan Old Style", "Georgia",
serif`. Font "Iowan Old Style" (có sẵn trên macOS nên được ưu tiên) vẽ SAI các
nguyên âm râu của tiếng Việt. Thân bài dùng font hệ thống sans nên không lỗi —
vì thế chỉ tên ở `<h1>/<h2>` bị. Đã render thử đối chiếu: Georgia (font dự
phòng thứ 2 trong danh sách) render tiếng Việt ĐÚNG.

**Sửa:** bỏ "Iowan Old Style" khỏi khai báo → `font-family: "Georgia",
"Times New Roman", serif`. Mac/Windows dùng Georgia, Android/Linux rơi về
serif hệ thống (Noto Serif) — cả hai render tiếng Việt chuẩn, vẫn giữ nét
serif. Sửa 1 dòng, không thêm file.

File: `css/style.css`

---

## 2026-08-19 — Card dashboard: bố cục mới (vòng nhỏ, thanh quan tâm, menu ⋯, timestamp)

Thiết kế lại card khách theo mẫu mới:

- **Vòng tiến độ chuyển thành vòng NHỎ inline** (16px, đĩa conic đầy theo bậc)
  đặt cạnh `x/7` + tên bước, thay cho vòng to góc phải trước đây.
- **Thêm thanh "Mức quan tâm"** dạng ngang mảnh (`.interest-bar`) + số % —
  trực quan hơn (trước chỉ có số trong form).
- **Nút Xoá dời vào menu "⋯"** (popover góc phải, `.card-menu`). Nút **Sửa**
  ở footer. Bấm ra ngoài hoặc mở menu card khác thì menu tự đóng.
- **Thêm timestamp "Cập nhật X trước"** (chữ nhỏ xám ở footer, dùng
  `updated_at` qua hàm `timeAgo`: vừa xong / X phút / X giờ / X ngày / ngày
  DD/MM/YYYY nếu >1 tuần).
- Tag **Mệnh rút gọn** còn "Mệnh Kim" (bỏ phần nạp âm dài) cho vừa card. Vẫn
  giữ tag căn hộ + tag đánh giá (theo yêu cầu). Card vẫn làm mờ nếu
  'không nên chăm'.
- **Notes cắt còn 2 dòng** (trước 3). Chiều cao card cố định tăng 220→240px.
- **Vá `db.js`**: thao tác update giờ gửi kèm `updated_at` lên Supabase (trước
  không gửi nên server giữ giờ cũ, làm timestamp/ sort "mới cập nhật" sai sau
  khi đồng bộ). Không đổi schema — cột `updated_at` đã có sẵn.

File: `js/app.js`, `js/db.js`, `css/style.css`

---

## 2026-08-19 — Icon Zalo bản nhẹ + số điện thoại không còn bấm được

- **Tối ưu icon Zalo**: ảnh gốc `icons/Zalo-icon.png` là 978×978, ~344KB —
  quá nặng cho 1 icon hiển thị ~20px. Tạo bản nhẹ `icons/zalo.png` 96×96
  (~9KB, đủ nét cho cả màn retina 2x–3x) bằng `sips`, đổi mọi tham chiếu
  sang file mới. File gốc `Zalo-icon.png` giờ KHÔNG còn dùng — giữ lại phòng
  khi cần, có thể xoá để repo gọn.
- **Số điện thoại không còn clickable**: trước đó trên card, số nằm trong thẻ
  `<a href="tel:">`. Nay tách số ra thành `<span class="phone-number">` chỉ
  để hiển thị (chữ thường, không gạch chân); mọi thao tác bấm chuyển hết sang
  2 icon (icon phone → gọi, icon Zalo → Zalo). Trang chi tiết vốn đã tách sẵn
  số khỏi nút nên không đổi.

File: `js/app.js`, `index.html`, `css/style.css`, `icons/zalo.png` (mới)

---

## 2026-08-19 — Icon Gọi / Zalo thay cho emoji & chữ

Đổi cách hiển thị SĐT + hành động gọi/Zalo cho gọn và rõ:

- **Card**: bỏ `📞` emoji + link Zalo cũ. Giờ hiện `{số điện thoại}
  {icon phone}` (bấm cả cụm → `tel:` mở giao diện gọi) và `{icon Zalo}`
  riêng (→ zalo.me). Trước đây bấm số là ra Zalo; nay bấm số/icon phone là
  GỌI, muốn nhắn Zalo thì bấm icon Zalo.
- **Trang chi tiết**: thay 2 nút chữ "Gọi" / "Zalo" bằng nút icon phone /
  icon Zalo tương ứng; bỏ luôn emoji 📞 trước số (đã có nút icon phone).
- **Icon**: phone là SVG inline (tô theo màu chữ, cỡ đặt bằng `em` nên luôn
  tương xứng cỡ chữ SĐT); Zalo dùng ảnh `icons/Zalo-icon.png`.
- `sw.js` **không đổi**: ảnh Zalo được service worker cache tự động theo cơ
  chế network-first sau lần tải đầu (không cần thêm vào APP_SHELL).

File: `index.html`, `js/app.js`, `css/style.css`

---

## 2026-08-19 — Trang chi tiết khách hàng (màn hình xem đầy đủ)

Thêm màn hình chi tiết `#detail-screen` (mục đã note trong `FEATURE_IDEAS.md`):

- **Bấm vào thân card** giờ mở **trang chi tiết** (trước đó mở thẳng modal
  Sửa). Nút **Sửa** trên trang chi tiết mở lại đúng modal cũ; sửa xong quay
  lại trang chi tiết đã cập nhật dữ liệu mới. Nút **← Quay lại** về danh sách.
- **Bố cục**: tên → SĐT + nút Gọi (`tel:`) / Zalo → hàng huy hiệu [Tiến độ =
  7 chấm tô theo bậc + tên bậc] [Quan tâm = 5 chấm + %] [đánh giá] → hộp
  **Ghi chú** (hiện đầy đủ, không cắt) → bảng **Căn hộ quan tâm** (loại/mã
  căn/mã toà/giá) → **Thông tin cá nhân** (giới tính, hôn nhân, ngày sinh,
  mệnh, thu nhập, thường trú).
- **Định dạng hiển thị**: giá VNĐ → "1,2 tỷ" / "800 triệu"; ngày sinh →
  DD/MM/YYYY; mệnh dùng thẳng chuỗi đã tính sẵn trong `menh`. Field trống hiện
  dấu "—".
- So với mockup gốc có **thêm 2 mục** ở phần cá nhân: Thu nhập và Thường trú
  (vì đó là dữ liệu cá nhân đang lưu, cần có chỗ xem ở chế độ đọc).
- Quản lý 3 màn hình bằng thuộc tính `hidden` (auth / app / detail) — không
  đổi kiến trúc, vẫn 1 trang SPA thuần.

File: `index.html`, `js/app.js`, `css/style.css`, `FEATURE_IDEAS.md`

---

## 2026-08-19 — Card khách hàng: chiều cao cố định, actions luôn ở đáy, cắt "Chi tiết"

Chỉnh lại thẻ khách trên dashboard cho đều mắt và dễ quét:

- **Chiều cao cố định `220px`** cho mỗi card (thay vì tự co theo nội dung),
  `display:flex; flex-direction:column; overflow:hidden`.
- **Actions (Sửa/Xoá) luôn nằm ở đáy** dù nội dung phía trên dài hay ngắn:
  bọc phần tag + chi tiết vào `.card-body` (`flex:1; min-height:0;
  overflow:hidden`) + `.card-actions { margin-top:auto }`. Nhờ đó nút luôn ở
  cùng 1 vị trí dọc giữa các card.
- **"Chi tiết" (notes) cắt còn tối đa 3 dòng** bằng `-webkit-line-clamp:3`,
  dư ra thêm "…". Bỏ `white-space:pre-wrap` (để clamp cắt gọn).
- **Bấm vào thân card → mở form xem/sửa đầy đủ** (thấy hết phần Chi tiết dài).
  Nút Sửa/Xoá và link SĐT (Zalo) vẫn hoạt động riêng, không kích hoạt mở
  form. Thêm hiệu ứng hover + con trỏ tay để gợi ý card bấm được.

File: `js/app.js`, `css/style.css`

---

## 2026-08-18 — Vòng tròn tiến độ chăm sóc 7 bậc + bậc "Không quan tâm-kết thúc"

Thay đổi cách dashboard thể hiện khách và thêm 1 trạng thái kết thúc mới:

- **Thêm bậc `'Không quan tâm-kết thúc'`** vào cuối danh sách tiến độ chăm
  sóc. Đây là trạng thái KẾT THÚC chăm sóc mà không chốt được khách — về mặt
  "đã xong hay chưa" tương đương bậc 7 `'Đã ký hợp đồng mua bán'` (cả hai đều
  coi là xong, mặc định ẩn khỏi dashboard).
- **Đổi vòng tròn trên thẻ khách**: bỏ vòng `% mức độ quan tâm`
  (`.interest-pill`), thay bằng **vòng tiến độ chăm sóc 7 bậc**
  (`.progress-ring`) — đầy dần theo bậc (level/7), mỗi bậc 1 màu (đỏ đất →
  xanh lá), giữa vòng ghi số bậc; bậc "Không quan tâm-kết thúc" hiện vòng đầy
  màu xám + dấu ✕. Khách chưa đặt tiến độ (bỏ trống) coi như bậc 1
  `'Chưa gọi được'`.
- **Thêm bộ lọc trạng thái** ở thanh công cụ (`#filter-progress`): mặc định
  `'Đang chăm sóc'` — dashboard chỉ hiện khách CHƯA xong (thay vì tất cả như
  trước). Chọn `'Đã xong'` hoặc `'Tất cả trạng thái'` để xem lại nhóm đã
  xong. Khi lọc theo 1 bậc cụ thể ở ô kế bên thì bỏ qua bộ lọc trạng thái.
- **Thứ tự sắp xếp mặc định mới** (`#sort-select`, tuỳ chọn `care_asc`):
  primary = tiến độ chăm sóc tăng dần (bậc 1 → 7, `'Không quan tâm-kết thúc'`
  xếp cuối), secondary = mức độ quan tâm tăng dần (thấp → cao) — đưa khách
  "cần chăm sớm" lên đầu. Vẫn còn các tuỳ chọn sắp xếp cũ (mới cập nhật, quan
  tâm cao nhất, tên A→Z).
- **Lưu ý còn giữ nguyên**: field/slider `Mức độ quan tâm` trong form, cùng
  bộ lọc `Q.tâm ≥` — vẫn dùng như cũ, chỉ bỏ phần vẽ vòng tròn % trên thẻ.

**Cần chạy migration:** `add_care_stage_ket_thuc.sql` trên Supabase SQL
Editor để nới ràng buộc CHECK của cột `care_stage` chấp nhận giá trị mới —
nếu không, khách gắn bậc mới sẽ không đồng bộ được lên server. Đã bake giá
trị mới vào `schema.sql` gốc luôn.

`sw.js` **không đổi** — network-first đã tự phục vụ bản JS/CSS mới sau deploy.

File: `js/app.js`, `index.html`, `css/style.css`, `schema.sql`,
`add_care_stage_ket_thuc.sql` (migration cần chạy)

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
