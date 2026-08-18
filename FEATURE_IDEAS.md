# FEATURE_IDEAS.md — Đề xuất tính năng mới

Chưa cái nào được làm. Sắp xếp thô theo mức độ nên làm sớm. Khi bắt tay làm
1 mục, chuyển ghi chú tiến độ sang `CHANGELOG.md` và xoá/cập nhật mục ở đây.

## Nên làm sớm (giá trị cao, ít công sức)

- **Trang chi tiết khách (thay vì chỉ card + modal sửa).** Hiện tại xem/sửa
  chung 1 modal; khi khách có nhiều "Chi tiết" freeform dài, card bị cắt bớt.
  Nên có view riêng dạng trang, hiển thị đầy đủ lịch sử, dễ đọc hơn trên
  điện thoại.
- **Lịch sử thay đổi tiến độ chăm sóc (timeline).** Hiện `care_stage` chỉ
  lưu giá trị hiện tại, mất lịch sử. Thêm bảng `customer_activity_log`
  (customer_id, field, old_value, new_value, changed_at, changed_by) ghi
  lại mỗi lần đổi `care_stage`/`evaluation` — giúp biết khách đã đi qua các
  bước nào, mất bao lâu ở mỗi bước.
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

- **Dashboard thống kê tổng quan.** Số khách theo từng `care_stage` (kiểu
  phễu bán hàng — funnel chart), tỉ lệ "nên chăm" / "không nên chăm", số
  khách mới trong tuần/tháng. Dùng `recharts` hoặc `chart.js` (đã có sẵn
  trong danh sách thư viện artifact, nhưng đây là web app riêng nên cần tự
  thêm qua CDN hoặc npm nếu chuyển sang có build step).
- **Gắn nhãn tự do (tags) ngoài các field cố định.** Một số khách có đặc
  điểm không nằm trong field nào (vd "khách VIP giới thiệu", "khách cũ quay
  lại") — thêm mảng `tags text[]` cho phép gắn nhãn tự do, filter theo tag.
- **Phân quyền chi tiết hơn khi có nhiều sale.** Hiện chỉ có 2 role
  (`admin`/`sale`), admin thấy hết. Có thể cần thêm khái niệm "chuyển giao
  khách" (đổi `owner_id`) khi 1 sale nghỉ hoặc khách được re-assign, kèm
  lịch sử ai từng phụ trách.
- **Tìm kiếm mờ (fuzzy search) cho tên khách.** Hiện search bằng
  `includes()` đơn giản trên chuỗi đã lowercase — không xử lý được gõ sai
  dấu hoặc không dấu. Cân nhắc chuẩn hoá bỏ dấu tiếng Việt trước khi so
  khớp (viết hàm `removeVietnameseTones()` đơn giản, không cần thư viện
  ngoài).
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
- **Tự động nhắc qua Telegram/Zalo OA khi có khách quá hạn follow-up.**
  Curtis đã có kinh nghiệm với Telegram bot (Telethon) ở các dự án khác —
  có thể tái dùng pattern đó, nhưng cần 1 backend nhỏ (Cloudflare Worker
  cron) để kiểm tra định kỳ và gửi thông báo, vì hiện tại app hoàn toàn
  client-side, không có gì chạy nền khi tắt trình duyệt.
- **Multi-tenant thật sự (bán cho sale khác dùng).** Ngoài phạm vi hiện
  tại — dự án đang thiết kế cho 1 nhóm nhỏ dùng nội bộ, không phải SaaS.
