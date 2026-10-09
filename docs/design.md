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
2. **Đầu thẻ = icon nét + tiêu đề + (›).** `.dcard-head`: icon line 20px (stroke ~1.7, màu xanh mực nhạt), tiêu đề 15px đậm 600, chữ thường (không VIẾT HOA, không chữ xám nhỏ). Có trang/khu xem chi tiết hơn → nút chevron `›` (`.dcard-go`) mép phải, không viết chữ "Xem thêm".
3. **Tổng quan trước, chi tiết sau.** Màn nhiều thông tin chia TAB gạch chân (vd hồ sơ: Tổng quan · Tương tác · Thông tin · Lịch sử). Tab đầu chỉ chứa thứ cần để hành động ngay; danh sách dài ở tab đầu chỉ xem trước 2–3 mục mới nhất + `›` sang tab đầy đủ. Một thẻ có thể thuộc nhiều tab (`data-tabs="overview interact"`).
4. **Chỉ 1 điểm nhấn màu mỗi màn.** Đỏ son (`--seal`) dành cho hành động tiếp theo (vd thẻ "Việc tiếp theo": nền hồng giấy, viền trái đỏ son, tiêu đề đỏ son) và tab đang chọn. Các thẻ khác trung tính. Không thêm màu mới ngoài bảng màu sẵn có.
5. **Chỉ số ngắn = thẻ nhỏ xếp lưới 2 cột** (vd Tiến độ / Quan tâm): nhãn trên, chấm/giá trị dưới; thẻ bấm được có `›`.
6. **Nút phụ đồng đều**: nền trắng, viền nhạt, bo 10px, chữ thường 13px, có icon nhỏ nếu cần; xếp hàng ngang, tự xuống dòng trên điện thoại. Nút chính (đỏ son) chỉ dùng khi thật sự là hành động chính.
7. **Thao tác ít dùng gom vào menu ⋯** (vd Sửa thông tin, Copy prompt AI) thay vì nút nổi riêng; thao tác dùng hằng ngày (Gọi, Zalo, Giao khách) để lộ ra ngoài.
8. **Bảng thông tin trong thẻ**: cột nhãn nền giấy ngà, chữ xám; cột giá trị chữ thường màu mực; dòng ẩn khi không có dữ liệu.
9. **Điện thoại trước**: kiểm tra ở 375px — thẻ sát lề 12px, tab chia đều không cuộn ngang, nút xuống dòng gọn. Desktop giữ cột nội dung tối đa ~720px.
10. **Chữ đậm CHỈ cho tiêu đề** (tiêu đề thẻ/section, tiêu đề thẻ chỉ số, tên khách ở đầu trang). Nội dung, giá trị, số điện thoại, nút, tab, nhãn trạng thái → chữ thường (tab đang chọn tối đa 500, phân biệt bằng màu + gạch chân). Phân cấp bằng cỡ chữ / màu / khoảng cách, không bằng in đậm.
11. **Cỡ chữ ngang các màn khác**: nội dung 14px, nút 13px, tab 13.5px, chữ phụ 12–12.5px, tiêu đề thẻ 15px. Không tăng cỡ chữ riêng cho 1 màn.

## Icon thống nhất (D-006, 2026-10-09)

**Một khái niệm = một icon, ở mọi nơi.** Icon của bậc chăm sóc, hành động / loại việc và các khái niệm chính chỉ khai báo ở `js/icons.js` (`ICON_PATHS`, bậc → icon ở `STAGE_ICON`). Đổi icon 1 khái niệm = sửa 1 dòng ở đó → thanh điều hướng, Tổng quan, hồ sơ, hộp Khách mới, checklist, lịch hẹn… đổi theo. Không vẽ SVG riêng cho khái niệm đã có; khái niệm mới → thêm vào `ICON_PATHS` trước rồi dùng.

- JS: `icon('call')`, `icon('call', 'btn-ic')`, `stageIcon('Booking & Làm hồ sơ')`. HTML tĩnh: `<span class="…" data-icon="call"></span>` (tự điền khi tải trang). Icon nét 24×24, stroke 1.8, màu theo `currentColor`.
- Icon giao diện thuần (mũi tên ›, ✕ đóng, ⋯, phễu lọc, sắp xếp, mây đồng bộ, máy ảnh, bút sửa) không thuộc bảng này.

