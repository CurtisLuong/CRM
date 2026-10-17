# QA thiết bị thật v2 (T5.3)

> **Trạng thái:** ĐANG LÀM (bắt đầu 2026-10-17).
> **Xong khi (tasks.md T5.3):** danh sách lỗi chặn = 0.
> **Bản kiểm:** `crm-v2-9hf.pages.dev` (nhánh `v2`, dữ liệu **staging** `mksjmpcsfawsiabfhoxe`). Ký hiệu: ✅ đạt · ❌ lỗi · ⚠ lỗi không chặn · ⏳ chưa làm · — bỏ qua (ghi lý do).
> **Baseline T0.6 (quyết định chủ dự án 2026-10-17, cần app gấp):** không chờ 1 tuần đo. Đo **số chạm/thời gian** (Bảng 1 của `docs/runbooks/baseline.md`) ngay trong T5.3, v1 và v2 cạnh nhau. Bảng 2–3 (chất lượng chăm sóc 7 ngày) không chặn cutover; mất số "trước" cho phần đó nếu không đo trước cutover.

## 0. Thiết bị

| Thiết bị | Trình duyệt / vỏ | Ai kiểm | Ghi chú |
|---|---|---|---|
| MacBook | Trình duyệt trong app Claude (Chromium), khổ ≥1024 + giả lập 360–430 | agent | |
| Android (máy hằng ngày) | Chrome | chủ dự án | |
| Android (máy hằng ngày) | APK **thử** `Sổ Khách v2 thử` (`vn.sokhach.crm.v2test`, trỏ `crm-v2`) cài song song app thật | chủ dự án | Build debug ngoài repo từ `android-app/` (chỉ đổi appId, tên, URL); không thay app thật `vn.sokhach.crm` |
| iPhone Safari | — | — | Chưa có thiết bị (tasks.md: "nếu có") |

## 1. Giao diện + chữ Việt (Mac)

| Mục | Sáng | Tối | Kết quả / ghi chú |
|---|---|---|---|
| ≥1024px: Hôm nay, Khách hàng, Hồ sơ, Công việc, Hiệu quả, Cài đặt | ⏳ | ⏳ | |
| 360px / 430px: cùng các màn, không cuộn ngang | ⏳ | ⏳ | |
| Dấu tiếng Việt (Be Vietnam Pro), không vỡ chữ/ô | ⏳ | ⏳ | |

## 2. Hiệu năng

| Mục | Mục tiêu | Mac | Android Chrome | APK thử |
|---|---|---|---|---|
| Mở app khi đã có cache (tới khi thấy danh sách Hôm nay) | < 2 giây | ⏳ | ⏳ | ⏳ |
| Mạng yếu (3G/chập chờn): thao tác ghi vẫn lưu ngay, đồng bộ sau | không mất, không treo | ⏳ | ⏳ | ⏳ |

## 3. Android thật

| # | Kịch bản | Chrome | APK thử | Ghi chú |
|---|---|---|---|---|
| A1 | Đăng nhập, "Đã đồng bộ", font Việt | ⏳ | ⏳ | |
| A2 | Gọi → quay số → về app → hộp ghi kết quả (Chrome: ước lượng; APK: đọc nhật ký cuộc gọi máy, thời lượng chính xác, cuộc "chưa ghi chú") | ⏳ | ⏳ | |
| A3 | Nút Zalo mở đúng chat (lỗi APK cũ: `docs/zalo-android-issue.md`) | ⏳ | ⏳ | |
| A4 | Ghi chú giọng nói (T6.6) | ⏳ | ⏳ | |
| A5 | Offline → ghi → đóng hẳn app → mở lại → bật mạng (lặp E1 trên APK) | (✅ E1 T5.2) | ⏳ | |
| A6 | Ảnh/tài liệu khách: chụp/tải lên, xem | ⏳ | ⏳ | |
| A7 | Lưu trữ khách + khôi phục (T5.10) | ⏳ | ⏳ | |
| A8 | Chuông/thông báo trong app, đổi sáng/tối | ⏳ | ⏳ | |

## 4. Số chạm / thời gian (v1 `crm-cop` vs v2), Android

Đo theo `docs/runbooks/baseline.md` Bảng 1; mỗi ô `chạm / giây`. v1 thao tác trên **khách thử**, hoàn tác sau. Ngân sách: `docs/UX_GUIDELINES.md` §3.

| Thao tác | v1 | v2 | Ghi chú |
|---|---|---|---|
| Ghi **không nghe máy** + lịch gọi lại (vừa cúp máy) | ⏳ | ⏳ | |
| Ghi **nói chuyện được** + ghi chú ngắn + bước tiếp | ⏳ | ⏳ | |
| Nhắn Zalo theo mẫu (tới lúc mở Zalo) | ⏳ | ⏳ | |
| Thêm ghi chú cho khách đang xem | ⏳ | ⏳ | |
| Hẹn gọi lại (đổi lịch) | ⏳ | ⏳ | |
| Thêm khách mới (SĐT + tên + nguồn) | ⏳ | ⏳ | |

## 5. Lỗi

| # | Mức | Mô tả | Nơi | Task |
|---|---|---|---|---|
| L1 | ⏳ cần tái hiện | ~16:30 sau khi bấm "Tải lại" (banner "Có bản mới") để lên bundle `index-rg_L917X.js`, trình duyệt **mất phiên đăng nhập** (không còn `sb-…-auth-token`, chỉ còn `crm_last_user`). App vẫn mở các màn: Đồng nghiệp hiện "Chưa tải được danh sách nhóm… cần chạy SQL/add_team_assign.sql" (thông báo sai nguyên nhân khi chưa đăng nhập); Hôm nay hiện form đăng nhập. Chưa rõ do cập nhật SW hay phiên hết hạn — thử lại: đăng nhập → bấm Tải lại khi có bản mới → còn đăng nhập không | Mac, trình duyệt app Claude | ⏳ |
| L2 | ⚠ | Màn Đồng nghiệp khi lỗi/chưa đăng nhập luôn ghi "cần chạy SQL/add_team_assign.sql" (`src/features/team/route.tsx` hiển thị khi `members.length === 0`) — gây hiểu nhầm | Mac | ⏳ |

**Lỗi chặn còn mở:** ⏳
