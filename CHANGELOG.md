# CHANGELOG

Ghi lại các thay đổi đáng kể theo thời gian. Mới nhất ở trên cùng.

Định dạng mỗi mục: `Ngày — Mô tả — File bị ảnh hưởng`

---

## 2026-08-24 — Ghi chú gọn hơn + badge tiến độ/quan tâm đổi màu

**1) Ghi chú (trang chi tiết):**
- Dòng ghi chú còn `[nội dung] [thời gian] [✎ sửa]` — **bỏ nút xoá ✕** ở dòng.
- Bấm ✎ → chế độ sửa có **3 nút Lưu / Huỷ / Xoá** (nút xoá chuyển vào đây).
- Nút **"＋ Thêm ghi chú" nằm trong khung** cùng danh sách: thêm wrapper `.notes-frame`
  (giữ viền/nền), `#detail-notes` bỏ viền riêng.

**2) Badge Tiến độ & Mức quan tâm** (giữ cấu trúc, chỉ đổi màu cho đồng bộ quy ước màu):
- **Tiến độ:** 7 chấm nay tô **màu riêng theo từng bậc** (đỏ đất bậc 1 → xanh lá bậc 7) tới
  bậc hiện tại, thay vì cùng 1 màu. Trạng thái kết thúc (không mua) → xám toàn bộ.
- **Mức quan tâm:** chấm tô **màu theo mốc** nguội/ấm/nóng/rất nóng (`INTEREST_TIERS`) thay vì
  luôn dùng `--terracotta` — cùng màu với tag mức quan tâm ngoài card.

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-24 — Khu "next action" thành THẺ NỔI (elevated card)

Làm nổi bật khu "Hành động tiếp theo" (thẻ nhắc gọi + danh sách việc) — chọn phương án C
sau khi so mockup 3 kiểu: **thẻ trắng, shadow ẤM (ám nâu — hợp tông giấy) + thanh màu bên
trái + tiêu đề đỏ son**. Áp cho CẢ 2 trạng thái để khu này đồng nhất, tách rõ khỏi khu "Ghi chú".

- `.next-action` + `.tasks-wrap` dùng chung khung thẻ: nền trắng, `border-left: 4px` màu đỏ son
  (mặc định), bo góc 14px, `box-shadow: 0 6px 18px rgba(120,70,40,.12)`, padding rộng hơn.
- Thẻ nhắc gọi vẫn đổi màu thanh trái theo độ gấp (vàng/đỏ/xám) — đè lên đỏ son mặc định.
- `.na-eyebrow` (HẸN GỌI / VIỆC TIẾP THEO) đổi từ xám → **đỏ son** (`--seal`).
- Thuần CSS, không đụng HTML/JS.

File: `css/style.css`

---

## 2026-08-24 — "Việc tiếp theo": danh sách to-do khi chưa có lịch gọi

Khu "Hành động tiếp theo" trang chi tiết (ngay dưới "Mức độ quan tâm") có 2 trạng thái:
- **Có lịch gọi** → thẻ nhắc gọi như cũ (lịch chính là next action).
- **Chưa có lịch** → **"VIỆC TIẾP THEO"**: danh sách việc tự do, mỗi việc có nút ✎ (mở
  textarea sửa + nút Lưu / 🗑 Xoá việc), cùng nút "＋ Thêm việc" và "＋ Đặt lịch gọi".

- **DB (cần chạy `add_next_tasks.sql`):** thêm cột `customers.next_tasks jsonb default '[]'`
  — mảng `{text, at}`, giữ thứ tự tạo. Không cần GRANT thêm. **Chạy TRƯỚC khi deploy** kẻo
  lưu việc báo "column does not exist" và kẹt hàng đợi.
- **db.js:** thêm `addTask` / `updateTask` (trống = xoá) / `deleteTask` — đồng bộ riêng cột
  `next_tasks`, offline-first như `notes_manual`.
- **app.js:** `renderDetailCall` phân nhánh thẻ gọi vs `renderDetailTasks`; state sửa/thêm
  qua `editingTaskAt` ('new' = đang thêm), reset khi mở khách khác. `#detail-schedule-btn`
  chuyển vào trong khối việc (cạnh "Thêm việc").
- **index.html/style.css:** khối `#detail-tasks-wrap` + style `.tasks-*` / `.task-*`.

File: `add_next_tasks.sql` (migration mới), `js/db.js`, `js/app.js`, `index.html`, `css/style.css`

---

## 2026-08-24 — Hộp thoại gọi PHẲNG + viền section đậm hơn

**1) Gộp luồng xác nhận gọi thành 1 hộp thoại phẳng.** Bỏ hộp thoại ghi chú riêng
(`#call-note-modal`) đã thêm hồi sáng. Nay `#call-action-modal` chứa luôn: thời gian hẹn +
lý do + **ô ghi chú** (`#callact-note`) + 3 nút.
- **Cả 3 nút đều ghi 1 mốc** vào care timeline (giữ nguyên bậc, forceLog, tự đánh số "lần N"),
  note = `[hành động] hh:mm, dd.mm.yyyy` + `. [ghi chú]` nếu có. Prefix theo nút: `đã gọi` /
  `hẹn lại` / `huỷ gọi`. Timestamp chốt lúc bấm nút.
- **Đã gọi** & **Huỷ gọi**: ghi mốc + xoá lịch hẹn. **Hẹn lại**: ghi mốc (giữ lịch) rồi mở
  scheduler chọn lịch mới. Đổi nhãn nút "Huỷ lịch" → **"Huỷ gọi"**. Gom `logCallAction(prefix,
  clearSchedule)` dùng chung cho cả 3.
- Giữ định dạng ngày `dd.mm.yyyy` (dấu chấm) như đã chốt trước đó — xem ghi chú bên dưới.

**2) Viền các section trong form khách đậm hơn ~50%.** `fieldset` từ `1px solid #E4DFD3`
(trùng viền field) → **`1.5px solid #C7BEA9`** (dày hơn + màu taupe đậm hơn) để phân biệt rõ
khung section với khung từng field.

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-24 — "Đã gọi" thêm bước ghi chú cuộc gọi

Đổi luồng xác nhận gọi: bấm countdown badge → hộp thoại (Đã gọi / Hẹn lại / Huỷ lịch) →
bấm **"Đã gọi"** giờ mở thêm **hộp thoại ghi chú cuộc gọi** (note không bắt buộc) trước khi ghi.

- Thêm dialog `#call-note-modal` (tái dùng khung `.callact`): tiêu đề "Ghi chú cuộc gọi",
  dòng phụ "[tên] · đã gọi hh:mm, dd.mm.yyyy", ô textarea + nút Lưu / Huỷ.
- **Timestamp chốt NGAY lúc bấm "Đã gọi"** (`callDoneAt`), không phụ thuộc gõ note lâu hay nhanh.
- **Lưu** → ghi 1 mốc MỚI vào care timeline, **giữ nguyên bậc hiện tại** (forceLog, vẫn tự đánh
  số "lần N"), note = `đã gọi hh:mm, dd.mm.yyyy` + `. [ghi chú]` nếu có → rồi xoá lịch hẹn.
  **Huỷ / ✕** → không ghi gì, giữ nguyên lịch hẹn.
- Đổi định dạng ngày trong `callStamp` từ `dd/mm/yyyy` → **`dd.mm.yyyy`** và prefix
  `Gọi lúc` → `đã gọi`. Tách `confirmCalled` cũ thành `openCallNote` + `saveCallNote`.

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-24 — Form sửa khách: header kèm tên + tên section nổi bật hơn

- **Header khi SỬA** đổi từ "Sửa thông tin khách" → "Sửa thông tin khách **[họ tên]**", lấy
  `full_name` từ record ĐÃ LƯU lúc mở form (không đổi theo lúc gõ ô Họ tên; tên rỗng → "(chưa
  tên)"). Chế độ thêm mới vẫn "Thêm khách mới". (`openForm` trong `js/app.js`)
- **Tên section (`legend`)** giữ nguyên cỡ 12px nhưng **in đậm + màu mực đậm (`--ink`) + chữ
  hoa giãn nhẹ** → tách biệt rõ tiêu đề section với tên field (13px, xám, thường). (`css/style.css`)

File: `js/app.js`, `css/style.css`

---

## 2026-08-24 — Form sửa khách: gom field vào 4 section có viền

Tổ chức lại form thêm/sửa khách thành **4 fieldset có viền chữ nhật** (dùng đúng pattern
`<fieldset><legend>` + `.form-grid` lồng như "Căn hộ quan tâm" cũ). Không đổi CSS/JS — chỉ
sắp xếp lại markup; mọi `name`/`id` giữ nguyên nên logic (OCR, tính mệnh, toggle note/lý do,
tài liệu) không đổi.

- **1) Thông tin cá nhân:** SĐT, họ tên, giới tính, ngày sinh, mệnh, hôn nhân, công việc, thu
  nhập, thường trú. Ô **Mệnh bỏ `span-2`** → chỉ còn 1 cột (trước chiếm cả 2 cột).
- **2) Thông tin căn hộ:** dự án, loại căn, mã căn, mã toà, giá căn, **+ thời gian đăng ký**
  (chuyển từ khối cá nhân sang đây). Đổi tên legend "Căn hộ quan tâm" → "Thông tin căn hộ".
- **3) Chăm sóc:** sắp lại đúng thứ tự tiến độ chăm sóc → mức độ quan tâm → ghi chú → đánh giá
  (kèm ô ghi chú đổi tiến độ & lý do không nên chăm ẩn/hiện như cũ).
- **4) Tài liệu đính kèm:** đổi `div.form-docs` → `fieldset` (id `form-docs-section` giữ nguyên,
  vẫn chỉ hiện khi SỬA khách). Bỏ tiêu đề `.proj-head` cũ (đã có `<legend>`).

File: `index.html`

---

## 2026-08-23 — Lịch gọi trang chi tiết → thẻ "Hành động tiếp theo"

Đổi khu lịch gọi ở trang chi tiết từ 1 dòng chữ + 3 nút thành 1 **thẻ phân cấp** bấm được.

- **Phân cấp:** dòng 1 = nhãn "HẸN GỌI" (trái) + badge đếm ngược (phải); dòng 2 = "ngày · giờ"
  (nổi bật); dòng 3 = lý do (mờ, nếu có). Viền trái đổi màu theo độ gấp (vàng sắp gọi · đỏ đến
  giờ · xám quên gọi).
