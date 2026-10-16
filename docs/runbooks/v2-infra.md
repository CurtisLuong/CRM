# Runbook — Hạ tầng v2: nhánh, Supabase staging, Cloudflare `crm-v2` (T0.5)

> **Ai làm:** chủ dự án, theo từng bước; agent hỗ trợ khi có lỗi. Không đụng project production (`crm-cop`, Supabase production).
> **Xong khi:** `https://crm-v2.pages.dev` mở được trang trống; staging đăng nhập được bằng tài khoản thử.
> Kiến trúc: `architecture.md` §8–9 · Quyết định D-011.

**Thứ tự:** Bước 1 (staging) → `backup.md` Phần C (khôi phục vào staging) → Bước 2–3 → Bước 4–6.

---

## Bước 1. Tạo Supabase project STAGING

1. supabase.com → Dashboard → **New project**.
   - Organization: như production · Name: `crm-staging` · Region: **giống production** (thường *Southeast Asia (Singapore)*).
   - Database password: bấm *Generate*, **lưu vào trình quản lý mật khẩu** (dùng cho `STAGING_DB_URL`).
   - Plan: Free (gói Free cho tối đa 2 project đang chạy).
2. Đợi project tạo xong (~2 phút). **Không** chạy SQL nào trong project này — dữ liệu và schema sẽ đến từ khôi phục backup.
3. Làm `backup.md` **Phần C** (diễn tập khôi phục) vào project này. Phải ra `✓ KHÔI PHỤC KHỚP HOÀN TOÀN` trước khi đi tiếp.
4. Realtime: `restore-staging.sh` tự bật cho đúng các bảng production đang bật. Lần diễn tập trước bản sửa này (2026-10-16): SQL Editor **staging** → chạy nội dung `SQL/add_realtime_customers.sql` một lần.
5. Nếu `public.customer_changes` chưa có trong staging (T0.2 chưa chạy production): chạy `SQL/v2/001_customer_audit.sql` + file test trên staging theo `audit.md` Mục 1.

> Staging chứa **dữ liệu thật** (khôi phục từ production): giữ riêng tư như production. Agent làm v2 chỉ dùng **anon key** staging (an toàn ở client, có RLS); không đưa service role key/mật khẩu database cho agent.

## Bước 2. Cấu hình đăng nhập staging

Staging → **Authentication → URL Configuration**:

- **Site URL:** `https://crm-v2.pages.dev`
- **Redirect URLs** → *Add URL* lần lượt: `https://crm-v2.pages.dev/**` · `https://*.crm-v2.pages.dev/**` (bản xem trước của từng nhánh/PR) · `http://localhost:5173/**` (máy dev).
- Lưu.

## Bước 3. Thử đăng nhập staging

Tài khoản được khôi phục nguyên từ production → **email + mật khẩu giống production**.
Thử nhanh (chưa có app v2): Staging → Authentication → Users → thấy đủ tài khoản. Sau Bước 6 (khi T1.1 xong) đăng nhập thật tại `https://crm-v2.pages.dev`.
Muốn có **tài khoản thử riêng** (không dùng tài khoản thật): Authentication → Users → *Add user* → *Create new user* → email dạng `test-sale@…`, đặt mật khẩu, tích *Auto Confirm User*. Tài khoản mới mặc định role `sale`, không thấy khách của người khác.

## Bước 4. Tạo nhánh `v2`

Agent làm được bước này khi bắt đầu T1.1 (cần quyền push). Nếu anh tự làm, trên Mac:

```bash
cd ~/Projects/CRM && git switch main && git pull && git switch -c v2 && git push -u origin v2
```

Mong đợi: dòng cuối có `branch 'v2' set up to track 'origin/v2'`. Từ đây **không** push thẳng vào `v2`; mỗi task là 1 nhánh `v2/<T-ID>-…` → Pull Request vào `v2`.

## Bước 5. Cloudflare Pages project `crm-v2`

1. dash.cloudflare.com → **Workers & Pages** → **Create** → tab **Pages** → **Connect to Git** → chọn repo CRM → *Begin setup*.
2. **Project name:** `crm-v2` (tạo ra URL `crm-v2.pages.dev`). **Production branch:** `v2`.
3. **Build settings** — giai đoạn trang trống (trước T1.1, nhánh `v2` chưa có `package.json`):
   - Framework preset: *None*
   - Build command: `mkdir -p dist && printf '<!doctype html><meta charset="utf-8"><title>Sổ Khách v2</title><p>Sổ Khách v2 — đang dựng</p>' > dist/index.html`
   - Build output directory: `dist`
   > **Không** để trống build command với output `/`: như vậy `crm-v2` sẽ phục vụ code v1 trỏ **Supabase production**.
4. **Environment variables** (Production **và** Preview, kiểu *Text*):
   - `VITE_SUPABASE_URL` = Project URL của **staging**
   - `VITE_SUPABASE_ANON_KEY` = anon / publishable key của **staging** (Project Settings → API Keys)
   - `VITE_WORKER_URL` = **để trống** (xem Bước 6)
   - `NODE_VERSION` = `22`
5. **Save and Deploy**. Mong đợi: build xanh, mở `https://crm-v2.pages.dev` thấy dòng "Sổ Khách v2 — đang dựng".
6. Settings → **Builds & deployments** → *Preview branch deployments*: **All non-Production branches** (mỗi PR `v2/…` có URL xem trước).
7. Khi T1.1 xong (agent báo): Settings → Build → đổi **Build command** thành `npm ci && npm run build` (output vẫn `dist`) → *Retry deployment*.

Project `crm-cop` (v1, production) **giữ nguyên** — không đổi gì ở đó cho tới T5.4.

## Bước 6. Worker (OCR / AI / Facebook) — chưa nối cho v2

Worker hiện tại (`worker/intake-worker.js`) chỉ cho **một** origin (`ALLOWED_ORIGIN = https://crm-cop.pages.dev`) và kiểm tra đăng nhập bằng Supabase **production** → app v2 đăng nhập staging gọi Worker sẽ bị từ chối. Vì vậy:

- Giai đoạn đầu: `VITE_WORKER_URL` để trống → v2 ẩn OCR/AI (đúng thiết kế, `architecture.md` §6).
- Khi tới T3.6 (OCR) / T3.12 (AI): agent đề xuất 1 trong 2 cách để anh duyệt — (a) deploy thêm Worker `intake-worker-staging` trỏ staging + origin `crm-v2`; (b) sửa Worker nhận danh sách origin. **Không** đổi `ALLOWED_ORIGIN` của Worker production lúc này (sẽ làm hỏng OCR/AI của v1).

## Kiểm tra cuối (gửi agent để đánh dấu T0.5 ☑)

| Mục | Kết quả |
|---|---|
| `backup.md` Phần C: bảng so sánh toàn ✓ | ☐ |
| Staging → Authentication → Users có đủ tài khoản | ☐ |
| Nhánh `v2` có trên GitHub | ☐ |
| `https://crm-v2.pages.dev` hiện "Sổ Khách v2 — đang dựng" | ☐ |
| Env `VITE_SUPABASE_URL` của `crm-v2` là URL **staging** (khác URL trong `js/config.js`) | ☐ |
