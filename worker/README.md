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

## Lãi vay mua nhà mỗi sáng (BR-01)

`bank-rates.js` đọc trang chủ 10 ngân hàng, theo liên kết về lãi suất/vay nhà (tối đa
3 trang/ngân hàng) và đọc bài từ 5 RSS cấu hình trong `bank-rates-config.js`.
Bài báo phải có từ khóa về lãi vay và ngày đăng không quá 45 ngày. Mỗi lượt tối đa
30 HTTP request công khai, tính cả RSS, redirect và nguồn lỗi. Nội dung HTML/script
được bỏ, hotline được ẩn, văn bản gửi Workers AI Qwen tối đa 12.000 ký tự/trang.
Không gọi AI bên ngoài binding `AI`.

AI phải trả JSON đúng khuôn với trích dẫn cho từng số. Worker đối chiếu trích dẫn
với văn bản, kiểm khoảng lãi 3–20%/năm, cộng tham chiếu + biên độ nếu đủ số, bỏ
thả nổi thấp hơn ưu đãi. Biên độ tính bằng điểm %, có thể nhỏ hơn 3. Trong cùng
lượt: nguồn ngân hàng thắng báo, cùng loại chọn ngày đăng mới hơn; không ghép gói
giữa các trang. Lệch hơn 2 điểm so với bản mới nhất thì bỏ cả dòng và log cảnh báo.
Không có số hợp lệ thì không ghi; bản cũ trong `bank_rates_latest` vẫn giữ nguyên.
Lỗi đọc bản cũ từ Supabase làm dừng lượt trước khi ghi.

Cron `0 0 * * *` chạy lúc **07:00 Việt Nam**, tách biệt cron Facebook `*/5`.
Các yêu cầu đồng thời trong cùng isolate được gộp; cùng ngày đã hoàn tất thì bỏ qua.
Isolate mới kiểm `fetched_at` trong `bank_rates_latest` để tránh ghi lại trong ngày
Việt Nam. Nếu cả lượt không ghi được dòng nào, dấu đã chạy chỉ nằm trong bộ nhớ
isolate; schema 016 không có bảng khóa lượt chạy bền vững. Không tạo bảng khác.
Kiểm ngày không phải khóa nguyên tử: hai isolate cùng bắt đầu trước khi có dòng
mới vẫn có thể cùng chạy. Lịch cron chỉ khai báo một lần mỗi ngày.

Curtis/Lead thiết lập sau khi duyệt:

1. Bảo đảm SQL `016_bank_rates.sql` đã có trên đúng Supabase mà Worker đang dùng:
   **staging `mksjmpcsfawsiabfhoxe`** khi thử preview, hoặc **production
   `nrqccwamwctihivpxjww`** khi duyệt chạy thật. Không đổi `SUPABASE_URL` của Worker
   đang nhận Facebook chỉ để thử tính năng này; dùng Worker staging riêng nếu cần.
2. Trong thư mục `worker`, dùng `wrangler secret put BANK_RATES_SECRET`, nhập bí mật
   riêng để bảo vệ route chạy thử. Cần sẵn `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   cùng project và binding `AI`. Không đặt service-role key trong app.
3. Chạy `wrangler deploy`. Nếu Wrangler yêu cầu đăng nhập trên VPS, mở link và mã
   trên Mac để đăng nhập. Thiếu `BANK_RATES_SECRET` thì route thủ công tắt (404);
   cron vẫn chạy bằng cấu hình Supabase và AI.
4. Chạy thử server-to-server (lệnh này ghi `bank_rates` trên project đã cấu hình):

   ```bash
   read -rsp 'BANK_RATES_SECRET: ' BANK_RATES_RUN_SECRET
   curl --request POST 'https://intake-worker.<subdomain>.workers.dev/bank-rates/run' \
     --header "X-Cron-Secret: ${BANK_RATES_RUN_SECRET}"
   unset BANK_RATES_RUN_SECRET
   ```

   Đúng secret trả thống kê `pages`, `candidates`, `written`, `drifted`, `failed`
   (lỗi trích xuất/ghi). Đã chạy hôm nay trả `skipped: "already_ran_today"`.
   Secret thiếu/sai trả 401; lỗi cấu hình/đọc DB trả 503. Xem `wrangler tail` để biết
   nguồn lỗi hoặc ngân hàng bị chặn do lệch số; log không chứa khóa hay nội dung AI.
5. Trên Supabase cùng môi trường, xem `bank_rates_latest`: mỗi dòng mới có URL
   trang đã đọc và ngày lấy; bấm nguồn để kiểm số gần đúng. Trang bị 403 hoặc không
   có số công khai sẽ giữ bản cũ. Không cần đọc/ghi bảng khách.

Kiểm thử offline: `npm run check` rồi `npx vitest run tests/worker`.
Fixture trong `tests/worker/fixtures/bank-rates/` mô phỏng HTML/RSS theo các nguồn
được giao, với số/ngày cố định phục vụ test; chưa phải bản chụp tải từ website thật.
Task cấm gọi mạng và repo chưa có bản chụp nguồn, nên Lead cần cung cấp HTML/RSS
thật rút gọn để hoàn tất yêu cầu fixture thật. Chưa kiểm website live hoặc deploy.
