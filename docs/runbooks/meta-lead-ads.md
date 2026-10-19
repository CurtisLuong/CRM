# Runbook — Đổ lead Meta Lead Ads (Facebook/Instagram) vào Sổ Khách

> Viết 2026-10-19 cho Curtis (không cần biết lập trình). Code: `worker/fb-leads.js` + `worker/meta/`, migration `SQL/v2/007_meta_lead_ads.sql`, thẻ cảnh báo ở **Cài đặt** và **Khách mới**.
> Mỗi bước ghi rõ **ai làm**. Bước nào của Curtis thì chỉ là bấm/dán — phần còn lại Claude làm.
> Giá trị bí mật (token, secret, key) **chỉ dán vào Cloudflare/Supabase**, không gửi qua chat, không dán vào app.

## 0. Tích hợp này làm gì

| Việc | Cách hoạt động |
|---|---|
| Khách gửi form quảng cáo FB/IG | Meta báo Worker ngay (webhook) → vài giây sau khách có trong **Khách mới** |
| Webhook trục trặc | Worker tự quét mọi form mỗi 5 phút (48 giờ gần nhất) → lead vẫn vào, trễ tối đa ~5 phút |
| Khách mới | Kênh **Facebook Ads**, cách nhập **Tự động**, chiến dịch = tên chiến dịch Meta (không có thì tên form), giờ đăng ký = giờ khách bấm gửi, câu trả lời form nằm ở ghi chú hồ sơ. Người phụ trách = tài khoản nhận lead (bạn) |
| SĐT đã có trong CRM | **Không tạo khách trùng.** Hồ sơ cũ thêm dòng "Đăng ký qua form quảng cáo" + kênh Facebook Ads. Không đổi bậc, không đổi người phụ trách |
| Meta gửi 1 lead nhiều lần | Chỉ ghi 1 lần (chống trùng theo mã lead) |
| Lỗi mạng / token / database | Lead nằm ở hàng chờ, tự thử lại (5 phút → 15 phút → 1 giờ … tối đa ~10 ngày). Không lead nào bị bỏ |
| Token sắp hết hạn / hỏng | Worker tự kiểm mỗi ngày → app hiện cảnh báo ở **Khách mới** và **Cài đặt → Kết nối Facebook Lead Ads** |
| Lead cũ / bị lỡ | Kéo bù theo khoảng ngày (mục 8). Meta chỉ giữ lead khoảng 90 ngày |

## 1. Ai làm gì

| # | Việc | Ai | Thời gian |
|---|---|---|---|
| 1 | Backup + chạy SQL 007 trên **production** | Curtis | 5 phút |
| 2 | Lấy service_role key + User UID trong Supabase | Curtis | 2 phút |
| 3 | Tạo Meta App, lấy App ID + App Secret | Curtis | 10 phút |
| 4 | Tạo System User + token không hết hạn → Page token | Curtis | 10 phút |
| 5 | Dán 9 secret vào Cloudflare | Curtis | 5 phút |
| 6 | Deploy Worker | **Claude** (sau khi Curtis nói "OK deploy Worker") | 2 phút |
| 7 | Bật webhook + đăng ký Page + chuyển app sang Live | Curtis | 10 phút |
| 8 | Thử bằng Lead Ads Testing Tool, kiểm lead đã vào | Curtis bấm, Claude kiểm | 5 phút |

## 2. Bước 1 — SQL (Curtis, chạy trên **production** `nrqccwamwctihivpxjww`)

1. Backup trước theo `docs/runbooks/backup.md` (hoặc nhờ Claude chạy script backup).
2. Mở https://supabase.com/dashboard → chọn project **`nrqccwamwctihivpxjww`** (production) → **SQL Editor** → **New query**.
3. Mở file `SQL/v2/007_meta_lead_ads.sql` trong repo, chép **toàn bộ**, dán vào → **Run**. Thấy "Success. No rows returned" là xong. Chạy lại lần nữa cũng không sao.
4. Kiểm (dán, Run — chỉ đọc):
   ```sql
   select (select count(*) from information_schema.tables where table_schema='public' and table_name in ('fb_lead_queue','integration_health')) as bang_moi,
          (select count(*) from pg_proc where proname='fb_attach_lead') as ham;
   ```
   Mong đợi: `bang_moi = 2`, `ham = 1`.