- **Bỏ 2 nút "Đổi lịch" + "Xoá lịch"** (`detail-callclear-btn` xoá hẳn). Chức năng đổi/huỷ nay
  nằm trong hộp thoại mở khi **bấm cả thẻ** (Đã gọi / Hẹn lại / Huỷ lịch) — tránh trùng lặp.
  Bấm được cả khi lịch xa >24h (chưa hiện badge). Chưa có lịch → chỉ còn nút "＋ Đặt lịch gọi".
- **Bỏ icon chuông 🔔** trước nhãn — thay bằng eyebrow chữ hoa "HẸN GỌI" + viền màu (hiện đại,
  gọn hơn).
- Đổi `#detail-call-label` (span) → thẻ `#detail-next-action` (button) chứa `#detail-call-badge`
  (nay là span), `#detail-na-when`, `#detail-na-reason`. `renderDetailCall` viết lại; listener
  badge cũ → listener trên cả thẻ.

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-23 — Lý do cho lịch hẹn gọi (form đặt lịch + modal xác nhận)

Thêm ô **"Lý do (không bắt buộc)"** vào form đặt lịch gọi, dưới phần chọn ngày. Lý do gắn
LIỀN với lịch hẹn và hiện lại lúc nhắc gọi để biết cần nói gì.

- **DB (cần chạy `add_next_call_reason.sql`):** thêm cột `customers.next_call_reason text`
  (nullable). Không cần GRANT thêm (quyền tầng bảng tự áp cho cột mới). **Chạy TRƯỚC khi
  deploy** — nếu không, lưu lịch gọi sẽ báo "column does not exist" và kẹt hàng đợi đồng bộ.
- **Form đặt lịch (`schedule-modal`):** thêm `<textarea id="sched-reason">`. `openScheduler`
  nạp lại lý do cũ khi bấm "Đổi lịch"; `saveSchedule` lưu kèm `next_call_reason`.
- **Hiển thị:** nhãn "🔔 Hẹn gọi" trang chi tiết nối thêm " · [lý do]"; modal xác nhận gọi
  thêm dòng "Lý do: ..." (id `callact-reason`) ngay dưới "Lịch hẹn". Đều dùng `textContent`
  (an toàn XSS).
- **Xoá theo lịch:** "Đã gọi" / "Huỷ lịch" / "Xoá lịch" set `next_call_reason = null` cùng
  `next_call_at`/`next_call_end` → lý do mất theo lịch (đúng như thiết kế).
- Không đụng `sw.js`/`APP_SHELL` → không cần tăng `CACHE_NAME`.

File: `add_next_call_reason.sql` (migration mới), `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-23 — Modal xác nhận gọi: thêm nút "Huỷ lịch" + "Đã gọi" ghi lịch sử

Đổi hộp thoại xác nhận cuộc gọi (mở khi bấm badge đếm ngược trên card hoặc trang chi tiết).

- **Giao diện:** `Gọi: [tên]` · `Lịch hẹn: [ngày] [khung giờ]` · 3 nút `[✓ Đã gọi] [Hẹn lại] [Huỷ lịch]`
  (trước đây chỉ có 2 nút, không có "Huỷ lịch"). Nút "Huỷ lịch" tô đỏ (`btn-danger`).
- **"Đã gọi"** giờ ghi thêm **1 mốc liên hệ mới** vào lịch sử chăm sóc, note tự động
  `Gọi lúc hh:mm, dd/mm/yyyy` (timestamp chốt ngay lúc bấm), rồi xoá lịch hẹn. **GIỮ NGUYÊN**
  bậc chăm sóc hiện tại (dùng `forceLog` — chỉ thêm mốc, không đẩy bậc). Khách chưa đặt bậc
  (null) coi như bậc 1 'Chưa gọi được' để không tạo mốc trống.
- **"Huỷ lịch"** chỉ xoá lịch hẹn (gỡ badge), KHÔNG ghi lịch sử — dùng khi bỏ hẹn mà không gọi.
- Không đụng `sw.js`/`APP_SHELL` → không cần tăng `CACHE_NAME` (network-first tự lấy bản mới).

File: `index.html`, `js/app.js`

---

## 2026-08-23 — Avatar trong CARD view (danh sách khách)

Thêm avatar tròn **46px** vào card (bên TRÁI tên + SĐT) — cùng nguồn dữ liệu với avatar trang
chi tiết (`avatar_path`; chưa có → chữ cái từ cuối trong tên + màu theo tên).

- Bọc card-head + phone-row trong `.card-top` (avatar trái · tên/SĐT phải); progress/notes/footer
  vẫn full-width bên dưới. Avatar chỉ hiển thị (không phải nút) → bấm card vẫn mở chi tiết.
- **Tối ưu mạng:** card LUÔN vẽ chữ cái trước (render nhanh); nếu khách có ảnh → gắn
  `data-avatar-path`, sau đó `resolveCardAvatars()` gom các path → **batch** `signedDocUrls`
  (createSignedUrls 1 lần) + **cache 10 phút** rồi mới đổi sang `<img>` (cover). Re-render dùng
  cache, không gọi lại mạng. Offline → giữ chữ cái.
- db.js: thêm `signedDocUrls(paths, expires)` (batch signed URL).

File: `js/db.js`, `css/style.css`, `js/app.js`

---

## 2026-08-23 — Ảnh đại diện cho khách (trang chi tiết)

Thêm avatar tròn cho mỗi khách ở trang chi tiết (tăng nhận diện).

- **DB (cần chạy `add_avatar.sql`):** thêm cột `customers.avatar_path text` (nullable) — trỏ tới
  file ảnh trong bucket `customer-docs` (CÙNG bucket tài liệu đính kèm), path
  `<owner>/<customerId>/avatar-<ts>.<ext>`. Không tạo dòng `documents` (để avatar không lẫn vào
  danh sách tài liệu). Cũng thêm vào `schema.sql` baseline.
- **db.js:** `uploadAvatar(id, blob)` (online-only: upload Storage → `update(avatar_path)` →
  xoá file cũ) + `removeAvatar(id)`. Hiển thị qua `signedDocUrl` như tài liệu.
- **UI chi tiết:** avatar tròn **bên TRÁI tên** (tên/hàng SĐT đẩy sang phải) — 64px điện thoại /
  72px desktop. Có ảnh → `object-fit: cover` (tự căn giữa + scale vừa khung tròn); chưa có →
  chữ cái đầu của TỪ CUỐI trong tên (vd "Lương Thị Đào" → "Đ") trên nền màu theo tên.
- **Xem + đổi ảnh:** bấm avatar → mở lại `#file-viewer` (chế độ avatar): xem ảnh gốc (có zoom)
  hoặc placeholder chữ cái, + khu "Chọn ảnh / Dán ảnh (clipboard)"; chọn xong → xem trước +
  **Lưu ảnh / Huỷ**; có nút "Gỡ ảnh" khi đã có avatar. Ảnh nén về ≤512px trước khi lưu.

File: `add_avatar.sql` (mới), `schema.sql`, `js/db.js`, `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-23 — Nút "Lưu vào danh bạ" (trang chi tiết) → icon person+

Đổi nút chữ "＋ Lưu vào danh bạ" thành **nút icon** (SVG person+, kiểu Lucide user-plus) cho đồng
bộ với 2 nút icon Gọi/Zalo cạnh nó (`.icon-btn`, viền teal). Giữ id `#detail-contact-btn` (logic
lưu danh bạ không đổi) + `aria-label`/`title` "Lưu vào danh bạ" cho tooltip & trợ năng.

File: `index.html`, `css/style.css`

---

## 2026-08-23 — List view: hiện chỉ báo NHẮC GỌI (đồng nhất card về rule đẩy lên đầu)

Kiểm tra thực tế: filter + sort + rule "đẩy khách sắp/đến/quên giờ gọi lên đầu" VỐN ĐÃ dùng chung
cho cả card lẫn list (`renderList` tính `list` một lần, cả 2 nhánh lặp trên cùng `list`; test 2
view cho ra thứ tự y hệt). Nhưng list view **không hiển thị** dấu nhắc gọi nên nhìn không thấy lý
do khách bị đẩy lên đầu → tưởng rule không áp dụng. Sửa: thêm nhãn nhắc gọi vào dòng list (dùng
chung `reminders` + màu `.call-soon/due/missed` như card; là NHÃN, không phải nút — bấm dòng vẫn
mở chi tiết). `fitListRow` tự ưu tiên nhãn này, thu số ĐT lại nếu chật.

File: `css/style.css`, `js/app.js`

---

## 2026-08-23 — Panel Bộ lọc gọn hơn: lịch tự thu gọn + Tiến độ thành dropdown

Thu gọn 2 điều khiển trong panel Bộ lọc (chọn xong KHÔNG đóng panel — vẫn chỉ nút "Áp dụng" đáy đóng):

- **Thời gian → Tuỳ chọn:** bấm "Tuỳ chọn" mở lịch; chọn xong KHOẢNG (đủ 2 đầu) → lịch **tự thu
  gọn** thành thanh tóm tắt "T7 8/8 → T5 20/8 · Đổi ▾" (giữ nguyên khoảng đã chọn, vẫn áp lọc
  real-time). Bấm thanh đó (hoặc bấm lại pill "Tuỳ chọn") mở lại lịch để chỉnh. State `calExpanded`.
- **Tiến độ:** đổi từ danh sách radio dài → **dropdown tuỳ biến** (như dropdown Trạng thái): nút
  hiện bậc đang chọn, bấm mới xổ full danh sách, chọn 1 bậc → thu gọn + áp ngay. State `stageFilter`
  thay cho radio `f-stage`; `matchesFilters`/`isAdvancedFilterActive` đọc `stageFilter`.
- `closeTransientPops()` đóng thêm dropdown Tiến độ; có handler riêng đóng nó khi bấm chỗ khác
  (kể cả trong panel). `populateSelects` render option cho `#stage-pop`.

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-23 — Panel Bộ lọc: lọc real-time, 1 nút "Áp dụng" đáy để đóng, không tự đóng

Chốt hành vi panel Bộ lọc theo ý dùng "gộp nhiều filter, xem nhóm khách trực tiếp":

- **Lọc real-time:** chọn ngày trên lịch (kể cả Tuỳ chọn) áp lọc NGAY, danh sách cập nhật tức thì
  (bỏ bản nháp + 2 nút Huỷ/Áp dụng trong lịch của bản trước).
- **Panel KHÔNG tự đóng** khi bấm ra ngoài hay cuộn (thu gọn header) → tách `closeTransientPops()`
  (chỉ đóng Sắp xếp + dropdown Trạng thái, chừa panel Bộ lọc) cho 2 sự kiện đó; `closeToolPops()`
  (đóng cả Bộ lọc) chỉ dùng cho đóng CHỦ ĐÍCH.
