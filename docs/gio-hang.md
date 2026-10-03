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
