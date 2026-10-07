# Giỏ hàng: Dự án → Toà → Căn

Một danh mục chung cho cả CRM:
- **Form khách**: danh sách "Dự án"; ô Mã toà / Mã căn có gợi ý theo dự án đã chọn. Chọn
  mã căn có trong giỏ hàng thì tự điền toà, diện tích, loại căn, tầng, hướng (và giá căn
  nếu đang trống).
- **Bảng tính vay**: chọn dự án → toà → căn. Đơn giá lấy theo giá riêng của căn, không có
  thì lấy giá duyệt của toà. Bàn giao và nhận sổ lấy theo dự án. Cấp nào cũng có "Khác…"
  để gõ tay.

## 3 lớp dữ liệu: lớp dưới để trống thì dùng giá trị lớp trên

Thứ tự hiển thị trong màn Giỏ hàng đúng theo bảng dưới.

| Lớp | Thuộc tính | Bảng / cột |
|---|---|---|
| **1. Dự án** | Tên dự án | `projects.name` |
| | Loại căn + diện tích điển hình theo từng loại | `project_apt_types` |
| | Giá điển hình (tr/m², lưu theo đồng) | `projects.typical_price_per_m2` |
| | VAT (% giá thuần) · KPBT (% giá thuần) | `projects.vat_rate`, `kpbt_rate` |
| | Bàn giao dự kiến · Nhận sổ sau bàn giao | `projects.handover_date`, `title_after_months` |
| | Tiến độ thanh toán | `projects.payment_schedule` (trống = mặc định 7 đợt) |
| **2. Toà** | Mã toà | `buildings.code` |
| | Loại căn (⊂ dự án) + diện tích theo loại (trống = dự án) | `building_apt_types` |
| | Giá điển hình (trống = dự án) | `buildings.approved_price_per_m2` |
| | Dự kiến bàn giao (trống = dự án) | `buildings.handover_date` |
| **3. Căn** | Mã căn · tầng · hướng · trạng thái | `units.code`, `floor`, `direction`, `status` |
| | Loại căn (⊂ toà — database chặn nếu sai) | `units.apt_type` |
| | Diện tích (trống = loại căn của toà → dự án) | `units.area_m2` |
| | Giá (trống = toà → dự án) | `units.price_per_m2_override` |

Cả app (form khách, bảng tính vay, màn Giỏ hàng) đều lấy giá trị **hiệu lực** qua cùng các hàm
trong `js/catalog.js` (`unitArea`, `unitPrice`, `buildingPrice`, `buildingHandover`…), nên số liệu
luôn khớp nhau. Trong Supabase, xem nhanh ở view `v_units` / `v_buildings` (cột `effective_*` và
`*_source` = căn / toà / dự án).

- Bảng tính vay: sửa ngày bàn giao thì lưu vào **đúng lớp đang cung cấp giá trị** (toà có ngày riêng
  thì lưu vào toà, không thì lưu vào dự án). Nhận sổ sau bàn giao luôn lưu vào dự án.
- Màn Giỏ hàng: giá nhập theo **tr/m²** (vd `19,91153`). Gõ đủ số đồng (`19911530` hoặc
  `19.911.530`) app cũng hiểu đúng.
- Mã căn duy nhất trong 1 toà. Xoá dự án thì xoá luôn toà và căn; xoá toà thì xoá luôn căn. Khách
  đã lưu không bị ảnh hưởng.
- Đổi tên dự án thì các khách đang gắn tên cũ cũng được đổi theo.

Migration theo thứ tự: `add_loan_module.sql` → `add_catalog_buildings.sql` →
`add_apt_types_by_project.sql` → `catalog_layers_v2.sql`.

## 3 cách nhập dữ liệu

1. **Trong app**: menu avatar → **Giỏ hàng**. Thêm/sửa/xoá dự án, toà (kèm giá duyệt),
   căn. Bấm vào dự án hoặc toà để mở ra. Cần có mạng.
2. **Nhập Excel**: trong màn Giỏ hàng → **⬇ File mẫu** để lấy đúng định dạng → điền →
   **⬆ Nhập Excel** → xem trước số dự án/toà/căn sẽ tạo hoặc cập nhật → **Nhập**.
   - Cột bắt buộc: `Dự án`, `Mã toà`. Các cột khác tuỳ chọn: `Giá toà (tr/m²)`, `Mã căn`,
     `Loại căn`, `Tầng`, `Hướng`, `Diện tích (m²)`, `Giá riêng (tr/m²)`, `Trạng thái` (Còn /
     Giữ chỗ / Đã bán). Tên cột không phân biệt dấu hay chữ hoa. Giá nhỏ hơn 1000 được hiểu là
     triệu/m².
   - Loại căn chưa khai báo thì tự được khai báo vào dự án (và vào toà nếu toà có danh sách
     riêng) trước khi ghi căn.
   - Ô Dự án hoặc Mã toà để trống thì lấy theo dòng trên (hợp với file CĐT có ô gộp).
   - Căn đã có (cùng toà + mã căn) thì được **cập nhật**. Cột có trong file sẽ ghi đè (ô
     trống = xoá giá trị đó); cột không có trong file thì giữ nguyên dữ liệu cũ.
   - Dòng chỉ có Dự án + Mã toà + Giá toà (không có mã căn) dùng để cập nhật giá toà.
3. **Supabase Table Editor**: sửa thẳng các bảng `projects` / `buildings` / `units`. Khi
   thêm căn bằng tay, nhớ điền cả `project_id` và `building_id`. Mở lại app (hoặc mở màn
   Giỏ hàng) để thấy dữ liệu mới.

## Offline

Giỏ hàng được lưu cache trên máy, nên khi mất mạng form khách và bảng tính vẫn dùng được.
Các thao tác sửa giỏ hàng thì cần mạng.

## Tìm căn và khách phù hợp

Trong Giỏ hàng, mở “Tìm căn / khách phù hợp” để tìm mã căn, dự án, toà, loại căn, ghi chú; lọc trạng thái, hướng, tầng, diện tích và giá. Xoá tìm để trở lại màn quản lý. Kết quả 50 căn/lần, có Xem thêm.

- Giá tìm kiếm là tổng gồm VAT + KPBT, tính bằng LoanEngine và giá / diện tích hiệu lực của catalog. Không dùng giá thuần trong hồ sơ khách để giả định ngân sách mua.
- Từ hồ sơ Tiềm năng: “Tìm căn phù hợp” chỉ đối chiếu dự án và loại căn đã ghi với căn còn hàng. Có thể nhập giá tối đa riêng. Hướng, tầng, diện tích trong hồ sơ chỉ dùng để xếp ưu tiên và giải thích, không suy nhu cầu từ ghi chú tự do.
- Từ căn còn hàng: “Tìm khách phù hợp” đối chiếu khách đang hoạt động, cho biết số khách thiếu dự án / loại căn; có Xem thêm và mở hồ sơ trực tiếp.
- Thiếu dữ liệu giá / diện tích không được coi là đạt một khoảng lọc tương ứng. Alias 2PN / 2 phòng ngủ chỉ chỉ số phòng, không tự đoán số WC.
- Cache giỏ hàng mới tách theo tài khoản, kéo đủ mọi trang của cả năm bảng trước khi thay cache. Cache giỏ hàng cũ không xác định user không tự chuyển; cần online một lần để nạp lại.
