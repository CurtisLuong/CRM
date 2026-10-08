# Vấn đề tồn đọng: nút Zalo trong app APK Android

> Trạng thái (2026-10-08): **CHƯA GIẢI QUYẾT** — tạm hoãn vì chưa có cáp USB-C để đọc dữ liệu từ điện thoại.
> Đọc file này trước khi sửa bất cứ gì liên quan mở Zalo trên Android.

## Hiện tượng
- Chỉ xảy ra trong **app APK "Sổ Khách"** (vỏ Capacitor, `android-app/`). Bản web app cài từ Chrome (PWA) **chưa bao giờ bị** — dùng làm "chuẩn đúng" để so sánh.
- Bấm nút Zalo (cả "Mở Zalo" lẫn chọn mẫu tin) → link `https://zalo.me/<SĐT dạng 0xxx>`.
- **APK 1.2 trở về trước:** lúc mở đúng màn chat, lúc vào trình duyệt nội bộ của app Zalo (thanh trên: ←, "Zalo App", `zalo.me`) báo *"Trang này không tìm thấy hoặc không hợp lệ"*. Cùng khách, cùng nút, ngẫu nhiên. Khách có Zalo thật, đã kết bạn → không phải do tài khoản / quyền riêng tư.
- **APK 1.3 (hiện đang cài):** hỏng **100%**, 2 kiểu:
  1. Màn lỗi "Trang này không tìm thấy" như trên.
  2. Zalo mở trang chủ (danh sách chat) rồi bật hộp **"Open with: Google Play / App Market"**; chọn store → vào trang Zalo trên store.
- Mac (link `zalo://conversation?phone=`) và iOS (`https://zalo.me`) không bị.

## Đường đi của link trong APK
`js/app.js` `openZaloFor()` → `window.open('https://zalo.me/0…')` → WebView không hỗ trợ cửa sổ mới nên tải trong chính WebView → `BridgeWebViewClient.shouldOverrideUrlLoading` → `Bridge.launchIntent(url)`:
- Mỗi plugin được hỏi `shouldOverrideLoad(url)` trước (1.3 có `ExternalLinkPlugin` chặn ở đây).
- Không plugin nào chặn → `new Intent(ACTION_VIEW, url)` "trơn" (không `CATEGORY_BROWSABLE`, không chỉ định app) → `startActivity`. (`node_modules/@capacitor/android/.../Bridge.java` ~dòng 389–427.)

Chrome thì gửi Intent BROWSABLE và tự chọn màn xử lý link → Zalo luôn mở đúng chat.

## Đã thử (không thành công)
| # | Cách | Ở đâu | Kết quả |
|---|---|---|---|
| 1 | Gộp 2 nút (Mở Zalo / copy mẫu) về chung `openZaloFor()`, link tính lại từ SĐT lúc bấm | web `js/app.js` | Không đổi — 2 nút vốn đã cùng link |
| 2 | Android trình duyệt/PWA: `intent://zalo.me/<SĐT>#Intent;scheme=https;package=com.zing.zalo;S.browser_fallback_url=…;end` | web `openZaloFor()` | **Không áp dụng cho APK** (APK cố ý giữ https vì Capacitor không hiểu `intent://`). Vẫn còn trong code cho PWA, chưa kiểm chứng trên PWA |
| 3 | "Mở Zalo" copy kèm SĐT + toast "dán vào ô tìm kiếm Zalo" | web | Là **chữa cháy**, đang giữ. Người dùng muốn nút này *không copy* → bỏ khi đã sửa xong |
| 4 | APK 1.3: `ExternalLinkPlugin` chặn `*.zalo.me`, Intent `ACTION_VIEW` + `CATEGORY_BROWSABLE` + `setPackage("com.zing.zalo")`, `queryIntentActivities(GET_RESOLVED_FILTER)` rồi **chấm điểm tự đoán** (khai báo host zalo.me +2, tên không chứa browser/webview +1) và `setComponent` màn điểm cao nhất; manifest thêm `<queries>` Zalo | `android-app/.../ExternalLinkPlugin.java` | **Tệ hơn: hỏng 100%** (2 kiểu ở trên). Màn được chọn là sai — có thể là màn "router"/kiểm tra cập nhật cần extras/referrer riêng, chưa biết chính xác |