> Migration chỉ **thêm** (2 bảng mới, vài cột mới ở `fb_leads`, 1 hàm). Không sửa hay xoá khách nào. Claude đã chạy thử trên Postgres trong máy (gắn lead, chống gắn trùng, quyền đọc/ghi) — đạt.
> Muốn thử trên **staging** `mksjmpcsfawsiabfhoxe` trước: làm y hệt bước 2–4 nhưng chọn project staging.

## 3. Bước 2 — Lấy 2 giá trị trong Supabase (Curtis, project **production** `nrqccwamwctihivpxjww`)

| Giá trị | Ở đâu | Dùng cho secret |
|---|---|---|
| **service_role key** | Project Settings → **API Keys** → tab **Legacy API keys** → dòng `service_role` → **Reveal** → Copy | `SUPABASE_SERVICE_ROLE_KEY` |
| **User UID người nhận lead** | **Authentication** → **Users** → dòng tài khoản của bạn (luongninja) → copy cột **UID** | `FB_LEAD_OWNER_ID` |

⚠️ service_role key mở được toàn bộ database. Chỉ dán vào Cloudflare (bước 5). Không gửi chat, không dán vào app.

## 4. Bước 3 — Tạo Meta App (Curtis)

Cần: bạn là admin của **Page** và của **Business portfolio** (business.facebook.com) đang sở hữu Page + tài khoản quảng cáo.

1. Vào https://developers.facebook.com → **My Apps** → **Create App**.
2. Tên app: `So Khach CRM` · email liên hệ: email của bạn.
3. Use case: chọn **Other** (Khác) → app type **Business** → chọn đúng Business portfolio → **Create app**.
4. Trong app: menu trái **App settings → Basic**:
   - Copy **App ID** → secret `FB_APP_ID`.
   - **App secret** → **Show** → nhập mật khẩu Facebook → copy → secret `FB_APP_SECRET`.
   - **Privacy Policy URL**: dán link chính sách bảo mật của landing page (cần để chuyển app sang Live ở bước 7). Chưa có → nhờ Claude soạn 1 trang.
   - **Save changes**.
5. Menu trái **Add product** (hoặc "Add use case") → tìm **Webhooks** → **Set up**. (Cấu hình ở bước 7.)

## 5. Bước 4 — Token đọc lead không hết hạn (Curtis)

Dùng **System User** (tài khoản máy của Business) để token **không hết hạn** theo thời gian.

1. Vào https://business.facebook.com/settings → **Users → System users** → **Add** → tên `crm-lead-reader`, vai trò **Admin** → Create.
2. Chọn system user vừa tạo → **Assign assets**:
   - **Pages** → chọn Page chạy quảng cáo → bật **Full control** (hoặc ít nhất: quản lý Page + Leads) → Save.
   - **Apps** → chọn `So Khach CRM` → **Full control** → Save.
   - (Tuỳ chọn, để có tên chiến dịch/quảng cáo) **Ad accounts** → chọn tài khoản quảng cáo → quyền **View performance** → Save.
3. Bấm **Generate new token** → chọn app `So Khach CRM` → **Token expiration: Never** → tích các quyền:
   `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads`, `ads_read` (thêm `ads_management` nếu Meta yêu cầu cho tên chiến dịch) → **Generate token** → copy (chỉ hiện 1 lần). Gọi là **TOKEN_HE_THONG**.
4. Đổi sang **Page token**: mở trình duyệt, dán (thay `TOKEN_HE_THONG`):
   `https://graph.facebook.com/v26.0/me/accounts?fields=id,name,access_token&access_token=TOKEN_HE_THONG`
   Trang hiện danh sách Page. Ở đúng Page của bạn:
   - `id` → secret `FB_PAGE_ID`
   - `access_token` → secret `FB_PAGE_ACCESS_TOKEN`
   Đóng tab ngay sau khi copy (token nằm trong lịch sử trình duyệt — xoá lịch sử tab này nếu máy dùng chung).
