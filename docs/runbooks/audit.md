# Runbook — Nhật ký thay đổi khách `customer_changes` (T0.2)

> **Mục đích:** mọi lần **sửa** hoặc **xoá** khách trên server (từ app v1, v2, landing page, Worker Facebook, SQL Editor) đều lưu lại **giá trị cũ** → cứu được dữ liệu khi có lỗi. Bảng chỉ-thêm: không ai (kể cả service role) sửa/xoá được.
> **File:** `SQL/v2/001_customer_audit.sql` · Test: `tests/sql/001_customer_audit.test.sql` · Quyết định: D-012 · `architecture.md` §3.1.6.
> Migration **chỉ thêm** bảng + trigger mới, không đổi cột/dữ liệu `customers`.

## 1. Chạy (chủ dự án)

**Hai project — xem mã trên thanh địa chỉ Dashboard (`supabase.com/dashboard/project/<mã>`) trước mỗi lần chạy:**

| Gọi là | Mã project | Là gì |
|---|---|---|
| **production** | `nrqccwamwctihivpxjww` | DB cũ, đang chạy thật — app v1 (`crm-cop.pages.dev`, APK) đọc/ghi vào đây |
| **staging** | `mksjmpcsfawsiabfhoxe` | Bản sao để thử (khôi phục từ backup 2026-10-16) — không app nào đang dùng |


Thứ tự bắt buộc — không bỏ bước:

1. **Staging trước.** Supabase Dashboard → project **staging** → SQL Editor → *New query* → dán **toàn bộ** `SQL/v2/001_customer_audit.sql` → **Run**. Mong đợi: `Success. No rows returned`.
2. Cùng project staging, query mới → dán toàn bộ `tests/sql/001_customer_audit.test.sql` → **Run**. Mong đợi: một thông báo **lỗi màu đỏ** (SQL Editor ghi `Failed to run sql query: ERROR: P0001: …`) đúng nội dung
   `AUDIT TEST: TẤT CẢ ĐẠT (12/12) — đã rollback, không để lại dữ liệu`.
   (Dùng lỗi để buộc huỷ dữ liệu thử — đây là kết quả đúng.) Nội dung khác → dừng, gửi agent nguyên văn.
3. *(Bỏ qua tới khi có app v2 trên `crm-v2`)* App v1 chỉ trỏ production nên chưa sửa khách trên staging bằng app được. File test ở bước 2 đã kiểm tra đúng cơ chế đó (sửa với quyền sale, RLS, xoá); kiểm tra bằng app thật làm ở bước 7 trên production.
4. **Backup production**: `bash scripts/backup/dump.sh --no-files` (`backup.md` Phần B).
5. **Production:** SQL Editor project production → dán toàn bộ `001_customer_audit.sql` → Run → `Success`.
6. Kiểm tra production (chỉ đọc):
   ```sql
   select (select count(*) from pg_trigger where tgname in ('customers_audit','customer_changes_no_update_delete','customer_changes_no_truncate')) as trigger_count,
          (select relrowsecurity from pg_class where oid = 'public.customer_changes'::regclass) as rls;
   ```
   Mong đợi: `trigger_count = 3`, `rls = true`. **Không** chạy file test trên production.
7. Dùng app bình thường 1 ngày, rồi chạy câu ở bước 3 trên production → có dòng nhật ký.

Chạy lại file migration nhiều lần vẫn an toàn (không nhân đôi, không mất nhật ký đã có).

## 2. Nhật ký ghi gì

| Cột | Ý nghĩa |
|---|---|
| `customer_id`, `owner_id` | Khách + người phụ trách **lúc thay đổi** (giữ quyền xem sau khi khách bị xoá/giao) |
| `changed_at`, `changed_by`, `changed_role` | Lúc nào, ai (`auth.uid()`; trống = service role/SQL Editor), vai trò (`authenticated` = app; `service_role` = landing/Worker; `postgres` = SQL Editor) |
| `op` | `UPDATE` hoặc `DELETE` |
| `old` | UPDATE: giá trị **cũ** của các cột đã đổi (+ `updated_at`, `updated_by` cũ). DELETE: **cả hàng** |
| `new_keys` | Tên các cột đã đổi (UPDATE) |

Lưu đúng cả thuộc tính JSONB lạ (không lọc). Sửa mà giá trị không đổi (chỉ `updated_at` nhảy) → không ghi.
Ai xem được: người phụ trách khách (kể cả khách đã xoá/đã giao đi), admin. Sale khác không xem được.
Nếu **không ghi được nhật ký** (sự cố hiếm) → chính câu sửa/xoá khách bị huỷ kèm thông báo *"Không ghi được nhật ký thay đổi khách…"*: không có thay đổi nào lọt mà không có nhật ký.

