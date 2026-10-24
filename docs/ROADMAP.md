# ROADMAP — Sổ Khách v3 (thiết kế lại UI/UX)

> Luồng B · B3/B4 · 2026-10-18. Nguồn: `docs/v3/current-state-ui.md` (U#), `docs/v3/feedback.md` (F#), `docs/research/competitors-2026-10-18.md` (I#). Curtis đã chọn ý tưởng 2026-10-18.
> Ranh giới: chỉ tầng giao diện (`src/features/**`, `src/ui/**`, `src/styles/**`). **Không đổi** dữ liệu/đồng bộ (`src/data/**`), luật nghiệp vụ (`src/domain/**`, `src/config/**` chỉ được thêm nhãn), SQL. Luật CLAUDE.md §3 giữ nguyên.

## Must / Should / Won't

| | Ý tưởng | Sửa | Ghi chú |
|---|---|---|---|
| **Must** | I6 Không bao giờ hiện mã (kết quả gọi, nguồn, ngày ISO) | F2 · U1, U12 | Lỗi P1 |
| **Must** | I10 Không trắng màn (lỗi 1 khối chỉ ẩn khối đó) | U13 | Lỗi |
| **Must** | Design System v4 | toàn app | Curtis cho đổi; ghi `decisions.md` |
| **Must** | I1 Hôm nay 1 dòng/khách, 1 nút chính | F1 · U3, U4 | |
| **Must** | I2 Hàng đợi theo hành động, bỏ nhãn P0 | F1 · U2 | Đọc `src/domain/signals`, không đổi luật ưu tiên |
| **Must** | I3 Phiên gọi lên đầu + tự sang khách kế | F1 | Phiên gọi đã có (T3.2) |
| **Must** | I5 Hồ sơ mới (4 nút cố định, việc tiếp, tương tác gần nhất, Brief gọn) | F2 · U6, U7, U8 | |
| **Should** | I7 Lọc dòng thời gian | F2 | |
| **Must** | I8 Danh sách = tệp 1 chạm, bộ lọc vào sheet | F3 · U5 | Tệp đã lưu có sẵn (T3.3) |
| **Should** | I9 Hiệu quả = 4 con số bấm được | F4 · U9 | Số đọc từ module Hiệu quả hiện có |
| **Should** | Công việc gọn (1 dòng/việc, chip gộp) | F4 · U10 | Cùng mẫu dòng với I1 |
| **Won't** | I4 vuốt Xong/Dời · Kanban kéo đổi bậc · gọi dự đoán nhiều số · AI tự soạn & gửi | — | Curtis không chọn / trái luật D-008, AI chỉ đề xuất |

## Milestone (mỗi cái phát hành được riêng)

| # | Tên | Nội dung | Ai | Nghiệm thu |
|---|---|---|---|---|
| **M0** ☑ 2026-10-19 | Thiết kế | Design System v4 + bản mẫu Hôm nay, Hồ sơ, Danh sách, Hiệu quả (360px + desktop, sáng/tối) | Lead → Curtis duyệt | Curtis duyệt bản mẫu (luật Factory 9) |
| **M1** ☑ 2026-10-19 | Sửa lỗi hiển thị | I6, I10 | Lead/worker | Không còn mã/ISO trên mọi màn với bộ khách giả; dữ liệu lạ không làm trắng màn |
| **M2** ☑ 2026-10-19 | Nền v4 | Token + component `src/ui` theo DS v4; khung (thanh trên không cắt tiêu đề, bỏ tiêu đề lặp — U11) | Lead (móng) + worker | Gallery `/dev/ui` + ảnh chụp 360/1280 sáng/tối |
| **M3** ☑ 2026-10-19 | Hôm nay v3 | I1, I2, I3 | Worker | Số khách thấy trọn trên màn đầu 360×780 ≥ 6 (hiện 2–3); ngân sách chạm UX §3 giữ nguyên hoặc tốt hơn |
| **M4** ☑ 2026-10-19 | Hồ sơ v3 | I5, I7 | Worker | Mở hồ sơ thấy việc tiếp + tương tác gần nhất không cần cuộn (360×780) |
| **M5** ☑ 2026-10-19 | Danh sách + Công việc + Hiệu quả | I8, Công việc gọn, I9 | Worker | Danh sách: ≥ 8 khách trong màn đầu 360×780; Hiệu quả màn đầu = 4 số |

Chỉ viết task cho milestone đang làm. Thứ tự: M0 → M1 → M2 → M3 → M4 → M5.

## Lưới an toàn (B5)

- FACT: e2e có sẵn cho Hôm nay, Hồ sơ, Khách hàng, Công việc, Hiệu quả (`tests/e2e/*.spec.ts`) + unit `npm run check`.
- Vấn đề: thiết kế lại sẽ làm trượt e2e đang kiểm theo nhãn/vị trí cũ, trong khi luật worker là "không sửa test có sẵn". Cách làm: với mỗi màn, **Lead** viết lại e2e theo bản mẫu đã duyệt (giữ mọi hành vi: gọi, ghi kết quả, hẹn, lưu local, offline) **trước** khi giao worker; worker chỉ thêm test mới.
- Luồng dữ liệu (ghi local + hàng đợi) không đổi → e2e `sync`, `archive`, `quick-actions` phải xanh nguyên trạng.

## Hồ sơ CP — phản hồi Curtis 23/10/2026

☑ 24/10 trên factory d2bd61f: CP-01 nhu cầu/dự án/ô gọn; CP-02 ảnh và nhóm tài liệu; CP-03 5 loại việc/icon. Đã kiểm local và browser giả, chờ duyệt phát hành production và thử clipboard Android thật. Chi tiết: reports/customer-profile-2026-10-23.md.
