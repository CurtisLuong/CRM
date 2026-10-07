#!/bin/bash
# Build APK RELEASE vỏ Android "Sổ Khách" (D-002), ký bằng khoá chính thức.
# Chạy: ./build-apk.sh ["ghi chú bản mới"]  → android-app/dist/SoKhach-<versionName>.apk
# Chỉ cần build lại khi SỬA phần native (thư mục android/). Sửa giao diện/web → push GitHub là đủ,
# app tự tải bản web mới.
set -e
cd "$(dirname "$0")"
# Gradle 8.x chưa chạy được trên Java 25 (đi kèm Android Studio) → dùng Java 21 (brew install openjdk@21).
export JAVA_HOME="${JAVA_HOME_21:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
[ -f android/local.properties ] || echo "sdk.dir=$ANDROID_HOME" > android/local.properties
npx cap sync android
[ -f keystore.properties ] || { echo "❌ Thiếu keystore.properties + sokhach-release.jks (khoá ký) — lấy từ bản sao lưu."; exit 1; }
(cd android && ./gradlew assembleRelease --console=plain)
# Đặt tên file theo phiên bản + cập nhật /android-app-version.json (banner "Có bản app mới").
VCODE=$(grep -E '^\s*versionCode' android/app/build.gradle | grep -oE '[0-9]+')
VNAME=$(grep -E '^\s*versionName' android/app/build.gradle | grep -oE '"[^"]+"' | tr -d '"')
NOTES="${1:-}"   # ghi chú bản mới (tuỳ chọn): ./build-apk.sh "Sửa lỗi ..."
mkdir -p dist
cp android/app/build/outputs/apk/release/app-release.apk "dist/SoKhach-$VNAME.apk"
SUPABASE_URL=$(grep -oE "https://[a-z0-9]+\.supabase\.co" ../js/config.js | head -1)
python3 - "$VCODE" "$VNAME" "$SUPABASE_URL" "$NOTES" <<'PY'
import json, sys
code, name, base, notes = sys.argv[1:5]
p = '../android-app-version.json'
try: old = json.load(open(p))
except Exception: old = {}
json.dump({
  "versionCode": int(code), "versionName": name,
  "url": f"{base}/storage/v1/object/public/app-releases/SoKhach-{name}.apk",
  "notes": notes or old.get("notes", "") if str(old.get("versionCode")) == code else notes,
}, open(p, 'w'), ensure_ascii=False, indent=2)
open(p, 'a').write('\n')
PY
echo "✅ APK: $(pwd)/dist/SoKhach-$VNAME.apk (versionCode $VCODE)"
echo "   Tiếp: (1) tải file này lên Supabase › Storage › app-releases  (2) commit + push android-app-version.json"