- **Chỉ nút "Áp dụng" duy nhất ở ĐÁY panel đóng panel** (bộ lọc vốn đã áp real-time nên nút chỉ
  đóng phiên). Bấm lại icon phễu cũng đóng (toggle). Mở Sắp xếp/Trạng thái vẫn đóng Bộ lọc (1
  popup 1 lúc).

File: `css/style.css`, `js/app.js`

---

## 2026-08-23 — "Tuỳ chọn" thời gian: lịch tuỳ biến chọn KHOẢNG (1 bảng, tô dải)

Đổi phần "Tuỳ chọn" của bộ lọc thời gian từ 2 ô `<input type=date>` native → **1 bảng lịch tuỳ
biến** chọn khoảng: bấm ngày bắt đầu rồi ngày kết thúc trên cùng bảng. Ngày đầu/cuối **tô teal
đậm** (chữ trắng); các ngày GIỮA **tô teal cùng màu ~½ opacity** (`rgba(26,46,41,0.5)`) thành dải
liền. Có header đổi tháng (‹ ›), hàng thứ T2..CN, hôm nay gạch chân, và dòng tóm tắt khoảng kèm
thứ (vd "T7 8/8 → T5 20/8").

- `renderCalendar()` vẽ lịch; `calPick(iso)` chốt đầu/cuối (tự sắp min/max nếu bấm ngược, bấm
  lần 3 bắt đầu khoảng mới); state `calMonth` cho tháng đang xem. Vẫn ghi vào `dateFilter.from/to`
  nên `dateFilterRange()`/lọc không đổi.
- **Bug đã sửa cùng lúc:** handler click lịch phải `stopPropagation()` — vì `calPick` render lại
  innerHTML làm phần tử vừa bấm rời DOM, để lọt tới handler "click ngoài" ở document sẽ tưởng
  click ngoài → đóng panel (cùng loại bug đã ghi ở handler Sắp xếp).
- Bỏ 2 `<input type=date>` + helper `viWeekdayLabel` cũ; thêm `viWdShort`/`dmyShort`.

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-23 — Bộ lọc thời gian đăng ký trong panel Bộ lọc (preset + tuỳ chọn lịch)

Thêm nhóm "Thời gian đăng ký" vào panel Bộ lọc (cạnh Tiến độ + Mức quan tâm) — lọc theo
`registered_at` (fallback `created_at`). Preset dạng pill: **Tất cả · Hôm nay · Tuần này · Tháng
này · Tuỳ chọn**. "Tuỳ chọn" xổ 2 ô ngày (`<input type=date>`, bấm ra lịch OS) Từ–Đến, **kèm nhãn
thứ trong tuần** (vd "Thứ Ba") bên cạnh mỗi ngày cho trực quan.

- `dateFilter = { preset, from, to }`; `dateFilterRange()` trả `{start,end}` (end loại trừ):
  hôm nay = 00:00→24h; tuần = Thứ Hai→Thứ Hai (dùng `mondayOf` sẵn có); tháng = mùng 1→mùng 1;
  tuỳ chọn = from 00:00 → (to+1 ngày) 00:00 (gồm cả ngày "đến"); chưa chọn ngày → không lọc.
- `matchesFilters` lọc thêm theo khoảng này; `isAdvancedFilterActive` + chấm đỏ phễu + nút "Xoá
  lọc ✕" đã tính cả lọc thời gian; `resetAdvancedFilters` đưa về "Tất cả". Áp ngay khi chọn.
- Weekday: `viWeekdayLabel()` (Chủ Nhật…Thứ Bảy). Lịch bung ra là lịch native của trình duyệt/OS
  (đã có sẵn cột thứ) — nếu sau muốn lịch tuỳ biến 100% như dropdown trạng thái thì làm thêm.

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-23 — OCR: đọc "thời gian đăng ký" chuẩn hơn (kèm NGÀY, không chỉ giờ)

Trước đây OCR chỉ lấy GIỜ tin nhắn (`message_time` HH:MM) rồi đoán hôm nay/hôm qua. Nhưng
Messenger/Facebook **kèm cả ngày phía sau giờ khi tin KHÔNG phải hôm nay** (vd "22:51 22 THG 8").
Nay đọc đúng cả ngày. Nguyên tắc (Gemini trả THÔ, app tự quy ra ngày cụ thể vì Gemini không
biết chắc giờ/timezone hiện tại):

- **Worker (`worker/intake-worker.js`) — CẦN `wrangler deploy` lại:** thêm 3 field
  `message_day` / `message_month` / `message_year` (INTEGER, nullable) vào schema; prompt hướng
  dẫn: chỉ đọc mốc giờ của TIN NHẮN (không lấy đồng hồ thanh trạng thái điện thoại vd "10:03");
  có ngày kèm ("22 THG 8" = ngày 22 tháng 8, "THG"=tháng) → điền day/month; chỉ điền year khi ảnh
  ghi rõ năm; chỉ có giờ → 3 field ngày = null; KHÔNG tự suy hôm nay/hôm qua.
- **App (`js/app.js`):** `applyOcrToForm` dựng `registered_at` theo 3 quy tắc:
  (1) có ngày trong ảnh → dùng đúng ngày; năm lấy từ ảnh, không có thì năm nay, nếu ngày rơi vào
  tương lai (vd đầu tháng 1 xem tin tháng 12) → lùi 1 năm. (2) chỉ có giờ → hôm nay. (3) chỉ có
  giờ mà giờ > hiện tại → hôm qua. Đã test 5 kịch bản khớp (gồm đúng ca "22:51 22 THG 8").

File: `worker/intake-worker.js`, `js/app.js`

---

## 2026-08-23 — Sửa lỗi OCR 524 (Gemini timeout): Worker timeout+retry + app maxDim 1024 + nút thử lại

Lỗi "Đọc ảnh thất bại: Gemini trả lỗi — error code: 524" thực chất là **timeout của Cloudflare**:
Worker gọi `fetch` sang Gemini, Gemini không trả kịp (~100s) → Cloudflare tự sinh response 524
cho subrequest → Worker gán nhãn sai thành "Gemini trả lỗi". Sửa 2 phía:

**Worker (`worker/intake-worker.js`) — CẦN `wrangler deploy` lại:**
- Thêm `callGeminiOnce()` dùng **AbortController timeout 45s/lần** (dưới ngưỡng ~100s của CF) →
  không treo tới 524 nữa.
- **Tự thử lại tối đa 2 lần** khi lỗi TẠM THỜI (timeout, lỗi mạng, 5xx kể cả 524); 4xx (lỗi cố
  định như sai model/API key) thì dừng ngay, không phí lượt.
