# CHANGELOG

Ghi lại các thay đổi đáng kể theo thời gian. Mới nhất ở trên cùng.

Định dạng mỗi mục: `Ngày — Mô tả — File bị ảnh hưởng`

---

## 2026-08-20 — Menu "⋯" trên card: thêm "Hẹn lịch gọi"

Menu "⋯" ở mỗi card khách trước chỉ có "Xoá khách". Nay thêm mục **"Hẹn lịch
gọi"** (đặt trên "Xoá khách") → trỏ thẳng tới helper hẹn lịch `openScheduler(id)`
(cùng modal đang dùng ở trang chi tiết), khỏi phải vào chi tiết mới đặt được lịch.

- Chữ "Hẹn lịch gọi" giữ **cùng tone** với các chữ khác (class `.menu-item`,
  màu `--ink`); chữ "Xoá khách" giữ **màu đỏ cảnh báo** (class `.menu-item danger`).
- Bấm → đóng menu "⋯" rồi mở modal hẹn lịch. Lưu xong `saveSchedule` đã tự
  `refreshList()` nên tag nhắc gọi hiện ngay trên card.

File: `js/app.js`

---

## 2026-08-20 — Lịch sử chăm sóc: cập nhật lùi (xoá bậc sau) + ghi thêm lần cùng bậc + tự đánh số "lần N"

Ba cải tiến cho timeline "Lịch sử chăm sóc" (dùng lại cột `care_stage_history`,
KHÔNG đổi schema, KHÔNG có migration cần chạy):