Bài học: **đừng đoán cấu trúc bên trong app Zalo** — phải đọc dữ liệu thật từ máy trước.

## Việc đầu tiên khi quay lại: lấy dữ liệu thật
Cần điện thoại kết nối `adb` — bằng cáp USB-C **hoặc không cần cáp**: *Gỡ lỗi không dây* (Android 11+: Tuỳ chọn nhà phát triển → Gỡ lỗi không dây → "Ghép nối bằng mã", rồi trên Mac `adb pair <ip:port>` và `adb connect <ip:port>`; Mac và điện thoại cùng Wi-Fi).
```bash
ADB=~/Library/Android/sdk/platform-tools/adb
# 1) Các màn của Zalo nhận link zalo.me (chỉ đọc)
$ADB shell dumpsys package com.zing.zalo | grep -B2 -A12 "zalo.me"
# 2) Thử gửi link giống Chrome / giống Capacitor, xem màn nào nhận
$ADB shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://zalo.me/0912xxxxxx"
$ADB shell am start -W -a android.intent.action.VIEW -d "https://zalo.me/0912xxxxxx"
# 3) Nhật ký lúc bấm nút Zalo trong app (Ctrl+C để dừng)
$ADB logcat -v time | grep -iE "ActivityTaskManager|START u0|zing.zalo|ExternalLink"
```
Đồng thời bật web app Chrome (PWA) bấm Zalo, ghi logcat để xem **Chrome gửi Intent cho màn nào** → bắt chước đúng màn đó.

## Phương án cho lần sửa tới (theo thứ tự nên thử)
1. **Chỉ đích danh đúng màn mà Chrome dùng** (lấy từ logcat ở trên): `setComponent` theo tên màn thật thay cho chấm điểm; giữ BROWSABLE; thêm extras/referrer giống Chrome nếu logcat cho thấy (`Intent.EXTRA_REFERRER`, `com.android.browser.application_id`).
2. **Mở bằng Chrome Custom Tab** (thư viện `androidx.browser`) thay vì Intent — giống hệt đường PWA đang chạy tốt (trang zalo.me tự chuyển sang app). Nhược: thoáng thấy tab trình duyệt.
3. **Bỏ `setComponent`, chỉ BROWSABLE + `setPackage`** — để Android tự chọn trong gói Zalo như Chrome. Thử nhanh, nhưng vẫn là đoán nếu chưa có logcat.
4. **Đẩy link cho Chrome xử lý** (`setPackage("com.android.chrome")`) để Chrome tự chuyển sang Zalo. Rủi ro: Chrome có thể chỉ hiện trang web zalo.me (không có cử chỉ người dùng trong Chrome).
5. **Phương án chắc chắn chạy (dự phòng):** mở **trang chủ app Zalo** (`getLaunchIntentForPackage("com.zing.zalo")`) + copy sẵn SĐT → sale dán vào ô tìm. Không vào thẳng chat nhưng không bao giờ lỗi.
6. **Gỡ `ExternalLinkPlugin`** (quay về Intent mặc định của Capacitor) — ít nhất trở lại mức 1.2 (lỗi thỉnh thoảng thay vì 100%).

Mỗi phương án đều cần **build APK mới** (tăng `versionCode`, xem `android-app/README.md`). Nên cài thử qua `adb install -r` trước, chỉ tải lên Supabase + push `android-app-version.json` khi đã chạy đúng. Lưu ý Android **không cho cài bản versionCode thấp hơn** — không "quay về 1.2" được nếu không gỡ app.

## Sau khi sửa xong
- Bỏ chữa cháy #3 (copy SĐT ở nút "Mở Zalo") trong `js/app.js` + dòng `.zpick-note` trong `index.html`.
- Cập nhật `docs/pitfalls.md` (mục Vỏ Android), `android-app/README.md`, CHANGELOG; đổi trạng thái file này thành đã giải quyết (ghi cách đúng).
