# Runbook — Baseline đo thao tác trên v1 (T0.6)

> **Ai làm:** chủ dự án, **1 tuần** dùng app v1 như bình thường (song song mọi việc khác). Không cần agent.
> **Để làm gì:** có số liệu "trước" để sau cutover so với v2 (PRD §8). Không đặt mục tiêu % trước khi có baseline.
> Ngân sách chạm mà v2 phải đạt: `UX_GUIDELINES.md` §3.

## Cách đếm

- **1 chạm** = 1 lần chạm/bấm vào nút, ô chọn, dòng, tab, nút Lưu, nút Back… **Gõ chữ không tính chạm** (nhưng tính vào thời gian).
- **Bắt đầu** đếm từ màn hình đang đứng khi nảy ra việc (ví dụ: vừa cúp máy, đang ở màn hình Tổng quan) → **kết thúc** khi app báo đã lưu (toast/hộp đóng).
- **Thời gian:** bấm đồng hồ bấm giờ trên điện thoại khác (hoặc nhờ người bấm), làm tròn tới giây. Không cần chính xác tuyệt đối — đo **3 lần** mỗi loại, ghi cả 3.
- Đo trên **thiết bị dùng hằng ngày** (Android có vỏ app). Ghi rõ thiết bị.
- Làm thao tác thật với khách thật là tốt nhất; nếu không có tình huống, làm với 1 khách thử rồi hoàn tác.

## Bảng 1 — Số chạm + thời gian (mỗi ô: chạm / giây)

Thiết bị: ____________ · Phiên bản APK: ______ · Tuần: ___/___ → ___/___

| Thao tác | Bắt đầu từ màn | Lần 1 | Lần 2 | Lần 3 | Ghi chú (chỗ vướng) |
|---|---|---|---|---|---|
| Gọi khách đang ở Tổng quan | Tổng quan | | | | |
| Ghi kết quả **không nghe máy** + đặt lịch gọi lại | Vừa cúp máy | | | | |
| Ghi kết quả **bận, hẹn gọi lại** + chọn giờ | Vừa cúp máy | | | | |
| Ghi kết quả **nói chuyện được** + ghi chú ngắn + bước tiếp | Vừa cúp máy | | | | |
| Nhắn Zalo theo mẫu gợi ý (tới lúc mở Zalo với tin đã chép) | Hồ sơ khách | | | | |
| Thêm 1 ghi chú cho khách đang xem | Hồ sơ khách | | | | |
| Thêm 1 ghi chú khi đang ở Tổng quan (chưa mở khách) | Tổng quan | | | | |
| Hẹn gọi lại (đổi lịch) | Hồ sơ khách | | | | |
| Tích xong 1 việc | Hồ sơ khách | | | | |
| Thêm khách mới (chỉ SĐT + tên + nguồn) | Tổng quan | | | | |

## Bảng 2 — Chất lượng chăm sóc (ghi mỗi tối, 7 ngày)

Lấy số ở **Phân tích / Tổng quan → thẻ "Nhịp chăm sóc khách"** của app v1 (cùng công thức sẽ dùng ở v2).

| Ngày | "Có bước tiếp theo" (x/y) | "Cam kết quá hạn" | Khách mới chờ gọi > 4 giờ (mục Việc cần làm) | Số cuộc đã ghi kết quả trong ngày | Ghi chú |
|---|---|---|---|---|---|
| T2 | | | | | |
| T3 | | | | | |
| T4 | | | | | |
| T5 | | | | | |
| T6 | | | | | |
| T7 | | | | | |
| CN | | | | | |

- **Khách đang chăm không có bước tiếp** = y − x của cột "Có bước tiếp theo".
- **Lời hứa trễ/tuần**: cộng các việc/lịch mà anh **thực tế** làm trễ so với đã hẹn khách trong tuần (đếm tay, kể cả việc chưa ghi vào app): ______

## Bảng 3 — Cảm nhận (cuối tuần, mỗi dòng 1–2 câu)

| Câu hỏi | Trả lời |
|---|---|
| Thao tác nào mất công nhất? | |
| Lúc nào quên ghi lại (gọi xong không ghi, nhắn Zalo không ghi…)? | |
| Thông tin nào hay phải lục lại mà khó tìm? | |
| Có lần nào mất / sai dữ liệu không? Khi nào? | |

## Gửi kết quả

Chụp ảnh / gửi file đã điền cho agent (không có SĐT/tên khách trong các bảng này). Agent ghi số liệu vào `docs/project-status.md` mục Baseline và đánh dấu T0.6 ☑.