| Khái niệm | Tên icon | Dùng ở |
|---|---|---|
| Tổng quan | `home` | tab header, thanh dưới |
| Khách hàng · Tiềm năng · bậc Đang chăm sóc | `customers` | tab, số khách, thẻ chỉ số, pipeline, Hiệu suất |
| Khách mới · Thêm khách · bậc Đăng kí mới | `new_lead` | thẻ chỉ số, smartlist, menu, Hiệu suất |
| Thông tin cá nhân | `person` | hồ sơ |
| Căn hộ · Giỏ hàng | `apartment` | hồ sơ, menu tìm |
| Tính vay | `loan` | hồ sơ, menu tìm |
| Ghi chú · cuộc gọi chưa ghi chú | `note` | hồ sơ, smartlist |
| Lịch sử chăm sóc | `history` | hồ sơ |
| Lịch hẹn | `calendar` | Lịch hẹn 7 ngày |
| Thông báo · Việc cần làm hôm nay | `bell` | header, smartlist |
| Giao khách | `assign` | hồ sơ, hộp Khách mới |
| Gọi · Cuộc gọi · Ghi cuộc gọi | `call` | nút gọi, hồ sơ, hộp Khách mới, Hiệu suất |
| Hẹn gọi | `call_sched` | checklist, Lịch hẹn 7 ngày, hộp Khách mới, nút Hẹn gọi, smartlist |
| Gọi lại (chưa liên lạc được) | `call_again` | smartlist |
| Nói chuyện được | `talked` | Hiệu suất |
| Nhắn tin / Zalo | `message` | loại việc |
| Hẹn cafe | `cafe` | loại việc |
| Hồ sơ · Tài liệu | `docs` | loại việc, hồ sơ |
| Tham quan nhà mẫu · bậc Xem dự án | `visit` | loại việc, pipeline |
| bậc Booking & Làm hồ sơ | `booking` | pipeline, phễu |
| Nuôi dài hạn | `nurture` | thẻ khách, hồ sơ |
| SLA · tốc độ phễu | `sla` | hồ sơ, smartlist |
| Kí HĐ · milestone Đã ký HĐMB · Chốt | `contract` | loại việc, thẻ chỉ số, pipeline, Hiệu suất |
| Việc · Việc tiếp theo | `task` | loại việc Khác, hồ sơ, thẻ chỉ số |
| Loại / không chốt | `drop` | bậc Loại |
| Đến giờ / quá giờ hẹn | `alarm` | smartlist |
| Chờ phân loại | `decide` | smartlist |
| Khách nóng | `hot` | smartlist, pipeline |
| Lâu chưa liên hệ · tốc độ gọi | `idle` | smartlist, Hiệu suất |
| Thiếu việc tiếp theo | `alert` | smartlist |
| Sinh nhật | `birthday` | smartlist |

## Màu nhãn & icon hành động (2026-10-09)

**Đỏ, vàng (cả cam) và xanh lá chỉ dành cho badge / cảnh báo mức cấp bách:** đỏ = quá hạn / gấp, vàng = sắp đến, xanh lá = đã xong / ổn. Nhãn (bậc chăm sóc, trạng thái liên hệ, loại việc, thẻ chỉ số, chú thích biểu đồ, avatar) và icon hành động **không** dùng 3 màu này, để màu cảnh báo luôn nổi bật và không bị hiểu nhầm.

Màu đếm ngược / nhắc hẹn (`.call-soon` / `.call-due` / `.call-missed` và viền trái `.is-*` trong `css/style.css`): **sắp đến** vàng sáng `#F5D66E` · **đến hạn** đỏ nhạt `#FF7075` · **quá hạn** đỏ đậm `#A1171E` (chữ trắng) · còn xa (>24 giờ) xám nhạt.

Bảng màu nhãn (khái niệm trùng icon thì trùng màu):

