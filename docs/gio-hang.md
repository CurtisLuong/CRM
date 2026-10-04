# Giỏ hàng: Dự án → Toà → Căn

Một danh mục chung cho cả CRM:
- **Form khách**: danh sách "Dự án"; ô Mã toà / Mã căn có gợi ý theo dự án đã chọn. Chọn
  mã căn có trong giỏ hàng thì tự điền toà, diện tích, loại căn, tầng, hướng (và giá căn
  nếu đang trống).
- **Bảng tính vay**: chọn dự án → toà → căn. Đơn giá lấy theo giá riêng của căn, không có
  thì lấy giá duyệt của toà. Bàn giao và nhận sổ lấy theo dự án. Cấp nào cũng có "Khác…"
  để gõ tay.

## Dữ liệu (Supabase)

| Bảng | Nội dung chính |
|---|---|
| `projects` | Tên dự án, bàn giao dự kiến, nhận sổ sau bàn giao (tháng), VAT %, KPBT %, tiến độ CĐT (`payment_schedule`) |
| `buildings` | Mã toà, **giá trung bình được duyệt** (`approved_price_per_m2`, đ/m²) |
| `units` | Mã căn, diện tích, tầng, hướng, loại căn, giá riêng (`price_per_m2_override`, để trống = theo toà), trạng thái (`available` / `holding` / `sold`) |

- Mã căn **duy nhất trong 1 toà** (2 toà khác nhau được trùng số căn, vd "0808").
- Xoá dự án thì xoá luôn toà và căn của nó; xoá toà thì xoá luôn căn. Khách đã lưu không
  bị ảnh hưởng.
- Đổi tên dự án trong màn Giỏ hàng thì các khách đang gắn tên cũ cũng được đổi theo.
- `project_options` (danh sách dự án cũ) đã gộp vào `projects`. Bảng cũ vẫn giữ để tham
  khảo, app không dùng nữa.

Migration: `SQL/add_catalog_buildings.sql` (chạy sau `SQL/add_loan_module.sql`).

## Tiến độ thanh toán theo dự án

Mỗi dự án có thể có tiến độ riêng, với số đợt tuỳ ý (cột `projects.payment_schedule`). Dự án
chưa cấu hình thì dùng **mẫu mặc định 7 đợt** (`DEFAULT_SCHEDULE` trong `js/loan/loan-engine.js`).

Cấu hình trong màn Giỏ hàng → mở dự án → **Tiến độ thanh toán**:
- Mỗi đợt gồm: tên, % giá trị căn, thời điểm (sau ký HĐ X ngày / ngày bàn giao / sau bàn giao
  X tháng / ngày cố định), loại đợt (Thường / **Bàn giao** / **Nhận sổ**).
- Cột **% VAT** tự tính để soát. App chặn lưu nếu tổng khác 100%, nếu không có đúng 1 đợt bàn
  giao, hoặc nếu đợt nhận sổ không phải đợt cuối.
- Thời điểm của đợt nhận sổ lấy theo ô "Nhận sổ sau BG" của dự án (chỉ nhập ở một chỗ).
- "Về mặc định 7 đợt" xoá tiến độ riêng của dự án.

**Quy tắc tính tiền từng đợt** (áp cho mọi tiến độ):
- Đợt thường: X% giá thuần + **X% tổng VAT**.
- Đợt nhận sổ (đợt cuối): X% giá thuần, **không VAT**. Phần VAT đó (cùng phần lẻ do làm tròn)
  dồn vào **đợt ngay trước đợt nhận sổ**.
- **KPBT** thu ở đợt bàn giao.
- Ngân hàng giải ngân từ đợt 2.

Ví dụ 10 đợt: Đ1 30% (30% VAT) · Đ2–8 mỗi đợt 5% (5% VAT) · Đ9 bàn giao 30% (35% VAT) + KPBT
· Đ10 nhận sổ 5% (0% VAT).

## Loại căn & diện tích điển hình

