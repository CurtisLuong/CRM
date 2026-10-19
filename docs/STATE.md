# STATE — AI Factory

Cập nhật: 2026-10-18 · Nhánh phát triển: `factory` (tách từ `v2` @ 484cb37 = production + 2 commit tài liệu).

| Mục | Trạng thái |
|---|---|
| Luồng | **B** — nâng cấp v2 → v3: thiết kế lại lớn UI/UX, được đổi Design System |
| Giai đoạn | M0–M5 ☑ · **v3 đã deploy production 2026-10-19** (`main` 53a9fc5) — chờ Curtis thử máy thật theo `docs/v3/release/README.md` |
| Production | `main` 53a9fc5 (v3) → `crm-cop.pages.dev`. Rollback: Cloudflare về deployment `f63bf7d` (`docs/project-status.md`) |
| Task cũ | T5.5, T6.3 (`docs/tasks.md`) tạm hoãn |
| Worker | OpenCode 2.0.29 + DeepSeek; push bị khoá trong từng worktree worker (`git config --worktree`) |
| Chưa xác minh | Preview Cloudflare cho `factory` dùng key nào — Curtis kiểm theo `docs/runbooks/factory-preview.md` trước lần push đầu |
| Factory | Skill cập nhật 2026-10-19 (xương sống + hàng rào): `docs/ARCHITECTURE.md` §0, `AGENTS.md` hàng rào chung + BLOCKED + báo cáo 3 mục, `factory-run.mjs` phạm vi glob + BLOCKED (mã 3, `tasks/blocked/`), mẫu `tasks/TEMPLATE.md` |
