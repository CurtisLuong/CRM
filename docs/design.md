# Nguyên tắc thiết kế CRM

## Phạm vi và nguồn

Tài liệu này tách nội dung thiết kế có trong CLAUDE.md gốc và biến chúng thành quy tắc thao tác ngắn. Không xác lập một bộ design system mới, không bổ sung triết lý của dự án khác.

## Phong cách đang được mô tả

- Giao diện theo kiểu “báo cáo bất động sản trang trọng”, trình bày theo thẻ nhóm thông tin (xem mục "Vibe thiết kế" bên dưới).
- Tông be/xanh rêu/cam đất.
- Style chính trong `css/style.css`.
- Module vay có `css/loan.css`, class tiền tố `.lm-`.

File nguồn không quy định chính xác mã màu, spacing, breakpoint, font size hay thư viện component. Khi chỉnh sửa, tra giá trị và pattern hiện có trong code; không tự đặt thêm thông số rồi coi đó là chuẩn đã duyệt.

## Vibe thiết kế: "cân bằng – rõ ràng theo nhóm" (chuẩn từ 2026-10-08)

Áp dụng cho MỌI màn mới hoặc khi làm lại màn cũ. Mẫu chuẩn: trang hồ sơ khách (`#detail-screen`); token và class dùng chung ở khối cuối `css/style.css` ("TRANG HỒ SƠ KHÁCH — CÂN BẰNG…").

1. **Chia nội dung thành THẺ theo nhóm thông tin.** Mỗi nhóm 1 thẻ `.dcard`: nền trắng trên nền giấy ngà, viền ấm nhạt `--card-border`, bo `--card-radius` (16px), bóng rất nhẹ `--card-shadow`, các thẻ cách nhau `--card-gap` (12px). Không lồng khung trong khung (bỏ viền/nền của khối con nằm trong thẻ).
2. **Đầu thẻ = icon nét + tiêu đề + (›).** `.dcard-head`: icon line 20px (stroke ~1.7, màu xanh mực nhạt), tiêu đề 15–16px đậm, chữ thường (không VIẾT HOA, không chữ xám nhỏ). Có trang/khu xem chi tiết hơn → nút chevron `›` (`.dcard-go`) mép phải, không viết chữ "Xem thêm".
3. **Tổng quan trước, chi tiết sau.** Màn nhiều thông tin chia TAB gạch chân (vd hồ sơ: Tổng quan · Tương tác · Thông tin · Lịch sử). Tab đầu chỉ chứa thứ cần để hành động ngay; danh sách dài ở tab đầu chỉ xem trước 2–3 mục mới nhất + `›` sang tab đầy đủ. Một thẻ có thể thuộc nhiều tab (`data-tabs="overview interact"`).
4. **Chỉ 1 điểm nhấn màu mỗi màn.** Đỏ son (`--seal`) dành cho hành động tiếp theo (vd thẻ "Việc tiếp theo": nền hồng giấy, viền trái đỏ son, tiêu đề đỏ son) và tab đang chọn. Các thẻ khác trung tính. Không thêm màu mới ngoài bảng màu sẵn có.
5. **Chỉ số ngắn = thẻ nhỏ xếp lưới 2 cột** (vd Tiến độ / Quan tâm): nhãn trên, chấm/giá trị dưới; thẻ bấm được có `›`.
6. **Nút phụ đồng đều**: nền trắng, viền nhạt, bo 10px, chữ đậm vừa, có icon nhỏ nếu cần; xếp hàng ngang, tự xuống dòng trên điện thoại. Nút chính (đỏ son) chỉ dùng khi thật sự là hành động chính.
7. **Thao tác ít dùng gom vào menu ⋯** (vd Sửa thông tin, Copy prompt AI) thay vì nút nổi riêng; thao tác dùng hằng ngày (Gọi, Zalo, Giao khách) để lộ ra ngoài.
8. **Bảng thông tin trong thẻ**: cột nhãn nền giấy ngà, chữ xám; cột giá trị chữ đậm; dòng ẩn khi không có dữ liệu.
9. **Điện thoại trước**: kiểm tra ở 375px — thẻ sát lề 12px, tab chia đều không cuộn ngang, nút xuống dòng gọn. Desktop giữ cột nội dung tối đa ~720px.

