# Runbook — Kiểm chứng dữ liệu v2 trên staging (T5.2)

> **Ai làm:** chủ dự án + agent. Bước nào **anh** làm, bước nào **agent** làm được ghi rõ ở đầu mỗi bước.
> **Ở đâu:** chỉ trên **staging** (`mksjmpcsfawsiabfhoxe`) và app v2 `https://crm-v2-9hf.pages.dev`. **Không** làm gì trên production (`nrqccwamwctihivpxjww`), không mở `crm-cop.pages.dev` để thử.
> **Mục tiêu:** có số liệu trước/sau cho từng bước và chứng minh **0 mất dữ liệu** (D-012). Kết quả ghi vào `docs/audits/v2-data-verification.md`.
> **Công cụ (đều chỉ đọc):** `scripts/verify/counts.sql` (số đếm + vân tay), `scripts/verify/audit-since.sql` (soi nhật ký tìm mất dữ liệu), `scripts/verify/idb-counts.js` (số app v2 đang giữ trong máy).

Mọi kết quả SQL ở đây **không chứa tên/SĐT khách** (chỉ số đếm, mã băm, mã khách, tên cột) → gửi agent được. Không gửi file backup, không dán dữ liệu khách cho AI.

---

## Cách chạy một file SQL (dùng cho mọi bước)

1. Mở Supabase Dashboard → chọn project **staging** `mksjmpcsfawsiabfhoxe` (kiểm tra mã trên thanh địa chỉ trình duyệt; **không** phải `nrqccwamwctihivpxjww`).
2. Menu trái → **SQL Editor** → **New query**.
3. Trên Mac, mở file trong repo (vd. `scripts/verify/counts.sql`), chọn hết (⌘A), copy (⌘C), dán vào SQL Editor.
4. Riêng `audit-since.sql`: sửa dòng có chữ `← SỬA MỐC GIỜ Ở ĐÂY` thành mốc giờ agent đưa (giờ Việt Nam).
5. Bấm **Run**. Kết quả hiện bên dưới → nút **Export** → **Download CSV** → gửi file CSV cho agent (hoặc chụp màn hình bảng).

---

## Phần A — Chuẩn bị staging *(anh làm, ~20 phút)*

T5.2 yêu cầu staging là bản khôi phục **mới nhất** từ production. Script khôi phục (`restore-staging.sh`) chỉ chạy vào project **trống**, mà staging hiện tại đã có dữ liệu từ lần khôi phục 2026-10-16 + dữ liệu anh thử trên v2. Cách làm theo quyết định đã chọn, ghi trong báo cáo `v2-data-verification.md` mục "Staging dùng cho lần kiểm".

**A1. Backup production mới** (chỉ đọc production):

```bash
cd ~/Projects/CRM && bash scripts/backup/dump.sh
```

Mong đợi: dòng cuối `✓ XONG. Backup ở: …/CRM-backups/<thư-mục>`. Ghi lại tên thư mục.

**A2. Khôi phục vào project staging trống** — theo `docs/runbooks/backup.md` Phần C (lệnh `restore-staging.sh`). Mong đợi `✓ KHÔI PHỤC KHỚP HOÀN TOÀN`.

**A3. Chạy migration v2 trên staging** (production chưa có các cột này; đây cũng là diễn tập cho cutover T5.4). Trên **staging**, chạy lần lượt từng file bằng SQL Editor:
`SQL/v2/002_customer_memory.sql` → `003_campaign_costs.sql` → `004_user_settings_ui_state.sql` → `005_units_verified_at.sql` → `006_catalog_archives.sql`. Mỗi file mong đợi `Success. No rows returned`.

**A4.** Nếu project staging đổi mã (tạo project mới): báo agent trước khi làm tiếp — cần đổi biến `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` của Cloudflare project `crm-v2` rồi build lại (theo `docs/runbooks/v2-infra.md`).

---

## Phần B — Số liệu gốc *(anh chạy SQL, agent ghi)*

1. Chạy `scripts/verify/counts.sql` trên staging → Export CSV → gửi agent. Đây là cột **"Trước"** trong báo cáo.
2. Ghi lại **giờ hiện tại** (vd. 14:05). Đây là **mốc giờ** cho `audit-since.sql` ở các bước sau.

---

## Phần C — Số v2 hiện khớp số trong DB *(anh đăng nhập, agent đếm)*

1. Trong app Claude, mở trình duyệt trong app (agent mở sẵn `crm-v2-9hf.pages.dev`). **Anh tự gõ** email + mật khẩu (giống production vì tài khoản được khôi phục) — agent không nhập mật khẩu.
2. Chờ chữ **"Đã đồng bộ"**.
3. Agent chạy `scripts/verify/idb-counts.js` trong tab đó và so với dòng của **đúng tài khoản** trong CSV Phần B (dòng `người = <tên> · <8 ký tự đầu mã>`; tài khoản admin so với dòng TỔNG nếu v2 tải mọi khách cho admin).
4. Agent mở các màn **Khách hàng**, **Khách mới**, **Công việc**, **Hôm nay** và đối chiếu số đếm hiện trên màn với số ở bước 3.
5. Lặp lại với tài khoản thứ hai (thành viên nhóm).

**Đạt khi:** mọi số khớp, hoặc chênh lệch có giải thích (vd. màn chỉ đếm khách chưa lưu trữ).