1. **Cập nhật LÙI tiến độ** — khi ở form sửa khách chọn 1 bậc THẤP HƠN bậc hiện
   tại, app hiện cảnh báo xác nhận; nếu đồng ý → xoá mọi mốc lịch sử ở bậc CAO
   HƠN bậc vừa chọn (coi các bước sau là nhầm/thử), chỉ giữ các mốc bậc ≤ bậc
   mới. VD `1→2→3→4` rồi lùi về 1 → chỉ còn bậc 1. Nếu bậc còn lại đã đúng bậc
   mới thì không thêm mốc trùng. Bấm Huỷ ở cảnh báo → không lưu gì, giữ nguyên
   form. Thứ hạng bậc dùng `careSortRank` (bậc 1 'Chưa gọi được' → bậc 7 'Đã ký
   hợp đồng'; 'Không quan tâm-kết thúc' = 8).

2. **Ghi thêm 1 lần liên hệ CÙNG bậc** cho 2 bậc lặp được ('Chưa gọi được',
   'Hẹn gọi lại') — bản chất vẫn ở nguyên bậc, chỉ thêm 1 mốc vào timeline. Làm
   được ở CẢ HAI nơi: (a) nút "＋ Ghi thêm lần" ở trang chi tiết (chỉ hiện khi
   bậc hiện tại là bậc lặp được); (b) trong form sửa: chọn lại đúng bậc cũ +
   nhập ghi chú → tự thêm mốc mới. Dùng cờ `forceLog` trong `CRM.update` +
   method mới `CRM.addCareLog`.

3. **Tự đánh số "lần N" khi hiển thị** — bậc chỉ có 1 mốc: không hiện số; từ 2
   mốc trở lên: tự đánh 'lần 1, lần 2...' theo thứ tự thời gian. Số này KHÔNG
   lưu xuống DB, tính lại mỗi lần render nên thêm/xoá mốc thì số luôn tự đúng.

File: `js/db.js`, `js/app.js`, `index.html`, `css/style.css`

---

## 2026-08-20 — Icon app dùng Net_Icon.png (mạng lưới xanh)

Thay icon PWA tạm ("KH") bằng `icons/Net_Icon.png` (1024×1024, nền mint bo góc
+ đồ hoạ mạng lưới xanh).

- Cắt bỏ viền trắng thừa quanh icon (center-crop 820) rồi render các cỡ chuẩn
  bằng `sips`: `app-icon-512.png` (512), `app-icon-192.png` (192),
  `apple-touch-icon.png` (180, cho iOS/Safari & Mac).
- Đổi TÊN file mới (app-icon-*) để trình duyệt/OS lấy icon mới, tránh dính cache
  icon cũ. Cập nhật `manifest.json` (icons) + thêm `<link rel="apple-touch-icon">`
  và `<link rel="icon">` (favicon) trong `index.html`.

File: `manifest.json`, `index.html`, `icons/app-icon-192.png`,
`icons/app-icon-512.png`, `icons/apple-touch-icon.png`

---

## 2026-08-19 — Sửa lỗi kẹt đồng bộ ("Đang đồng bộ 1 thay đổi..." mãi)

Hàng đợi đồng bộ có 1 thao tác cứ đẩy lên server là lỗi → `flushQueue` dừng ở
đó và thử lại mãi (reload/xoá app không giúp vì hàng đợi nằm trong IndexedDB).
Nghi phạm chính: thao tác `insert` cho khách ĐÃ có trên server → lỗi trùng khoá.

- **`db.js`: đổi `insert` → `upsert`** (theo khoá chính `id`). Khách đã tồn tại
  (trùng id) thì cập nhật đè thay vì báo lỗi trùng.
- **Tự BỎ insert trùng (23505)**: lỗi thực tế gặp là trùng
  `customers_phone_owner_unique` (2 bản cùng SĐT, khác id) — upsert-theo-id không
  bắt được. Nay `flushQueue` gặp insert lỗi 23505 (trùng id HOẶC trùng
  (phone,owner)) thì tự bỏ op thừa đó & chạy tiếp (khách đã có trên server;
  `pull()` sẽ đồng bộ lại bản chuẩn). Chỉ auto-bỏ với `insert`; `update` trùng
  vẫn báo để user sửa SĐT.
- **Hiện rõ lỗi**: khi 1 thao tác lỗi (không phải mất mạng), badge chuyển
  "🔴 Kẹt đồng bộ (N) — chạm để xử lý" (thay vì "Đang đồng bộ..." vô tận).
  Bấm badge → thử đẩy lại; nếu vẫn kẹt → hiện lỗi cụ thể + cho **xoá các thao
  tác kẹt** (`CRM.clearQueue`, dữ liệu local vẫn còn, chỉ ngừng đẩy op lỗi).

File: `js/db.js`, `js/app.js`, `css/style.css`

---

## 2026-08-19 — Thời gian đăng ký + mốc "Bắt đầu đăng ký" đầu timeline

**Cần chạy migration** `add_registered_at.sql` (thêm cột `registered_at`).

1. **Thời gian đăng ký** (`registered_at`): thêm trường `datetime-local` trong
   form (giờ hh:mm + ngày). Khách mới prefill giờ hiện tại — nếu không sửa thì
   lấy luôn giờ đó (db.js cũng tự đặt = created_at nếu trống). Sửa lại được.
   Khách cũ backfill = created_at trong migration.
2. **Timeline lịch sử chăm sóc** luôn bắt đầu bằng mốc **"Bắt đầu đăng ký"** kèm
   thời gian đăng ký (khối mực in đậm, không sửa note), rồi mới tới các mốc đổi
   tiến độ. Thấy được khoảng cách từ lúc đăng ký tới lần chăm sóc đầu tiên.

File: `index.html`, `js/app.js`, `js/db.js`, `css/style.css`, `schema.sql`,
`add_registered_at.sql` (migration cần chạy)

---

## 2026-08-19 — Badge nhắc gọi về vị trí cố định (cạnh menu ⋯)

Trước đây tag nhắc gọi đặt ngay sau tên → vị trí "nhảy" theo độ dài tên. Nay
gom tag + menu ⋯ vào 1 nhóm phải (`.card-head-right`), tên dùng `flex:1` chiếm
chỗ còn lại → tag luôn cố định sát mép phải cạnh ⋯, dù tên dài/ngắn/xuống dòng.

File: `js/app.js`, `css/style.css`

---

## 2026-08-19 — Thuộc tính Dự án (multi-select tự quản lý) + Loại căn dạng chọn

**Cần chạy migration** `add_projects_and_apt_options.sql` (bảng `project_options`
+ cột `customers.projects`) — chạy trước/ngay khi deploy.

1. **Dự án** (trong "Căn hộ quan tâm"): chọn nhiều (chip), gồm 2 dự án seed sẵn
   (Marquee Homes, Vin Tràng Cát) + **"＋ Thêm mới"** (lưu vào bảng
   `project_options`, dùng lại mãi). Nút **"Quản lý"** bật chế độ xoá dự án khỏi
   danh sách (nút ✕ trên từng chip — xoá không ảnh hưởng khách đã lưu).
   - Danh sách theo từng tài khoản (owner), lưu ở Supabase; cache localStorage
     để đọc offline. Thêm/xoá dự án cần online (thao tác hiếm); còn chọn dự án
     cho khách thì offline vẫn chạy (lưu qua hàng đợi như field khác).
   - **Lựa chọn dự án lần gần nhất** (localStorage `crm_last_projects`) tự áp
     làm mặc định cho khách MỚI (nếu chưa chủ động chọn).
   - Giá trị lưu ở `customers.projects` (mảng tên dự án). Hiện ở trang chi tiết
     (dòng "Dự án" trong bảng căn hộ).

2. **Loại căn**: đổi từ ô tự nhập → **select** các option
   (1N-1WC / 1N+, 1WC / 2N-2WC / 2N+, 2WC / 3N-2WC) + **"Khác..."** (tự nhập,
   chỉ riêng cho khách đó, KHÔNG lưu vào danh sách chung). Vẫn dùng cột `apt_type`
   text sẵn có → không cần migration cho loại căn.

File: `index.html`, `js/app.js`, `css/style.css`, `schema.sql`,
`add_projects_and_apt_options.sql` (migration cần chạy)

---

## 2026-08-19 — Đổi tiêu chí sort mặc định

Sort mặc định `care_asc` (`sortCustomers` trong app.js) đổi từ 2 → 3 tiêu chí:
1. Tiến độ chăm sóc tăng dần (giữ nguyên).
2. Cùng bậc → mức quan tâm **GIẢM dần** (trước đây tăng dần).
3. Bằng nhau → khách **mới tạo gần đây lên trước** (`created_at` giảm dần).

Cập nhật nhãn dropdown thành "Tiến độ ↑, quan tâm ↓ (mặc định)".
File: `js/app.js`, `index.html`

---

## 2026-08-19 — Thêm nghề nghiệp + hẹn lịch gọi + nhắc gọi trên card

**Cần chạy migration** `add_occupation_and_call_schedule.sql` (thêm 3 cột:
`occupation`, `next_call_at`, `next_call_end`) — chạy trước/ngay khi deploy.

1. **Công việc** (`occupation`): thêm select trong form (Tự do / Công ty, DN /
   Công, viên chức / Công an, Bộ đội), hiện ở "Thông tin cá nhân" trang chi tiết.

2. **Hẹn lịch gọi** (trang chi tiết, dialog dùng chung `#schedule-modal`):
   - Chọn giờ: 9–10h / 14–15h / 20–21h / Tùy chọn giờ.
   - Chọn ngày: Hôm nay / Ngày mai / Tùy chọn ngày (min = sau hôm nay).
   - Giờ gọi lưu dạng KHUNG (duration): preset dài 1h (`next_call_at`→`next_call_end`),
     tùy chọn giờ là 1 mốc (end = at). Nút "Đổi lịch" / "Xoá lịch".

3. **Tag nhắc gọi trên card** (dóng ngang tên, bấm được):
   - `< 24h` trước giờ: tag **vàng** "hh:mm nữa gọi" (đếm ngược, cập nhật mỗi 30s).
   - Trong khung giờ + 30 phút sau khi hết khung: tag **đỏ nhạt** "đến giờ gọi".
   - Quá 30 phút sau khung: tag **xám** "quên gọi hh:mm".
   - Bấm tag → popup `#call-action-modal`: **Đã gọi** (xoá lịch, tag biến mất) /
     **Hẹn lại** (mở lại dialog đặt lịch) / **✕** (thoát). Tag chỉ mất khi bấm "Đã gọi".
   - Card có nhắc gọi **nổi lên đầu, ĐÈ sort hiện tại**, sắp theo giờ hẹn tăng dần
     (quên/đến giờ trước, rồi gần nhất → xa hơn).

Client-side (đếm ngược `setInterval` 30s); dùng lại `CRM.update` để lưu (không
đụng care_stage timestamps). File: `index.html`, `js/app.js`, `css/style.css`,
`schema.sql`, `add_occupation_and_call_schedule.sql` (migration cần chạy).

---

## 2026-08-19 — Đổi tên "Sổ Khách", làm lại header & bảng màu toàn app

**1. Đổi tên** ứng dụng: "CRM Khách hàng" → **"Sổ Khách"** (title, brand
header, màn đăng nhập, `manifest.json` name/short_name).

**2. Header mới (nhiều công năng hơn):**
- Gộp **tab "Khách hàng" / "Tổng quan" vào ngay header** (bỏ thanh tab riêng
  bên dưới) — dạng segmented control trên nền mực in.
- **Ô tìm nhanh luôn có trong header** (chuyển từ toolbar lên). Gõ tìm khi
  đang ở tab Tổng quan → tự chuyển về tab Khách hàng để thấy kết quả.
- **Gộp "Đăng xuất" vào avatar tròn** (menu popover kèm email) — bỏ nút Đăng
  xuất chình ình.
- **Thêm nút "↻ Làm mới"**: đẩy hàng đợi + kéo dữ liệu mới nhất từ Supabase +
  vẽ lại, không phải tắt/mở lại app (icon xoay khi đang tải).
- Header responsive: mobile xuống 3 hàng (brand+tab / badge+reload+avatar /
  ô tìm full-width).

**3. Bảng màu mới** — cảm hứng "con dấu mộc đỏ trên sổ đỏ/hợp đồng"
(cập nhật biến trong `:root`):
- Nền giấy ngà `#F7F4EE`; chữ chính + header mực in xanh đen `#1A2E29`.
- **Accent chính đỏ son `#B0342A`** (nút, badge quan trọng, mức quan tâm) —
  thay cam đất cũ. Nút primary + avatar dùng màu này.
- Accent phụ xanh lá trầm `#3D6B4F` (nên chăm / thành công).
- Giữ nguyên bảng màu 7 bậc tiến độ (vốn đã là gradient đỏ→xanh, hợp tông).

File: `index.html`, `manifest.json`, `css/style.css`, `js/app.js`

---

## 2026-08-19 — Dashboard tổng quan (tab riêng, 8 phân tích)

Thêm tab "Tổng quan" cạnh "Khách hàng" (điều hướng bằng `.tab-nav` trong
`#app-screen`; `#list-view` / `#dashboard-view`). Tất cả tính client-side từ
`allCustomers` đã nạp — KHÔNG đổi schema, KHÔNG query thêm, chạy offline.
Chart tự vẽ bằng CSS/SVG, không dùng thư viện ngoài.

8 widget (mục theo yêu cầu):
1. **Phễu bán hàng** theo care_stage + **% chuyển đổi** giữa các bước, tự đánh
   dấu **nút thắt** (bước rớt nhiều nhất, tô đỏ). Đếm "đã từng đạt tới" mỗi bậc
   (suy từ `care_stage_history` + bậc hiện tại) để % có nghĩa.
2. **Đánh giá** nên/không nên chăm + **drill-down lý do** (evaluation_reason)
   trong nhóm "không nên chăm".
3. **Khách mới theo tuần** (cột, 8 tuần gần nhất, theo created_at).
4. **Điểm quan tâm TB toàn pipeline** + **đường xu hướng theo tuần** (khách mới
   vào đang "nóng" hay "nguội").
5. **Phân bổ loại căn / mã toà** (khách đang chăm).
6. **Khách bị bỏ quên**: đang chăm nhưng >7 ngày chưa đổi tiến độ
   (theo `care_stage_updated_at`). Bấm mở chi tiết.
7. **Thời gian TB ở mỗi bậc** (tính từ `care_stage_history`).
8. **Khách nóng cần gọi ngay**: quan tâm >70% & >7 ngày chưa động — kèm nút gọi.

Bố cục masonry: JS chia card vào cột thấp nhất (1 cột mobile → 3 cột laptop),
tự chia lại khi đổi kích thước cửa sổ. Dashboard tự làm mới khi quay lại tab.

File: `index.html`, `js/app.js`, `css/style.css`

---

## 2026-08-19 — Sửa được note của từng mốc lịch sử chăm sóc (chỉ note)

Timeline lịch sử trước đây chỉ đọc. Giờ note của mỗi mốc sửa được tại chỗ.

- **`db.js`**: thêm `CRM.updateCareHistoryNote(id, at, note)` — tìm mốc theo
  `at`, chỉ đổi `note`, GIỮ NGUYÊN `stage`, `at`, `updated_at`,
  `care_stage_updated_at`. Đồng bộ chỉ gửi cột `care_stage_history` → không
  làm nhảy "cập nhật cuối" trên card hay bất kỳ ràng buộc/timestamp nào.
- **`app.js`**: mỗi mốc trong timeline có nút ✎ (sửa) / "+ ghi chú" (mốc chưa
  có note). Bấm → hiện ô input tại chỗ + nút Lưu/Huỷ (Enter=Lưu, Esc=Huỷ). Chỉ
  1 mốc sửa 1 lúc (`editingHistoryAt`). Lưu xong vẽ lại timeline.
- **`css`**: style ô sửa note + nút ✎ kín đáo.

Không đổi schema (dùng lại cột `care_stage_history` sẵn có) → không cần migration.

File: `js/db.js`, `js/app.js`, `css/style.css`

---

## 2026-08-19 — Lịch sử tiến độ chăm sóc (timeline) trên trang chi tiết

Ghi lại & hiển thị toàn bộ hành trình đổi Tiến độ chăm sóc của khách.

- **Lưu lịch sử**: thêm cột `care_stage_history` (JSONB) trên `customers` —
  mảng các mốc `{stage, note, at}`. KHÔNG dùng bảng log riêng: nhét thẳng vào
  record khách để tự đồng bộ qua hàng đợi IndexedDB hiện có (không thêm
  bảng/RLS/grant/pull mới). Migration `add_care_stage_history.sql` (CẦN CHẠY).
- **Ghi mốc**: `db.js` — mỗi khi `care_stage` đổi (đồng bộ với timestamp đã
  làm) thì append 1 mốc kèm `at = giờ đổi`. Khi tạo khách có sẵn bậc → tạo
  mốc đầu tiên.
- **Ghi chú riêng mỗi lần đổi**: form có thêm ô "Ghi chú cho lần đổi tiến độ
  này" (`care_stage_note`), CHỈ hiện khi chọn bậc khác giá trị lúc mở form.
  Ghi chú này đi vào mốc lịch sử, không phải cột riêng của khách
  (`CRM.create/update` nhận qua tham số `opts.careStageNote`).
- **Hiển thị**: mục "Lịch sử chăm sóc" ở trang chi tiết — timeline dọc, mỗi
  bậc là 1 khối ô tô màu theo tiến độ (nổi bật), timestamp + note mờ hơn,
  giữa các mốc hiện khoảng thời gian ("2 ngày 23 giờ", "10 phút"...). Cũ trên,
  mới dưới. Không có header cột.

**Cần chạy migration** `add_care_stage_history.sql` trước/ngay khi deploy.

File: `js/db.js`, `js/app.js`, `index.html`, `css/style.css`, `schema.sql`,
`add_care_stage_history.sql` (migration cần chạy)

---

## 2026-08-19 — Timestamp card chỉ đổi khi Tiến độ chăm sóc thay đổi

Trước đây "Cập nhật X trước" trên card dùng `updated_at` → đổi mỗi lần sửa BẤT
KỲ field nào. Yêu cầu mới: timestamp chỉ phản ánh lần **Tiến độ chăm sóc**
(`care_stage`) đổi cuối cùng.

**Cách làm** (không tái dùng `updated_at` vì nó còn phục vụ sort "Mới cập nhật"
+ xử lý xung đột last-write-wins):

- **Thêm cột mới `care_stage_updated_at`** (migration `add_care_stage_updated_at.sql`
  — CẦN CHẠY trên Supabase; đã bake vào `schema.sql`).
- **`db.js`**: khi `update`, so sánh `care_stage` cũ/mới — chỉ khi khác mới đặt
  `care_stage_updated_at = now` (và gửi kèm lên server). Sửa field khác không
  đụng cột này. Khi `create`, đặt = giờ tạo (khách mới hiện "vừa xong").
- **`app.js`**: card đọc `care_stage_updated_at` (dòng cũ chưa có thì tạm dùng
  `updated_at`).
- `updated_at` vẫn cập nhật mỗi lần sửa như cũ (không đổi hành vi sort/đồng bộ).

**Cần chạy migration** `add_care_stage_updated_at.sql` trước/ngay khi deploy —
nếu không thao tác lưu khách sẽ lỗi "column ... does not exist" và kẹt hàng đợi.

File: `js/db.js`, `js/app.js`, `schema.sql`, `add_care_stage_updated_at.sql` (migration cần chạy)

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
