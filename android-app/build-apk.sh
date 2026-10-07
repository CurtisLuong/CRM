#!/bin/bash
# Build APK vỏ Android "Sổ Khách" (D-002). Chạy: ./build-apk.sh  → file ở android-app/dist/SoKhach.apk
# Chỉ cần build lại khi SỬA phần native (thư mục android/). Sửa giao diện/web → push GitHub là đủ,
# app tự tải bản web mới.
set -e
cd "$(dirname "$0")"
# Gradle 8.x chưa chạy được trên Java 25 (đi kèm Android Studio) → dùng Java 21 (brew install openjdk@21).
export JAVA_HOME="${JAVA_HOME_21:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
[ -f android/local.properties ] || echo "sdk.dir=$ANDROID_HOME" > android/local.properties
npx cap sync android
(cd android && ./gradlew assembleDebug --console=plain)
mkdir -p dist
cp android/app/build/outputs/apk/debug/app-debug.apk dist/SoKhach.apk
echo "✅ APK: $(pwd)/dist/SoKhach.apk"
