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

- **Tầng 1 — tab ở header, tối đa 3:** Tổng quan (màn mặc định khi mở app) · Tiềm năng (khách lớp 2) · Khách mới (lead lớp 1). Không thêm tab thứ 4.
- **Tầng 2 — menu tài khoản (avatar):** nhóm *Công cụ* (Tính vay, Giỏ hàng…), nhóm *Cài đặt* (Lời chào Zalo…), rồi Đăng xuất. Tính năng mới mặc định vào đây.
- Màn công cụ mở từ menu không có tab sáng; đầu màn có thanh `.tool-head` (nút ← về Tổng quan + tên công cụ).
- **Menu đa năng trong ô tìm** (icon thanh trượt, chốt 2026-10-07): chỉ là LỐI TẮT tới thao tác/công cụ đã có (Thêm khách, Nhập/Xuất, Tính vay, Giỏ hàng) — mỗi mục bấm hộ nút gốc qua `data-proxy`. Không đặt tính năng chỉ có ở đây; nơi gốc vẫn là menu tài khoản/toolbar.
- Ô tìm kiếm hiện ở cả 3 tab chính (`SEARCH_VIEWS` trong `js/app.js`); màn công cụ không có (class `.topbar.no-search`). Tìm ở Tổng quan → trang kết quả tạm gộp Tiềm năng + Khách mới; bấm 1 khách → sang đúng tab của khách và mở khách.
- Muốn đưa một công cụ lên tầng 1 → coi là đổi cách tổ chức UI, hỏi chủ dự án trước.

## Tìm kiếm và bộ lọc (2026-10-07)

Bộ lọc tìm kiếm chung đặt trong details ngay dưới header, mặc định gập; không thêm đối tượng vào header hoặc tab thứ tư. Summary nói rõ phạm vi tab và việc đang lọc. Lối “Tìm trên tất cả khách” về Tổng quan, giữ các điều kiện lọc chung. Bộ lọc riêng của Tiềm năng / Khách mới vẫn áp dụng trong tab đó.

Giỏ hàng có panel tìm riêng trong dialog hiện có; matching mở từ hồ sơ hoặc căn. Count có aria-live, kết quả hỗ trợ focus / phím mũi tên / Enter; Cmd/Ctrl+K đưa về ô tìm. Bộ lọc dùng hai cột ở màn hẹp, không kéo tràn ngang.

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
