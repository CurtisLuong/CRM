# Module Tính khoản vay NOXH

Tính dòng tiền cho khách: phiếu giá → 7 đợt thanh toán (khách trả / ngân hàng giải ngân)
→ lịch trả nợ từng tháng → tất toán sớm → xuất PDF A4. **Đã tích hợp sẵn vào CRM.**

## 1. File nằm ở đâu

```
js/loan/
├─ loan-engine.js   ← "bộ não": tính giá, tiến độ, khoản vay, lịch trả nợ, tất toán (chạy được cả Node)
├─ loan-store.js    ← lưu/đọc Supabase (dự phòng localStorage)
├─ loan-pdf.js      ← xuất PDF A4 (html2pdf từ cdnjs; không tải được → hộp thoại In)
├─ loan-ui.js       ← giao diện (form + kết quả), API: LoanModule.mount(el, opts)
└─ loan-crm.js      ← "keo dán" vào CRM: tab "Tính vay" + mục trong trang chi tiết khách
css/loan.css                ← style, mọi class tiền tố .lm- (không đụng CSS cũ)
SQL/add_loan_module.sql     ← tạo bảng Supabase + preset ngân hàng + dữ liệu Tràng Cát
tests/loan-engine.test.js   ← test khớp phiếu CĐT căn R30413
dev/loan-demo.html          ← trang chạy thử độc lập
```

Thứ tự `<script>` trong `index.html` BẮT BUỘC: engine → store → pdf → ui → crm, và
tất cả nằm SAU `app.js` (loan-crm.js dùng biến `sb`, `allCustomers` của app.js).

## 2. Dùng trong CRM

- **Màn "Tính vay"** (bảng Tiện ích): hàng đầu gồm **Khách hàng** · **Tư vấn viên** (1 hàng,
  tự xuống dòng khi hẹp). Tư vấn viên (in trên PDF) nhập tên + SĐT một lần, lưu theo từng máy.
  Khách hàng không bắt buộc: bấm → danh sách khách Tiềm năng đang chăm (mình phụ trách, chưa Đã mua /
  Loại) + ô tìm theo tên / SĐT (dùng chung bộ tìm của ô tìm tổng, gõ không dấu được). Chọn khách →
  bảng tính dựng lại, điền sẵn dự án / toà / mã căn / loại căn / diện tích; chính sách dự án (VAT,
  KPBT, tiến độ CĐT, bàn giao) tự lấy theo dự án trong giỏ hàng; "Lưu phương án" gắn vào khách đó.
  ✕ = bỏ chọn, về bảng tính độc lập.
- **Trang chi tiết khách → "Tính khoản vay"**: bấm 💰 → bảng tính điền sẵn mã căn +
  diện tích của khách. "💾 Lưu phương án" lưu gắn với khách; các phương án đã lưu hiện
  thành danh sách phía trên, bấm "Mở" để mở lại.
- Chạy thử không cần đăng nhập: mở `dev/loan-demo.html` bằng Live Server.
- Test: `node tests/loan-engine.test.js` → thấy `Tất cả khớp ✅` là OK.

## 3. Tạo bảng trên Supabase (làm 1 lần)

1. Vào **Supabase Dashboard → SQL Editor → New query**.
2. Mở `SQL/add_loan_module.sql`, copy **toàn bộ**, dán vào → **Run**.
3. Kiểm tra **Table Editor** thấy các bảng mới:

| Bảng | Dùng để |
|---|---|
| `projects` | Dự án (VAT, KPBT, ngày bàn giao, tiến độ CĐT) |
| `project_unit_types` | Loại căn + **đơn giá/m² chuẩn** |
| `units` | Từng căn (giá chỉnh tay theo hướng/tầng) — để sẵn cho giỏ hàng |
| `bank_presets` | Gói vay các ngân hàng |
| `loan_settings` | Lưu "lần chỉnh cuối" (lãi suất, ân hạn…) |
| `loan_quotes` | Phương án đã lưu, gắn với khách |

