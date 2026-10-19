# Intake Worker (cổng nhập liệu)

Cloudflare Worker đứng giữa app CRM và model AI, giữ API key an toàn (không lộ ra
trình duyệt). Đây là thành phần **deploy RIÊNG**, KHÔNG nằm trong Cloudflare Pages
của app — nên nó không phá triết lý "no build step" của phần frontend.

Hiện có 1 route: `POST /ocr` — nhận ảnh, gọi Gemini vision, trả JSON field khách.

Route `POST /ai` — **Trợ lý AI** ở hồ sơ khách (tóm tắt trước khi gọi, soạn tin Zalo, tách ghi
chú → đề xuất việc). Chạy bằng **Cloudflare Workers AI** (chọn trong app: Qwen3 30B hoặc GLM 4.7 Flash), KHÔNG
cần API key: binding `[ai]` trong `wrangler.toml` đã khai báo sẵn, chỉ cần `wrangler deploy` lại.
Gói miễn phí: 10.000 neurons/ngày (~vài trăm lượt AI/ngày). Thêm/đổi model: `MODELS` trong
`ai-assist.js` + `AI_MODELS` trong `js/ai.js`. Xem dung lượng đã dùng: Cloudflare Dashboard → AI → Workers AI.

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

## Lỗi "User location is not supported for the API use"
Gemini API chặn theo vị trí của **máy gọi tới nó** — tức Worker, không phải điện thoại. Worker mặc định chạy ở trạm
Cloudflare gần người dùng; một số mạng (vd wifi FPT) đi qua trạm Hồng Kông (Gemini không hỗ trợ) → lỗi, còn 4G/5G đi
trạm khác thì không. Đã ghim Worker chạy ở Mỹ bằng `[placement] region = "gcp:us-east4"` trong `wrangler.toml`
(2026-10-07). Kiểm tra: header `cf-placement` của phản hồi `/ocr` phải là `remote-IAD` (code chạy ở Mỹ); `X-Worker-Colo` chỉ là trạm NHẬN yêu cầu (vd SIN/HKG). Đã deploy + xác nhận `remote-IAD` ngày 2026-10-07.

---

# Facebook / Instagram Lead Ads → CRM

Thiết lập, thử, kéo bù, xử lý cảnh báo token: **`docs/runbooks/meta-lead-ads.md`** (nguồn duy nhất — viết cho người
không cần biết lập trình). Code: `fb-leads.js` (router `/fb/*`) + `meta/` (hàng chờ, chống trùng, Graph, tình trạng
kết nối). DB: `SQL/add_fb_leads.sql` + `SQL/v2/007_meta_lead_ads.sql`.

Tóm tắt kỹ thuật:
- Route: `GET/POST /fb/webhook` (chữ ký `X-Hub-Signature-256`), `POST /fb/manual` (Make/Zapier), `POST /fb/poll`,
  `POST /fb/backfill`, `GET /fb/health` — 4 route cuối cần header `X-Intake-Secret: <FB_MANUAL_SECRET>`.
- Mọi `leadgen_id` vào `fb_lead_queue` trước; webhook chỉ trả 200 khi đã ghi hàng chờ (lỗi → 503, Meta gửi lại).
  Cron 5 phút: quét 48h + xử lý hàng chờ (≤ `FB_BATCH_SIZE`, mặc định 5) + ghi `integration_health`; kiểm token 1 lần/ngày.
- Secret: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FB_LEAD_OWNER_ID`, `FB_PAGE_ID`, `FB_PAGE_ACCESS_TOKEN`,
  `FB_APP_ID`, `FB_APP_SECRET`, `FB_VERIFY_TOKEN`, `FB_MANUAL_SECRET`; tuỳ chọn `FB_GRAPH_VERSION` (mặc định `v26.0`), `FB_BATCH_SIZE`.
- Giả lập webhook có chữ ký tới `wrangler dev`: `FB_APP_SECRET=... node worker/tools/simulate-meta-webhook.mjs`.

## Kiểm thử code
`npx vitest run tests/worker` — giả lập Supabase + Graph (không gọi mạng thật).
