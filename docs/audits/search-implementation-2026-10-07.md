# Triển khai search — 2026-10-07

Đã triển khai các hạng mục ưu tiên 1–3 trong [audit ban đầu](search-2026-10-07.md). Code local, chưa commit / deploy; không đổi schema hoặc dịch vụ tìm kiếm.

## Người dùng có thể làm gì

| Chức năng | Cách dùng |
|---|---|
| Nhiều từ / nhiều trường | `nguyen huong`, `huong marquee`; mọi từ phải xuất hiện trong cùng hồ sơ |
| Cụm chính xác | `"marquee homes"`; không sửa typo trong cụm trích dẫn |
| SĐT / mã số | +84 / 84 / 0 đồng nhất; chọn phạm vi SĐT / Mã căn / Ngày sinh khi cần. Mã 1208, năm 1990, diện tích 53,6 không bị ép thành SĐT |
| Loại căn | 2PN / 2 phòng ngủ tương ứng số phòng 2N; không tự thêm 2WC; giữ phân biệt căn có `+` và WC đã ghi |
| Độ liên quan | Số / tên chính xác trước; tên trước mã căn / dự án, rồi ghi chú. Khớp chính xác trước gần đúng |
| Typo tên | Một lỗi thêm / thiếu / thay / đảo chữ cho từ tên 4–12 chữ; hiện “Gần đúng”; không áp cho số |
| Thông tin mở rộng | Tìm diện tích, hướng, tầng và việc tiếp theo cùng các ghi chú / cuộc gọi / lịch sử hiện có |
| Bộ lọc công việc | Dự án, loại căn, toà, nguồn, campaign, giá căn, vốn sẵn có, diện tích, lần gọi, kết quả gọi, lần liên hệ cuối, đến hạn, thiếu thông tin |
| Danh sách đã lưu | Lưu query, phạm vi và điều kiện lọc; tự đánh giá theo dữ liệu hiện tại. Có preset chưa gọi / khách nóng 7 ngày / đến hạn |
| Phạm vi rõ | Tiềm năng / Khách mới giữ bộ lọc riêng; “Tìm trên tất cả khách” về Tổng quan và giữ lọc chung |
| Kết quả đầy đủ | Xem thêm ở mọi danh sách, giỏ hàng và khách phù hợp căn; đếm / export không bị giới hạn bởi số dòng đang dựng |
| Phím tắt / lịch sử | Cmd/Ctrl+K, mũi tên, Enter, Escape; lịch sử gần đây; aria-live / focus rõ |
| Giỏ hàng | Tìm mã căn / toà / dự án / ghi chú; lọc loại, hướng, tầng, giá, diện tích, trạng thái |
| Khách ↔ căn | Nút từ hồ sơ / từ căn; dự án + loại căn là điều kiện bắt buộc, chỉ căn còn hàng; hiện lý do và dữ liệu thiếu |

`finance` là vốn sẵn có, không phải tổng ngân sách mua. Matching có giới hạn giá mua nhập riêng, dùng giá tổng VAT + KPBT từ LoanEngine và kế thừa catalog. Hướng / tầng / diện tích đã ghi trong hồ sơ chỉ giúp xếp ưu tiên; không suy nhu cầu từ note tự do. Thiếu giá / diện tích không được coi là đạt khoảng lọc tương ứng.

Bộ lọc và lịch sử lưu riêng theo tài khoản trên thiết bị này; chưa đồng bộ đa thiết bị. Nút “Xoá bộ lọc tìm kiếm” chỉ xoá các điều kiện chung trong panel; bộ lọc riêng của tab có nút xoá hiện có.

## Tối ưu và đồng bộ

- Query / khoảng ngày / điều kiện nhiều lựa chọn compile một lần mỗi lượt; tài liệu đã chuẩn hoá cache theo object record, tránh stale khi sửa note không đổi updated_at.
- Chuẩn hoá nền theo đợt khoảng 4 ms, hủy khi dữ liệu / tài khoản đổi. Debounce 120 ms và composition guard, không dựng tab ẩn khi gõ.
- Dựng 50 khách / căn mỗi lần, Tổng quan 30 mỗi nhóm; highlight chỉ tạo cho dòng đang hiển thị. Map tra dự án / toà / nhóm căn thay các tìm kiếm tuyến tính lặp.
- Pull theo khóa id có thứ tự, xác nhận count, tiếp tục khi API cap thấp hơn kích thước trang. Không thay cache bằng trang lỗi / thiếu; transaction chỉ commit sau khi queue vẫn rỗng, phiên và local revision vẫn khớp.
- IndexedDB khách / queue và cache catalog tách theo user; request đang chạy không thay cache tài khoản mới. Queue flush gộp các lượt đồng thời và dùng client / DB của phiên khởi đầu.
- Cache khách cũ nhập một lần theo owner; thao tác không ghi owner chỉ nhập khi tài khoản ghi nhớ khớp và không trái owner record. DB cũ giữ nguyên để phục hồi. Thao tác không thể xác định tài khoản không tự chuyển. Cache catalog cũ không rõ user không tự dùng; cần online một lần để nạp mới.
- App-shell cache v41 có các script mới. Không chạy migration, không đổi RLS / GRANT.