| Màu | Mã | Dùng cho |
|---|---|---|
| Xanh thép | `#3E6A8A` | Gọi · bậc Đang tiếp cận · Hẹn gọi lại · Việc hôm nay (thẻ chỉ số) |
| Chàm | `#5160A8` | Nhắn tin / Zalo · bậc Đang chăm sóc (Tiềm năng) · Chờ kết bạn Zalo |
| Xanh dầu | `#2B7A8C` | Tham quan · bậc Xem dự án · Nói chuyện được · Phản hồi tốt |
| Tím | `#6E5F99` | Hồ sơ · nhóm thông tin / Gợi ý |
| Xanh than | `#2E3A6E` | bậc Booking & Làm hồ sơ |
| Xám thép | `#6B7A8F` | Nuôi dài hạn (ngoài phễu) |
| Mận | `#8A4A78` | Kí HĐ · milestone Đã ký HĐMB · Chốt |
| Nâu | `#7A5A44` | Hẹn cafe · Khách mới vào · Chưa gọi được · nhóm Khách nóng |
| Xám | `#9AA3AE` / `#9A9A90` / `#6b6b60` | bậc Đăng kí mới · Không chốt / Mất liên lạc · việc Khác |

Màu loại việc khai báo ở `.kind-*` (`css/style.css`), màu bậc ở `CARE_STAGE_COLORS`, trạng thái liên hệ ở `CONTACT_STATUS_COLORS` (`js/app.js`). Thêm nhãn mới → chọn trong bảng trên hoặc màu lạnh / trung tính khác, không chọn đỏ / vàng / cam / xanh lá.

Thang độ quan tâm (`INTEREST_TIERS`, `js/app.js`): tông mận nhạt → đậm + số ngọn lửa (`icon('hot')`) — Nguội `#8B93A0` (không lửa) · Ấm `#B98AA8` (1 lửa) · Nóng `#8A4A78` (2) · Rất nóng `#5E2A52` (3). Mận = màu Kí HĐ: khách càng nóng càng gần chốt.

## Phễu 5 giai đoạn & SLA (D-008, 2026-10-09)

- Pill tiến độ: vòng % + "x/5" + tên bậc; Đã mua = "★ Đã ký HĐMB" nền mận nhạt; Nuôi dài hạn = icon `nurture`, nền xám thép, không phân số; Không chốt = "✕" xám.
- Nhãn SLA dùng chung màu đếm ngược: quá mục tiêu = vàng sáng, quá hạn mức = đỏ đậm; còn trong mục tiêu thì thẻ khách không hiện (hồ sơ / hộp Khách mới hiện xám nhạt).
- Hồ sơ: thẻ "Tốc độ phễu" (thanh thời gian, vạch = mục tiêu, cuối thanh = hạn mức) + 4 ô tích Booking + nút "Xác nhận đã Ký HĐMB". Phân tích: thẻ "Phễu & tốc độ (SLA)" thay thẻ phễu cũ; Pipeline thêm ô milestone "★ Đã ký HĐMB".

## Biểu đồ (2026-10-09)

- Thanh ngang (`hbars`): thanh mảnh 8px, nền `#F1EEE7`, mọi dòng 1 lưới chung (thanh thẳng hàng), số không đậm + chữ phụ xám. Màu = 1 màu nhãn lạnh cho cả biểu đồ (bảng "Màu nhãn"); `part` = phần đậm trong thanh, phần còn lại cùng màu nhạt.
- Đường xu hướng (`sparkline`): nét 1.6px, vùng tô 8%, chỉ chấm điểm cuối kèm số, vạch mốc nét đứt.
- Số lớn: chữ mảnh (300) màu mực, không tô màu cảnh báo.

## Tab Công việc & Phân tích (D-007, 2026-10-09)

- **Công việc:** chip lọc loại việc (có số) · nhóm Quá hạn (tiêu đề đỏ son) / Hôm nay / 7 ngày tới / Sau đó / Chưa có hạn, mỗi nhóm 1 thẻ, dòng dạng dòng thời gian như Lịch hẹn 7 ngày + ô tích (việc → xong, ghi lịch sử; hẹn gọi → hộp Gọi xong / Hẹn lại) + đếm ngược · "Đã xong 30 ngày qua" thu gọn cuối trang.
- **Phân tích:** thẻ "Gợi ý từ dữ liệu" đầu trang — mỗi gợi ý: icon (dùng chung) · 1 câu kết luận có số · 1 dòng "vì sao / nên làm gì" · nút hành động nếu có. Gợi ý theo quy tắc, chỉ hiện khi đủ dữ liệu (`INSIGHT_MIN` trong `js/app.js`); chưa đủ → dòng "Cần thêm dữ liệu: …". Thêm gợi ý mới = thêm 1 khối trong `analyticsInsightsHtml()`.

