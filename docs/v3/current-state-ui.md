# Khảo sát hiện trạng UI/UX v2 — 2026-10-18 (Luồng B · B0)

> Nguồn: app v2 build từ nhánh `v2` @ 484cb37 (= production `crm-cop`, cutover 2026-10-17), chạy offline với **12 khách giả** (không dùng dữ liệu thật), chụp 360px sáng/tối + 1280px sáng.
> Ảnh chụp: thư mục scratchpad của phiên (không commit). Chụp lại: kịch bản `tour.cjs` (Playwright, seed IndexedDB như `tests/e2e/*`).
> Nhãn: **FACT** = thấy trên ảnh chụp/code · **HYPOTHESIS** = suy đoán, cần Curtis xác nhận trên máy thật.

## 1. Bản đồ màn

| Màn | Route | Ghi chú nhanh |
|---|---|---|
| Hôm nay | `/`, `/today` | NBA + Sức làm + Hàng đợi (4 tab) + Phiên gọi |
| Khách hàng | `/khach-hang` | Tiềm năng / Khách mới, bộ lọc, tệp đã lưu, Retarget |
| Khách mới | `/khach-moi` | Lớp 1 (D-001) |
| Hồ sơ | `/ho-so/:id` | Đầu hồ sơ, bước tiếp, Brief, 5 tab, Thông tin thêm, Lưu trữ |
| Công việc | `/cong-viec` | Quá hạn / 7 ngày tới |
| Hiệu quả | `/hieu-qua` | Chăm sóc, SLA, phễu, Marketing |
| Khác | `/gio-hang`, `/tinh-vay`, `/cai-dat`, `/thong-bao`, `/dong-nghiep`, `/intake` | — |

Khung: thanh dưới 5 nút (mobile), rail trái (desktop), ⌘K, nút ＋. Design system v3 "Signal" (`docs/DESIGN_SYSTEM.md`) đã áp; dark mode chạy được.

## 2. Vấn đề UI/UX thấy được

Mức: **P1** = cản việc hằng ngày · **P2** = khó chịu/khó hiểu · **P3** = đánh bóng.

| # | Màn | Vấn đề | Loại | Mức | Nhãn |
|---|---|---|---|---|---|
| U1 | Hồ sơ | Mã nội bộ lộ ra người dùng: kết quả gọi `busy`, `no_answer`; nguồn `facebook_ads`; ngày dạng `2026-10-04T02:00:00.000Z` | Chữ | P1 | FACT |
| U2 | Hôm nay | Mọi dòng đều nhãn **P0** → nhãn ưu tiên không phân biệt được gì; chữ tiếng Anh "Next Best Action" | Thứ bậc | P1 | FACT |
| U3 | Hôm nay | Mỗi dòng có 4 nút icon không nhãn + nút "Ghi tương tác" + đôi khi "Xong" → 5–6 nút/dòng, khó biết nút nào là gì, dòng cao ~140px (360px chỉ thấy ~3 khách/màn) | Mật độ | P1 | FACT |
| U4 | Hôm nay | Lý do lặp chữ: "Xác nhận cư trú · 3–5 ngày · Xác nhận cư trú · 3–5 ngày"; dòng "Đến giờ / quá giờ hẹn gọi · quá hạn" khó đọc | Chữ | P2 | FACT |
| U5 | Khách hàng (360) | Màn đầu chỉ thấy nút + bộ lọc (6 ô chọn + tên tệp + Xoá lọc); danh sách khách bắt đầu ở ~1000px | Bố cục | P1 | FACT |
| U6 | Hồ sơ | Bậc chọn bằng `<select>` gốc trong đầu hồ sơ; "Brief · 20 giây" chiếm ~1 màn với 7 ô phần lớn "Chưa biết" + câu hỏi gợi ý → đẩy dòng thời gian xuống | Thứ bậc | P1 | FACT |
| U7 | Hồ sơ (1280) | Thanh hành động Gọi/Zalo/Ghi chú/Hẹn nổi giữa trang, đè lên nội dung Brief, không thẳng cột nội dung | Bố cục | P2 | FACT |
| U8 | Hồ sơ | "Thông tin thêm" liệt kê ~14 trường, phần lớn "Chưa biết" | Mật độ | P2 | FACT |
| U9 | Hiệu quả (360) | Trang dài ~8.300px, rất nhiều thẻ con chữ nhỏ; khó thấy 1–2 con số quan trọng nhất | Thứ bậc | P2 | FACT |
| U10 | Công việc | Mỗi hẹn gọi 3 dòng chip (Hẹn gọi · Lịch hẹn · quá hạn) → danh sách rất dài | Mật độ | P2 | FACT |
| U11 | Khung (360) | Tiêu đề bị cắt "Khách hà…", "Hồ sơ kh…" do ô trạng thái đồng bộ; tiêu đề lặp 2 lần (thanh trên + H1) | Bố cục | P2 | FACT |
| U12 | Khách mới | Chữ nội bộ "Lớp 1 · … theo D-001" hiện cho người dùng | Chữ | P3 | FACT |
| U13 | Hồ sơ | Ghi chú đăng ký kiểu lạ hiện `[object Object]`; Hôm nay **trắng màn** nếu một trường có kiểu lạ (không có ErrorBoundary) | Độ bền | P2 | FACT (dữ liệu giả sai kiểu); khả năng gặp với dữ liệu thật: HYPOTHESIS |
| U14 | Hôm nay | "Sức làm", "Brief", "Cơ hội", "Phiên gọi" — thuật ngữ mới, chưa rõ người dùng hiểu không | Chữ | P3 | HYPOTHESIS |

## 3. Điểm tốt nên giữ

- Dark mode đủ tương phản; font tiếng Việt (Be Vietnam Pro) hiển thị dấu tốt.
- Desktop: rail trái + ⌘K gọn; nội dung giới hạn chiều rộng dễ đọc.
- Khách mới: danh sách gọn, trạng thái gọi rõ — mẫu tốt cho các danh sách khác.

## 4. Lưới an toàn hiện có (B5)

FACT: 26 file e2e (`tests/e2e/`, 360/390/1280) + unit test (`npm run check`). Màn Hôm nay, Hồ sơ, Khách hàng, Công việc đều có e2e — đủ làm lưới trước khi sửa UI. Cần thêm ảnh chụp chuẩn (visual) nếu muốn bắt lỗi bố cục: HYPOTHESIS, chưa quyết.

## 5. Việc tiếp theo

B1: Curtis nói điều không thích khi dùng thật → `docs/v3/feedback.md`, gộp với bảng trên → B3 lộ trình.
