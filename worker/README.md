# Intake Worker (cổng nhập liệu)

Cloudflare Worker đứng giữa app CRM và model AI, giữ API key an toàn (không lộ ra
trình duyệt). Đây là thành phần **deploy RIÊNG**, KHÔNG nằm trong Cloudflare Pages
của app — nên nó không phá triết lý "no build step" của phần frontend.

Hiện có 1 route: `POST /ocr` — nhận ảnh, gọi Gemini vision, trả JSON field khách.

## 1. Lấy Gemini API key
1. Vào https://aistudio.google.com/ → **Get API key** → tạo key.
2. Free tier của bản `gemini-3.6-flash` khá rộng cho nhu cầu vài chục ảnh/ngày.

> Lưu ý chi phí: **quota API tính riêng, KHÔNG liên quan gói "Gemini Pro" của app
> Google.** Gói Pro tiêu dùng không nâng rate limit của API. Muốn vượt free tier
> của API thì bật billing trong Google AI Studio (trả theo lượng dùng, rất rẻ cho
> ảnh lẻ). App vẫn chạy tốt trong free tier cho khối lượng nhỏ.

## 2. Deploy Worker

**Cách A — Wrangler (khuyên dùng):**
```bash
npm install -g wrangler
cd worker
wrangler login
wrangler deploy               # dùng wrangler.toml kèm theo
# đặt các biến bí mật:
wrangler secret put GEMINI_API_KEY
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put ALLOWED_ORIGIN     # vd: https://crm-cop.pages.dev
```

**Cách B — Dashboard:** Cloudflare Dashboard → Workers & Pages → Create Worker →
dán nội dung `intake-worker.js` → Deploy. Vào **Settings > Variables** thêm 4 biến
trên (đánh dấu Encrypt cho GEMINI_API_KEY).

## 3. Nối vào app
Sau khi deploy, Worker có URL dạng `https://intake-worker.<subdomain>.workers.dev`.
Dán URL đó vào `js/config.js`:
```js
window.APP_CONFIG = {
  SUPABASE_URL: '...',
  SUPABASE_ANON_KEY: '...',
  WORKER_URL: 'https://intake-worker.<subdomain>.workers.dev',  // <-- thêm dòng này
};
```
Khi `WORKER_URL` rỗng, nút "📷 Nhập từ ảnh" tự ẩn (tính năng tắt cho tới khi cấu hình).

## Giá trị các biến hiện tại (điền để tự tham chiếu)
- SUPABASE_URL: `https://nrqccwamwctihivpxjww.supabase.co`
- SUPABASE_ANON_KEY: lấy trong `js/config.js`
- ALLOWED_ORIGIN: origin thật của app (vd `https://crm-cop.pages.dev`)