## Trang hồ sơ khách (2026-10-08)

- Đầu trang: ảnh bìa (← Quay lại · ⋯ menu: Sửa thông tin khách, Copy prompt phân tích AI) nối liền khối trắng: avatar đè mép bìa + tên · SĐT + Gọi / Zalo / Lưu danh bạ + Giao khách · 4 tab.
- **Tổng quan**: Tiến độ (› sang Lịch sử) · Quan tâm · Liên lạc (nếu có) → Việc tiếp theo (+ Thêm việc · + Hẹn gọi · Ghi cuộc gọi) → Căn hộ quan tâm (› mở Sửa) → Tính khoản vay (Tính khoản vay · Tìm căn phù hợp) → Ghi chú (3 mới nhất, › sang Tương tác).
- **Tương tác**: Ghi chú đầy đủ · Cuộc gọi. **Thông tin**: Thông tin cá nhân (› mở Sửa) · Nâng cao · Tài liệu. **Lịch sử**: Lịch sử chăm sóc.
- Mở khách khác → về tab Tổng quan. Thêm khối mới = thêm 1 thẻ `.dcard` với `data-tabs` phù hợp; logic chuyển tab: `setDetailTab()` trong `js/app.js`.

## Cách chỉnh UI

- Giữ nhất quán với các màn hiện có; dùng lại style/component khi phù hợp.
- Ưu tiên thông tin dễ đọc và thao tác rõ ràng cho công cụ nội bộ.
- Điều chỉnh layout nhỏ phù hợp phong cách không cần phê duyệt riêng.
- Đổi phong cách chủ đạo, bảng màu hoặc cách tổ chức UI có tác động lớn cần được đối chiếu nguyên tắc và phạm vi yêu cầu.
- Giữ namespace `.lm-` cho style module vay để hạn chế ảnh hưởng sang phần khác.

## Phân cấp điều hướng (chốt 2026-10-06)

- **Tầng 1 — tab ở header, 2 mục (D-004, chốt 2026-10-08):** Tổng quan (màn mặc định khi mở app) · Khách hàng. Không thêm tab thứ 3.
- **Bố cục header:** điện thoại/màn hẹp (<900px) xếp 3 hàng: logo · nút → tab → ô tìm, thu gọn thành 1 hàng khi cuộn. Desktop (≥900px) gộp 1 hàng: logo "Sổ Khách" · vạch ngăn · tab (có icon) · ô tìm giãn hết chỗ còn lại · đồng bộ / chuông / avatar; không thu gọn khi cuộn (chỉ thêm icon Lọc ở tab Khách hàng).
- **Tầng 1b — nhóm khách trong tab Khách hàng** (dải tab gạch chân `#cust-subtabs` dưới header): Tiềm năng (khách lớp 2 MÌNH phụ trách) · Khách mới (lead lớp 1 MÌNH phụ trách) · Khách nhóm (khách đồng nghiệp phụ trách mà mình thấy — chỉ hiện khi có nhóm hoặc có khách như vậy). Bấm tab Khách hàng mở lại nhóm xem gần nhất. Badge "khách mới chưa gọi" CHỈ hiện ở nhóm Khách mới, dạng nhẹ (viên be nhạt, chữ xám); tab header Tổng quan / Khách hàng không có số (tránh thúc giục, không cạnh tranh với chuông thông báo). Tab header có icon (ngôi nhà / nhóm người) ở mọi cỡ màn. Tên nhóm hiển thị là "Tiềm năng" (đổi lại 2026-10-08, D-004); "Đang chăm" chỉ là một trạng thái lọc. Tiềm năng / Khách nhóm không hiện số trên tab — số khách ở dòng dưới thanh công cụ. Thanh công cụ: Bộ lọc (có nhóm Trạng thái, mặc định Đang chăm / Cần gọi) · Sắp xếp · menu 3 chấm (Tiềm năng/Khách nhóm: đổi kiểu xem, Nhập/Xuất; Khách mới: Nhập/Xuất) · số khách. Nhóm khách và thanh công cụ nằm chung `#cust-bar`, nút nhỏ (32px, icon 15px) để không tranh chú ý với header: desktop ≥900px 1 hàng (nhóm khách trái; công cụ + vạch ngăn + số khách phải), điện thoại 2 hàng. Header thu gọn ở tab Khách hàng có icon Lọc trái nút đồng bộ, chấm đỏ khi đang lọc khác mặc định.
- **Tầng 2 — menu tài khoản (avatar):** nhóm *Công cụ* (Tính vay, Giỏ hàng…), nhóm *Cài đặt* (Lời chào Zalo…), rồi Đăng xuất. Tính năng mới mặc định vào đây.
- Màn công cụ mở từ menu không có tab sáng; đầu màn có thanh `.tool-head` (nút ← về Tổng quan + tên công cụ).
- **Menu đa năng trong ô tìm** (icon thanh trượt, chốt 2026-10-07): chỉ là LỐI TẮT tới thao tác/công cụ đã có (Thêm khách, Nhập/Xuất, Tính vay, Giỏ hàng) — mỗi mục bấm hộ nút gốc qua `data-proxy`. Không đặt tính năng chỉ có ở đây; nơi gốc vẫn là menu tài khoản/toolbar.
- Ô tìm kiếm hiện ở Tổng quan và mọi nhóm khách (`SEARCH_VIEWS` trong `js/app.js`); màn công cụ không có (class `.topbar.no-search`). Tìm ở Tổng quan → trang kết quả tạm chia 3 nhóm Tiềm năng / Khách mới / Khách nhóm; bấm 1 khách → sang đúng nhóm của khách và mở khách.
- Muốn đưa một công cụ lên tầng 1 → coi là đổi cách tổ chức UI, hỏi chủ dự án trước.

