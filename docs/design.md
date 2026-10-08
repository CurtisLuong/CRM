# Nguyên tắc thiết kế CRM

## Phạm vi và nguồn

Tài liệu này tách nội dung thiết kế có trong CLAUDE.md gốc và biến chúng thành quy tắc thao tác ngắn. Không xác lập một bộ design system mới, không bổ sung triết lý của dự án khác.

## Phong cách đang được mô tả

- Giao diện theo kiểu “báo cáo bất động sản trang trọng”.
- Tông be/xanh rêu/cam đất.
- Style chính trong `css/style.css`.
- Module vay có `css/loan.css`, class tiền tố `.lm-`.

File nguồn không quy định chính xác mã màu, spacing, breakpoint, font size hay thư viện component. Khi chỉnh sửa, tra giá trị và pattern hiện có trong code; không tự đặt thêm thông số rồi coi đó là chuẩn đã duyệt.

## Cách chỉnh UI

- Giữ nhất quán với các màn hiện có; dùng lại style/component khi phù hợp.
- Ưu tiên thông tin dễ đọc và thao tác rõ ràng cho công cụ nội bộ.
- Điều chỉnh layout nhỏ phù hợp phong cách không cần phê duyệt riêng.
- Đổi phong cách chủ đạo, bảng màu hoặc cách tổ chức UI có tác động lớn cần được đối chiếu nguyên tắc và phạm vi yêu cầu.
- Giữ namespace `.lm-` cho style module vay để hạn chế ảnh hưởng sang phần khác.

## Phân cấp điều hướng (chốt 2026-10-06)

- **Tầng 1 — tab ở header, 2 mục (D-004, chốt 2026-10-08):** Tổng quan (màn mặc định khi mở app) · Khách hàng. Không thêm tab thứ 3.
- **Tầng 1b — nhóm khách trong tab Khách hàng** (dải tab gạch chân `#cust-subtabs` dưới header): Đang chăm (khách lớp 2 MÌNH phụ trách) · Khách mới (lead lớp 1 MÌNH phụ trách) · Khách nhóm (khách đồng nghiệp phụ trách mà mình thấy — chỉ hiện khi có nhóm hoặc có khách như vậy). Bấm tab Khách hàng mở lại nhóm xem gần nhất. Badge "khách mới chưa gọi" hiện ở cả nhóm Khách mới lẫn tab Khách hàng. Tên hiển thị dùng "Đang chăm", không dùng "Tiềm năng".
- **Tầng 2 — menu tài khoản (avatar):** nhóm *Công cụ* (Tính vay, Giỏ hàng…), nhóm *Cài đặt* (Lời chào Zalo…), rồi Đăng xuất. Tính năng mới mặc định vào đây.
- Màn công cụ mở từ menu không có tab sáng; đầu màn có thanh `.tool-head` (nút ← về Tổng quan + tên công cụ).
- **Menu đa năng trong ô tìm** (icon thanh trượt, chốt 2026-10-07): chỉ là LỐI TẮT tới thao tác/công cụ đã có (Thêm khách, Nhập/Xuất, Tính vay, Giỏ hàng) — mỗi mục bấm hộ nút gốc qua `data-proxy`. Không đặt tính năng chỉ có ở đây; nơi gốc vẫn là menu tài khoản/toolbar.
- Ô tìm kiếm hiện ở Tổng quan và mọi nhóm khách (`SEARCH_VIEWS` trong `js/app.js`); màn công cụ không có (class `.topbar.no-search`). Tìm ở Tổng quan → trang kết quả tạm chia 3 nhóm Đang chăm / Khách mới / Khách nhóm; bấm 1 khách → sang đúng nhóm của khách và mở khách.
- Muốn đưa một công cụ lên tầng 1 → coi là đổi cách tổ chức UI, hỏi chủ dự án trước.

## Tổng quan = bàn làm việc của sale (2026-10-07)

