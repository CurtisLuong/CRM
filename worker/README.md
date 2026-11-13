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

## Lãi suất ngân hàng mỗi sáng (BR-01, BR-02, BR-03, BR-04)

`bank-rates.js` đọc lần lượt 5 Bing News RSS: hai truy vấn vay cũ, “lãi suất tiết kiệm
12 tháng”, “lãi suất tiết kiệm Big4” và “lãi suất vay mua nhà tháng <tháng>/<năm>”
(tháng hiện tại tại Việt Nam, tính lại mỗi lượt), đủ 10 trang chủ ngân hàng rồi 5 RSS cũ,
tất cả cấu hình trong `bank-rates-config.js`. Tiếp theo đọc bài từ tìm kiếm trước
(mới nhất trước), bài từ RSS cũ sau, cuối cùng mới đọc liên kết về lãi suất/vay nhà
của ngân hàng (chia vòng, tối đa 3 trang/ngân hàng). Không có liên kết phù hợp thì
không đọc trang con. URL trùng chỉ đọc một lần trong cả lượt.

20 nguồn đầu vào dùng tối đa 21 request (tối đa 1 request redirect bổ sung),
chừa 10 request cho bài báo khi nguồn đầu vào không redirect (`MIN_NEWS_PAGES = 10`).
Nếu nguồn đầu vào redirect thì còn 9 request cho bài, tổng vẫn không vượt 30.
Redirect bài báo cũng tính trong phần này. Nếu ít bài, phần dư dùng cho trang con.
Bing chỉ dùng để tìm URL; không gửi trang tìm kiếm cho AI hoặc lưu link Bing.
Chỉ nhận URL gốc HTTPS thuộc các báo RSS cũ và Vietstock, Dân trí, VietnamNet,
Báo Mới, Soha; thêm 24h, Thanh Niên, Tuổi Trẻ, VnExpress, Znews, Lao Động,
Báo Pháp Luật (kể cả subdomain), Người Quan Sát, CafeBiz, CafeLand, Batdongsan,
Báo Gia Lai, Người Lao Động, Tiền Phong, VTV. Bỏ link thiếu `url`, host lạ, IP
hoặc giao thức không hợp lệ. Ví dụ:
`http://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fdantri.com.vn%2Fkinh-doanh%2Flai-vay.htm&ref=BF`
→ `https://dantri.com.vn/kinh-doanh/lai-vay.htm`. Bài tìm được vẫn là nguồn `news`.

Bài báo phải có từ khóa về lãi vay hoặc lãi tiết kiệm/tiền gửi và ngày đăng không quá 90 ngày. Mỗi lượt tối đa
30 HTTP request công khai, tính cả RSS, redirect và nguồn lỗi. Nội dung HTML/script
được bỏ, hotline được ẩn, văn bản xử lý tối đa 12.000 ký tự/trang.
Bài dài được cắt thành đoạn tối đa `CHUNK_TEXT = 3.500` ký tự, ưu tiên cuối câu,
chồng mép `CHUNK_OVERLAP = 400` ký tự. Mỗi đoạn gọi Workers AI Qwen một lần;
tối đa `MAX_CHUNKS_PER_PAGE = 4` đoạn/trang và `MAX_AI_CALLS = 40` lần/cả lượt
(cấu hình ở `bank-rates-config.js`, tính cả lần AI lỗi/timeout). Hết ngân sách thì
log tên giới hạn, dừng gọi thêm, vẫn ghi số đã kiểm được. Các đoạn của một trang
gộp theo `(bank_code, kind)`, giữ dòng hợp lệ đầu tiên, không ghép trường giữa đoạn.
Không gọi AI bên ngoài binding `AI`.

AI phải trả JSON đúng khuôn với trích dẫn nguyên văn cho từng số, bao gồm
`deposit_rate`. Lãi gửi chỉ lấy tiết kiệm cá nhân kỳ hạn đúng 12 tháng, tại quầy
hoặc online; kênh được ghi vào `note` nếu nguồn nêu. Bỏ kỳ hạn khác, tiền gửi
doanh nghiệp và lãi đặc biệt đòi số tiền rất lớn. Không suy đoán hoặc bịa số.
Một kết quả AI có thể chứa cả vay và gửi cho mỗi ngân hàng; Worker tách thành
dòng `kind=loan` (cột gửi null) và `kind=deposit` (mọi cột vay null). Lãi gửi
chỉ nhận 1–12%/năm. Trích dẫn phải có trong chính đoạn đã gửi AI và chứa nguyên số,
không nhận số con (ví dụ `5,9` trong `15,9`). Nếu trích dẫn ngắn, Worker kiểm từng
lần xuất hiện, lấy câu chứa số và tối đa khoảng 300 ký tự trước đầu câu để tìm
sản phẩm/kỳ hạn. Số gửi phải gắn với kỳ hạn 12 tháng ngay trước (hoặc ngay sau nếu
không có kỳ hạn trước), có ngữ cảnh tiết kiệm/tiền gửi/huy động và không thuộc loại
đặc biệt/doanh nghiệp. Tên ngân hàng gần số trong cửa sổ hoặc phần trước tối đa
1.500 ký tự phải khớp mã AI trả; đối chiếu không phân biệt hoa/thường từ `BANK_SOURCES`.
Tên ngân hàng khác gần hơn thì loại. Cửa sổ chỉ để kiểm, không lưu vào bảng;
`note` vẫn chỉ nhận nếu nguyên văn có trong đoạn.

