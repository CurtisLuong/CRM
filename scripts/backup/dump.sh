#!/usr/bin/env bash
# scripts/backup/dump.sh — BACKUP TOÀN BỘ production (T0.1). Chỉ ĐỌC production, không sửa gì.
#   bash scripts/backup/dump.sh            → database + file Storage
#   bash scripts/backup/dump.sh --no-files → chỉ database (nhanh, dùng trước migration nhỏ)
# Kết quả: thư mục ~/CRM-backups/<ngày-giờ>/ (ngoài repo). Hướng dẫn: docs/runbooks/backup.md
set -euo pipefail
. "$(dirname "$0")/lib.sh"

WITH_FILES=1
[ "${1:-}" = "--no-files" ] && WITH_FILES=0

load_env
find_pg_tools
[ -n "${SUPABASE_DB_URL:-}" ] || die "Thiếu SUPABASE_DB_URL trong .env.backup"
DB="$SUPABASE_DB_URL"
REF="$(project_ref "$DB")"

say "Backup production (project: ${REF:-?})"
check_versions "$DB"

umask 077
OUT="$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
chmod 700 "$BACKUP_ROOT" "$OUT"
say "Thư mục: $OUT"

# 1) Schema + dữ liệu public: bản custom (để khôi phục) + bản .sql đọc được.
"$PG_DUMP" "$DB" --schema=public --format=custom --no-owner --file "$OUT/public.dump"
ok "public.dump (định dạng khôi phục)"
"$PG_DUMP" "$DB" --schema=public --format=plain --no-owner --file "$OUT/public.sql"
ok "public.sql (đọc được)"

# 2) Tài khoản đăng nhập (owner_id của khách trỏ tới đây) — chỉ dữ liệu.
"$PG_DUMP" "$DB" --data-only --table=auth.users --table=auth.identities --file "$OUT/auth-data.sql"
ok "auth-data.sql (tài khoản)"

# 3) Thành phần ngoài schema public mà khôi phục cần: trigger trên auth.users, policy + bucket Storage, realtime.
"$PSQL" "$DB" -X -q -At -v ON_ERROR_STOP=1 > "$OUT/auth-triggers.sql" <<'SQL'
select pg_get_triggerdef(t.oid) || ';'
from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal order by t.tgname;
SQL
"$PSQL" "$DB" -X -q -At -v ON_ERROR_STOP=1 > "$OUT/storage-policies.sql" <<'SQL'
select format('drop policy if exists %I on storage.objects; create policy %I on storage.objects as %s for %s to %s%s%s;',
  policyname, policyname, permissive, cmd, array_to_string(roles, ', '),
  coalesce(' using (' || qual || ')', ''), coalesce(' with check (' || with_check || ')', ''))
from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;
SQL
"$PSQL" "$DB" -X -q -At -v ON_ERROR_STOP=1 -c \
  "select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'public', public, 'file_size_limit', file_size_limit, 'allowed_mime_types', allowed_mime_types) order by id), '[]') from storage.buckets" \
  > "$OUT/buckets.json"
"$PSQL" "$DB" -X -q -At -v ON_ERROR_STOP=1 -c \
  "select coalesce(string_agg(schemaname || '.' || tablename, E'\n' order by tablename), '') from pg_publication_tables where pubname = 'supabase_realtime'" \
  > "$OUT/realtime-tables.txt"
ok "auth-triggers.sql, storage-policies.sql, buckets.json, realtime-tables.txt"

# 4) customers.json — toàn bộ khách, đủ mọi cột JSONB (bản dễ đọc / so sánh độc lập với pg_dump).
"$PSQL" "$DB" -X -q -At -v ON_ERROR_STOP=1 -c \
  "set timezone = 'UTC'; select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]') from public.customers c" \
  | grep -v '^SET$' > "$OUT/customers.json"   # psql 15+ in cả chữ "SET" của lệnh đầu → bỏ
N_JSON="$(jq 'length' "$OUT/customers.json")"
ok "customers.json ($N_JSON khách)"

# 5) Danh sách file Storage (bucket, tên, kích thước) — storage.sh dùng để tải.
"$PSQL" "$DB" -X -q -At -F $'\t' -v ON_ERROR_STOP=1 -c \
  "select bucket_id, name, coalesce(metadata->>'size', '') from storage.objects order by bucket_id, name" \
  > "$OUT/storage-manifest.tsv"
ok "storage-manifest.tsv ($(wc -l < "$OUT/storage-manifest.tsv" | tr -d ' ') file)"

# 6) Số dòng + md5 nội dung từng bảng — để so khi khôi phục.
"$PSQL" "$DB" -X -q -At -F $'\t' -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/row-counts.sql" | grep -v '^SET$' > "$OUT/row-counts.tsv"
ok "row-counts.tsv"

# Kiểm tra chéo: số khách trong customers.json = số dòng public.customers.
N_DB="$(awk -F'\t' '$1=="public.customers"{print $2}' "$OUT/row-counts.tsv")"
[ "$N_JSON" = "$N_DB" ] || die "customers.json có $N_JSON khách nhưng bảng có $N_DB dòng — backup không nhất quán, chạy lại."

cat > "$OUT/INFO.txt" <<EOF
Backup Sổ Khách CRM (T0.1)
Thời điểm: $(date '+%Y-%m-%d %H:%M:%S %z')
Project:   ${REF:-?}
pg_dump:   $("$PG_DUMP" --version)
Git:       $(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo '?')
Khôi phục: docs/runbooks/backup.md (Phần C)
EOF

# 7) File Storage.
if [ "$WITH_FILES" -eq 1 ]; then
  bash "$SCRIPT_DIR/storage.sh" "$OUT"
else
  warn "Bỏ qua file Storage (--no-files)."
fi

( cd "$OUT" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS )
ok "SHA256SUMS (kiểm tra file không hỏng: cd vào thư mục backup rồi chạy  shasum -a 256 -c SHA256SUMS)"

say ""
say "Số dòng từng bảng:"
awk -F'\t' '{ printf "  %-40s %8s\n", $1, $2 }' "$OUT/row-counts.tsv"
say ""
say "✓ XONG. Backup ở: $OUT  ($(du -sh "$OUT" | cut -f1))"
say "  Nên chép thêm 1 bản sang ổ ngoài / iCloud Drive (runbook Bước 5). Không đưa thư mục này vào repo hay gửi cho AI."