5. **Cho app quyền đọc lead của Page** (nếu Page bật "Leads Access"): Meta Business Suite → **Settings → Integrations → Leads access** → chọn Page → tab **CRMs** → **Assign CRMs** → chọn `So Khach CRM`; tab **People** → đảm bảo system user `crm-lead-reader` có quyền. Không thấy mục này = Page chưa giới hạn, bỏ qua.

## 6. Bước 5 — Dán secret vào Cloudflare (Curtis)

1. https://dash.cloudflare.com → **Workers & Pages** → chọn **intake-worker** → **Settings** → **Variables and Secrets** → **Add**.
2. Mỗi dòng dưới đây: **Type = Secret**, **Variable name** = cột Tên (gõ đúng chữ hoa), **Value** = giá trị → **Save** (có thể chọn "Save" rồi deploy sau — Claude deploy ở bước 6).

| Tên | Giá trị | Lấy ở |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | Bước 2 |
| `FB_LEAD_OWNER_ID` | User UID của bạn | Bước 2 |
| `FB_APP_ID` | App ID | Bước 3 |
| `FB_APP_SECRET` | App secret | Bước 3 |
| `FB_PAGE_ID` | id của Page | Bước 4 |
| `FB_PAGE_ACCESS_TOKEN` | access_token của Page | Bước 4 |
| `FB_VERIFY_TOKEN` | tự đặt 1 chuỗi, vd `sokhach-fb-2026` (ghi lại — dùng ở bước 7) | Tự đặt |
| `FB_MANUAL_SECRET` | tự đặt 1 chuỗi dài ≥ 24 ký tự, không dấu (ghi vào trình quản lý mật khẩu — dùng để kéo bù) | Tự đặt |
| `SUPABASE_URL` | **Đã có** từ trước (`https://nrqccwamwctihivpxjww.supabase.co`) — kiểm có trong danh sách là được | — |

Tuỳ chọn (không cần đặt): `FB_GRAPH_VERSION` (mặc định `v26.0`), `FB_BATCH_SIZE` (mặc định 5 lead/lượt — xem mục 11).

## 7. Bước 6 — Deploy Worker (Claude, sau khi Curtis duyệt)

Curtis nhắn: **"OK deploy Worker Meta Lead Ads"**. Claude chạy `wrangler deploy` trong `worker/`, rồi gọi `/fb/health` để xác nhận secret đủ và token hợp lệ. Worker production đang phục vụ OCR + AI — Claude kiểm lại `/ocr`, `/ai` vẫn chạy sau deploy.

## 8. Bước 7 — Bật webhook + đăng ký Page (Curtis)

1. developers.facebook.com → app `So Khach CRM` → **Webhooks** → ô chọn object: **Page** → **Subscribe to this object**:
   - **Callback URL**: `https://intake-worker.luongninja.workers.dev/fb/webhook`
   - **Verify token**: đúng chuỗi `FB_VERIFY_TOKEN` đã đặt ở bước 5
   - **Verify and save**. Báo lỗi = Worker chưa deploy hoặc gõ sai verify token.
   - Trong danh sách field của Page, dòng **leadgen** → **Subscribe**.
2. **Đăng ký Page nhận sự kiện cho app**: mở https://developers.facebook.com/tools/explorer →
   - **Meta App**: `So Khach CRM` · **User or Page**: chọn Page của bạn (cấp quyền khi được hỏi)
   - Đổi **GET** thành **POST**, ô đường dẫn dán: `me/subscribed_apps?subscribed_fields=leadgen` → **Submit** → thấy `"success": true` là xong.
3. **Chuyển app sang Live**: đầu trang app, công tắc **App Mode: Development → Live** (cần Privacy Policy URL ở bước 3). Khi app còn ở Development, Meta có thể không gửi webhook cho lead thật — lúc đó lead vẫn vào qua quét 5 phút.

## 9. Bước 8 — Thử (Curtis bấm, Claude kiểm)