JSON đúng cú pháp nhưng sai khuôn bị bỏ cả phản hồi như trước. Riêng lỗi cú pháp,
Worker quét object trong mảng `rates`, đếm ngoặc (bỏ ngoặc đóng thừa, bỏ qua ngoặc
trong chuỗi), cứu từng object đúng khuôn rồi kiểm bằng chứng như bình thường.
Không cứu được object nào thì tăng `failed`; đoạn lỗi không làm mất dòng hợp lệ
ở các đoạn khác. Một trang có đoạn lỗi không cứu được được tính `failed` một lần.

Với lãi vay, Worker đối chiếu trích dẫn
với văn bản, kiểm khoảng lãi 3–20%/năm, cộng tham chiếu + biên độ nếu đủ số, bỏ
thả nổi thấp hơn ưu đãi. Biên độ tính bằng điểm %, có thể nhỏ hơn 3. Trong cùng
lượt, chọn riêng theo `(bank_code, kind)`: nguồn ngân hàng thắng báo, cùng loại
nguồn chọn ngày đăng mới hơn; không ghép gói giữa các trang. Lệch hơn 2 điểm
so với bản mới nhất của cùng ngân hàng và loại thì bỏ dòng đó, log cả loại.
Lãi gửi bị loại không làm mất dòng vay hợp lệ và ngược lại.
`published_on` luôn lấy ngày nguồn công bố: ưu tiên meta/ngày bài gốc rồi ngày RSS.
Trang ngân hàng không có ngày công bố lưu null; không dùng ngày đọc để điền.
`fetched_at` mới là thời điểm Worker đọc nguồn.
Không có số hợp lệ thì không ghi; bản cũ trong `bank_rates_latest` vẫn giữ nguyên.
Lỗi đọc bản cũ từ Supabase làm dừng lượt trước khi ghi.

Cron `0 0 * * *` chạy lúc **07:00 Việt Nam**, tách biệt cron Facebook `*/5`.
Các yêu cầu đồng thời trong cùng isolate được gộp; cùng ngày đã hoàn tất thì bỏ qua.
Isolate mới đọc cả hai loại từ view `bank_rates_latest` (bản mới nhất theo ngân hàng
và loại), kiểm `fetched_at` để tránh ghi lại trong ngày
Việt Nam. Nếu cả lượt không ghi được dòng nào, dấu đã chạy chỉ nằm trong bộ nhớ
isolate; schema 016/017 không có bảng khóa lượt chạy bền vững. Không tạo bảng khác.
Kiểm ngày không phải khóa nguyên tử: hai isolate cùng bắt đầu trước khi có dòng
mới vẫn có thể cùng chạy. Lịch cron chỉ khai báo một lần mỗi ngày.

Curtis/Lead thiết lập sau khi duyệt:

1. Bảo đảm SQL `016_bank_rates.sql` rồi `017_bank_rates_deposit.sql` đã có trên
   đúng Supabase mà Worker đang dùng:
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
   (lỗi trích xuất/ghi), thêm `ai_calls` và `rejected` đếm theo lý do:
   `no_quote_in_text`, `no_context`, `wrong_term`, `wrong_bank`, `out_of_range`,
   `drift`, `json`. Đã chạy hôm nay trả `skipped: "already_ran_today"`,
   `ai_calls: 0` và các bộ đếm loại bằng 0.
   Secret thiếu/sai trả 401; lỗi cấu hình/đọc DB trả 503. Xem `wrangler tail` để biết
   nguồn lỗi hoặc ngân hàng bị chặn do lệch số; log không chứa khóa hay nội dung AI.
   Cuối lượt có `bank-rates summary`: các thống kê trên, `ai_rows` (số object đọc
   được từ AI), `validated` (số dòng vay/gửi qua kiểm trước gộp/chặn lệch).
   `rejected` đếm mỗi dòng vay/gửi bị loại một lý do; đoạn chồng có thể đếm lại
   một đề xuất. `json` đếm phản hồi bỏ hoàn toàn; JSON cứu được không tính lỗi này.
   Summary không chứa văn bản bài, trích dẫn, note hoặc số điện thoại.
5. Trên Supabase cùng môi trường, xem `bank_rates_latest`: mỗi dòng mới có URL
   trang đã đọc, loại vay/gửi, ngày công bố (có thể null) và ngày lấy; bấm nguồn để kiểm số gần đúng. Trang bị 403 hoặc không
   có số công khai sẽ giữ bản cũ. Không cần đọc/ghi bảng khách.

Kiểm thử offline: `npm run check` rồi `npx vitest run tests/worker`.
Fixture BR-01 trong `tests/worker/fixtures/bank-rates/`, fixture BR-02 đặt ngay trong
`tests/worker/bank-rates-search.test.ts`, fixture BR-03 trong
`tests/worker/bank-rates-deposit.test.ts`: mô phỏng HTML/RSS theo các nguồn được giao,
với số/ngày cố định phục vụ test (Lead duyệt dùng mô phỏng). Chưa kiểm website live
hoặc deploy; task cấm gọi mạng thật.
BR-04 có `tests/worker/bank-rates-chunks.test.ts` và fixture mô phỏng bài dài nhiều
ngân hàng `tests/worker/fixtures/bank-rates/long-multi-bank.txt`, kiểm cắt đoạn,
ngân sách, bằng chứng ngắn, ngân hàng gần nhất, cứu JSON và summary/response.
