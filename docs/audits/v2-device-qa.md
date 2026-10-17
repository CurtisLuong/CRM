# QA thiết bị thật v2 (T5.3)

> **Trạng thái:** ĐANG LÀM (bắt đầu 2026-10-17).
> **Xong khi (tasks.md T5.3):** danh sách lỗi chặn = 0.
> **Bản kiểm:** `crm-v2-9hf.pages.dev` (nhánh `v2`, dữ liệu **staging** `mksjmpcsfawsiabfhoxe`). Ký hiệu: ✅ đạt · ❌ lỗi · ⚠ lỗi không chặn · ⏳ chưa làm · — bỏ qua (ghi lý do).
> **Baseline T0.6 (quyết định chủ dự án 2026-10-17, cần app gấp):** không chờ 1 tuần đo. Đo **số chạm/thời gian** (Bảng 1 của `docs/runbooks/baseline.md`) ngay trong T5.3, v1 và v2 cạnh nhau. Bảng 2–3 (chất lượng chăm sóc 7 ngày) không chặn cutover; mất số "trước" cho phần đó nếu không đo trước cutover.

## 0. Thiết bị

| Thiết bị | Trình duyệt / vỏ | Ai kiểm | Ghi chú |
|---|---|---|---|
| MacBook | Trình duyệt trong app Claude (Chromium), khổ ≥1024 + giả lập 360–430 | agent | |
| Android (máy hằng ngày) | Chrome | chủ dự án | |
| Android (máy hằng ngày) | APK **thử** `Sổ Khách v2 thử` (`vn.sokhach.crm.v2test`, trỏ `crm-v2`) cài song song app thật | chủ dự án | Build debug ngoài repo từ `android-app/` (chỉ đổi appId, tên, URL); không thay app thật `vn.sokhach.crm` |
| iPhone Safari | — | — | Chưa có thiết bị (tasks.md: "nếu có") |

## 1. Giao diện + chữ Việt (Mac)

| Mục | Sáng | Tối | Kết quả / ghi chú |
|---|---|---|---|
| 1280px: 15 màn (Trang chủ, Hôm nay, Khách hàng, Khách mới, Hồ sơ, Công việc, Thao tác nhanh, Hiệu quả, Giỏ hàng, Tính vay, Thông báo, Cài đặt, Nhập/xuất, Retarget, Đồng nghiệp) | ✅ | ✅ | 15/15 không cuộn ngang, không phần tử tràn, không chữ lỗi/đăng nhập (quét tự động khi đã đăng nhập, 16:38) |
| 360px / 430px: cùng 15 màn | ✅ | ✅ | 15/15 ở cả 2 khổ × sáng/tối |
| Dấu tiếng Việt (Be Vietnam Pro), không vỡ chữ/ô | ✅ | ✅ | `document.fonts.check('Be Vietnam Pro', 'Trường Hưởng Đường')` = true; ảnh chụp Hôm nay tối đọc rõ. Lỗi hiển thị L3 |

## 2. Hiệu năng

| Mục | Mục tiêu | Mac | Android Chrome | APK thử |
|---|---|---|---|---|
| Mở app khi đã có cache (tới khi thấy danh sách Hôm nay) | < 2 giây | ✅ LCP 0,2 s (service worker, 0 byte mạng) | ⏳ | ⏳ |
| Mạng yếu (3G/chập chờn): thao tác ghi vẫn lưu ngay, đồng bộ sau | không mất, không treo | ⏳ | ⏳ | ⏳ |

## 3. Android thật

| # | Kịch bản | Chrome | APK thử | Ghi chú |
|---|---|---|---|---|
| A1 | Đăng nhập, "Đã đồng bộ", font Việt | — | ✅ | 2026-10-17 ~17:00, chủ dự án |
| A2 | Gọi → quay số → về app → hộp ghi kết quả (Chrome: ước lượng; APK: đọc nhật ký cuộc gọi máy, thời lượng chính xác, cuộc "chưa ghi chú") | (✅ E3 T5.2) | ✅ | Hiện hộp + thời lượng |
| A3 | Nút Zalo mở đúng chat (lỗi APK cũ: `docs/zalo-android-issue.md`) | — | ✅ | |
| A4 | Ghi chú giọng nói (T6.6) | ⏳ | ❌ L4 | Báo không có quyền micro; Cài đặt Android không có mục micro cho app |
| A5 | Offline → ghi → đóng hẳn app → mở lại → bật mạng (lặp E1 trên APK) | (✅ E1 T5.2) | ✅ | |
| A6 | Ảnh/tài liệu khách: chụp/tải lên, xem | — | ✅ | |
| A7 | Lưu trữ khách + khôi phục (T5.10) | — | ⏳ thử lại | Chủ dự án không tìm thấy màn "Khách đã lưu trữ" → L5; lối vào có ở menu ⋮ (Tiện ích) › "Xem khách đã lưu trữ" (agent xác nhận trên khổ 375px) |
| A8 | Chuông/thông báo trong app, đổi sáng/tối | ⏳ | ⏳ | |

## 4. Số chạm / thời gian (v1 `crm-cop` vs v2), Android

