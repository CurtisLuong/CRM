#!/usr/bin/env bash
# scripts/backup/restore-staging.sh — DIỄN TẬP KHÔI PHỤC backup vào project STAGING (T0.1, T0.5, T5.2).
#   bash scripts/backup/restore-staging.sh ~/CRM-backups/<ngày-giờ>
# Chỉ ghi vào STAGING. Từ chối nếu chuỗi kết nối staging trùng production, hoặc staging đã có dữ liệu khách.
# Cuối cùng in bảng so sánh số dòng + md5 từng bảng: production (lúc backup) ↔ staging (sau khôi phục).
# Hướng dẫn: docs/runbooks/backup.md (Phần C).
set -euo pipefail
. "$(dirname "$0")/lib.sh"

load_env
find_pg_tools
SRC="${1:-}"
[ -n "$SRC" ] && [ -f "$SRC/public.dump" ] && [ -f "$SRC/row-counts.tsv" ] || die "Cách dùng: bash scripts/backup/restore-staging.sh <thư mục backup>"
[ -n "${STAGING_DB_URL:-}" ] || die "Thiếu STAGING_DB_URL trong .env.backup (tạo project staging trước — docs/runbooks/v2-infra.md)."
ST="$STAGING_DB_URL"
ST_REF="$(project_ref "$ST")"; PROD_REF="$(project_ref "${SUPABASE_DB_URL:-}")"
[ -n "$ST_REF" ] || die "Không đọc được mã project từ STAGING_DB_URL."
[ "$ST_REF" != "$PROD_REF" ] && [ "$ST" != "${SUPABASE_DB_URL:-}" ] || die "STAGING_DB_URL đang trỏ vào PRODUCTION ($PROD_REF). Dừng."

say "Khôi phục backup: $SRC"
say "Vào project STAGING: $ST_REF   (production: ${PROD_REF:-?} — KHÔNG bị đụng tới)"
( cd "$SRC" && shasum -a 256 -c SHA256SUMS >/dev/null ) || die "File backup không khớp SHA256SUMS (hỏng hoặc bị sửa)."
ok "File backup nguyên vẹn (SHA256SUMS)"
check_versions "$ST"

has_customers="$("$PSQL" "$ST" -X -q -At -c "select to_regclass('public.customers') is not null")"
if [ "$has_customers" = "t" ]; then
  n="$("$PSQL" "$ST" -X -q -At -c "select count(*) from public.customers")"
  [ "$n" = "0" ] || die "Staging đã có $n khách. Chỉ khôi phục vào project staging MỚI/TRỐNG (hoặc tạo lại project staging)."
  die "Staging đã có bảng customers (trống). Dùng project staging mới hoàn toàn để diễn tập cho sạch."
fi

printf '\nGõ đúng mã project staging (%s) để tiếp tục: ' "$ST_REF"
read -r answer
[ "$answer" = "$ST_REF" ] || die "Mã không khớp — huỷ, chưa ghi gì."

# 1) Tài khoản (auth.users, auth.identities) — trước, vì khách trỏ owner_id tới đây.
"$PSQL" "$ST" -X -q -v ON_ERROR_STOP=1 --single-transaction \
  -c "set session_replication_role = replica" -f "$SRC/auth-data.sql" >/dev/null
ok "Tài khoản đăng nhập"

# 2) Schema + dữ liệu public (bảng, hàm, RLS, GRANT, trigger, index). Lỗi → huỷ toàn bộ bước này.
# Bỏ mục của chính schema public + DEFAULT ACL (project Supabase mới đã có sẵn; ghi lại sẽ lỗi quyền).
TOC="$(mktemp)"; trap 'rm -f "$TOC"' EXIT
"$PG_RESTORE" -l "$SRC/public.dump" | grep -v -E '(SCHEMA - public |SCHEMA public |DEFAULT ACL )' > "$TOC"
"$PG_RESTORE" --dbname "$ST" --no-owner --single-transaction --exit-on-error -L "$TOC" "$SRC/public.dump"
ok "Schema + dữ liệu public"

