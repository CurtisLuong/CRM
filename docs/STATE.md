# STATE — AI Factory

Cập nhật: 2026-10-18 · Nhánh phát triển: `factory` (tách từ `v2` @ 484cb37 = production + 2 commit tài liệu).

| Mục | Trạng thái |
|---|---|
| Luồng | **B** — nâng cấp v2 → v3: thiết kế lại lớn UI/UX, được đổi Design System |
| Giai đoạn | B0–B4 ☑ · M0 ☑ (D-023) · M1 ☑ · M2 ☑ (nền v4) · **M3 ☑ 2026-10-19** (Hôm nay v3, e2e 107 đạt) · M4/M5: Lead đã chuẩn bị model + e2e (đang trượt chờ worker), **chưa viết task** — viết theo mẫu mới `tasks/TEMPLATE.md` |
| Production | `main` f63bf7d → `crm-cop.pages.dev` (Supabase production). Không đụng khi chưa duyệt |
| Task cũ | T5.5, T6.3 (`docs/tasks.md`) tạm hoãn |
| Worker | OpenCode 2.0.29 + DeepSeek; push bị khoá trong từng worktree worker (`git config --worktree`) |
| Chưa xác minh | Preview Cloudflare cho `factory` dùng key nào — Curtis kiểm theo `docs/runbooks/factory-preview.md` trước lần push đầu |
| Factory | Skill cập nhật 2026-10-19 (xương sống + hàng rào): `docs/ARCHITECTURE.md` §0, `AGENTS.md` hàng rào chung + BLOCKED + báo cáo 3 mục, `factory-run.mjs` phạm vi glob + BLOCKED (mã 3, `tasks/blocked/`), mẫu `tasks/TEMPLATE.md` |
