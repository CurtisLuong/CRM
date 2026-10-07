# Vỏ Android "Sổ Khách" (Capacitor)

Chỉ để **đọc nhật ký cuộc gọi** trên Android (quyết định D-002 trong `docs/decisions.md`).
App mở thẳng `https://crm-cop.pages.dev` — sửa giao diện/web → push GitHub là đủ, KHÔNG cần build lại APK.

## Khi nào phải build lại APK
Chỉ khi sửa phần native: `android/app/src/main/**` (plugin `CallLogPlugin.java`, `MainActivity.java`,
quyền trong `AndroidManifest.xml`, icon) hoặc `capacitor.config.json`.

## Build
Cần: Android Studio (có Android SDK), Java 21 (`brew install openjdk@21`), Node.

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

## Ghi chú
- APK hiện là bản **debug** (ký bằng khoá debug của máy Mac này). Khi phát cho đồng nghiệp nên chuyển sang bản release
  ký bằng khoá riêng — phải gỡ app cũ 1 lần khi đổi khoá.
- Không đưa lên Google Play được (Play hạn chế quyền READ_CALL_LOG).
- Ghi NGẦM khi app đóng: chưa làm. Cổng sẵn sàng: `window.CRMCalls.ingest(calls)` trong `js/calls.js`.