1. Mở https://developers.facebook.com/tools/lead-ads-testing → chọn **Page** + **Form** → nếu có lead thử cũ: **Delete lead**.
2. Bấm **Preview form** → điền **tên + SĐT thật của bạn** (vd. số phụ) → gửi. (Nút **Create lead** tạo lead bằng chữ giả, không có SĐT thật → Worker ghi nhật ký "Lead không có số điện thoại" và **không** tạo khách — dùng được để thử webhook, không thử được tạo khách.)
3. Bấm **Track status** → dòng trạng thái **success** (Meta gọi được Worker).
4. Mở Sổ Khách → **Khách mới**: lead thử xuất hiện sau vài giây (qua webhook) hoặc ≤ 5 phút (qua quét). Kéo xuống để làm mới.
5. **Cài đặt → Kết nối Facebook Lead Ads**: "Đang hoạt động", "Lead gần nhất" = vừa xong.
6. Xoá lead thử bên Meta (**Delete lead**) → **Preview form** lần 2, **cùng SĐT** → **không** có khách thứ 2; hồ sơ khách thử có thêm dòng "Đăng ký qua form quảng cáo".
7. Lưu trữ khách thử trong CRM sau khi xong.

Xem nhật ký (chỉ đọc, SQL Editor **production** `nrqccwamwctihivpxjww`):
```sql
select received_at, status, via, form_name, campaign_name, error
from public.fb_leads order by received_at desc limit 20;
select lead_id, via, attempts, last_error, next_attempt_at, done_at
from public.fb_lead_queue where done_at is null order by created_at;
select status, message, token_expires_at, last_lead_at, pending_count, stuck_count, checked_at
from public.integration_health;
```

## 10. Kéo bù lead cũ / lead bị lỡ

Dùng khi: vừa bật tích hợp (muốn lấy lead trước đó), hoặc token hỏng nhiều ngày. Chỉ lấy được lead trong ~90 ngày.

Curtis mở **Terminal** trên Mac, dán (thay `CHUOI_FB_MANUAL_SECRET` và ngày):

```bash
curl -X POST https://intake-worker.luongninja.workers.dev/fb/backfill -H "X-Intake-Secret: CHUOI_FB_MANUAL_SECRET" -H "Content-Type: application/json" -d '{"since":"2026-10-01","until":"2026-10-19"}'
```

Kết quả dạng `{"forms":3,"found":40,"queued":12,"already":28}`: `queued` = lead mới đưa vào hàng chờ; Worker ghi dần 5 lead mỗi 5 phút (12 lead ≈ 15 phút). Lead đã có không bị ghi lại. Chỉ một form: thêm `"form_id":"<mã form>"` vào trong `{...}`.

(Hoặc nhắn Claude "kéo bù lead từ ngày X" — Claude đưa đúng lệnh; Claude không giữ secret.)

## 11. Khi có cảnh báo

| App hiện | Nghĩa | Làm gì |
|---|---|---|
| "Token Facebook hết hạn sau N ngày (dd/MM/yyyy)…" hoặc "…đã hết hạn" | Token sắp/đã hết hạn (thường do dùng token cá nhân thay vì System User) | Làm lại bước 4 (System User, **Never**) → Cloudflare → `FB_PAGE_ACCESS_TOKEN` → **Edit** → dán token mới → Save/Deploy |
| "Token Facebook không còn hiệu lực…" | Token bị thu hồi (đổi mật khẩu, gỡ quyền Page, xoá system user…) | Như trên. Lead trong lúc lỗi nằm ở hàng chờ, tự vào trong ≤ 1 giờ sau khi thay token. Lỗi quá 2 ngày → kéo bù (mục 10) cho chắc |
| "Thiếu quyền leads_retrieval…" | Token tạo thiếu quyền | Bước 4.3, tích đủ quyền, tạo lại token |
| "Thiếu cấu hình Worker: FB_…" hoặc "Chưa cấu hình đủ…" | Thiếu secret | Bước 5, thêm đúng tên secret được nêu |
| "Page chưa đăng ký nhận lead qua webhook…" | Meta gỡ đăng ký (hiếm) | Bước 7.2 |
| "Có lead chờ quá 1 giờ" | Database/Graph lỗi tạm | Thường tự hết. Kéo dài > 1 ngày → nhắn Claude |
| "Có N lead không tự ghi được vào CRM…" / "Cần xử lý tay: N lead" | Lead thử lại 15 lần (~10 ngày) vẫn lỗi | Nhắn Claude; câu SQL thứ hai ở mục 9 cho xem lỗi (`last_error`). Dữ liệu lead vẫn giữ nguyên trong `fb_leads.raw` |
| (không có cảnh báo) lead có trong Meta mà không thành khách | Khách không để SĐT | Câu SQL thứ nhất ở mục 9: dòng `status = error`, lỗi "Lead không có số điện thoại"; câu trả lời của khách nằm ở cột `raw` |
| "Chưa nhận được cập nhật từ máy chủ trong 30 phút qua" | Worker ngừng chạy cron | Nhắn Claude kiểm Cloudflare (Workers → intake-worker → Logs) |

