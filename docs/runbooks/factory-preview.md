# Kiểm Cloudflare preview trước lần push `factory` đầu tiên

Mục tiêu: bản xem trước của nhánh `factory` chỉ được dùng Supabase **staging** (`mksjmpcsfawsiabfhoxe`), không bao giờ production (`nrqccwamwctihivpxjww`).

Repo có 2 project Cloudflare Pages cùng nối GitHub: `crm-cop` (production, nhánh `main`) và `crm-v2` (staging). Cả hai có thể tự build preview cho nhánh mới.

## Bước (Curtis làm trên dash.cloudflare.com)

1. Workers & Pages → **crm-cop** → Settings → **Variables and Secrets** → chọn môi trường **Preview**.
   - Xem `VITE_SUPABASE_URL`. Nếu chứa `nrqccwamwctihivpxjww` (production) **hoặc** Preview trống → sang bước 2.
2. **crm-cop** → Settings → **Builds & deployments** → *Branch control* → *Preview branch deployments*: chọn **None** (crm-cop chỉ build `main`). Lưu.
3. Workers & Pages → **crm-v2** → Settings → Variables and Secrets → **Preview**: `VITE_SUPABASE_URL` phải chứa `mksjmpcsfawsiabfhoxe` (staging). Nếu trống → chép từ môi trường Production của crm-v2 (cũng là staging).
4. crm-v2 → Builds & deployments → *Preview branch deployments*: **All non-Production branches** (để có preview `factory`).
5. Báo Lead kết quả bước 1 và 3 (chỉ cần nói "production / staging / trống", không gửi key).

## Sau đó, push bằng tay (không gỡ khoá)

```bash
git push "$(git remote get-url origin)" factory:factory
```

Link preview dự kiến: `https://factory.crm-v2-9hf.pages.dev` (Lead xác nhận sau lần build đầu).