- **Thông báo phân loại rõ** thay cho "Gemini trả lỗi" mập mờ: `timeout` (504, "phản hồi quá
  lâu"), `busy` (5xx, "đang bận/quá tải"), `rejected` (4xx, "từ chối — kiểm tra ảnh/model/key"),
  `network`. Log mỗi lần thử qua `wrangler tail`.
- Hằng số `GEMINI_TIMEOUT_MS` / `GEMINI_MAX_ATTEMPTS` chỉnh ở đầu file.

**App (`index.html`, `js/app.js`) — chỉ kéo-để-tải-lại:**
- OCR thu ảnh về **maxDim 1024** (thay 1600) → payload nhẹ + Gemini nhanh hơn → đỡ timeout.
  (Chỉ đổi tại chỗ gọi OCR; upload tài liệu vẫn 1600.)
- Thêm nút **"↻ Thử lại"** cạnh dòng trạng thái OCR: hiện khi đọc ảnh thất bại, bấm gọi lại đúng
  ảnh vừa rồi (`lastOcrFile`). Reset khi mở form / đọc thành công.

File: `worker/intake-worker.js`, `index.html`, `js/app.js`

---

## 2026-08-23 — List view: bỏ nút gọi/Zalo, số ĐT hiện nhiều/ít số theo chỗ trống

Tinh chỉnh list view: **bỏ nút gọi & Zalo** trên mỗi dòng (muốn thao tác thì bấm vào dòng →
trang chi tiết). Chỗ trống dồn cho SỐ ĐIỆN THOẠI: `fitListRow()` giờ thử từ SỐ ĐẦY ĐỦ giảm dần
số digits cho tới khi vừa (thay vì cap ở 3 số) — nguyên tắc: ưu tiên tên đầy đủ, dư chỗ mới hiện
số ĐT, càng dư nhiều càng hiện nhiều số cuối ("…xxxxx"), đủ chỗ thì hiện cả số; chật quá thì ẩn;
tên quá dài mới cắt "…" ở tên. Đã kiểm tra: màn rộng → số đầy đủ; mobile → tên ngắn hiện cả số,
tên vừa hiện vài số cuối, tên rất dài thì ẩn số. Bỏ rule `.row-phone` (không còn nút). `sw.js`
không đổi.

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-23 — List view: LUÔN 1 hàng (kể cả điện thoại) + số ĐT tự co theo diện tích

Đổi lại list view theo yêu cầu: mỗi khách LUÔN gói gọn 1 hàng (bỏ kiểu xuống 2 hàng ở mobile).
Thứ tự 1 hàng: **[Tên đầy đủ] … [SĐT …xxx + nút gọi + Zalo + loại căn + thẻ mức quan tâm]**
(nhóm phải neo sát mép phải bằng `margin-left:auto`). Field null → bỏ hẳn.

- **Số ĐT thích ứng:** hiện "…" + tối đa 3 số cuối; JS `fitListRow()` đo `scrollWidth` vs
  `clientWidth` rồi co dần **3→2→1→ẩn** để nhường chỗ. Ưu tiên GIỮ TÊN đầy đủ (tên để `flex:0 0
  auto`, không co); chỉ khi ẩn hết số ĐT mà vẫn tràn (tên quá dài) mới gắn `.truncate` cắt "…"
  ở tên. Chạy sau khi render + khi `resize` cửa sổ (debounce 120ms). Màn rộng (Mac) → hiện đủ
  "…678" cho mọi khách; điện thoại → tên thường (≤4 âm tiết) vẫn đủ, số ĐT tự ẩn.
- **Thẻ mức quan tâm:** dùng nhãn bậc (Nguội/Ấm/Nóng/Rất nóng) như card. Bỏ chấm ◆ trong list
  (tiết kiệm chỗ cho tên) và cho **nền pill theo màu bậc** (selector `.cust-row .tag-interest.ti-*`
  thắng nền xám của `.tag`) để vẫn phân biệt màu ngay.
- Thu gọn padding/gap/font nhóm phải để tên 4 âm tiết vừa đủ 1 hàng trên 375px.
- Thay `@media (max-width:560px)` (xuống 2 hàng) đã bỏ. `sw.js` không đổi.

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-23 — Lọc trạng thái: thay <select> gốc bằng dropdown tuỳ biến (khớp UI 100%)

`<select id="filter-progress">` (Đang chăm / Đã xong / Tất cả) để trình duyệt/OS tự vẽ (nút +
danh sách bung ra khác hẳn UI, rõ nhất trên Mac/Safari). Thay hẳn bằng **dropdown tuỳ biến** để
cả nút đóng LẪN danh sách bung ra đều đồng nhất với popup Lọc/Sắp xếp — CSS thuần không style
được list của `<select>` gốc nên phải tự dựng.

- `index.html`: `<select>` → `<div class="tool-pop status-select-wrap">` gồm nút `#progress-btn`
  (nhãn + caret ˅) + panel `#progress-pop` (dùng chung shell `.pop-panel`) với 3 nút `.status-opt`.
- `css`: `.status-select-btn` khớp nút Lọc/Sắp xếp (cao 38px, viền/màu); caret xoay 180° khi mở;
  `.status-opt` kiểu menu, mục đang chọn nền teal (`.is-sel`); popup rộng 150px (thắng min-width
  240px của `.pop-panel`).
- `app.js`: state `progressFilter` ('active'|'done'|'all') thay cho `.value` của select;
  `matchesFilters` đọc `progressFilter`; wiring mở/đóng + chọn (áp ngay, gọi `renderList`).
  `closeToolPops()` đóng luôn popup trạng thái → mở Lọc/Sắp xếp hay bấm ra ngoài đều tự đóng nó
  (nhờ wrap mang class `.tool-pop`).

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-22 — Thêm List view (dòng gọn) cho danh sách khách + nút đổi kiểu xem

Bổ sung kiểu xem DÒNG GỌN bên cạnh card view sẵn có (để lướt nhanh khi khách nhiều). Mỗi dòng
hiện đúng thứ tự: **Tên · SĐT + nút gọi/Zalo · Loại căn · Quan tâm** (field null → bỏ, để trống).

- Nút đổi kiểu xem `#view-toggle` (icon `.tool-icon-btn`) trong toolbar, cạnh nút Sắp xếp. Hiện
  icon của kiểu SẼ chuyển sang (≡ = sang list, ▭▭ = về card) + tooltip. Lựa chọn lưu
  `localStorage['crm_view_mode']` → nhớ qua các lần mở.
- `renderList()` rẽ nhánh theo `viewMode`: mode `list` render `.cust-row`, thêm class
  `.list-mode` cho `#customer-list` (bỏ lưới card → xếp dọc 1 cột). Dùng LẠI class nút gọi/Zalo
  (`.card-phone/.card-zalo`) và màu quan tâm (`.ti-*`) của card. Không SĐT → bỏ hẳn dòng SĐT;
  không căn & không quan tâm → bỏ dòng meta.
- Handler click của `#customer-list` khớp thêm `.cust-row` (bấm dòng → `openDetail`; bấm nút
  gọi/Zalo → link chạy bình thường). Không cần đổi `sw.js` (không thêm file mới; app.js/css
  network-first tự lấy bản mới).
- **Cập nhật:** mỗi dòng dồn tất cả trường lên CÙNG 1 HÀNG (`.cust-row` = flex ngang): Tên co
  giãn + cắt "…" khi dài, SĐT/căn/quan tâm giữ nguyên bên phải.
- **Responsive (cập nhật tiếp):** `.cust-row` thêm `flex-wrap: wrap`; ở `@media (max-width:560px)`
  ép `.row-name { flex-basis:100%; white-space:normal }` → **màn rộng (Mac/tablet) 1 hàng đủ
  thông tin như cũ; điện thoại tự xuống 2 hàng** (tên đầy đủ ở hàng 1, SĐT/căn/quan tâm ở hàng 2).

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-22 — Cổng thông báo trong app (Tầng 1: chuông + badge, chưa push)

Thêm "cổng thông báo" (notification engine) — 1 chỗ DUY NHẤT định nghĩa "khi nào nhắc sale
điều gì", để dễ thêm rule mới về sau. Đây là **Tầng 1** (in-app, KHÔNG cần backend): chỉ báo
khi app đang mở/mở lại. Push thật (kêu khi app đóng) là Tầng 2 — cần Cloudflare Worker + cron,
để dành sau.

- **File mới `js/notifications.js`** — bộ máy `window.NOTIF`. Mỗi rule là 1 hàm thuần
  `evaluate(khách, now) → {level,title,body,sortAt}|null`; thêm rule = thêm 1 `registerRule({...})`,
  không đụng `app.js`. `NOTIF.compute(khách)` chạy mọi rule → trả danh sách đã sort (gấp trước).
- **`lastInteractionAt(khách)`** — MỘT hàm duy nhất cho "mốc liên hệ cuối": max của
  `care_stage_updated_at`, note mới nhất `care_stage_history`, note mới nhất `notes_manual`
  (đổi/ghi care stage + thêm ghi chú hồ sơ). Sau này thêm "nhiều note/1 stage" chỉ sửa hàm này.
- **2 rule hiện có:**
  - `call_due` (🔴 urgent): đã tới khung `next_call_at`→`next_call_end` (+30' ân hạn) → "Đến giờ
    gọi"; quá ân hạn mà chưa xác nhận đã gọi → "Quên gọi". Chưa tới giờ → không vào chuông.
  - `hot_idle` (🟠 warn): `interest_level ≥ 60` và `≥ 7 ngày` chưa liên hệ, khách chưa kết thúc.
  - Ngưỡng chỉnh ở `NOTIF_CONFIG` đầu file.
- **UI:** nút chuông 🔔 đặt giữa nút sync và avatar, có chấm đỏ + số. Bấm → panel xổ danh sách;
  bấm 1 dòng → `openDetail()` về trang khách đó. Panel & chuông đóng khi bấm ra ngoài / mở popup
  còn lại. **Header thu gọn:** chuông ẩn đi (giống avatar) — nếu để lại sẽ chiếm chỗ đẩy nút sync
  lệch sang trái, chìm dưới ô tìm; chỉ còn logo · ô tìm · sync như trước.
- **App badge:** `navigator.setAppBadge(tổng số)` / `clearAppBadge()` (có kiểm tra hỗ trợ) — số
  đỏ trên icon PWA. Badge là 1 con số chung của HĐH (không tô màu riêng từng loại).
- Tính lại trong `refreshList()` (dữ liệu đổi) + `setInterval` 30s ("đến giờ gọi" tự nổi theo giờ).
- **`sw.js`:** thêm `/js/notifications.js` vào `APP_SHELL`, **bump `CACHE_NAME` v5→v6** (bẫy #4).

File: `js/notifications.js` (mới), `index.html`, `css/style.css`, `js/app.js`, `sw.js`

---

## 2026-08-22 — Gộp chấm đồng bộ + nút làm mới thành 1 nút trạng thái

Thay `#sync-badge` (chấm màu) + `#reload-btn` (↻) bằng MỘT nút `#sync-btn` phản ánh 4 trạng
thái (chỉ gộp UI, business logic flush/pull/xử-lỗi giữ nguyên):

| Trạng thái | Icon | Màu | Bấm |
|---|---|---|---|
| Synced | ✓ | xanh | làm mới (`handleReload`) |
| Syncing | ↻ | cam, xoay | vô hiệu (bỏ qua) |
| Offline | ⊘ | xám | thử reconnect (`handleReload`) |
| Error | ! | đỏ | hiện & sửa lỗi (`handleSyncError`) |

- Hover hiện tooltip: dòng 1 "✓ Đã đồng bộ", dòng 2 "Lần cuối: HH:MM" (`lastSyncedAt` ghi khi
  vừa chuyển sang trạng thái đã đồng bộ).
- Luồng: ✓ xanh → bấm → ↻ xoay (giữ tối thiểu 0.55s) → xong → về ✓ (`manualSyncing`).
- Nút vẫn hiện ở header thu gọn (đóng vai nút làm mới cũ). Gỡ `.sync-badge`/`.icon-btn-plain`.
- Icon: dùng bộ **SVG "đám mây" (cloud)** — đám mây nét (currentColor theo trạng thái) + ký
  hiệu bên trong: check / mũi tên vòng (xoay chỉ mũi tên) / gạch chéo (cloud-off) / chấm than.
  Ẩn dụ "đồng bộ lên mây". (Glyph text ✓↻⊘! chỉ còn dùng trong CHỮ tooltip.)

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-22 — Gesture "Quay lại" của Android: về danh sách thay vì thoát app

App là SPA đổi màn bằng thuộc tính `hidden`, không tích hợp History API → gesture/nút "Quay
lại" của Android (PWA) không có gì để lùi, ở màn CHI TIẾT khách thì back = THOÁT APP. Sửa:
- Vào màn chi tiết → `history.pushState({screen:'detail'})` (chỉ đẩy khi mới vào, không đẩy
  khi vẽ lại → không phình history).
- Nghe `popstate`: nếu đang ở màn chi tiết → về danh sách (`showAppScreen`), KHÔNG thoát.
- Nút "← Quay lại" và xoá-khách-đang-xem → `closeDetailToList()` (lùi history nếu đang có
  entry 'detail' → đồng bộ, tránh lệch history).
- Các `<dialog>` native (form/lịch/xem ảnh) vốn được trình duyệt tự đóng bằng back.

File: `js/app.js`

---

## 2026-08-22 — Fix: header nhấp nháy khi dừng ở ngưỡng chuyển full↔collapsed

Khi dừng cuộn ngay điểm chuyển trạng thái, header dao động qua lại liên tục (nhấp nháy). Nguyên
nhân: header thu gọn/bung đổi chiều cao trang (sticky chiếm chỗ trong luồng) → trình duyệt tự
chỉnh `scrollY` để giữ nội dung (scroll-anchoring) → scrollY nhảy qua ngưỡng → toggle → lặp vô
hạn dù đã ngừng kéo. Sửa: **`overflow-anchor: none`** trên `html, body` → header đổi trạng thái
KHÔNG làm scrollY tự nhảy → tại một điểm thả tay chỉ còn 1 trạng thái ổn định.

File: `css/style.css`

---

## 2026-08-22 — Fix: gõ tìm khi header thu gọn làm header biến mất (Android/Chrome)

Khi header đang THU GỌN mà chạm ô tìm để gõ, bàn phím ảo Android đổi viewport khiến header
sticky (ô tìm `position:absolute`) biến mất → không thấy từ khoá đang gõ. Xử:
- Chỉ khi ô tìm **CÓ ký tự** (đang gõ) mới **LƯU vị trí cuộn hiện tại**, rồi **bung header đầy
  đủ + về đầu trang + khoá không thu gọn**. Focus mà ô còn RỖNG (chưa nhập / đã xoá hết) → vẫn
  thu gọn bình thường, KHÔNG nhảy về đầu.
- **Xoá hết ký tự → khôi phục ĐÚNG vị trí cuộn đã lưu** lúc bắt đầu gõ. Vì header sticky chiếm
  chỗ trong luồng (đổi chiều cao làm lệch cuộn), khi khôi phục sẽ đổi trạng thái header **tức
  thì (tắt transition tạm bằng class `.no-anim`)** rồi mới scroll → về đúng chỗ, không lệch.

(`searchQueryActive()` = focus && có ký tự; `savedScrollY` lưu/khôi phục; listener
focus/blur/input trên `#search-input`.)

File: `js/app.js`

---

## 2026-08-22 — Header thu gọn: animation mượt hoàn toàn bằng CSS (morph liên tục)

Trước đây chuyển giữa header đầy đủ ↔ thu gọn bị "cứng" vì `display`/`display:contents`/đổi
`flex-direction` đổi tức thì (không animate được). Nay bỏ hẳn cách đó, chuyển sang **morph
liên tục 100% bằng CSS transition** (~0.3s):
- **Ô tìm** đặt `position:absolute`, trượt bằng `top/left/right` (đầy đủ = hàng 3 rộng hết → thu
  gọn = giữa logo và refresh). Vì đổi inset thay vì scale → **co bề rộng mượt, không méo chữ**.
- **Chữ "Sổ Khách" / tabs / sync / avatar** fade (`opacity`) + co (`max-width`/`max-height`)
  về 0 → biến mất mượt thay vì "pop".
- Header `padding`/`gap` cũng transition; chừa `padding-bottom` ở trạng thái đầy đủ cho ô tìm
  absolute. Tôn trọng `prefers-reduced-motion`. Không còn dùng JS transform/FLIP — JS chỉ
  bật/tắt class `.collapsed`.
- Thời lượng: **0.3s** (chữ/tabs fade 0.2s).

File: `css/style.css`, `js/app.js`

---

## 2026-08-22 — Header tự thu gọn khi cuộn (1 hàng: logo · search · refresh)

- Ở đầu trang: header đầy đủ 3 tầng (logo + "Sổ Khách" + sync + refresh + avatar / tabs / search).
- Cuộn xuống: header thu gọn còn **1 hàng ngang**: `logo · thanh tìm · nút refresh` (ẩn chữ tên,
  tabs, chấm sync, avatar) — nhường không gian cho nội dung.
- Kỹ thuật: JS bắt `window` scroll (rAF throttle, ngưỡng trễ 48/16 tránh rung), toggle class
  `.topbar.collapsed`; CSS dùng `display:contents` để "làm phẳng" các hàng lồng nhau thành 1
  hàng rồi ẩn/sắp lại thứ tự. Khi bắt đầu thu gọn thì đóng panel Bộ lọc/Sắp xếp đang mở.

File: `css/style.css`, `js/app.js`

---

## 2026-08-22 — Logo chính thức (icons/logo.svg) gắn khắp app

Dùng `logo.svg` (bản vector polished trong `backup icons`) làm logo CHÍNH: nền vuông xanh
`#1A2C27` + vòng tròn/người cream `#EEECE7` + dấu tích đỏ `#A64737`. Đã strip 15KB metadata
C2PA → còn ~2.6KB. Đặt tại `icons/logo.svg`.

Xuất PNG từ logo.svg bằng QuickLook (`qlmanage`, máy không có rsvg/imagemagick):
`app-icon-192/512.png`, `apple-touch-icon.png` (180), `favicon-32.png`.

Gắn `logo.svg` vào mọi vị trí:
- **Header**: `[logo] Sổ Khách` — nền vuông logo (`#1A2C27`) hoà gần khít vào teal header (`#1A2E29`).
- **Login**: badge logo bo góc trên form đăng nhập.
- **Splash/Loading**: màn tải `#splash` (logo + "Sổ Khách" + 3 chấm đỏ nhấp nháy + "Đang tải
  dữ liệu..."); nền splash đặt `#1A2C27` trùng logo để mark như nổi. Ẩn khi app sẵn sàng
  (`hideSplash`), lưới an toàn 8s.
- **Favicon**: `logo.svg` + PNG 32 fallback.
- **App icon (PWA)**: `app-icon-192/512.png` + `apple-touch-icon.png`.
- Xoá 2 SVG tạm cũ (`logo-mark.svg`, `logo-icon.svg`); `APP_SHELL` dùng `logo.svg`, tăng
  `CACHE_NAME` v4 → **v5**.

File: `index.html`, `css/style.css`, `js/app.js`, `sw.js`, `icons/*`

---

## 2026-08-22 — Sửa panel Bộ lọc/Sắp xếp bị tràn mép phải trên điện thoại

Trên màn hẹp, panel neo `left:0`/`right:0` theo nút nhỏ (lệch trái/phải) bị tràn ra ngoài mép
phải → che mất mũi tên tăng/giảm và nút "Áp dụng"; panel Bộ lọc thì cắt mất tên bậc dài.
Khắc phục: thêm `position:relative` cho `.toolbar`; trong `@media (max-width:560px)` cho panel
neo theo TOOLBAR và trải gần full ngang (`left:16px; right:16px; width:auto`) — không còn tràn.
Desktop giữ nguyên panel gọn neo theo nút (Sắp xếp canh phải).

File: `css/style.css`

---

## 2026-08-22 — Nút "Xoá lọc ✕" cạnh dòng đếm khách

Thêm nút **"Xoá lọc ✕"** ngay bên phải dòng "[x] khách hàng"; bấm → đưa bộ lọc nâng cao về
mặc định (tiến độ = Tất cả, quan tâm ≥ 0%). Nút **chỉ hiện khi đang có lọc nâng cao** (cùng
điều kiện với chấm đỏ trên icon phễu) để giữ UI gọn. Tách hàm dùng chung `resetAdvancedFilters`
(nút trong panel + nút inline), và `updateFilterDot` nay bật/tắt cả chấm đỏ lẫn nút; gọi trong
`renderList` để luôn khớp trạng thái.

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-22 — Panel Sắp xếp đa tiêu chí (tam giác ▲▼, chọn nhiều, Áp dụng)

Đổi panel Sắp xếp từ chọn 1 tiêu chí sang **đa tiêu chí** (multi-key):
- Mỗi tiêu chí (Tiến độ / Quan tâm / Cập nhật / Tên) có cặp **tam giác ▲▼**. Tam giác trên
  sáng = sắp tăng, dưới sáng = giảm; hướng còn lại để màu mặc định (xám).
- **Bấm tam giác** đổi hướng; bấm lại đúng hướng đang bật → **bỏ chọn** tiêu chí đó.
- **Chọn nhiều tiêu chí** cùng lúc; ưu tiên theo thứ tự hàng (Tiến độ > Quan tâm > Cập nhật >
  Tên). Chỉ **áp dụng khi bấm "Áp dụng"** (panel giữ bản nháp `sortDraft` tới khi áp dụng).
- Mặc định = 4 tiêu chí: tiến độ↑ · quan tâm↓ · cập nhật mới nhất↓ · tên A→Z↑ (nút Đặt lại
  mặc định). Không lưu → mỗi lần tải trang về mặc định.
- `currentSort` nay là MẢNG {key,dir}; `sortCustomers` so sánh đa khoá theo thứ tự.
- Fix: handler bấm tam giác render lại innerHTML làm phần tử bị tách DOM → lọt tới handler
  "click ngoài" đóng panel; thêm `stopPropagation`.

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-22 — Thiết kế lại giao diện danh sách (FAB, panel lọc/sắp xếp, header 3 tầng)

- **Nút thêm khách → FAB**: nút tròn "+" nổi góc dưới phải (`.fab`), chỉ hiện ở tab Khách hàng
  (nằm trong `#list-view`). Giữ id `add-customer-btn` nên listener cũ không đổi.
- **Bộ lọc**: thanh ngoài chỉ còn trạng thái (Đang chăm sóc / Đã xong / Tất cả). Các lọc còn
  lại (Tiến độ + Mức quan tâm) chuyển vào **panel Bộ lọc** ẩn dưới icon phễu — Tiến độ dạng
  radio, Mức quan tâm là slider ≥ X%, nút Xoá lọc + Áp dụng. Icon phễu có chấm báo khi đang có
  lọc nâng cao. (Bỏ `<select id="filter-stage">`, đổi sang radio `name="f-stage"`; interest
  đổi từ ô số sang range.)
- **Sắp xếp → icon**: panel sổ ra từng thuộc tính (Tiến độ / Quan tâm / Cập nhật / Tên) với 2
  hướng, + nút Đặt lại mặc định. Trạng thái sort giữ trong biến `currentSort` (không lưu → mỗi
  lần tải trang tự về mặc định). Mặc định đa khoá: tiến độ↑ → quan tâm↓ → cập nhật mới nhất →
  tên A→Z. (Bỏ `<select id="sort-select">`.)
- **Header 3 tầng**: (1) "Sổ Khách" + chấm đồng bộ/↻/avatar; (2) tab Khách hàng/Tổng quan;
  (3) ô tìm kiếm rộng hết có icon 🔍.
- Fix phụ: `.btn-primary.btn-small` bị `.btn-small` đè nền trắng + chữ trắng → mất chữ; thêm
  rule khôi phục nền/chữ primary.

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-22 — Tín hiệu đồng bộ gọn thành 1 chấm màu (chữ hiện khi hover)

Bỏ chữ ở badge đồng bộ, chỉ còn 1 CHẤM MÀU; chữ giải thích hiện khi hover chuột (thuộc
tính `title`, kèm `aria-label` cho screen reader):
- 🟢 Xanh = đã đồng bộ.
- 🟡 Vàng = đang đồng bộ (còn thay đổi chờ đẩy) hoặc chưa tải được bản mới.
- 🔴 Đỏ = offline hoặc kẹt đồng bộ.

`updateSyncBadge` nay set class màu (`sync-green/yellow/red`) thay vì viết chữ; badge vẫn
bấm được để thử lại như trước.

File: `index.html`, `js/app.js`, `css/style.css`

---

## 2026-08-22 — Gọn thanh lọc/sắp xếp + đồng bộ cỡ chữ

- Filter tiến độ (`#filter-stage`): đổi option mặc định "— Mọi bậc —" → **"Tiến độ: tất cả"**
  (mặc định vẫn là tất cả các bậc).
- **Bỏ hẳn filter Đánh giá** (nên chăm / không nên chăm): gỡ `<select id="filter-evaluation">`
  và mọi tham chiếu trong `matchesFilters` / listener / nút Xoá lọc.
- Sort mặc định: bỏ chữ "(mặc định)" ở option "Tiến độ ↑, quan tâm ↓" (vẫn là sort mặc định).
- Đồng bộ cỡ chữ mọi mục trong toolbar về **14px** (trước đây label "Q.tâm ≥" 13px trong khi
  select/nút 16px → nhìn lệch).

File: `index.html`, `js/app.js`, `css/style.css`

---

## 2026-08-22 — Badge đồng bộ báo đúng cả chiều KÉO (không còn "đã đồng bộ" giả)

**Bug:** badge `updateSyncBadge` chỉ nhìn hàng đợi ĐẨY LÊN (`pendingCount`); khi `pull()`
(kéo bản mới về) lỗi mạng thì chỉ log im lặng rồi return → badge vẫn báo "🟢 Đã đồng bộ" dù
dữ liệu đang CŨ (đúng ca Mac lỗi mạng, hiện thiếu 1 khách nhưng vẫn báo đã đồng bộ).

**Sửa:**
- `pull()` giờ trả `{ok, skipped?, error?}` và ghi `_lastPullError` khi kéo lỗi (getter
  `CRM.lastPullError()`), xoá cờ khi kéo thành công.
- Badge thêm trạng thái **🟠 "Chưa tải được bản mới — chạm để thử lại"** khi đã đẩy hết
  nhưng kéo lỗi. Chạm badge ở trạng thái này → thử tải lại.
- Interval 15s: nếu lần kéo trước lỗi và đang online → tự KÉO LẠI (mạng chập chờn có thể
  không bắn event 'online'), kéo được thì vẽ lại danh sách.

File: `js/db.js`, `js/app.js` (không đụng APP_SHELL nên không cần tăng CACHE_NAME)

---

## 2026-08-21 — Chặn trùng khi tạo khách + chuẩn hoá SĐT + nguồn nhiều giá trị

**Bối cảnh bug:** tạo khách trùng SĐT thì bản trùng bị unique index (phone,owner) chặn ở
server, thao tác insert tự bị bỏ ([db.js:369](js/db.js)) → KHÔNG có rác trên Supabase/hàng đợi;
chỉ có 1 "bản ma" tạm trong IndexedDB, tự mất khi `pull()` (reload). Nay chặn NGAY khi lưu.

**1) Chặn trùng khi TẠO khách mới** (so trong danh sách khách của mình, theo SĐT đã chuẩn hoá):
- SĐT chưa có → tạo bình thường.
- SĐT trùng + tên trùng + cùng nhóm nguồn → chặn, báo "trùng lặp".
- SĐT trùng + tên trùng + khác nhóm nguồn → KHÔNG tạo bản mới, chỉ BỔ SUNG nguồn vào khách
  cũ (nguồn thành nhiều giá trị, vd "Quảng cáo + Landing page"), báo đã lưu.
- SĐT trùng + tên KHÁC → chặn, báo "xác nhận lại số điện thoại".
- Nhóm nguồn: manual + ocr = "Quảng cáo"; landing = "Landing page".
- Khi SỬA khách: chặn đổi SĐT trùng khách khác (tránh update vi phạm unique làm KẸT hàng đợi).

**2) Chuẩn hoá SĐT** (`normalizePhoneVN`, đổi tên từ `normalizeOcrPhone`, áp cho mọi lần lưu):
bỏ dấu cách/chấm/gạch, "+84.."/"84..(11 số)" → "0..", thiếu "0" đầu → thêm. "0123 456 789" ≡
"0123456789". Kèm migration `normalize_phones.sql` chuẩn hoá số đang có (báo cáo cặp đụng nhau,
không tự gộp).

**3) source → mảng nhiều giá trị** (jsonb): migration `source_multi_value.sql`. Hiển thị theo
nhóm ("Quảng cáo", "Landing page"), helper `sourceListOf/sourceGroupsOf/sourceDisplay`.

⚠️ **Thứ tự deploy:** chạy `source_multi_value.sql` TRƯỚC khi deploy code (code ghi source dạng
mảng; cột còn là text sẽ kẹt hàng đợi). `normalize_phones.sql` chạy lúc nào cũng được.

File: `js/app.js`, `schema.sql`, `normalize_phones.sql` (mới), `source_multi_value.sql` (mới)

---

## 2026-08-21 — OCR: dán ảnh từ clipboard (thêm cạnh "Nhập từ ảnh")

Ngoài chọn ảnh từ máy như cũ, giờ dán được ảnh trực tiếp từ clipboard — tiện khi chụp
màn hình tin nhắn rồi dán thẳng:
- Nút **"📋 Dán ảnh"** (Clipboard API `navigator.clipboard.read()`) — cần HTTPS + quyền.
- **Ctrl/Cmd+V khi form khách đang mở** dán thẳng ảnh (đường tin cậy nhất, không cần
  xin quyền). Chỉ chặn khi clipboard THỰC SỰ có ảnh — dán chữ (SĐT...) vào ô vẫn bình thường.
- Ảnh dán đi vào đúng luồng OCR hiện có (`handleOcrImage` nhận cả File lẫn Blob).
- Không hỗ trợ / bị chặn quyền → báo nhẹ, gợi ý dùng cách còn lại.

File: `index.html`, `js/app.js`

---

## 2026-08-21 — OCR: suy luận giới tính từ tên (kèm ngưỡng độ chắc chắn)

Trước đây prompt OCR CẤM đoán giới tính. Nay cho phép Gemini suy luận giới tính từ
TÊN tiếng Việt (đa số đoán được), kèm chỉ số `gender_confidence` (0-100):
- Ảnh ghi rõ giới tính → `gender_confidence = 100`.
- Không ghi rõ nhưng có tên → suy từ tên, tự chấm độ chắc chắn.
- Vẫn CẤM đoán giới tính từ ảnh đại diện/khuôn mặt; vẫn cấm đoán tuổi/hôn nhân.
- **Ngưỡng 90% áp ngay trong Worker**: `gender_confidence >= 90` mới lấy; dưới ngưỡng
  (tên trung tính) → `gender = null` → form để trống cho user tự chọn khi rà.

Áp ngưỡng ở Worker (deterministic) thay vì phó mặc model tự lọc. Client không đổi
(vốn chỉ điền gender khi hợp lệ). **CẦN redeploy Worker** thì mới có hiệu lực.

File: `worker/intake-worker.js`

---

## 2026-08-21 — Tự đặt con trỏ ở ô tìm kiếm khi vào app (chỉ máy tính)

Mỗi lần reload / mở lại / lần đầu vào app, con trỏ tự nằm sẵn trong ô tìm kiếm để gõ
ngay, không phải bấm chuột vào ô. Đặt trong `onLoggedIn` (đúng luồng khởi động, không
kích hoạt khi quay lại từ màn chi tiết). Chỉ chạy trên **máy KHÔNG cảm ứng** (Mac/laptop);
trên điện thoại bỏ qua để không tự bật bàn phím ảo mỗi lần mở app.

File: `js/app.js`

---

## 2026-08-21 — Universal search + tìm SĐT theo vị trí bất kỳ

Nâng ô tìm kiếm từ chỉ "phone + tên" thành tìm trên MỌI trường của khách, chia 2 nhánh
theo nội dung gõ vào:

**1) Query TOÀN SỐ → tìm theo SĐT với ưu tiên vị trí:**
- Khớp **từ đầu** (prefix): chỉ cần 1 số cũng ra (`0`, `01`, `012`...).
- Khớp **giữa/cuối**: phải **từ 3 số trở lên** mới ra (`123`, `678`, `6789` ra; còn
  `23`, `2` không ra) — hợp thói quen tìm bằng 3-4 số cuối, tránh ra quá nhiều kết quả.