## Tổng quan = bàn làm việc của sale (2026-10-07)

Tổng quan ưu tiên HÀNH ĐỘNG trước báo cáo: lời chào + 4 chỉ số nhanh → "Việc hôm nay" (nhóm việc theo ưu tiên, mỗi dòng có nút gọi) → lịch hẹn 7 ngày / pipeline đang chăm / hiệu suất tuần → mục "Phân tích & báo cáo" thu gọn chứa các biểu đồ. Thêm loại nhắc việc mới = thêm 1 nhóm trong `dashActionGroups()` (`js/app.js`); biểu đồ báo cáo mới đặt trong `renderDashAnalytics()`, không đưa lên trên Việc hôm nay. Bấm khách ở Tổng quan mở hồ sơ tại chỗ (không đổi tab). Lộ trình tiếp theo: `docs/sale-focus-roadmap.md`.

Nhịp follow-up (2026-10-07): gợi ý lịch luôn là GỢI Ý để sale bấm xác nhận (không tự đặt ngầm). Thông số nhịp/khung giờ/mẫu Zalo mặc định chỉ đặt trong `FOLLOWUP_CONFIG` / `ZALO_TEMPLATES_DEFAULT` của `js/followup.js`; hướng dẫn cho chủ dự án ở `docs/huong-dan-follow-up.md`.

## Nhóm và giao khách (2026-10-08)

Khách đồng nghiệp phụ trách nằm ở nhóm **Khách nhóm** (D-004). Trưởng nhóm lọc theo người bằng mục "Người phụ trách" ĐẦU panel Bộ lọc sẵn có — chỉ hiện ở nhóm Khách nhóm. Khách không do mình phụ trách: nhãn `👤 Tên` trên thẻ, hồ sơ / hộp Khách mới có dòng "chỉ xem" và ẩn nút sửa. Nút "👥 Giao khách" trong hồ sơ và hộp Khách mới; "Đồng nghiệp" trong menu avatar nhóm Cài đặt.

## Tìm kiếm và bộ lọc (2026-10-07)

Dùng bộ lọc sẵn có của từng nhóm Tiềm năng / Khách mới / Khách nhóm; không thêm panel lọc tìm kiếm thứ hai dưới header. Loại căn dùng các nút chọn cùng kiểu với bộ lọc thời gian: Tất cả, Studio, 1N, 2N, 3N…; nhóm theo số phòng ngủ, gồm các biến thể cộng / góc / số WC. Số phòng khác xuất hiện khi dữ liệu có; có Khác và Chưa rõ. Kết hợp với các điều kiện lọc hiện tại, chấm báo lọc và Xoá lọc dùng chung.

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
