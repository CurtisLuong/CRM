# Phản hồi của Curtis — đợt thiết kế lại UI/UX (Luồng B · B1)

> 2026-10-18. Curtis chọn: **thiết kế lại lớn** (được đổi cấu trúc màn), **có** nghiên cứu đối thủ, chạy bằng **AI Factory** (nhánh `factory` + worker).
> Mã U# tham chiếu `docs/v3/current-state-ui.md`.

| # | Màn | Curtis nói | Loại | Mức | Gắn với |
|---|---|---|---|---|---|
| F1 | Hôm nay | Quá rối | UX | P1 | U2, U3, U4, U14 |
| F2 | Hồ sơ | Dài, có mã lạ | UX + lỗi chữ | P1 | U1, U6, U7, U8, U13 |
| F3 | Khách hàng | Danh sách khách khó dùng (bộ lọc che danh sách) | UX | P1 | U5 |
| F4 | Công việc, Hiệu quả | Trang quá dài | UX | P1 | U9, U10 |

## Quyết định của Curtis (2026-10-18)

| Câu hỏi | Quyết |
|---|---|
| Đối thủ nghiên cứu | VN: Getfly CRM, Bitrix24, CRMViet, Meey CRM · Quốc tế: Follow Up Boss, Lofty, Close · Ngoài ngành: Superhuman, Todoist |
| Design System | **Được đổi** → viết `DESIGN_SYSTEM.md` v4, ghi `decisions.md` |
| Task cũ đang dở (T6.3, T5.5, worktree Codex) | **Tạm hoãn**; khi có thiết kế v3 thì xét lại còn cần không |
| Khoá push | Chỉ khoá trong worktree của worker; repo chính + `merge-to-v2.mjs` giữ nguyên |

## Còn hỏi (để sau, khi xem bản thiết kế)

- Khi dùng thật trên điện thoại có lúc nào bấm nhầm, phải tìm lâu, hoặc bỏ không dùng màn nào không?
