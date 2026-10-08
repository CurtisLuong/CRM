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

## Lỗi "User location is not supported for the API use"
Gemini API chặn theo vị trí của **máy gọi tới nó** — tức Worker, không phải điện thoại. Worker mặc định chạy ở trạm
Cloudflare gần người dùng; một số mạng (vd wifi FPT) đi qua trạm Hồng Kông (Gemini không hỗ trợ) → lỗi, còn 4G/5G đi
trạm khác thì không. Đã ghim Worker chạy ở Mỹ bằng `[placement] region = "gcp:us-east4"` trong `wrangler.toml`
(2026-10-07). Kiểm tra: header `cf-placement` của phản hồi `/ocr` phải là `remote-IAD` (code chạy ở Mỹ); `X-Worker-Colo` chỉ là trạm NHẬN yêu cầu (vd SIN/HKG). Đã deploy + xác nhận `remote-IAD` ngày 2026-10-07.

---

# Facebook Lead Ads → CRM (ghi thẳng vào database)

Khách điền form quảng cáo Facebook → Worker ghi ngay thành **khách mới** (nhóm Khách mới) của tài khoản trưởng
nhóm, kênh "Facebook Ads", chiến dịch = tên chiến dịch / tên form, câu trả lời form nằm ở "Thông tin đăng ký".
SĐT đã có trong CRM → không tạo trùng, chỉ thêm kênh + ghi chú "đăng ký lại". Code: `fb-leads.js`.

Hai đường nhận lead (bật cả hai, trùng thì tự bỏ qua):
- **Quét 5 phút/lần (cron)** — chạy được ngay cả khi app Meta còn ở chế độ Development. Lead trễ tối đa ~5 phút.
- **Webhook** — Facebook báo tức thì (vài giây). Cần app Meta chuyển sang **Live**.

## Bước 1 — Supabase
1. SQL Editor → chạy `SQL/add_fb_leads.sql` (bảng nhật ký lead, chống trùng).
2. Project Settings → API → copy **service_role** key (BÍ MẬT — chỉ đặt vào Worker, không bao giờ đưa vào app).
3. Authentication → Users → copy **User UID** của tài khoản trưởng nhóm (người nhận lead).

## Bước 2 — Meta (Facebook)
1. https://developers.facebook.com → My Apps → **Create App** → loại **Business** → gắn vào Business portfolio đang sở hữu Page.
2. **Page ID**: Page → Giới thiệu → Minh bạch trang (hoặc Business Settings → Pages).
3. **Token đọc lead (không hết hạn) — khuyên dùng System User:**
   Business Settings → Users → **System users** → Add (Admin) → **Assign assets**: chọn Page (quyền đầy đủ) và app vừa tạo →
   **Generate new token** → chọn app, hạn **Never**, tích quyền `leads_retrieval`, `pages_show_list`,
   `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads` (thêm `ads_read` nếu muốn có tên chiến dịch / quảng cáo) → copy token.
   Sau đó lấy **Page token** từ token này: mở `https://graph.facebook.com/v23.0/me/accounts?access_token=<TOKEN_VỪA_TẠO>`
   trên trình duyệt → copy `access_token` của đúng Page.
4. **Cho app đọc lead**: Business Settings → Integrations → **Leads access** → chọn Page → tab CRMs → thêm app (nếu mục này có bật).
5. **App secret**: App dashboard → App settings → Basic → App secret (Show).

## Bước 3 — Đặt secret cho Worker rồi deploy
```bash
cd worker
wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # service_role key (bước 1.2)
wrangler secret put FB_LEAD_OWNER_ID            # User UID trưởng nhóm (bước 1.3)
wrangler secret put FB_PAGE_ID                  # bước 2.2
wrangler secret put FB_PAGE_ACCESS_TOKEN        # Page token (bước 2.3)
wrangler secret put FB_APP_SECRET               # bước 2.5
wrangler secret put FB_VERIFY_TOKEN             # tự đặt 1 chuỗi bất kỳ, vd sokhach-fb-2026 (dùng ở bước 4)
wrangler secret put FB_MANUAL_SECRET            # tự đặt 1 chuỗi dài bất kỳ (để chạy quét thử / Make, Zapier)
wrangler deploy
```
(`SUPABASE_URL` đã đặt từ trước cho /ocr. Tuỳ chọn: `FB_GRAPH_VERSION`, mặc định `v23.0`.)

Kiểm tra quét ngay (không chờ 5 phút):
```bash
curl -X POST https://intake-worker.luongninja.workers.dev/fb/poll -H "X-Intake-Secret: <FB_MANUAL_SECRET>"
```
Kết quả dạng `{"forms":2,"created":1,"merged":0,"duplicate":3,"error":0}`. Lỗi token/quyền sẽ hiện thông báo của Facebook.

## Bước 4 — Webhook (tức thì, tuỳ chọn)
1. App dashboard → Add product → **Webhooks** → chọn **Page** → Subscribe to this object:
   Callback URL `https://intake-worker.luongninja.workers.dev/fb/webhook`, Verify token = `FB_VERIFY_TOKEN` → Verify and save → bật field **leadgen**.
2. Đăng ký app nhận sự kiện của Page — mở trên trình duyệt (POST qua Graph API Explorer):
   `POST /<PAGE_ID>/subscribed_apps?subscribed_fields=leadgen` với Page token.
3. Chuyển app sang **Live** (cần URL chính sách quyền riêng tư). Chưa Live thì webhook không nhận lead thật — cron 5 phút vẫn chạy.

## Bước 5 — Thử
- https://developers.facebook.com/tools/lead-ads-testing → chọn Page + form → **Create lead** → khách hiện ở **Khách hàng → Khách mới**
  (vài giây nếu webhook chạy, tối đa ~5 phút qua cron; kéo xuống để tải lại app).
- Xem nhật ký trong SQL Editor:
  `select received_at, status, via, form_name, error from public.fb_leads order by received_at desc limit 20;`
  `status = error` → cột `error` ghi lý do, cột `raw` giữ nguyên dữ liệu lead để nhập tay.

## Phương án dự phòng: Make / Zapier
Nếu Meta không cấp được quyền đọc lead: dùng Make (hoặc Zapier) "Facebook Lead Ads → Watch new leads" →
module **HTTP POST** tới `https://intake-worker.luongninja.workers.dev/fb/manual`,
header `X-Intake-Secret: <FB_MANUAL_SECRET>`, body JSON:
```json
{ "lead_id": "{{id}}", "full_name": "{{full_name}}", "phone": "{{phone_number}}", "email": "{{email}}",
  "campaign": "{{campaign_name}}", "form_name": "{{form_name}}", "created_time": "{{created_time}}",
  "answers": { "Câu hỏi 1": "{{...}}" } }
```

## Kiểm thử code
`node tests/fb-leads.test.mjs` — giả lập Supabase + Graph (không gọi mạng thật).