Chưa thêm inverted / trigram index, Web Worker hoặc PostgreSQL search: audit chỉ đề xuất có điều kiện; số đo warm bên dưới chưa cho thấy cần thêm lớp đó. Tổng chi phí xây dữ liệu vẫn phụ thuộc độ dài notes. Người gõ ngay trước khi warmup hoàn tất, hoặc refresh khi query đang mở, vẫn có thể chịu cold work; cần đo p95 trên Android thật trước khi quyết định Worker / index. Kiểm tra count không tạo snapshot server: cập nhật đồng thời giữ nguyên số lượng có thể được phản ánh ở lần pull tiếp theo.

## Kiểm chứng đã chạy

- `node tests/search.test.js`: 29 ca query; xếp độ liên quan, NFD / highlight an toàn, khoảng lọc, alias và ghép căn / giá; kéo 1.201 dòng dưới cap 173, trang lỗi, count thay đổi và phiên hết hiệu lực.
- `node tests/loan-engine.test.js`: toàn bộ kiểm tra hiện có pass.
- `tests/search-browser.test.cjs`: Chrome headless, origin giả `crm-audit.local`, chặn URL bên ngoài. IndexedDB thật, dữ liệu và Supabase client giả. Đã pass:
  - Nhập cache / queue cũ đúng tài khoản, không lặp và không nhận queue trái owner; đổi A ↔ B.
  - Kéo đủ 1.201 khách dù API cap 137; lỗi trang giữ cache; thay đổi local lúc pull không bị ghi đè; pull A đang chạy không ghi vào B.
  - Kéo đủ 1.201 căn và giữ toàn bộ catalog khi một trang lỗi.
  - Query nhiều từ, typo tên, rank, Xem thêm, card / dòng gọn; export đủ kết quả.
  - Lọc diện tích, preset khách nóng, lưu / xoá danh sách, cách ly danh sách A / B, lịch sử, mũi tên / Enter và mô phỏng IME.
  - Sửa note lịch sử không đổi updated_at vẫn tìm được nội dung mới, không giữ nội dung cũ.
  - Tìm căn offline với giá / diện tích kế thừa; ghép cả hai chiều; Xem thêm khách; loại căn vượt giá tối đa.
  - Viewport 1280, 375 và 320 px không tràn ngang; không pageerror. Đã xem ảnh desktop / mobile, giữ font hiện có và dấu tiếng Việt đọc được.
- `git diff --check` pass; `AGENTS.md` và `CLAUDE.md` giống nhau.

## Số đo local với 10.000 khách giả

| Phép đo | Kết quả lần cuối |
|---|---:|
| Cold build + match + DOM, gọi trực tiếp để chẩn đoán | 471.4 ms |
| Truy vấn mới khi field cache đã có | 25.0 ms |
| Tìm lại cùng truy vấn, median 7 lượt | 10.8 ms |
| Warmup nền | 112 đợt, tối đa 4.1 ms / đợt |
| Truy vấn mới sau warmup nền | 25.8 ms |
| Dòng Tổng quan dựng | 60 |

Danh sách Tiềm năng ẩn giữ 50 dòng của lần mở trước, không bị dựng lại thành 5.000 dòng khi gõ. Audit cũ đo luồng input dựng các tab mất 533,4 ms; các số mới chỉ đo JS / DOM của view đang mở, không gồm debounce 120 ms, paint hoặc bàn phím Android. Dữ liệu test có thêm lịch sử chăm sóc nên không coi đây là benchmark trước / sau được kiểm soát tuyệt đối. Các lượt mới dao động khoảng 20–30 ms cho truy vấn warm; cold vẫn lớn nên có warmup nền.

Chưa xác minh auth / quyền theo role thật, cap / dữ liệu / notes production, service-worker cập nhật thật, độ trễ / bàn phím / nhật ký Android thật, đồng bộ nhiều tab / thiết bị đồng thời hoặc deploy.

## File chính

`js/search.js`, `js/search-ui.js`, `js/paged-fetch.js`, `js/property-search.js`, `js/catalog-search-ui.js`; tích hợp `js/app.js`, `js/db.js`, `js/catalog.js`, `index.html`, `css/style.css`, `sw.js`. Hướng dẫn tương ứng cập nhật trong architecture / design / gio-hang / CHANGELOG.
