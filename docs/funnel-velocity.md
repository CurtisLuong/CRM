# Phễu khách hàng & tốc độ (SLA) — D-008

Cấu hình (sửa số ở đây là đổi toàn app): `js/velocity.js` → `VELOCITY_CONFIG`.

## Các giai đoạn

[1. Đăng kí mới] → [2. Đang tiếp cận] → [3. Đang chăm sóc] → [4. Xem dự án] → [5. Booking & Làm hồ sơ] → ★ Ký HĐMB

- Giai đoạn 1–2 là tab **Khách mới** (lớp 1, D-001); 3–5 là **Tiềm năng**.
- **★ Ký HĐMB** không phải giai đoạn: bấm nút "Xác nhận đã Ký HĐMB" ở hồ sơ → đóng deal, khách vào mục **Đã mua**. Phễu ghi `Đã ký HĐMB: X căn` (1 khách = 1 căn).
- **Nuôi dài hạn** (tách từ Đang chăm sóc): khách chưa đủ tiền ngay, hẹn 3–6 tháng. Ra khỏi phễu chính, không tính tốc độ / tỉ lệ chuyển đổi. Nút "Đưa lại vào phễu" → về Đang chăm sóc, SLA tính lại.
- **Loại / Không chốt**: kết thúc, không chốt.

## SLA

| Giai đoạn | Mục tiêu lý tưởng | Hạn mức tối đa | Quá hạn mức |
|---|---|---|---|
| Đăng kí mới | < 30 phút | 4 giờ | Thông báo cảnh báo. Đăng ký 6h–22h tính ngay; sau 22h → từ 7h sáng hôm sau; 0h–6h → 7h cùng ngày |
| Đang tiếp cận | 1–2 ngày | 7 ngày | Tối đa gọi 5 lần; quá 7 ngày chưa nói chuyện được → **tự chuyển Loại "Không liên lạc được"** |
| Đang chăm sóc (tư vấn nóng) | 7–10 ngày | 20 ngày | Mục tiêu: chốt lịch xem sa bàn / nhà mẫu / dự án / văn phòng bán hàng. Quá hạn → **tự chuyển Nuôi dài hạn** + hẹn gọi lại 3 tháng |
| Xem dự án | 7 ngày | 14 ngày | Cảnh báo |
| Booking & Làm hồ sơ | 45 ngày | 2,5 tháng | Theo dõi 4 bước hồ sơ |
| ★ Ký HĐMB | không tính giờ | không tính giờ | Điểm chạm kết thúc phễu |

Đồng hồ: Đăng kí mới = từ lúc đăng ký đến cuộc gọi đầu; Đang tiếp cận = cuộc gọi đầu đến Đạt / Loại; các giai đoạn sau = từ lúc vào giai đoạn (khách cũ ở "Hỗ trợ hồ sơ" tính từ lúc vào bậc đó).

Màu: quá mục tiêu = nhãn **vàng**, quá hạn mức = **đỏ đậm** (cùng màu nhãn đếm ngược, `docs/design.md`).

## Tự chuyển + hoàn tác

- App kiểm tra mỗi lần mở / tải lại danh sách, chỉ khách mình phụ trách, có thông báo nhỏ khi vừa chuyển.
- Khách mới bị tự loại: mở lại ở hộp Khách mới ("Mở lại") → đồng hồ tính lại từ lúc mở.
- Khách tự chuyển Nuôi dài hạn: hồ sơ hiện dòng "App đã tự chuyển…" + nút **Hoàn tác** trong 3 ngày (`autoUndoDays`).
- Khách đã quá hạn từ trước khi có tính năng: được thêm trọn 1 hạn mức tính từ 2026-10-10 (`autoSince`) rồi mới tự chuyển.

## Checklist Booking & Làm hồ sơ

Trên thẻ "Tốc độ phễu" ở hồ sơ, 4 ô tích (mỗi bước có hạn tính từ bước trước):

1. Xác nhận cư trú — chuẩn 3–5 ngày (tính từ lúc Booking)
2. Xác nhận điều kiện nhà ở — chuẩn ~15 ngày sau bước 1
3. CĐT/Sở thẩm định đạt — chuẩn 5–7 ngày
4. Thông báo ký HĐMB

Tích = ghi 1 dòng "Hồ sơ: ✓ …" vào lịch sử chăm sóc; bỏ tích (có hỏi lại) = xoá dòng đó.

## Ở đâu trong app

- Thẻ khách / thẻ Khách mới: nhãn SLA khi quá mục tiêu / quá hạn.
- Hồ sơ: thẻ "Tốc độ phễu" (thanh thời gian, checklist, nút Ký HĐMB / Nuôi dài hạn / Hoàn tác).
- Tổng quan: nhóm "Quá hạn mức SLA phễu"; khách mới quá 4 giờ tô đỏ; chuông thông báo.
- Phân tích: thẻ "Phễu & tốc độ (SLA)" (số khách, thời gian TB so với mục tiêu / hạn mức, số khách đang quá hạn, % chuyển đổi, nút thắt); Pipeline có ô "★ Đã ký HĐMB".
- Bộ lọc danh sách: Trong phễu · Nuôi dài hạn · Đã mua · Không chốt · Tất cả.