## Loại việc & Lịch hẹn 7 ngày (2026-10-09)

- Mỗi việc có **loại** (icon nét + màu riêng, khai báo 1 chỗ ở `TASK_KINDS` trong `js/app.js`, màu ở CSS `.kind-<loại>`): Hẹn gọi (lịch gọi) · Nhắn tin/Zalo · Hẹn cafe · Hồ sơ (thu thập/bổ sung) · Tham quan (nhà mẫu/sa bàn) · Kí HĐ · Khác. Chọn ở hộp Thêm/Sửa việc; việc cũ chưa có loại → đoán theo chữ. Icon loại dùng chung ở checklist hồ sơ và Lịch hẹn 7 ngày — thêm chỗ hiển thị việc mới thì dùng lại `kindIconHtml()`.
- Thẻ "Lịch hẹn 7 ngày tới" dạng dòng thời gian: cột trái thứ/ngày · giờ · "còn N ngày"; chấm màu theo loại trên trục dọc; thẻ phải: tên khách · nhãn loại (viên màu nhạt) · icon + nội dung · ›. 5 dòng + "Xem tất cả" ở đầu thẻ. Chữ đậm vẫn chỉ ở tiêu đề thẻ (giờ to hơn nhưng không đậm).

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

- **Tầng 1 — 4 tab chính (D-007, 2026-10-09; trước là 2 tab theo D-004):** Tổng quan (màn mặc định, chỉ việc hôm nay) · Khách hàng · Công việc (mọi hẹn gọi + việc theo hạn, lọc loại việc) · Phân tích (Gợi ý từ dữ liệu + Pipeline + Hiệu suất + biểu đồ). Không thêm tab thứ 5 / tab "Công cụ" khi chưa duyệt.
- **Điện thoại / màn hẹp (<900px): tab chính nằm ở THANH ĐIỀU HƯỚNG DƯỚI** (`#bottom-nav`, 2026-10-09): Tổng quan · Khách hàng · [＋ thêm khách, nút tròn nổi giữa] · Công việc · Phân tích. Nút ＋ bấm hộ nút ＋ của màn đang xem (Tổng quan / Tiềm năng → thêm khách, Khách mới → thêm khách mới); nút ＋ nổi góc phải và tab trên header ẩn ở màn hẹp. Không thêm mục mới vào thanh dưới khi chưa duyệt (D-007).
- **Bố cục header:** điện thoại/màn hẹp (<900px) xếp 2 hàng: logo · nút → ô tìm (tab đã xuống thanh dưới), thu gọn thành 1 hàng khi cuộn. Desktop (≥900px) gộp 1 hàng: logo "Sổ Khách" · vạch ngăn · tab (có icon) · ô tìm giãn hết chỗ còn lại · đồng bộ / chuông / avatar; không thu gọn khi cuộn (chỉ thêm icon Lọc ở tab Khách hàng).
- **Tầng 1b — nhóm khách trong tab Khách hàng** (dải tab gạch chân `#cust-subtabs` dưới header): Tiềm năng (khách lớp 2 MÌNH phụ trách) · Khách mới (lead lớp 1 MÌNH phụ trách) · Khách nhóm (khách đồng nghiệp phụ trách mà mình thấy — chỉ hiện khi có nhóm hoặc có khách như vậy). Bấm tab Khách hàng mở lại nhóm xem gần nhất. Badge "khách mới chưa gọi" CHỈ hiện ở nhóm Khách mới, dạng nhẹ (viên be nhạt, chữ xám); tab header Tổng quan / Khách hàng không có số (tránh thúc giục, không cạnh tranh với chuông thông báo). Tab header có icon (ngôi nhà / nhóm người) ở mọi cỡ màn. Tên nhóm hiển thị là "Tiềm năng" (đổi lại 2026-10-08, D-004); "Đang chăm" chỉ là một trạng thái lọc. Tiềm năng / Khách nhóm không hiện số trên tab — số khách ở dòng dưới thanh công cụ. Thanh công cụ: Bộ lọc (có nhóm Trạng thái — Tiềm năng/Khách nhóm: Đang chăm (mặc định) · Đã xong · Tất cả; Khách mới: Tất cả (mặc định, khách đã loại xếp cuối) · Chưa gọi · Cần gọi lại · Đã loại) · Sắp xếp · menu 3 chấm (Tiềm năng/Khách nhóm: đổi kiểu xem, Nhập/Xuất; Khách mới: Nhập/Xuất) · số khách (icon người — cùng icon tab Khách hàng — + số; chữ đầy đủ ở tooltip/aria-label). Nhóm khách và thanh công cụ nằm chung `#cust-bar`, nút nhỏ (32px, icon 15px) để không tranh chú ý với header: desktop ≥900px 1 hàng (nhóm khách trái; công cụ + vạch ngăn + số khách phải), điện thoại 2 hàng. Header thu gọn ở tab Khách hàng có icon Lọc trái nút đồng bộ, chấm đỏ khi đang lọc khác mặc định.
- **Tầng 2 — menu tài khoản (avatar):** nhóm *Công cụ* (Tính vay, Giỏ hàng…), nhóm *Cài đặt* (Lời chào Zalo…), rồi Đăng xuất. Tính năng mới mặc định vào đây.
- Màn công cụ mở từ menu không có tab sáng; đầu màn có thanh `.tool-head` (nút ← về Tổng quan + tên công cụ).
- **Menu đa năng trong ô tìm** (icon thanh trượt, chốt 2026-10-07): chỉ là LỐI TẮT tới thao tác/công cụ đã có (Thêm khách, Nhập/Xuất, Tính vay, Giỏ hàng) — mỗi mục bấm hộ nút gốc qua `data-proxy`. Không đặt tính năng chỉ có ở đây; nơi gốc vẫn là menu tài khoản/toolbar.
- Ô tìm kiếm hiện ở Tổng quan và mọi nhóm khách (`SEARCH_VIEWS` trong `js/app.js`); màn công cụ không có (class `.topbar.no-search`). Tìm ở Tổng quan → trang kết quả tạm chia 3 nhóm Tiềm năng / Khách mới / Khách nhóm; bấm 1 khách → sang đúng nhóm của khách và mở khách.
- Muốn đưa một công cụ lên tầng 1 → coi là đổi cách tổ chức UI, hỏi chủ dự án trước.

