# FEATURE_IDEAS.md — Đề xuất tính năng mới

Chưa cái nào được làm. Sắp xếp thô theo mức độ nên làm sớm. Khi bắt tay làm
1 mục, chuyển ghi chú tiến độ sang `CHANGELOG.md` và xoá/cập nhật mục ở đây.

## Nên làm sớm (giá trị cao, ít công sức)

<!-- ĐÃ LÀM 2026-08-19: Trang chi tiết khách (màn hình #detail-screen) —
     xem CHANGELOG.md. Bấm vào card mở trang chi tiết (đầy đủ Chi tiết,
     căn hộ, thông tin cá nhân), nút Sửa mở lại modal cũ. -->

<!-- ĐÃ LÀM 2026-08-19: Lịch sử tiến độ chăm sóc (timeline) — nhưng làm GỌN hơn
     đề xuất gốc: KHÔNG tạo bảng log riêng, mà lưu mảng JSONB care_stage_history
     ({stage,note,at}) ngay trên record khách (đồng bộ sẵn qua hàng đợi). Mỗi lần
     đổi care_stage → append 1 mốc kèm ghi chú riêng. Hiển thị timeline ở trang
     chi tiết + khoảng thời gian giữa các bước. Xem CHANGELOG + add_care_stage_history.sql.
     (Chưa log evaluation — chỉ care_stage. Muốn log thêm field khác thì mở rộng sau.) -->
- **Nhắc hẹn gọi lại.** Khi `care_stage = 'Hẹn gọi lại'`, cho phép chọn ngày
  giờ hẹn, hiển thị badge "quá hạn" trên dashboard nếu đã qua ngày mà chưa
  đổi trạng thái. Có thể làm bằng field `next_followup_at` + filter/sort
  theo field này, không cần thêm bảng.
- **Export danh sách ra Excel/CSV.** Sale hay cần gửi báo cáo nhanh. Dùng
  `papaparse` hoặc SheetJS (client-side, không cần backend) để export bảng
  `allCustomers` hiện có trong `app.js`.
- **Xác nhận lại link Zalo trên môi trường thật + fallback tốt hơn.** Hiện
  chỉ mở `zalo.me/<số>`; nên thử thêm scheme `zalo://` trên Android trước,
  fallback web nếu không mở được. Cần test tay trên máy thật (đã note trong
  `CLAUDE.md` mục 6).

## Trung hạn

<!-- ĐÃ LÀM 2026-08-19: Dashboard tổng quan (tab "Tổng quan" cạnh danh sách).
     8 widget: phễu + % chuyển đổi & nút thắt, đánh giá + lý do loại, khách mới/tuần,
     điểm quan tâm TB + xu hướng, phân bổ căn/toà, khách bị bỏ quên (>7 ngày),
     thời gian TB mỗi bậc, khách nóng cần gọi. Tự vẽ chart bằng CSS/SVG (KHÔNG dùng
     thư viện ngoài — giữ offline + không build). Xem CHANGELOG. -->
- **Xuất dashboard ra ảnh/PDF để gửi báo cáo.** Hiện dashboard chỉ xem trong app.
- **Gắn nhãn tự do (tags) ngoài các field cố định.** Một số khách có đặc
  điểm không nằm trong field nào (vd "khách VIP giới thiệu", "khách cũ quay
  lại") — thêm mảng `tags text[]` cho phép gắn nhãn tự do, filter theo tag.
- **Phân quyền chi tiết hơn khi có nhiều sale.** Hiện chỉ có 2 role
  (`admin`/`sale`), admin thấy hết. Có thể cần thêm khái niệm "chuyển giao
  khách" (đổi `owner_id`) khi 1 sale nghỉ hoặc khách được re-assign, kèm
  lịch sử ai từng phụ trách.
<!-- ĐÃ LÀM 2026-08-19: Tìm kiếm bỏ dấu — thêm removeVietnameseTones() trong
     app.js, áp vào matchesFilters. Gõ "huong" ra "Hương", "hu" ra ngay. Xem
     CHANGELOG.md. (Chưa xử lý gõ SAI dấu kiểu typo — chỉ bỏ dấu, đủ dùng.) -->
- **Nhắc trùng SĐT khi nhập khách mới.** Hiện unique index chặn ở tầng DB
  nhưng lỗi trả về khá kỹ thuật; nên check trước ở client và hỏi "Khách này
  đã tồn tại, xem lại thông tin cũ?" thay vì để lỗi INSERT rớt xuống hàng
  đợi đồng bộ.

## Dài hạn / cân nhắc kỹ trước khi làm

- **App native hoặc Capacitor wrapper.** Nếu PWA không đủ mượt trên
  Android (background sync, notification), có thể bọc lại bằng Capacitor.
  Không nên làm sớm — PWA hiện đáp ứng đủ yêu cầu ban đầu.
- **Tích hợp gọi điện/ghi âm cuộc gọi.** Ngoài phạm vi kỹ thuật ban đầu,
  cần thêm quyền truy cập điện thoại — chỉ cân nhắc nếu thực sự cần, vì kéo
  theo nhiều vấn đề riêng tư/pháp lý.
  <!-- 2026-08-20: Đã cân nhắc "đọc nhật ký cuộc gọi Android của đúng SĐT + tự
       điền timestamp/duration vào note". KẾT LUẬN: KHÔNG khả thi với PWA/web —
       đọc call log cần quyền hệ thống READ_CALL_LOG, chỉ cấp cho app native cài
       từ APK; web app trong sandbox trình duyệt không có API nào chạm tới được.
       Muốn làm thật phải bọc native (Capacitor/TWA + plugin riêng) = đổi kiến
       trúc lớn. Curtis đã quyết định BỎ QUA tính năng này, giữ web thuần. Nếu
       sau này cần: cân nhắc phương án "nhập tay nhanh thời lượng cuộc gọi" thay
       vì đọc tự động. -->
- **App native để đọc nhật ký cuộc gọi (nếu đổi ý).** Bọc PWA hiện tại bằng
  Capacitor/TWA + viết plugin native đọc call log của đúng SĐT khách, tự điền
  timestamp + duration vào ghi chú. Là thay đổi kiến trúc lớn — chỉ làm khi
  Curtis xác nhận rõ muốn.
<!-- ĐÃ LÀM 2026-08-22 (Tầng 1): Cổng thông báo IN-APP — chuông 🔔 cạnh avatar +
     app badge, tính từ js/notifications.js (rule call_due + hot_idle). CHỈ báo khi
     app đang mở/mở lại. Xem CHANGELOG. Thêm rule mới = thêm 1 registerRule({...}). -->
- **PUSH thật (Tầng 2) — nhắc khi app ĐÓNG, qua Web Push + Cloudflare Worker cron.**
  Nối tiếp cổng thông báo Tầng 1 (đã có `js/notifications.js`): để điện thoại kêu
  khi chưa mở app, cần backend chạy nền. Kế hoạch: bảng `push_subscriptions` +
  `notifications_log` (chống báo trùng) + RLS, cặp VAPID key, client xin quyền +
  `subscribe`, `sw.js` thêm `push`/`notificationclick`, và **Cron Trigger** trên
  Worker (đã có `worker/intake-worker.js`) dùng LẠI đúng các rule của Tầng 1.
  Chỗ khó nhất: mã hoá web-push (VAPID JWT + AES128GCM) bằng WebCrypto trong Worker.
- **Tự động nhắc qua Telegram/Zalo OA khi có khách quá hạn follow-up.**
  Curtis đã có kinh nghiệm với Telegram bot (Telethon) ở các dự án khác —
  có thể tái dùng pattern đó, nhưng cần 1 backend nhỏ (Cloudflare Worker
  cron) để kiểm tra định kỳ và gửi thông báo, vì hiện tại app hoàn toàn
  client-side, không có gì chạy nền khi tắt trình duyệt. (Cùng hạ tầng cron với
  Tầng 2 push ở trên — có thể làm chung.)
- **Multi-tenant thật sự (bán cho sale khác dùng).** Ngoài phạm vi hiện
  tại — dự án đang thiết kế cho 1 nhóm nhỏ dùng nội bộ, không phải SaaS.