# 3) Trigger trên auth.users (vd tạo profile khi đăng ký) — nằm ngoài schema public nên dump riêng.
if [ -s "$SRC/auth-triggers.sql" ]; then
  sed -E 's/^CREATE TRIGGER ([^ ]+) /DROP TRIGGER IF EXISTS \1 ON auth.users; CREATE TRIGGER \1 /' "$SRC/auth-triggers.sql" \
    | "$PSQL" "$ST" -X -q -v ON_ERROR_STOP=1 --single-transaction -c "set client_min_messages = warning" -f - >/dev/null
  ok "Trigger auth.users"
fi

# 3b) Realtime: bật cho đúng các bảng production đang bật (vd public.customers).
while read -r t; do
  [ -n "$t" ] || continue
  "$PSQL" "$ST" -X -q -v ON_ERROR_STOP=1 -c "do \$\$ begin
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname || '.' || tablename = '$t')
    then execute 'alter publication supabase_realtime add table $t'; end if; end \$\$" >/dev/null
  ok "Realtime: $t"
done < "$SRC/realtime-tables.txt"

# 4) Storage: tạo bucket, policy, rồi tải file lên (giữ nguyên đường dẫn → avatar_path / documents khớp).
if [ -n "${STAGING_URL:-}" ] && [ -n "${STAGING_SERVICE_ROLE_KEY:-}" ]; then
  [ "${STAGING_URL%/}" != "${SUPABASE_URL%/}" ] || die "STAGING_URL trùng production."
  AUTH=(-H "Authorization: Bearer $STAGING_SERVICE_ROLE_KEY" -H "apikey: $STAGING_SERVICE_ROLE_KEY")
  jq -c '.[]' "$SRC/buckets.json" | while read -r b; do
    curl -sS -o /dev/null -X POST "$STAGING_URL/storage/v1/bucket" "${AUTH[@]}" -H 'Content-Type: application/json' -d "$b" || true
  done
  [ -s "$SRC/storage-policies.sql" ] && "$PSQL" "$ST" -X -q -v ON_ERROR_STOP=1 --single-transaction -c "set client_min_messages = warning" -f "$SRC/storage-policies.sql" >/dev/null
  ok "Bucket + policy Storage"
  up=0; fail=0
  while IFS=$'\t' read -r bucket name size; do
    f="$SRC/storage/$bucket/$name"; [ -f "$f" ] || continue
    mime="$(file -b --mime-type "$f" 2>/dev/null || echo application/octet-stream)"
    if curl -sS -f -o /dev/null -X POST "$STAGING_URL/storage/v1/object/$bucket/$(urlencode_path "$name")" "${AUTH[@]}" \
         -H "x-upsert: true" -H "Content-Type: $mime" --data-binary @"$f"; then up=$((up + 1)); else fail=$((fail + 1)); warn "Lỗi tải lên: $bucket/$name"; fi
  done < "$SRC/storage-manifest.tsv"
  ok "Tải lên $up file Storage, lỗi $fail"
else
  warn "Bỏ qua Storage (thiếu STAGING_URL / STAGING_SERVICE_ROLE_KEY)."
fi

# 5) So sánh production (lúc backup) ↔ staging.
"$PSQL" "$ST" -X -q -At -F $'\t' -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/row-counts.sql" | grep -v '^SET$' > "$SRC/staging-row-counts.tsv"
REPORT="$SRC/restore-report.md"
{
  echo "# Diễn tập khôi phục — $(date '+%Y-%m-%d %H:%M')"
  echo
  echo "Backup: \`$(basename "$SRC")\` · staging: \`$ST_REF\`"
  echo
  echo "| Bảng | Production (backup) | Staging | Khớp |"
  echo "|---|---:|---:|:---:|"
  compare_counts "$SRC/row-counts.tsv" "$SRC/staging-row-counts.tsv"
  echo
  echo "✓ = cùng số dòng VÀ cùng nội dung (md5). \"bỏ qua\" = bucket không nằm trong BACKUP_BUCKETS (cố ý không backup, vd file APK)."
  echo "Realtime production: $(tr '\n' ' ' < "$SRC/realtime-tables.txt")"
} > "$REPORT"

say ""; cat "$REPORT"; say ""
if grep -q '| ✗ |' "$REPORT"; then
  warn "Có bảng chưa khớp (✗). storage.objects chênh lệch thường do file chưa tải lên; bảng public lệch = báo agent."
  say "Báo cáo: $REPORT"; exit 1
fi
say "✓ KHÔI PHỤC KHỚP HOÀN TOÀN. Báo cáo: $REPORT"