## Tổng quan = bàn làm việc của sale (2026-10-07)

Tổng quan ưu tiên HÀNH ĐỘNG trước báo cáo (kiểu "what to do next" + smartlist, quét nhanh): lời chào + 4 thẻ chỉ số (ô icon màu nhạt theo loại · nhãn · số · dòng phụ; bấm được) → "Việc cần làm hôm nay" dạng SMARTLIST: mỗi nhóm việc 1 dòng gọn (icon · số + tên nhóm · tên vài khách đầu · ›), bấm dòng để xổ danh sách khách của nhóm (mỗi dòng có nút gọi, tối đa 5 + Xem thêm) → 5 hẹn / việc gần nhất ("Xem tất cả" → tab Công việc). Pipeline, Hiệu suất và các biểu đồ nằm ở tab Phân tích (D-007). Thêm loại nhắc việc mới = thêm 1 nhóm trong `dashActionGroups()` (`js/app.js`); biểu đồ báo cáo mới đặt trong `renderDashAnalytics()` (hiện ở tab Phân tích), không đưa về Tổng quan. Biểu đồ phân tích ưu tiên đo HIỆU QUẢ (vd "Hiệu quả bán hàng": khách mới · đã liên hệ · chuyển giai đoạn, chọn 7/30/90 ngày) hơn là chỉ đếm lead; chọn khoảng / chuyển góc nhìn bằng nút viên thuốc `.dash-seg` (vd "Căn khách quan tâm": Loại căn · Toà · Ngân sách), lựa chọn nhớ trên máy. Bấm khách ở Tổng quan mở hồ sơ tại chỗ (không đổi tab). Lộ trình tiếp theo: `docs/sale-focus-roadmap.md`.

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
