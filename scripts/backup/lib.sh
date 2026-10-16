# scripts/backup/lib.sh — hàm dùng chung cho dump.sh / storage.sh / restore-staging.sh (source, không chạy trực tiếp).
# Không in mật khẩu / khoá ra màn hình.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$REPO_ROOT/scripts/backup"

say()  { printf '%s\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ⚠ %s\n' "$*" >&2; }
die()  { printf '\n✗ %s\n' "$*" >&2; exit 1; }

load_env() {
  local f="$REPO_ROOT/.env.backup"
  [ -f "$f" ] || die "Chưa có file .env.backup ở thư mục gốc repo. Làm theo docs/runbooks/backup.md (Bước 2)."
  # shellcheck disable=SC1090
  set -a; . "$f"; set +a
  BACKUP_ROOT="${BACKUP_ROOT:-$HOME/CRM-backups}"
  BACKUP_BUCKETS="${BACKUP_BUCKETS:-customer-docs customer-avatars}"
  case "$(cd "$(dirname "$BACKUP_ROOT")" 2>/dev/null && pwd)/$(basename "$BACKUP_ROOT")/" in
    "$REPO_ROOT"/*) die "BACKUP_ROOT đang nằm TRONG repo ($BACKUP_ROOT). Backup chứa dữ liệu khách thật → phải để ngoài repo." ;;
  esac
}

# Tìm pg_dump / psql / pg_restore: PATH hoặc Homebrew (postgresql@17, libpq).
find_pg_tools() {
  local d
  for d in "" /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@17/bin /opt/homebrew/opt/libpq/bin /usr/local/opt/libpq/bin; do
    if [ -z "$d" ]; then command -v pg_dump >/dev/null 2>&1 && { PG_BIN="$(dirname "$(command -v pg_dump)")"; break; }
    elif [ -x "$d/pg_dump" ]; then PG_BIN="$d"; break; fi
  done
  [ -n "${PG_BIN:-}" ] || die "Chưa cài công cụ PostgreSQL. Chạy: brew install postgresql@17   (xem runbook Bước 1)"
  PG_DUMP="$PG_BIN/pg_dump"; PSQL="$PG_BIN/psql"; PG_RESTORE="$PG_BIN/pg_restore"
  command -v jq >/dev/null 2>&1 || die "Thiếu jq. Chạy: brew install jq"
  command -v curl >/dev/null 2>&1 || die "Thiếu curl."
}

# Major version của client pg_dump phải >= server.
check_versions() { # $1 = db url
  local server client
  server="$("$PSQL" "$1" -X -At -c 'show server_version_num' 2>/dev/null)" || die "Không kết nối được database. Kiểm tra chuỗi kết nối + mật khẩu trong .env.backup (runbook Bước 2)."
  server=$(( server / 10000 ))
  client="$("$PG_DUMP" --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')"
  [ "$client" -ge "$server" ] || die "pg_dump bản $client cũ hơn server $server. Chạy: brew install postgresql@$server"
  ok "Kết nối được database (Postgres $server, pg_dump $client)"
}

# Mã project Supabase rút từ chuỗi kết nối (user postgres.<ref> hoặc host db.<ref>.supabase.co).
project_ref() {
  local u="$1" r
  r="$(printf '%s' "$u" | sed -nE 's#^[a-z]+://postgres\.([a-z0-9]+):.*#\1#p')"
  [ -n "$r" ] || r="$(printf '%s' "$u" | sed -nE 's#.*@db\.([a-z0-9]+)\.supabase\.co.*#\1#p')"
  printf '%s' "$r"
}

# Mã hoá đường dẫn Storage theo từng đoạn (giữ dấu /).
urlencode_path() {
  local parts seg out='' i=0
  IFS='/' read -r -a parts <<< "$1"
  for seg in "${parts[@]}"; do
    [ $i -gt 0 ] && out="$out/"
    out="$out$(jq -rn --arg s "$seg" '$s|@uri')"; i=$((i + 1))
  done
  printf '%s' "$out"
}

file_size() { stat -f%z "$1" 2>/dev/null || stat -c%s "$1"; }

# So 2 file row-counts (production lúc backup ↔ staging) → các dòng bảng Markdown.
# Bucket không nằm trong BACKUP_BUCKETS (không tải file) → "bỏ qua", không tính là lệch.
compare_counts() { # $1 = production tsv, $2 = staging tsv
  awk -F'\t' -v keep=" $BACKUP_BUCKETS " '
    function skipped(k,   b) { if (k !~ /^storage\.objects\[/) return 0; b = k; sub(/^storage\.objects\[/, "", b); sub(/\]$/, "", b); return index(keep, " " b " ") == 0 }
    NR==FNR { r[$1]=$2; m[$1]=$3; next }
    { seen[$1]=1; s = (($1 in r) && r[$1]==$2 && m[$1]==$3) ? "✓" : (skipped($1) ? "bỏ qua" : "✗")
      printf "| %s | %s | %s | %s |\n", $1, ($1 in r ? r[$1] : "—"), $2, s }
    END { for (k in r) if (!(k in seen)) printf "| %s | %s | — | %s |\n", k, r[k], (skipped(k) ? "bỏ qua" : "✗") }' "$1" "$2"
}
