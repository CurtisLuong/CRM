# Bản đồ tài liệu và cách tổ chức repo

> Cập nhật 2026-10-16 cho đại tu v2. `CLAUDE.md` = `AGENTS.md` (nguyên tắc cốt lõi + chỉ dẫn đọc). Tài liệu chuyên đề chứa chi tiết; đọc theo task, không đọc tuần tự toàn bộ.

## Bộ quy định v2 (nguồn chuẩn)

| File | Nội dung | Đọc khi |
|---|---|---|
| `PRD.md` | Mục tiêu, 5 ưu tiên, đối chiếu v1 → v2, tính năng F-01…F-14 + nghiệm thu, ngoài phạm vi, chỉ số | Chọn/thiết kế/nghiệm thu tính năng |
| `tasks.md` | Sóng, phụ thuộc, nhóm song song, thẻ task (Đọc/Sở hữu/Xong khi), bảng trạng thái, việc của chủ dự án | Mỗi phiên làm việc v2 |
| `ARCHITECTURE.md` | Stack, cấu trúc `src/`, **hợp đồng dữ liệu (§3)**, đồng bộ, AI/Worker, cầu nối Android, build/PWA, chuyển đổi, bảng ánh xạ v1 → v2 | Chạm dữ liệu, sync, schema, build, deploy |
| `DESIGN_SYSTEM.md` | DS v3 "Signal": token sáng/tối, chữ, khoảng cách, chuyển động, icon, component, bố cục | Mọi việc giao diện v2 |
| `UX_GUIDELINES.md` | IA 4 tab, ngân sách số chạm, chuẩn Hôm nay/Hồ sơ, tín hiệu & gợi ý, luồng chuẩn, Hiệu quả, checklist | Mọi việc trải nghiệm v2 (đọc cùng DS) |
| `prompts.md` | Prompt AI trong app (Worker `/ai`) + mẫu prompt cho coding agent | Sửa AI; giao việc cho agent |
| `decisions.md` | Chỉ mục + sổ quyết định D-001…D-015, quy trình khi xung đột | Xung đột nguyên tắc, cần tiền lệ |

## Tài liệu nghiệp vụ chuyên đề (vẫn hiệu lực ở v2; đường dẫn code là của v1 tới khi T5.5 cập nhật)

| File | Nội dung |
|---|---|
| `funnel-velocity.md` | Phễu 5 giai đoạn, SLA, tự chuyển, checklist Booking (D-008) |
| `huong-dan-follow-up.md` | Nhịp follow-up, khung giờ gọi, mẫu Zalo (D-005) |
| `huong-dan-nhom.md` | Nhóm, giao khách (D-003) — hướng dẫn cho chủ dự án |
| `gio-hang.md` | Giỏ hàng, nhập Excel |
| `loan-module.md` | Engine vay, cập nhật lãi suất |
| `pitfalls.md` | Lỗi kỹ thuật đã gặp + cách tránh |
| `zalo-android-issue.md` | Lỗi nút Zalo trong APK (chưa giải quyết) |
| `project-status.md` | Snapshot trạng thái triển khai — luôn xác minh lại |
| `CHANGELOG.md` | Lịch sử thay đổi đáng kể (mới nhất trên cùng) |

## Tham chiếu (không phải yêu cầu đã duyệt)

| File | Nội dung |
|---|---|
| `CRM bất động sản 2026.md` | Nghiên cứu 11 CRM + năng lực đáng xây (nền của PRD) |
| `sale-focus-roadmap.md`, `FEATURE_IDEAS.md` | Ý tưởng/lộ trình cũ; phần còn giá trị đã đưa vào PRD |
| `audits/` | Báo cáo nghiệm thu/rà soát theo đợt |
| `runbooks/` (tạo ở Sóng 0) | Hướng dẫn từng bước cho chủ dự án: backup, hạ tầng v2, baseline, cutover |

## Quy ước

- Mỗi quy tắc có **một nơi chính**; file khác chỉ tóm tắt + trỏ tới. Khi đổi quy tắc, sửa nơi chính trước.
- File Markdown mới: chữ thường, gạch nối (trừ các file quy định viết hoa đã có: `PRD.md`, `DESIGN_SYSTEM.md`, `UX_GUIDELINES.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`).
- Changelog không thay cho quyết định; quyết định chỉ ghi điều ảnh hưởng nguyên tắc/phạm vi.
- `project-status.md` chỉ giữ trạng thái hữu ích cho bàn giao + điểm chưa xác minh, ghi ngày và môi trường kiểm tra.
- Giữ `index.html`, `manifest.json`, `sw.js` ở root trên `main` tới cutover (đổi vị trí làm đổi phạm vi Service Worker). Trên nhánh `v2`, code v1 nằm trong `legacy/` (T1.1).
- Di chuyển file migration không có nghĩa phải chạy lại trên Supabase.