**Dự án → Toà → Căn trong bảng tính lấy từ Giỏ hàng** (bảng `projects` / `buildings` /
`units`), xem [gio-hang.md](gio-hang.md). Chọn toà thì đơn giá = giá duyệt của toà; chọn căn
thì tự điền diện tích, loại căn, giá riêng. Bàn giao và nhận sổ (mặc định 1,5 tháng) lấy theo
dự án; sửa trong bảng tính sẽ **ghi ngược vào dự án**. Dự án gõ tay ("Khác…") thì nhớ lần nhập
cuối trong `loan_settings`. VAT/KPBT/tiến độ CĐT sửa trong màn Giỏ hàng (VAT, KPBT) hoặc cột
`payment_schedule` của bảng `projects`. Bảng `project_unit_types` không còn dùng.

## 4. Offline / PWA

Các file của module đã có trong `APP_SHELL` của `sw.js`. Phần tính chạy offline.
Xuất PDF cần mạng lần đầu để tải html2pdf. "Lưu phương án" gọi thẳng Supabase (không qua
hàng đợi offline của `db.js`) → mất mạng sẽ báo lỗi, tính + PDF vẫn dùng bình thường.

## 5. Quy tắc tính (để đối chiếu)

| Mục | Quy tắc |
|---|---|
| Giá thuần | Diện tích × đơn giá (hoặc nhập tay để khớp CĐT tuyệt đối) |
| VAT / KPBT | 5% / 2% giá thuần (sửa theo dự án trong bảng `projects`) |
| Đợt 1–5 | % × giá gồm VAT |
| Đợt nhận sổ (`role: title`) | % × giá thuần, **không VAT** |
| Đợt bàn giao (`role: handover`) | Giá FULL − các đợt khác (gồm KPBT + phần VAT dồn từ đợt nhận sổ) |
| Khoản vay | Tỷ lệ vay × giá gồm VAT. Ngân hàng giải ngân từ đợt 2, không tính KPBT |
| Lãi kỳ | Dư nợ thực tế × lãi năm × số ngày thực tế ÷ 365 |
| Gốc kỳ | Dư nợ ÷ số kỳ còn lại (gốc giảm dần, tự tính lại mỗi lần giải ngân thêm) |
| Ân hạn | Tính từ lần giải ngân đầu hoặc cuối (chọn trong form) |
| Phí tất toán | % × dư nợ còn lại, theo năm vay (năm 1 = 12 tháng đầu) |

**Đổi tiến độ CĐT cho dự án khác:** sửa cột `payment_schedule` (JSON) trong bảng `projects`. Mỗi đợt:
- `due.type`: `offsetDays` (T + số ngày), `handover` (ngày bàn giao), `afterHandoverMonths` (sau bàn giao X tháng), `date` (ngày cố định)
- `role`: `handover` cho đợt bàn giao, `title` cho đợt nhận sổ

---

## 6. Việc cần làm định kỳ

- **Mỗi 6 tháng (01/01 và 01/07):** NHNN công bố lãi suất mới → cập nhật `rate_tiers` trong bảng `bank_presets`.
- **Khi có biểu phí thật từ ngân hàng:** sửa `prepay_fees`, ví dụ `[3,3,2,1,1]` = năm 1: 3%, năm 2: 3%, năm 3: 2%, năm 4–5: 1%, từ năm 6: miễn.

---

## 7. Gỡ lỗi nhanh

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Không thấy dự án từ Supabase, chỉ thấy "Happy Home Tràng Cát" mặc định | Chưa chạy `SQL/add_loan_module.sql` |
| Lưu phương án báo lỗi `permission denied` / 404 | Chưa chạy SQL, hoặc đang mất mạng |
| Lỗi `LoanEngine is not defined` | Sai thứ tự file JS |
| PDF bị trắng hoặc lỗi font | Mạng chặn cdnjs → dùng hộp thoại In thay thế |

Mở Console (F12) — module ghi lỗi với tiền tố `[loan]`.