---

## Phần D — Mở + lưu không sửa mọi khách *(agent làm, anh chạy SQL)*

1. Agent mở lần lượt hồ sơ **mọi khách** của tài khoản đang đăng nhập; với mỗi khách: mở các ô sửa (thông tin, ghi chú, việc, cuộc gọi) rồi bấm **Lưu** mà **không đổi gì**.
2. Chờ "Đã đồng bộ".
3. Anh chạy `audit-since.sql` (mốc giờ = lúc bắt đầu Phần D) và `counts.sql`.

**Đạt khi:** `audit-since` chỉ có dòng **TÓM TẮT** với `thay đổi: 0`; `counts` dòng **"30 vân tay khách (bỏ updated_at)"** **giống hệt** Phần B. (Dòng "31 … đầy đủ" được phép khác vì `updated_at` đổi.)

---

## Phần E — Kịch bản rủi ro *(làm cùng nhau)*

Dùng **1 khách thử** cho mỗi kịch bản: tạo khách mới trên v2 tên `TEST T5.2 <số kịch bản>`, SĐT dạng `0900000001`, `0900000002`… (không dùng khách thật). Ghi mốc giờ trước mỗi kịch bản; sau mỗi kịch bản chạy `audit-since.sql` từ mốc đó.

| # | Kịch bản | Cách làm | Đạt khi |
|---|---|---|---|
| E1 | Offline rồi đóng app | Trên điện thoại: tắt mạng → ghi 1 cuộc gọi, 1 ghi chú, 1 việc cho khách thử → **đóng hẳn** app/tab → mở lại (vẫn offline) → bật mạng | Sau khi mở lại vẫn thấy đủ 3 mục; bật mạng → "Đã đồng bộ"; trên staging khách có đủ 3 mục; `audit-since` không có ✗ |
| E2 | 2 máy sửa cùng khách | Mac + điện thoại cùng tài khoản. Điện thoại **tắt mạng** → thêm ghi chú "từ điện thoại". Mac → thêm ghi chú "từ Mac" + đổi nghề nghiệp. Điện thoại bật mạng | Ghi lại khách còn **cả 2 ghi chú** hay mất 1 (`audit-since` báo `✗ MẤT PHẦN TỬ notes_manual`). Mất → tạo task con, **chặn cutover** |
| E3 | Mở gọi rồi huỷ | Bấm **Gọi** khách thử → huỷ cuộc gọi/quay lại ngay → không chọn kết quả | Không mất cuộc gọi cũ; không có 2 cuộc gọi trùng; cuộc gọi chưa ghi hiện nhắc "ghi kết quả" như v1 |
| E4 | Webhook Facebook lặp | **Không** bắn lead thử nếu Worker còn trỏ production. Agent chạy `node tests/fb-leads.test.mjs` (chống trùng) và kiểm tra Worker đang trỏ DB nào | Test pass; nếu có Worker staging: gửi cùng 1 lead 2 lần → chỉ 1 khách, `fb_leads` có 1 `created` + 1 `merged` |
| E5 | Đổi tài khoản | Tài khoản A tắt mạng → thêm 1 ghi chú → đăng xuất → đăng nhập B (bật mạng) → đăng xuất → đăng nhập lại A | B **không** thấy khách của A (trừ khách được giao/theo dõi); ghi chú của A **không** bị gửi dưới tên B; đăng nhập lại A → ghi chú được gửi, "Đã đồng bộ" |
| E6 | Hàng đợi chéo v1 ↔ v2 | Trên thật chỉ xảy ra lúc cutover (cùng tên miền). Agent chạy `npx vitest run tests/data/localdb.test.ts` (v2 gửi đúng hàng đợi v1 ghi và ngược lại) | Test pass; runbook cutover giữ bước "mọi máy Đã đồng bộ trước khi đổi" |

Xong kịch bản: lưu trữ (không xoá) các khách `TEST T5.2 …`.

---

## Phần F — Chốt *(anh chạy SQL, agent viết báo cáo)*

1. Chạy `counts.sql` → cột **"Sau"**. Chênh lệch với "Trước" phải giải thích được bằng đúng các thao tác Phần E (vd. +6 khách thử, +N ghi chú).
2. Chạy `audit-since.sql` với mốc giờ **Phần B** → toàn bộ lần kiểm. Không được có `✗` ngoài các lỗi đã ghi thành task con.
3. Gửi 2 CSV cho agent → agent điền `docs/audits/v2-data-verification.md` → cổng merge đánh dấu T5.2 ☑ khi **0 mất dữ liệu** (hoặc mọi lỗi đã có task con và anh đồng ý).

## Sự cố

| Gặp | Làm gì |
|---|---|
| SQL báo `relation "public.customer_changes" does not exist` | Staging chưa có audit T0.2 → chạy `SQL/v2/001_customer_audit.sql` trên **staging** rồi chạy lại |
| v2 không đăng nhập được | Kiểm tra Cloudflare `crm-v2` trỏ đúng staging (Phần A4) |
| `audit-since` có dòng ✗ | Không sửa tay dữ liệu. Gửi CSV cho agent; khách bị mất phần tử khôi phục được từ cột `old` của `customer_changes` (`docs/runbooks/audit.md`) |