Đo theo `docs/runbooks/baseline.md` Bảng 1; mỗi ô `chạm / giây`. v1 thao tác trên **khách thử**, hoàn tác sau. Ngân sách: `docs/UX_GUIDELINES.md` §3.

| Thao tác | v1 | v2 | Ghi chú |
|---|---|---|---|
| Ghi **không nghe máy** + lịch gọi lại (vừa cúp máy) | ⏳ | ⏳ | |
| Ghi **nói chuyện được** + ghi chú ngắn + bước tiếp | ⏳ | ⏳ | |
| Nhắn Zalo theo mẫu (tới lúc mở Zalo) | ⏳ | ⏳ | |
| Thêm ghi chú cho khách đang xem | ⏳ | ⏳ | |
| Hẹn gọi lại (đổi lịch) | ⏳ | ⏳ | |
| Thêm khách mới (SĐT + tên + nguồn) | ⏳ | ⏳ | |

## 5. Lỗi

| # | Mức | Mô tả | Nơi | Task |
|---|---|---|---|---|
| L1 | ⚠ theo dõi | ~16:30 sau khi bấm "Tải lại" (banner "Có bản mới") để lên bundle `index-rg_L917X.js`, trình duyệt **mất phiên đăng nhập** (không còn `sb-…-auth-token`, chỉ còn `crm_last_user`). App vẫn mở các màn: Đồng nghiệp hiện "Chưa tải được danh sách nhóm… cần chạy SQL/add_team_assign.sql" (thông báo sai nguyên nhân khi chưa đăng nhập); Hôm nay hiện form đăng nhập. Tải lại trang thường (16:39) vẫn giữ phiên. Nút Tải lại chỉ gọi `updateServiceWorker(true)` (`src/app/UpdatePrompt.tsx`), không xoá storage → nghi phiên hết hạn đúng lúc reload và 2 trang cùng làm mới token (Supabase đăng xuất khi refresh token bị dùng 2 lần). Thử lại ở lần có bản mới kế tiếp + để ý trên điện thoại; tái hiện được → chặn | Mac, trình duyệt app Claude | theo dõi |
| L2 | ⚠ | Màn Đồng nghiệp khi lỗi/chưa đăng nhập luôn ghi "cần chạy SQL/add_team_assign.sql" (`src/features/team/route.tsx` hiển thị khi `members.length === 0`) — gây hiểu nhầm. Khi đã đăng nhập thì tải được danh sách bình thường | Mac | task con (dễ) |
| L3 | ⚠ | Hôm nay › thẻ Next Best Action, dòng "Bằng chứng" in dữ liệu thô: `booking_steps: [object Object] · care_stage_updated_at: 2026-10-07T03:54:48… · due: 1789272314339` (`src/features/today/route.tsx:224` nối `field: String(value)`). Không mất dữ liệu; xấu, ngay thẻ đầu màn chính | Mac | task con (dễ) |
| L4 | ❌ (APK) | Ghi chú giọng nói trong vỏ APK: báo không có quyền micro, Android không hiện quyền để bật. Nguyên nhân: `android-app/android/app/src/main/AndroidManifest.xml` chỉ khai INTERNET, READ_CALL_LOG, CALL_PHONE — **thiếu `RECORD_AUDIO`** (+ `MODIFY_AUDIO_SETTINGS`); `BridgeWebChromeClient` của Capacitor xin RECORD_AUDIO lúc chạy nhưng thiếu khai báo nên bị từ chối ngay. Sửa = thêm quyền + phát hành APK 1.5 (D-002). WebView Android không có Web Speech → giọng nói trong APK đi đường ghi âm + Worker `/stt` (T6.6) — cần xác nhận Worker đã deploy. Không chặn cutover dữ liệu (tính năng mới P1, v1 không có) nhưng là tính năng hỏng trên thiết bị chính | Android APK | task con |
| L5 | ⚠ | Màn "Khách đã lưu trữ" khó tìm: chỉ có trong menu ⋮ (9 mục) và bảng lệnh; danh sách Khách hàng không có lối vào | Android | task con (dễ) — chờ chủ dự án thử lại A7 |
| L6 | ❌ chặn dùng hằng ngày | Màn Khách hàng: cuộn xuống rồi **không cuộn lên lại được** tới tiêu đề/bộ lọc (chủ dự án báo trên Android). Agent tái hiện ở khổ 375px, bộ lọc "Tất cả" (75 khách): danh sách là khung cuộn riêng `h-[min(68dvh,680px)] overflow-auto overscroll-contain` (`src/features/customers/route.tsx:422`) nằm dưới khối bộ lọc dài; danh sách về đầu (`scrollTop 0`) nhưng cuộn lên tiếp trên danh sách không cuộn trang (`scrollY` giữ 597) vì `overscroll-contain` chặn cuộn lan; vùng ngoài danh sách để kéo trang rất nhỏ. Hướng sửa: bỏ `overscroll-contain` (cho cuộn lan) hoặc ảo hoá theo cuộn trang thay vì khung cuộn lồng | Android + Mac 375px | task con |

**Lỗi chặn còn mở:** L6 (cuộn danh sách khách). L4 (micro APK) chờ thử APK có quyền micro.
