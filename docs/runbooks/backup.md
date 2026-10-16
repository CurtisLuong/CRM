# Runbook — Backup và diễn tập khôi phục (T0.1)

> **Ai làm:** chủ dự án, trên MacBook, bằng ứng dụng **Terminal**. Mỗi bước có lệnh để dán + kết quả mong đợi.
> **Khi nào:** lần đầu ngay bây giờ; sau đó **trước mọi migration production**, **trước cutover** (T5.4), và mỗi tuần trong thời gian xây v2.
> **An toàn:** script chỉ **đọc** production. Khôi phục chỉ ghi vào project **staging** và tự từ chối nếu trỏ nhầm production.
> Script: `scripts/backup/` · Quyết định: D-012 · Hợp đồng dữ liệu: `architecture.md` §3.

**Backup chứa dữ liệu khách thật và mã băm mật khẩu đăng nhập.** Chỉ để trên máy của anh (mặc định `~/CRM-backups`) + 1 ổ ngoài/iCloud riêng tư. Không đưa vào repo, không gửi qua chat/email, không dán nội dung cho AI.

---

## Phần A — Chuẩn bị (làm 1 lần)

### Bước 1. Cài công cụ

Mở Terminal, dán:

```bash
brew install postgresql@17 jq
```

Mong đợi: chạy vài phút, kết thúc không có chữ `Error`. (Đã có Homebrew trên máy.)

### Bước 2. Tạo file cấu hình `.env.backup`

```bash
cd ~/Projects/CRM && cp scripts/backup/env.backup.example .env.backup && chmod 600 .env.backup && open -e .env.backup
```

File mở trong TextEdit. Điền 3 giá trị (giữ nguyên dấu `"`):

1. **`SUPABASE_DB_URL`** — Supabase Dashboard → project production → nút **Connect** (trên cùng) → mục **Connection string** → chọn **Session pooler** → bấm copy chuỗi `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-…pooler.supabase.com:5432/postgres` → dán, rồi thay `[YOUR-PASSWORD]` bằng **mật khẩu database**.
   - Quên mật khẩu database: Project Settings → Database → **Reset database password**. App, landing page và Worker **không** dùng mật khẩu này (chúng dùng API key), nên đặt lại không làm gián đoạn app.
   - Dùng *Session pooler* (không dùng *Direct connection*) vì mạng gia đình thường không có IPv6.
2. **`SUPABASE_URL`** — Project Settings → **API** → *Project URL* (`https://xxxx.supabase.co`).
3. **`SUPABASE_SERVICE_ROLE_KEY`** — Project Settings → **API Keys** → tab *Legacy API keys* → **service_role** → Reveal → copy (chuỗi bắt đầu `eyJ…`). Khoá này toàn quyền: chỉ để trong file này.

Để trống phần STAGING tới Phần C. Lưu file (⌘S), đóng TextEdit.

Kiểm tra file không bị Git theo dõi:

```bash
git check-ignore .env.backup
```

Mong đợi: in ra `.env.backup`. Nếu không in gì → **dừng**, báo agent.

---

## Phần B — Chạy backup

```bash
cd ~/Projects/CRM && bash scripts/backup/dump.sh
```

Mong đợi (vài chục giây – vài phút tuỳ số file):

```text
Backup production (project: xxxx)
  ✓ Kết nối được database (Postgres 15|17, pg_dump 17)
  ✓ public.dump … ✓ customers.json (N khách) … ✓ storage-manifest.tsv (M file)
Tải file Storage — bucket: customer-docs customer-avatars
  ✓ Tải mới M · đã có 0 · lỗi 0
Số dòng từng bảng: …
✓ XONG. Backup ở: /Users/<anh>/CRM-backups/20261016-213000  (… MB)
```

- Chỉ cần database (nhanh, ví dụ ngay trước khi chạy 1 file SQL): `bash scripts/backup/dump.sh --no-files`.
- Tải file bị lỗi giữa chừng (mạng chập chờn): chạy lại phần file, chỉ tải cái còn thiếu: `bash scripts/backup/storage.sh ~/CRM-backups/<thư-mục>`.

**Trong thư mục backup có:**

| File | Nội dung |
|---|---|
| `public.dump` / `public.sql` | Toàn bộ bảng, hàm, RLS, GRANT, trigger, dữ liệu schema `public` (bản khôi phục / bản đọc được) |
| `auth-data.sql` | Tài khoản đăng nhập (`auth.users`, `auth.identities`) |
| `customers.json` | Mọi khách, đủ cột JSONB (bản độc lập để đối chiếu / cứu từng khách) |
| `storage/…` + `storage-manifest.tsv` + `storage-check.tsv` | File tài liệu + avatar, danh sách và kết quả kiểm kích thước |
| `row-counts.tsv` | Số dòng + md5 nội dung từng bảng lúc backup |
| `auth-triggers.sql`, `storage-policies.sql`, `buckets.json`, `realtime-tables.txt` | Phần cấu hình nằm ngoài schema `public` cần khi khôi phục |
| `SHA256SUMS`, `INFO.txt` | Kiểm tra file không hỏng; thời điểm, project, phiên bản |

### Bước 5. Chép bản thứ 2