Tổng quan ưu tiên HÀNH ĐỘNG trước báo cáo: lời chào + 4 chỉ số nhanh → "Việc hôm nay" (nhóm việc theo ưu tiên, mỗi dòng có nút gọi) → lịch hẹn 7 ngày / pipeline đang chăm / hiệu suất tuần → mục "Phân tích & báo cáo" thu gọn chứa các biểu đồ. Thêm loại nhắc việc mới = thêm 1 nhóm trong `dashActionGroups()` (`js/app.js`); biểu đồ báo cáo mới đặt trong `renderDashAnalytics()`, không đưa lên trên Việc hôm nay. Bấm khách ở Tổng quan mở hồ sơ tại chỗ (không đổi tab). Lộ trình tiếp theo: `docs/sale-focus-roadmap.md`.

Nhịp follow-up (2026-10-07): gợi ý lịch luôn là GỢI Ý để sale bấm xác nhận (không tự đặt ngầm). Thông số nhịp/khung giờ/mẫu Zalo mặc định chỉ đặt trong `FOLLOWUP_CONFIG` / `ZALO_TEMPLATES_DEFAULT` của `js/followup.js`; hướng dẫn cho chủ dự án ở `docs/huong-dan-follow-up.md`.

## Nhóm và giao khách (2026-10-08)

Khách đồng nghiệp phụ trách nằm ở nhóm **Khách nhóm** (D-004). Trưởng nhóm lọc theo người bằng mục "Người phụ trách" ĐẦU panel Bộ lọc sẵn có — chỉ hiện ở nhóm Khách nhóm. Khách không do mình phụ trách: nhãn `👤 Tên` trên thẻ, hồ sơ / hộp Khách mới có dòng "chỉ xem" và ẩn nút sửa. Nút "👥 Giao khách" trong hồ sơ và hộp Khách mới; "Đồng nghiệp" trong menu avatar nhóm Cài đặt.

## Tìm kiếm và bộ lọc (2026-10-07)

Dùng bộ lọc sẵn có của từng nhóm Đang chăm / Khách mới / Khách nhóm; không thêm panel lọc tìm kiếm thứ hai dưới header. Loại căn dùng các nút chọn cùng kiểu với bộ lọc thời gian: Tất cả, Studio, 1N, 2N, 3N…; nhóm theo số phòng ngủ, gồm các biến thể cộng / góc / số WC. Số phòng khác xuất hiện khi dữ liệu có; có Khác và Chưa rõ. Kết hợp với các điều kiện lọc hiện tại, chấm báo lọc và Xoá lọc dùng chung.

Giỏ hàng có panel tìm riêng trong dialog hiện có; matching mở từ hồ sơ hoặc căn. Count có aria-live, kết quả hỗ trợ focus / phím mũi tên / Enter; Cmd/Ctrl+K đưa về ô tìm. Các nút lọc xuống dòng trong panel hiện có ở màn hẹp, không kéo tràn ngang.

## Font và tiếng Việt

File nguồn ghi font heading đang dùng `"Georgia", "Times New Roman", serif` sau khi gặp lỗi với `"Iowan Old Style"` trên macOS.

Khi chọn/đổi font, thử trên giao diện thực tế với: “Trường”, “Hưởng”, “Ngữ”, “Tự”, “Đường”. Kiểm tra cả dấu, fallback và tên khách dài. Đừng chỉ thử văn bản tiếng Anh hoặc chữ Việt không dấu.

Giữ font hiện tại khi chưa có lý do đổi. Không coi việc một font từng hiển thị đúng là bảo đảm trên mọi thiết bị; xem `docs/pitfalls.md` để biết lỗi gốc.

## Ẩn/hiện UI

Giữ rule `[hidden] { display: none !important; }` đã dùng trong style chính. Nếu phần tử được JS điều khiển bằng `el.hidden`, kiểm tra cả trạng thái ẩn và hiện sau khi sửa CSS.

## Ngoại lệ và thay đổi chung

Khi có xung đột, áp dụng quy trình ở `CLAUDE.md` và `docs/decisions.md`.

Ví dụ minh họa, chưa phải quyết định đã duyệt: một biểu đồ cần màu cảnh báo nổi bật có thể được duyệt riêng cho biểu đồ đó. Điều này không tự đổi bảng màu của toàn CRM.

Nếu duyệt ngoại lệ, ghi rõ màn/component, điều được phép khác và điều kiện áp dụng. Nếu duyệt đổi phong cách toàn dự án, cập nhật phần “Phong cách đang được mô tả” tại đây và phần nguyên tắc trong `CLAUDE.md`.
