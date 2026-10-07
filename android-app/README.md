# Vỏ Android "Sổ Khách" (Capacitor)

Chỉ để **đọc nhật ký cuộc gọi** trên Android (quyết định D-002 trong `docs/decisions.md`).
App mở thẳng `https://crm-cop.pages.dev` — sửa giao diện/web → push GitHub là đủ, KHÔNG cần build lại APK.

## Khi nào phải build lại APK
Chỉ khi sửa phần native: `android/app/src/main/**` (plugin `CallLogPlugin.java`, `MainActivity.java`,
quyền trong `AndroidManifest.xml`, icon) hoặc `capacitor.config.json`.

## Build
Cần: Android Studio (có Android SDK), Java 21 (`brew install openjdk@21`), Node, và 2 file khoá ký (xem dưới).

```bash
cd android-app
npm install        # lần đầu
./build-apk.sh     # → dist/SoKhach.apk
```

## Cài lên điện thoại
- Cách 1 (khuyên dùng): bật Gỡ lỗi USB trên máy, cắm cáp, chạy `~/Library/Android/sdk/platform-tools/adb install -r dist/SoKhach.apk`.
- Cách 2: chép `dist/SoKhach.apk` sang điện thoại, mở file để cài (cho phép cài từ nguồn không rõ).
  Nếu Android báo "Cài đặt bị hạn chế" khi cấp quyền Nhật ký cuộc gọi: Cài đặt › Ứng dụng › Sổ Khách › ⋮ › "Cho phép cài đặt bị hạn chế".

Lần đầu mở app sẽ hỏi quyền **Nhật ký cuộc gọi** → chọn Cho phép.

## Khoá ký (QUAN TRỌNG)
APK được ký bằng khoá chính thức: `android-app/sokhach-release.jks` + mật khẩu trong `android-app/keystore.properties`.
Hai file này **không có trong Git** — phải **sao lưu cả hai** (Google Drive / trình quản lý mật khẩu).
Mất khoá = không cài đè được app nữa (phải gỡ, cài lại, cấp quyền lại).

## Phát bản mới (khi sửa phần native)
1. Tăng `versionCode` (+1) và `versionName` trong `android/app/build.gradle`.
2. `./build-apk.sh "ghi chú ngắn về bản mới"` → `dist/SoKhach-<versionName>.apk`, đồng thời tự sửa
   `/android-app-version.json` (repo web).
3. Supabase › Storage › bucket `app-releases` › Upload file APK đó (tên file giữ nguyên).
   Bucket tạo 1 lần bằng `SQL/add_app_releases_bucket.sql`.
4. Commit + push `android-app-version.json` → app trên điện thoại hiện banner **"Có bản app mới"** →
   bấm Cập nhật → Chrome tải APK → bấm vào file để cài đè (không cần gỡ).
   Thứ tự quan trọng: tải APK lên TRƯỚC rồi mới push file phiên bản (tránh banner trỏ tới file chưa có).

## Ghi chú
- Nút/vuốt Back: `MainActivity` gọi `window.CRMBack()` (js/app.js) — lùi trong app; hết đường lùi → đưa app xuống nền.
- Không đưa lên Google Play được (Play hạn chế quyền READ_CALL_LOG).
- Ghi NGẦM khi app đóng: chưa làm. Cổng sẵn sàng: `window.CRMCalls.ingest(calls)` trong `js/calls.js`.