Kéo thư mục backup mới nhất (Finder → `Go` → `Home` → `CRM-backups`) sang ổ ngoài hoặc iCloud Drive (thư mục riêng tư). Kiểm tra bản chép không hỏng:

```bash
cd "<thư mục backup trên ổ ngoài>" && shasum -a 256 -c SHA256SUMS | grep -v ': OK$' ; echo "xong kiểm tra"
```

Mong đợi: chỉ in `xong kiểm tra` (không có dòng nào báo FAILED).

---

## Phần C — Diễn tập khôi phục vào staging (bắt buộc 1 lần, chứng minh backup dùng được)

Cần project Supabase **staging mới, trống** (tạo theo `docs/runbooks/v2-infra.md` Bước 1). Không khôi phục vào project đã có dữ liệu.

1. Mở `.env.backup` (`open -e .env.backup`), điền phần STAGING theo đúng cách Bước 2 nhưng lấy từ **project staging**: `STAGING_DB_URL` (Session pooler + mật khẩu database staging), `STAGING_URL`, `STAGING_SERVICE_ROLE_KEY`. Lưu.
2. Chạy (thay `<thư-mục>` bằng backup mới nhất, ví dụ `20261016-213000`):

   ```bash
   cd ~/Projects/CRM && bash scripts/backup/restore-staging.sh ~/CRM-backups/<thư-mục>
   ```

3. Script hỏi *"Gõ đúng mã project staging"* → gõ mã staging được in ngay phía trên → Enter.
4. Mong đợi cuối cùng: bảng so sánh, mọi dòng có **✓** (bucket không backup ghi "bỏ qua"), và dòng `✓ KHÔI PHỤC KHỚP HOÀN TOÀN`. Các dòng `NOTICE … does not exist, skipping` (nếu có) là vô hại.

| Kết quả | Ý nghĩa | Làm gì |
|---|---|---|
| Mọi dòng ✓ (hoặc "bỏ qua") | Backup khôi phục đủ: cùng số dòng **và** cùng nội dung (md5) | Gửi agent **bảng so sánh** (chỉ có tên bảng, số dòng, ✓/✗ — không có dữ liệu khách) để đóng T0.1 |
| "bỏ qua" ở `storage.objects[app-releases]` | Bucket không nằm trong `BACKUP_BUCKETS` (file APK, cố ý không backup) | Bình thường. Muốn giữ cả APK: thêm `app-releases` vào `BACKUP_BUCKETS` |
| ✗ ở `storage.objects[…]` | File chưa tải lên đủ | Chạy lại lệnh ở bước 2 trên project staging mới, hoặc báo agent |
| ✗ ở bảng `public.*` / `auth.*` | Khôi phục lệch | Không làm gì thêm trên production; gửi agent bảng + dòng lỗi |
| Dừng với `✗ …` trước khi có bảng | Lỗi kết nối / staging không trống / lỗi khôi phục | Gửi agent đúng dòng lỗi (không gửi file backup) |

Báo cáo cũng được lưu tại `~/CRM-backups/<thư-mục>/restore-report.md`.

5. Sau khi khớp: đăng nhập thử staging theo `v2-infra.md` Bước 3 (mật khẩu đăng nhập giống production vì tài khoản được khôi phục).

**Lưu ý:** staging lúc này chứa **dữ liệu thật** → giữ riêng tư như production; không đưa mật khẩu/khoá staging cho người ngoài.

---

## Phần D — Khi cần cứu dữ liệu production

Không tự khôi phục đè lên production. Tuỳ mức độ:

1. **Sai/mất dữ liệu của 1–vài khách** (sửa nhầm, xoá nhầm): dùng nhật ký `customer_changes` (sau khi T0.2 chạy) — `docs/runbooks/audit.md` có câu SQL khôi phục từng trường / từng khách. Hoặc lấy bản của khách đó trong `customers.json` của backup gần nhất.
2. **Hỏng diện rộng:** dừng dùng app trên mọi máy (để hàng đợi offline không ghi thêm), báo agent kèm thời điểm phát hiện. Agent sẽ khôi phục backup vào staging trước, đối chiếu, rồi lập kế hoạch chép phần cần cứu sang production — anh duyệt từng bước.
3. Supabase gói trả phí có *Point-in-time recovery* / backup hằng ngày trong Dashboard → Database → Backups; xem ở đó trước khi khôi phục toàn bộ.

---

## Sự cố thường gặp

| Thông báo | Cách xử lý |
|---|---|
| `Chưa cài công cụ PostgreSQL` / `Thiếu jq` | Làm lại Bước 1 |
| `Không kết nối được database` | Sai mật khẩu hoặc dùng nhầm *Direct connection* → copy lại chuỗi **Session pooler**, thay đúng mật khẩu |
| `pg_dump bản X cũ hơn server Y` | `brew install postgresql@Y` rồi chạy lại |
| `BACKUP_ROOT đang nằm TRONG repo` | Sửa `BACKUP_ROOT` trong `.env.backup` thành thư mục ngoài `~/Projects/CRM` |
| `Có N file chưa tải được` | Chạy lại `storage.sh` (chỉ tải phần thiếu); vẫn lỗi → kiểm tra `SUPABASE_SERVICE_ROLE_KEY` |
| `STAGING_DB_URL đang trỏ vào PRODUCTION` | Chuỗi staging bị chép nhầm từ production → lấy lại từ project staging |
