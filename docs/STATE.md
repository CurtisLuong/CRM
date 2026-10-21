# STATE — AI Factory

Cập nhật: 2026-10-19 · Nhánh phát triển: `factory` (tách từ `v2` @ 484cb37 = production + 2 commit tài liệu).

| Mục | Trạng thái |
|---|---|
| Luồng | **B** — nâng cấp v2 → v3: thiết kế lại lớn UI/UX, được đổi Design System |
| Giai đoạn | M0–M5 ☑ · **v3 đã deploy production 2026-10-19** (`main` 53a9fc5) — chờ Curtis thử máy thật theo `docs/v3/release/README.md` |
| Production | `main` 53a9fc5 (v3) → `crm-cop.pages.dev`. Rollback: Cloudflare về deployment `f63bf7d` (`docs/project-status.md`) |
| Meta Lead Ads (ML) | ☑ code trên `factory` (ML-L, ML-01, ML-02). **Worker `intake-worker` deploy production 2026-10-21** (version `b1910971`, từ `factory` 20367ae; rollback: `wrangler rollback be650b75` = code 13/10 + đủ secret) — Curtis duyệt. SQL 007 + 9 secret đã có trên production (kiểm 2026-10-21). Lần deploy này **kèm AI v2 (T6.7)** vì bản trước là code 13/10. Lượt cron đầu: token đọc được **22 lead / 6 form** (48h), đưa vào hàng chờ, nhưng ghi lỗi `permission denied for table fb_leads` (service_role thiếu quyền — `SQL/add_fb_leads.sql` không cấp) → lead tự thử lại, chưa mất. 2026-10-21: Claude chạy SQL 008 production (Curtis duyệt); phát hiện form thật đặt tên trường tiếng Việt (`số_điện_thoại`, `tên_đầy_đủ`) → parser cũ coi mọi lead là không SĐT; đã sửa + deploy Worker `7334c292` (rollback `be650b75`). Webhook Meta đã gọi tới Worker. 25 lead tự thử lại lúc 18:55–19:35 giờ VN; 1 lead bị đánh dấu nhầm "không SĐT" cần đưa lại hàng chờ. Thẻ cảnh báo (Cài đặt, Khách mới) lên production khi `factory` merge `main` |
| Task cũ | T5.5, T6.3 (`docs/tasks.md`) tạm hoãn |
| Worker | OpenCode 2.0.29 + DeepSeek; push bị khoá trong từng worktree worker (`git config --worktree`) |
| Chưa xác minh | Preview Cloudflare cho `factory` dùng key nào — Curtis kiểm theo `docs/runbooks/factory-preview.md` trước lần push đầu |
| Factory | Skill cập nhật 2026-10-19 (xương sống + hàng rào): `docs/ARCHITECTURE.md` §0, `AGENTS.md` hàng rào chung + BLOCKED + báo cáo 3 mục, `factory-run.mjs` phạm vi glob + BLOCKED (mã 3, `tasks/blocked/`), mẫu `tasks/TEMPLATE.md` |