- Chuẩn hoá `+84/84 → 0` (helper `phoneDigits`) để khớp số gõ dạng `0...`.

**2) Query CÓ CHỮ (kể cả `2n`) → universal search (bỏ dấu) trên mọi trường:**
- Gom hết giá trị của khách vào 1 chuỗi: tên, giới tính, ngày sinh, mệnh, hôn nhân,
  nghề, thu nhập, nơi ở, loại căn, mã căn, mã toà, dự án, giá, mức quan tâm, tiến độ,
  đánh giá + lý do, nguồn, **note của từng bậc chăm sóc** (`care_stage_history[].note`),
  và **ghi chú tay** (`notes_manual[].text`).
- Nhờ vậy gõ `lan tan gia` ra khách có note "lăn tăn giá", gõ `2n` ra khách loại
  căn "2N-2WC"...; vẫn tìm được tên có dấu như cũ (`huong` ra "Hương").
- Chuỗi tìm được cache theo `updated_at` qua `WeakMap` (không đụng object gốc → không
  lỡ đẩy field phụ xuống DB), để gõ phím mượt dù nhiều khách.

Ghi chú: query toàn số CHỈ tìm trong SĐT (cố ý), để gõ 1-2 số không lôi ra hàng loạt
khách trùng số ở giá/%/mã căn. Muốn tìm số trong các trường khác thì gõ kèm chữ.

