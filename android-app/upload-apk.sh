#!/bin/bash
# Tải APK phiên bản hiện tại (theo android/app/build.gradle) lên Supabase Storage › app-releases.
# Cần đăng nhập Supabase CLI 1 lần trên máy: `supabase login` (mở trình duyệt để xác nhận).
# Chạy SAU ./build-apk.sh và TRƯỚC khi push android-app-version.json.
set -e
cd "$(dirname "$0")"
VNAME=$(grep -E '^\s*versionName' android/app/build.gradle | grep -oE '"[^"]+"' | tr -d '"')
FILE="dist/SoKhach-$VNAME.apk"
[ -f "$FILE" ] || { echo "❌ Chưa có $FILE — chạy ./build-apk.sh trước."; exit 1; }
REF=$(grep -oE "https://[a-z0-9]+\.supabase\.co" ../js/config.js | head -1 | sed -E 's#https://([a-z0-9]+)\..*#\1#')
supabase --experimental storage cp "$FILE" "ss:///app-releases/SoKhach-$VNAME.apk" \
  --project-ref "$REF" --content-type application/vnd.android.package-archive --cache-control "max-age=300"
URL="https://$REF.supabase.co/storage/v1/object/public/app-releases/SoKhach-$VNAME.apk"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -I "$URL")
[ "$CODE" = "200" ] && echo "✅ Đã tải lên: $URL" || { echo "⚠️ Tải lên xong nhưng link trả HTTP $CODE: $URL"; exit 1; }