Danh sách loại căn chuẩn: **Studio, 1N-1WC, 1N+, 1WC, 2N-2WC, 2N+, 2WC, 2N-2WC-G, 3N-2WC**
(`APT_TYPES` trong `js/app.js`), có thêm "Khác" để gõ tay.

| Cấp | Bảng | Lưu gì |
|---|---|---|
| Dự án | `project_apt_types` | Các loại căn dự án có + **diện tích điển hình chung** |
| Toà | `building_apt_types` | Các loại căn của toà (bắt buộc nằm trong danh sách của dự án — DB chặn nếu sai) + diện tích chỉnh riêng theo toà (trống = theo dự án) |
| Căn | `units.area_m2` | Diện tích riêng của căn |

**Diện tích của 1 căn = riêng của căn → điển hình của loại căn trong toà → điển hình trong dự án.**
Diện tích điển hình chỉ để gợi ý: bảng tính vay và form khách tự điền, sửa tay được.

- Toà chưa tích loại căn nào thì dùng tất cả loại căn của dự án.
- Đổi tên loại căn ở dự án: toà và căn đang dùng tên cũ được database tự đổi theo.
- Xoá loại căn ở dự án: toà cũng bỏ loại đó, còn căn đã nhập vẫn giữ nguyên.
- Lưu hoặc nhập Excel một căn có loại căn chưa khai báo thì loại đó tự được thêm vào dự án
  (và vào toà, nếu toà đang có danh sách riêng).
- Sửa trong màn Giỏ hàng: mở dự án → mục **Loại căn của dự án**; mở toà → **Loại căn của toà**
  (gõ diện tích cho loại chưa tích thì ô đó tự được tích).
- Xem nhanh trong Supabase: view `v_building_apt_types` (loại căn hiệu lực của từng toà) và
  `v_units` (cột `effective_area_m2`, `area_source` = căn / toà / dự án).

Migration: `SQL/add_apt_types_by_project.sql` (chạy sau `add_catalog_buildings.sql`).

## 3 cách nhập dữ liệu

1. **Trong app**: menu avatar → **Giỏ hàng**. Thêm/sửa/xoá dự án, toà (kèm giá duyệt),
   căn. Bấm vào dự án hoặc toà để mở ra. Cần có mạng.
2. **Nhập Excel**: trong màn Giỏ hàng → **⬇ File mẫu** để lấy đúng định dạng → điền →
   **⬆ Nhập Excel** → xem trước số dự án/toà/căn sẽ tạo hoặc cập nhật → **Nhập**.
   - Cột bắt buộc: `Dự án`, `Mã toà`. Các cột khác tuỳ chọn: `Giá duyệt toà (đ/m²)`,
     `Mã căn`, `Diện tích (m²)`, `Tầng`, `Hướng`, `Loại căn`, `Giá riêng (đ/m²)`,
     `Trạng thái` (Còn / Giữ chỗ / Đã bán). Tên cột không phân biệt dấu hay chữ hoa.
   - Ô Dự án hoặc Mã toà để trống thì lấy theo dòng trên (hợp với file CĐT có ô gộp).
   - Căn đã có (cùng toà + mã căn) thì được **cập nhật**. Cột có trong file sẽ ghi đè (ô
     trống = xoá giá trị đó); cột không có trong file thì giữ nguyên dữ liệu cũ.
   - Dòng chỉ có Dự án + Mã toà + Giá duyệt (không có mã căn) dùng để cập nhật giá toà.
3. **Supabase Table Editor**: sửa thẳng các bảng `projects` / `buildings` / `units`. Khi
   thêm căn bằng tay, nhớ điền cả `project_id` và `building_id`. Mở lại app (hoặc mở màn
   Giỏ hàng) để thấy dữ liệu mới.

## Offline

Giỏ hàng được lưu cache trên máy, nên khi mất mạng form khách và bảng tính vẫn dùng được.
Các thao tác sửa giỏ hàng thì cần mạng.