File: `js/app.js`

---

## 2026-08-21 — Zoom cho trình xem ảnh (pinch / trackpad / nút +−)

Thêm phóng to/thu nhỏ cho trình xem, tôn trọng thói quen từng thiết bị:
- **Android**: tách 2 ngón = phóng to, chụm lại = thu nhỏ; 1 ngón kéo khi đã zoom = di chuyển.
- **Mac/Windows**: pinch trackpad (wheel + ctrlKey) = zoom; cuộn 2 ngón khi đã zoom = di chuyển; chuột kéo = di chuyển; bấm đúp = zoom nhanh/trả 100%.
- **Nút +/−** thủ công + hiển thị % (100%–600%).

Áp dụng cho **ẢNH** (transform scale + translate; `touch-action:none` để app tự bắt
cử chỉ). **PDF** dùng luôn zoom sẵn có của trình xem PDF trình duyệt (pinch/trackpad/
thanh công cụ của nó) nên cụm nút +/− tự ẩn khi xem PDF, tránh nhân đôi/xung đột.

File: `index.html`, `js/app.js`, `css/style.css`

---

## 2026-08-21 — Trình xem ảnh/PDF trong app (nhẹ)

Xem tài liệu không còn bị đẩy sang tab trình duyệt. Thêm 1 dialog xem nhẹ
(`#file-viewer`): **ảnh** dùng `<img>`, **PDF** dùng `<iframe>` (trình duyệt tự
render, KHÔNG kèm thư viện PDF nặng). Định dạng khác vẫn mở tab mới. Có nút
"Mở tab mới" dự phòng + đóng bằng ✕ / bấm nền tối / Esc. `openDocSigned` nhận diện
mime để chọn xem-trong-app hay mở-tab; signed URL nới hạn 300s cho đủ thời gian xem.
Dùng chung cho cả trang chi tiết (chỉ xem) lẫn form Sửa khách.