## 3. Dung lượng

Mỗi lần lưu ghi lại giá trị cũ của cột đổi. Cột lớn nhất là các mảng JSONB (`call_attempts`, `care_stage_history`, `next_tasks`, `notes_manual`) — mỗi lần ghi cuộc gọi lưu lại cả mảng cũ của khách đó (thường vài KB).
Ước lượng: ~50 lần sửa/ngày × ~5 KB ≈ 250 KB/ngày ≈ **~90 MB/năm** cho 1 sale. Gói Free Supabase có 500 MB database. Kiểm tra mỗi tháng:

```sql
select pg_size_pretty(pg_total_relation_size('public.customer_changes')) as audit_size,
       pg_size_pretty(pg_database_size(current_database())) as db_size,
       (select count(*) from public.customer_changes) as rows;
```

Khi `audit_size` > ~200 MB: báo agent đề xuất chính sách lưu giữ (vd chuyển nhật ký > 12 tháng ra file backup rồi dọn) — cần **quyết định riêng + backup**; trigger chỉ-thêm phải tạm tắt có chủ đích.

## 4. Truy vấn khôi phục mẫu (SQL Editor production — đọc kỹ trước khi chạy câu có `update`/`insert`)

Mọi câu khôi phục bên dưới **cũng được ghi nhật ký** (khôi phục sai vẫn hoàn tác được).

**a) Lịch sử 1 khách theo SĐT** (gồm cả khách đã bị xoá):

```sql
select ch.id, ch.changed_at at time zone 'Asia/Ho_Chi_Minh' as luc, ch.op, ch.new_keys, ch.changed_role, ch.old
from public.customer_changes ch
where ch.customer_id in (select id from public.customers where phone = '09xxxxxxxx')
   or ch.old ->> 'phone' = '09xxxxxxxx'
order by ch.changed_at desc;
```

**b) Ai đổi gì trong 24 giờ qua:**

```sql
select changed_at at time zone 'Asia/Ho_Chi_Minh' as luc, customer_id, op, new_keys, changed_role
from public.customer_changes where changed_at > now() - interval '24 hours' order by changed_at desc;
```

**c) Đưa 1 cột về giá trị TRƯỚC một lần sửa** (lấy `id` dòng nhật ký từ câu a; ví dụ cột `notes_manual`):

```sql
update public.customers c
set notes_manual = ch.old -> 'notes_manual'
from public.customer_changes ch
where ch.id = 12345                      -- id dòng nhật ký
  and c.id = ch.customer_id
  and ch.old ? 'notes_manual';           -- chỉ chạy nếu lần đó thật sự đổi cột này
```

Với cột không phải JSONB (vd `full_name`, `care_stage`, `next_call_at`): `set full_name = ch.old ->> 'full_name'` (timestamp: `(ch.old ->> 'next_call_at')::timestamptz`). Sau khi chạy: mở app → kéo làm mới; máy nào đang offline có hàng đợi cũ có thể ghi đè lại (LWW) → đồng bộ mọi máy trước.

**d) Khôi phục khách bị xoá** (từ dòng `op = 'DELETE'`):

```sql
insert into public.customers
select (jsonb_populate_record(null::public.customers, ch.old)).*
from public.customer_changes ch
where ch.id = 12345 and ch.op = 'DELETE'
on conflict (id) do nothing;
```

Tài liệu (`documents`) của khách bị xoá theo `on delete cascade` **không** có trong nhật ký này → lấy từ backup (`public.sql` / thư mục `storage/` của bản backup trước lúc xoá); báo agent hỗ trợ.

## 5. Sự cố

| Triệu chứng | Làm gì |
|---|---|
| App báo lỗi đồng bộ có chữ *"Không ghi được nhật ký thay đổi khách"* | Dữ liệu chưa bị đổi (an toàn). Gửi agent nguyên văn lỗi. Khẩn cấp cần lưu ngay: chủ dự án có thể tạm tắt **chỉ** trigger ghi nhật ký: `alter table public.customers disable trigger customers_audit;` → báo agent, bật lại bằng `enable trigger` sau khi sửa |
| Báo *"customer_changes là nhật ký chỉ-thêm"* | Có thao tác đang cố sửa/xoá nhật ký — đúng thiết kế; kiểm tra ai/cái gì đang làm vậy |
