#!/usr/bin/env bash
# scripts/backup/storage.sh — tải file Storage (customer-docs, customer-avatars…) về thư mục backup (T0.1).
#   bash scripts/backup/storage.sh ~/CRM-backups/<ngày-giờ>
# Đọc danh sách từ storage-manifest.tsv (do dump.sh tạo). Chạy lại được: file đã tải đúng kích thước sẽ bỏ qua.
# Cần SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY trong .env.backup (chỉ dùng để ĐỌC file).
set -euo pipefail
. "$(dirname "$0")/lib.sh"

load_env
find_pg_tools
OUT="${1:-}"
[ -n "$OUT" ] && [ -f "$OUT/storage-manifest.tsv" ] || die "Cách dùng: bash scripts/backup/storage.sh <thư mục backup có storage-manifest.tsv>"
[ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] || die "Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong .env.backup (runbook Bước 2)."

say "Tải file Storage — bucket: $BACKUP_BUCKETS"
CHECK="$OUT/storage-check.tsv"; : > "$CHECK"
n_ok=0; n_skip=0; n_fail=0
while IFS=$'\t' read -r bucket name size; do
  case " $BACKUP_BUCKETS " in *" $bucket "*) ;; *) continue ;; esac
  [ -n "$name" ] || continue
  dest="$OUT/storage/$bucket/$name"
  if [ -f "$dest" ] && [ -n "$size" ] && [ "$(file_size "$dest")" = "$size" ]; then
    n_skip=$((n_skip + 1)); printf '%s\t%s\t%s\tok\n' "$bucket" "$name" "$size" >> "$CHECK"; continue
  fi
  mkdir -p "$(dirname "$dest")"
  url="$SUPABASE_URL/storage/v1/object/$bucket/$(urlencode_path "$name")"
  if curl -sS -f --retry 3 --retry-delay 2 -o "$dest.part" \
       -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" "$url" 2>/dev/null \
     && mv "$dest.part" "$dest" \
     && { [ -z "$size" ] || [ "$(file_size "$dest")" = "$size" ]; }; then
    n_ok=$((n_ok + 1)); printf '%s\t%s\t%s\tok\n' "$bucket" "$name" "$size" >> "$CHECK"
  else
    rm -f "$dest.part"; n_fail=$((n_fail + 1)); printf '%s\t%s\t%s\tLỖI\n' "$bucket" "$name" "$size" >> "$CHECK"
    warn "Không tải được: $bucket/$name"
  fi
done < "$OUT/storage-manifest.tsv"

ok "Tải mới $n_ok · đã có $n_skip · lỗi $n_fail  (chi tiết: storage-check.tsv)"
[ "$n_fail" -eq 0 ] || die "Có $n_fail file chưa tải được. Chạy lại lệnh này (chỉ tải phần còn thiếu)."