File: `index.html`, `js/app.js`, `css/style.css`

---

## 2026-08-21 — Chuyển Xoá khách + quản lý tài liệu vào trang Sửa khách

- **Xoá khách**: bỏ khỏi menu "⋯" trên card; giờ là nút **"🗑 Xoá khách"** viền/chữ
  đỏ ở góc dưới TRÁI form Sửa khách (chỉ hiện khi sửa, không hiện khi thêm mới).
  Vẫn confirm 1 bước. Xoá xong tự đóng form + về danh sách nếu đang xem chi tiết.
  Menu "⋯" trên card giờ chỉ còn "Hẹn lịch gọi".
- **Tài liệu**: thêm/xoá tài liệu chuyển vào **form Sửa khách** (mục "Tài liệu đính
  kèm": Xem + Xoá + Thêm; chỉ hiện khi sửa). **Trang chi tiết chỉ còn XEM** (danh
  sách + nút Xem, bỏ Thêm/Xoá; có dòng gợi ý sửa ở trang Sửa khách).

File: `index.html`, `js/app.js`, `css/style.css`

---

## 2026-08-21 — Form thêm khách: gọn "Thường trú", thêm "Ghi chú", "Dự án" thành dropdown

- **Thường trú**: rút còn nửa dòng, xếp ngang hàng "Thu nhập" (bỏ `span-2`),
  placeholder gợi ý nhập tên tỉnh.
- **Ghi chú**: thêm ô "Ghi chú" (`new_note`) trong form → khi Lưu, thành 1 mục
  ghi chú của khách (append qua `CRM.addNote`, cả tạo mới lẫn sửa).
- **Dự án**: đổi từ chips luôn-hiện sang **dropdown chọn nhiều** (nút tóm tắt tên đã
  chọn → panel checkbox), vẫn chọn nhiều + giữ lựa chọn gần nhất làm mặc định +
  Thêm/Quản lý dự án như cũ. `renderProjChips` → `renderProjSelect`.

File: `index.html`, `js/app.js`, `css/style.css`

---

## 2026-08-21 — Lưu trữ tài liệu (ảnh/PDF) + tinh chỉnh OCR (tên, giờ đăng ký, ảnh reg_image)

**Tài liệu khách** (mới): Supabase Storage bucket riêng tư `customer-docs` + bảng
metadata `documents` (`kind/label/storage_path/mime/size...`). File để ở Storage
(không nhét base64 vào DB), xem qua **signed URL** hết hạn 60s. **Cần chạy
`add_documents.sql`** (tạo bảng + RLS + bucket + policy Storage) TRƯỚC khi deploy.
- Trang chi tiết: mục **"📎 Xem tài liệu (N)"** thu gọn được, mỗi tài liệu có nút
  Xem/Xoá; nút **"＋ Thêm tài liệu"** (ảnh + PDF) cho hồ sơ sau này. Ảnh nén trước
  khi lên, PDF giữ nguyên. `db.js`: `listDocuments/uploadDocument/deleteDocument/
  signedDocUrl` (ONLINE-ONLY, không qua hàng đợi offline).
- Ảnh OCR tự lưu thành tài liệu `kind='reg_image'` khi Lưu khách mới.

**Tinh chỉnh OCR:**
- Tên tự viết hoa chữ đầu mỗi từ ("NGO THI MINH THU" → "Ngo Thi Minh Thu").
- `registered_at` lấy từ **giờ tin nhắn** (field `message_time` Gemini trả): giờ đó
  ≤ giờ hiện tại → ngày hôm nay; muộn hơn → hôm qua.
- Model đổi sang `gemini-3.6-flash` (2.5-flash ngừng cho user mới).
- Chuẩn hoá SĐT (cả prompt Gemini lẫn code app `normalizeOcrPhone`): "+84..." → "0...";
  "84"+11 chữ số → "0..."; không bắt đầu "0" và chưa đủ 10 chữ số → thêm "0" đầu.
  Số nước ngoài/khác giữ nguyên.

File: `add_documents.sql` (migration cần chạy), `js/db.js`, `js/app.js`,
`index.html`, `css/style.css`, `worker/intake-worker.js`

---

## 2026-08-20 — Nhập khách từ ẢNH (OCR qua Gemini) — kênh 2 của intake layer

Thêm nút **"📷 Nhập từ ảnh"** trong form Thêm/Sửa khách: chọn ảnh (chụp Zalo/
Messenger/form) → AI vision đọc → TỰ ĐIỀN các ô trong form. **Không lưu thẳng** —
user rà lại (nhất là SĐT) rồi mới bấm Lưu.

- **Cloudflare Worker mới** (`worker/intake-worker.js`, deploy RIÊNG — không thuộc
  Pages) giữ API key Gemini an toàn. Route `POST /ocr`: xác thực bằng access_token
  Supabase (chặn người lạ đốt quota), gọi Gemini `gemini-3.6-flash` (structured
  output → JSON đúng field bảng customers), trả về cho app. Xem `worker/README.md`
  để deploy + đặt secret (GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
  ALLOWED_ORIGIN).
- **App**: `config.js` thêm `WORKER_URL` (rỗng → nút OCR tự ẩn, tính năng tắt).
  Ảnh được thu nhỏ ≤1600px + nén JPEG ở client trước khi gửi (nhẹ, nhanh, đỡ quota).
  Field OCR trả về được lọc hợp lệ trước khi điền (SĐT/tên/giới tính/ngày sinh/
  hôn nhân/nghề/thu nhập/nơi ở/loại căn/mã căn/mã toà/giá/dự án/mức quan tâm);
  ghi chú OCR (`note`) thành 1 note tự nhập sau khi lưu khách.
- Không đổi luồng CRUD/offline hiện có; OCR chỉ prefill form.
- Prompt đã tinh chỉnh theo ảnh mẫu thật (lead form Messenger): liệt kê đúng thuộc
  tính CRM + giá trị hợp lệ, ép null nếu thiếu, CẤM suy đoán (kể cả đoán giới tính
  từ ảnh đại diện), bỏ qua tin nhắn tự động của phía sale, SĐT chỉ lấy chữ số. Loại
  căn khớp linh hoạt bất kể dấu cách/phẩy/gạch nhưng vẫn phân biệt biến thể "+"
  ("3N, 2WC" → "3N-2WC"; "2N+, 2WC" ≠ "2N-2WC").

Chưa build: field `source` (thủ công/OCR/landing) và kênh 3 (leads landing page) —
để các bước sau.

File: `worker/intake-worker.js`, `worker/README.md`, `worker/wrangler.toml`,
`js/config.js`, `js/app.js`, `index.html`, `css/style.css`

---

## 2026-08-20 — Card: mức quan tâm thành viền trái 4 bậc màu + badge (bỏ thanh %)

Đổi cách thể hiện Mức quan tâm trên card danh sách (trang chi tiết giữ nguyên
chấm + %):

- **Viền trái card** tô màu theo 4 bậc quan tâm (dải `::before` rộng 5px, tự bo
  góc theo card nhờ `overflow:hidden`; màu set qua biến `--tier` trong JS).
- **Badge "◆ {nhãn}"** trong hàng tiến độ (nền tint nhạt + ◆/chữ theo màu bậc).
- **Bỏ** thanh "Quan tâm [====] %" cũ trên card (xoá `.interest-line/-bar/-fill/-pct`).
- Ngưỡng & màu (hàm `interestTier` / `INTEREST_TIERS`):
  Nguội `<35%` #8b93a0 · Ấm `35–<60%` #e8a33d · Nóng `60–<80%` #c94f3e ·
  Rất nóng `>=80%` #a8302a.

File: `js/app.js`, `css/style.css`

---

## 2026-08-20 — Ghi chú khách: note TỰ ĐỘNG (từ care stage) + note tự nhập dạng bullet

Đổi "Ghi chú" từ 1 ô text tự do thành danh sách bullet, tách 2 loại:

1. **Note TỰ ĐỘNG** (trên cùng, nhãn "Tự động", không sửa được): lấy note của
   mốc care stage MỚI NHẤT có ghi chú; nếu bậc mới nhất không có note thì quét
   ngược lấy note gần nhất phía trước có ghi chú. KHÔNG lưu xuống DB — tính lại
   mỗi lần hiển thị (`autoNoteFromHistory`) nên luôn bám theo note mới nhất.
2. **Note TỰ NHẬP** (xếp dưới, mới nhất trên): thêm bằng nút **"＋ Thêm ghi chú"**
   ở trang chi tiết, mỗi ghi chú là 1 bullet có ngày giờ, sửa/xoá tại chỗ.

- Hiển thị ở **cả trang chi tiết lẫn card danh sách** (card: note tự động lên đầu,
  cắt còn 2 dòng như cũ).
- **Schema**: thêm cột `notes_manual jsonb` (mảng `{text, at}`, mới nhất ở đầu).
  Cột `notes` text cũ được GIỮ (không xoá), app không dùng nữa; migration tự
  chuyển ghi chú cũ thành 1 bullet đầu tiên. **Cần chạy `add_notes_manual.sql`
  trên Supabase SQL Editor TRƯỚC khi bản deploy mới có hiệu lực** (nếu không sẽ
  báo "column notes_manual does not exist" và kẹt hàng đợi đồng bộ).
- Bỏ ô "Chi tiết (freeform)" trong form thêm/sửa khách (ghi chú giờ nhập ở trang
  chi tiết). `db.js` thêm `addNote/updateNote/deleteNote` (đồng bộ riêng cột
  `notes_manual`, không đụng field khác).

File: `add_notes_manual.sql` (migration cần chạy), `js/db.js`, `js/app.js`,
`index.html`, `css/style.css`

---

## 2026-08-21 — Chống freeze khi mạng yếu: timeout SW + không đá ra login khi offline