> **Meta có tự báo token hết hạn không?** Meta **không** có webhook báo token hết hạn (HYPOTHESIS — không tìm thấy trong tài liệu). Token System User đặt "Never" không hết hạn theo thời gian, chỉ mất khi bị thu hồi. Vì vậy Worker tự kiểm token mỗi ngày bằng `debug_token` và cảnh báo trước 7 ngày; lỗi token cũng được phát hiện ngay ở lượt gọi Graph đầu tiên.

## 12. Phương án dự phòng: Make / Zapier

Nếu Meta không cấp được quyền đọc lead: Make (hoặc Zapier) "Facebook Lead Ads → Watch new leads" → module **HTTP POST** tới `https://intake-worker.luongninja.workers.dev/fb/manual`, header `X-Intake-Secret: <FB_MANUAL_SECRET>`, body JSON:
```json
{ "lead_id": "{{id}}", "full_name": "{{full_name}}", "phone": "{{phone_number}}", "email": "{{email}}",
  "campaign": "{{campaign_name}}", "form_name": "{{form_name}}", "created_time": "{{created_time}}",
  "answers": { "Câu hỏi 1": "{{...}}" } }
```
Cùng luật chống trùng/hàng chờ như webhook.

## 13. Giới hạn, chi phí, bảo mật

- **Cloudflare gói miễn phí**: mỗi lần chạy ≤ 50 lượt gọi ra ngoài → Worker xử lý tối đa 5 lead/lượt cron (60 lead/giờ khi chỉ còn đường quét). Lead qua webhook được xử lý ngay theo từng lead, không bị giới hạn này. Chạy chiến dịch > 60 lead/giờ mà webhook hỏng → hàng chờ chậm lại (không mất). Gói Workers Paid (5 USD/tháng) bỏ giới hạn → đặt `FB_BATCH_SIZE = 30`.
- **Meta Graph API**: dùng `v26.0` (mới nhất 07/2026). Meta tự chuyển phiên bản cũ khi hết hạn; đổi bằng secret `FB_GRAPH_VERSION`.
- **Bảo mật**: chữ ký `X-Hub-Signature-256` (App Secret) chặn webhook giả; `/fb/manual`, `/fb/poll`, `/fb/backfill`, `/fb/health` cần `FB_MANUAL_SECRET`; service_role key chỉ ở Worker; log không ghi SĐT/tên/token. Lead không được gửi cho AI.
- **Dữ liệu (D-012)**: khách cũ chỉ được thêm 1 dòng tương tác + kênh; không trường nào bị ghi đè; mọi thay đổi khách có nhật ký `customer_changes`.

## 14. Câu hỏi đã chốt mặc định (Curtis đổi được)

| Câu hỏi | Mặc định đang dùng | Phương án khác |
|---|---|---|
| Khách trùng SĐT đang **lưu trữ** đăng ký lại | Gắn dòng "Đăng ký qua form quảng cáo" vào hồ sơ lưu trữ, **không** tự mở lại; nhật ký ghi chú để tra | Tự mở lưu trữ (cần duyệt vì là tự động hoá mới) |
| Khách cũ đăng ký lại có được nhắc gọi ở **Hôm nay** không | Chưa (lần đăng ký lại không tính là "sale đã liên hệ", nên nhắc chăm sóc cũ vẫn giữ) | Thêm tín hiệu "Khách vừa đăng ký lại" ở Hôm nay (task riêng) |
| Ai nhận lead | 1 người (`FB_LEAD_OWNER_ID`), chia bằng "Giao khách" | Chia theo form/chiến dịch (task riêng) |