Khắc phục lỗi trên Android: mất mạng → tự đăng xuất → kẹt "Đang tải lại...".
- **`sw.js` network-first CÓ TIMEOUT (5s)**: mạng chậm/chập chờn → rơi về cache ngay
  thay vì chờ vô hạn (hết treo "Đang tải lại..." khi reload). Điều hướng không có
  cache khớp → trả app-shell `index.html`. Tăng `CACHE_NAME` v2→v3.
- **Không đá ra màn hình đăng nhập khi chỉ MẤT MẠNG**: nhớ user đăng nhập gần nhất
  (`crm_last_user`); khi mất phiên mà đang offline → GIỮ app, vẫn xem được dữ liệu
  khách đã lưu (IndexedDB). Chỉ về login khi ONLINE (đăng xuất thật / token hết hạn)
  hoặc khi bấm Đăng xuất (xoá "nhớ user" + về login ngay, kể cả offline).

File: `sw.js`, `js/app.js`

---

## 2026-08-21 — Đổi tên bậc 'Không quan tâm-kết thúc' → 'Không chốt-kết thúc'

Đổi tên giá trị care_stage. **Cần chạy `rename_care_stage_khong_chot.sql`** (đổi
ràng buộc CHECK + cột care_stage + trong care_stage_history JSONB). Code: đổi hằng
`CARE_STAGE_DROPPED` (các nơi khác dùng qua hằng nên tự theo); bake tên mới vào
`schema.sql`. Chạy migration TRƯỚC khi deploy để tránh kẹt đồng bộ.

File: `rename_care_stage_khong_chot.sql` (migration cần chạy), `js/app.js`, `schema.sql`

---

## 2026-08-21 — Badge nhắc gọi (đếm ngược) vào trang chi tiết

Mang badge đếm ngược giờ gọi (trước chỉ ở card) vào trang chi tiết, đặt cạnh khu
"lịch hẹn gọi". Đầy đủ tính năng như ngoài card: bấm badge → hộp thoại **"đã gọi"
/ "hẹn lại"** (dùng lại `openCallAction`). 3 trạng thái soon/due/missed dùng lại
class `call-tag` sẵn có. Đếm ngược tự cập nhật mỗi 30s khi đang mở trang chi tiết.

File: `index.html`, `js/app.js`

---

## 2026-08-21 — Liên kết bậc chăm sóc → mức quan tâm (+ tự đánh giá khi kết thúc)

Khi ĐỔI bậc chăm sóc trong form, mức quan tâm tự nhảy theo (map `STAGE_INTEREST`):
- 'Đang chăm sóc qua Zalo' → 60%, 'Đã yêu cầu hỗ trợ hồ sơ' → 70%, 'Đã booking' →
  90%, 'Đã ký hợp đồng mua bán' → 100%.
- 'Không quan tâm-kết thúc' → **0%** và tự set đánh giá **'không nên chăm'**.
- Các bậc còn lại: không đụng mức quan tâm.
- **Kéo slider bằng tay ghi đè** giá trị tự động (giá trị lúc Lưu là giá trị cuối cùng).
- Khách mới không chỉnh gì vẫn mặc định 50% (như cũ).

File: `js/app.js`

---

## 2026-08-21 — Ghi chú: sắp note tự nhập mới-nhất-lên-trên (tường minh theo 'at')

Note tự động (latest care stage) vẫn xếp đầu; các note tự nhập nay sắp **theo mốc
'at' giảm dần** (tạo sau lên trên — cập nhật hơn, tiện chăm sóc). Sort tường minh
khi render (không chỉ dựa thứ tự mảng) nên đúng kể cả với dữ liệu cũ/sau đồng bộ.
Áp dụng cả trang chi tiết lẫn card danh sách.

File: `js/app.js`

---

## 2026-08-21 — Nút "Lưu vào danh bạ" (vCard) ở trang chi tiết

Xuất khách ra danh bạ điện thoại/máy: tạo **vCard 3.0 (.vcf)** rồi dùng **Web Share
API** trên điện thoại (bung màn hình "Thêm liên hệ" — Android/iOS), **fallback tải
.vcf** trên desktop (macOS/Windows mở Danh bạ/Contacts để thêm).
- Tên danh bạ = **Họ tên + loại căn** (FN/N). SĐT → TEL, ngày sinh → BDAY, thường
  trú → ADR. Các trường còn lại (dự án, giá, mệnh, nghề, thu nhập, mức quan tâm,
  tiến độ, đánh giá, ghi chú, nguồn) gộp vào **NOTE** của hồ sơ danh bạ.
- Nút "＋ Lưu vào danh bạ" ở hàng SĐT trang chi tiết. Escape đúng chuẩn vCard
  (`\n`, `\,`, `\;`). Chỉ dùng dữ liệu của khách; do người dùng chủ động bấm.

File: `index.html`, `js/app.js`

---

## 2026-08-21 — Thêm "Nguồn khách" (source) — hệ thống tự detect

Thêm cột `source` cho customers (text): `manual` (Quảng cáo – nhập tay), `ocr`
(Quảng cáo – từ ảnh), `landing` (Landing page, để dành). **Cần chạy `add_source.sql`**
(thêm cột + backfill: có tài liệu reg_image → 'ocr', không có → 'manual').

- Hệ thống TỰ set khi tạo khách (dùng "📷 Nhập từ ảnh" → 'ocr', nhập tay → 'manual');
  user KHÔNG sửa được (không có ô trong form). Landing page sẽ set 'landing' sau.
- Hiển thị "Nguồn khách" ở trang chi tiết (mục Thông tin cá nhân), nhãn thân thiện
  qua `SOURCE_LABELS`/`sourceLabel`.
- Đã bake cột `source` (và `notes_manual`) vào `schema.sql` baseline.

File: `add_source.sql` (migration cần chạy), `js/app.js`, `schema.sql`

---

## 2026-08-21 — Kéo để tải lại (Mac/Windows): bỏ quán tính, chỉ tính kéo chủ động

Trackpad/chuột có "quán tính" (momentum) → flick cuộn lên tới đỉnh, phần trớn dội
lại ở đỉnh cộng dồn khiến reload nhầm; trải nghiệm lệch với Android. Nay lọc bỏ trớn:
- 1 lần kéo hợp lệ phải **bắt đầu chậm** (event đầu < 24) — flick trớn qua đỉnh có
  vận tốc lớn ngay khi chạm đỉnh → bị coi là trớn, bỏ qua cả phiên. (Giống cảm ứng:
  phải bắt đầu ngay tại đỉnh.)
- Sau khi qua đỉnh của cú kéo, delta tụt < 40% đỉnh = trớn → ngừng cộng.
- Ngắt >120ms giữa các event = lần kéo mới. Đã test 4 kịch bản (kéo mạnh/nhẹ/flick
  trớn/kéo-rồi-nhấc) cho kết quả đúng.

File: `js/app.js`

---

## 2026-08-21 — Kéo để tải lại: hỗ trợ trackpad/chuột trên Mac/Windows

Pull-to-refresh trước chỉ nghe sự kiện cảm ứng (`touch*`) → trackpad Mac (phát
`wheel`, không phát touch) không kích hoạt được. Thêm nhánh **`wheel`**: khi đã ở
đỉnh trang mà tiếp tục overscroll LÊN (kéo 2 ngón xuống, `deltaY<0`) đủ ngưỡng →
reload. Rời đỉnh / cuộn xuống / ngừng lăn 200ms → thu thanh về, huỷ. Có cờ chống
kích hoạt trùng. Đã test bằng wheel giả: kéo mạnh ở đỉnh → trigger; kéo nhẹ hoặc
đang cuộn giữa trang → không trigger.

File: `js/app.js`

---

## 2026-08-20 — Kéo để tải lại (pull-to-refresh) → reload toàn bộ trang

Thêm cử chỉ **kéo từ đầu trang xuống để reload cả trang** (`location.reload()`)
— khác nút `↻` (nút đó chỉ làm mới DỮ LIỆU tại chỗ). Vì `sw.js` là network-first
nên reload sẽ lấy HTML/JS/CSS mới nhất từ Cloudflare, tức **áp dụng luôn code vừa
commit/deploy**.

- Ở đầu trang (`scrollY<=0`), kéo xuống (có lực cản) quá ngưỡng ~64px rồi thả →
  hiện thanh "Thả để tải lại" → reload. Chưa đủ ngưỡng thì thanh tự thu về.
- Chỉ dùng touch (điện thoại/tablet). Bỏ qua khi đang có `dialog[open]` (form,
  hộp thoại) để không reload nhầm lúc đang thao tác. Kéo lên / trang đã cuộn khỏi
  đỉnh → không kích hoạt (cuộn bình thường).
- Thanh chỉ báo `#ptr-indicator` (fixed top, trượt từ trên xuống) + spinner khi
  đang tải. Không bump `CACHE_NAME` (APP_SHELL không đổi; network-first tự lấy mới).

File: `index.html`, `css/style.css`, `js/app.js`

---

## 2026-08-20 — Zalo trên Mac: mở thẳng cửa sổ chat trong app native

Trước đây bấm icon Zalo trên Mac chỉ mở trang web `zalo.me/{sdt}` (Android thì
đã vào app native nhờ App Links). Nay trên Mac dùng **deep-link scheme native**
để nhảy thẳng vào cửa sổ chat của đúng khách.

- Dò trên máy Mac (qua `lsregister` + grep `app.asar` + test `open`): app Zalo
  Mac đăng ký scheme `zalo:`, và path mở đúng chat theo SĐT là
  **`zalo://conversation?phone={sdt}`** (các dạng khác như `chat?phone=`,
  `user/`, `open?phone=` chỉ bật app chung chung).
- `zaloLink()` nhận biết nền tảng: **Mac để bàn** → `zalo://conversation?phone=`;
  còn lại (Android/iOS/Windows) → giữ `https://zalo.me/{sdt}`. iPad Safari báo UA
  "Macintosh" nhưng có cảm ứng nên bị loại khỏi nhánh Mac (hàm `isMacDesktop`).
- SĐT chuẩn hoá về dạng `0...` (bỏ `+84/84`) như link web cũ.
- Link web (http) vẫn mở tab mới; link app native (`zalo://`) bỏ `target="_blank"`
  để không để lại tab trắng. Áp dụng cho cả card danh sách và nút ở trang chi tiết.
- Không thêm fallback JS (thử scheme rồi hẹn giờ mở web) vì trên desktop việc dò
  "app đã mở hay chưa" không đáng tin, dễ mở đúp. Máy sale luôn có app Zalo nên
  chấp nhận: Mac chưa cài Zalo thì bấm icon sẽ không mở gì.

File: `js/app.js`

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
