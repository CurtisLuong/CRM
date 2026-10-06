# CLAUDE.md — Hướng dẫn AI làm việc với CRM

## 1. Mục tiêu và phạm vi

CRM nội bộ cho một sale bất động sản, chủ yếu làm dự án nhà ở xã hội tại Hải Phòng/Hưng Yên. Thay thế ghi chú rời rạc bằng app web dùng trên Android và MacBook, đồng bộ dữ liệu và nhập khách khi mất mạng. Có thể mở rộng dần cho vài đồng nghiệp.

Không yêu cầu app native, multi-tenant SaaS hoặc chức năng thanh toán.

Chủ dự án không có background lập trình: ưu tiên giải pháp đơn giản, ít bước thủ công; giải thích rõ trước khi đổi kiến trúc. Giao tiếp ngắn gọn, tập trung vào kết quả và lựa chọn thực tế.

## 2. Nguyên tắc bắt buộc

- Frontend HTML/CSS/JavaScript thuần, không build step. File phải chạy bằng script/link thông thường; không thêm bundler hoặc framework nếu chưa được duyệt.
- Backend/DB: Supabase Postgres + Auth. Hosting: Cloudflare Pages, kết nối GitHub.
- Dữ liệu khách: đọc IndexedDB local trước; ghi local ngay và thêm hàng đợi đồng bộ lên Supabase. Xung đột theo last-write-wins dựa trên `updated_at`.
- Quyền dữ liệu dùng RLS và GRANT; không bỏ một lớp để thay thế cho lớp kia.
- Thông tin khách được thu thập dần. Theo đặc tả gốc, `phone`, `full_name`, `owner_id` là bắt buộc; các field thông tin khách khác cho phép trống. Đối chiếu schema khi sửa.
- Giữ phong cách báo cáo bất động sản trang trọng, bảng màu be/xanh rêu/cam đất. Theo quy tắc tại `docs/design.md` khi sửa UI.
- Tái sử dụng cấu trúc, style và module hiện có khi phù hợp; không đổi kiến trúc để giải quyết một chỉnh sửa nhỏ.

## 3. Khởi động với context tối thiểu

1. Đọc file này một lần trong phiên; đọc lại khi file thay đổi.
2. Xác định phạm vi yêu cầu và kiểm tra trạng thái Git, kể cả thay đổi chưa commit. Giữ lại thay đổi ngoài phạm vi của người dùng.
3. Đọc code cần sửa và các phụ thuộc trực tiếp. Mở tài liệu theo bảng dưới, chỉ đến mức đủ để làm task đúng.
4. Mở rộng phạm vi đọc nếu có bằng chứng thiếu context. Không quét toàn repo hoặc toàn lịch sử chỉ để phòng hờ.

| Khi task liên quan đến | Đọc thêm |
|---|---|
| Kiến trúc, luồng dữ liệu, auth, schema, offline | `docs/architecture.md`; schema/migration và code tương ứng |
| Giao diện, CSS, font, bố cục | `docs/design.md`; phần UI/font trong `docs/pitfalls.md` |
| Supabase/CDN, auth, RLS/GRANT | Phần JavaScript/Supabase trong `docs/pitfalls.md` |
| PWA, cache hoặc cập nhật app | Phần Service Worker trong `docs/pitfalls.md` |
| Module vay | `docs/loan-module.md`; code trong `js/loan/` và `css/loan.css` |
| Giỏ hàng hoặc nhập Excel | `docs/gio-hang.md`; `js/catalog.js`, `js/catalog-ui.js` |
| Xung đột nguyên tắc hoặc tiền lệ | `docs/decisions.md` |
| Setup, chạy app, triển khai | `README.md`; file cấu hình và workflow liên quan |
| Tiếp nối công việc hoặc hỏi trạng thái | `docs/project-status.md`, sau đó xác minh phần liên quan |

Không mặc định đọc toàn bộ `CHANGELOG.md`, `FEATURE_IDEAS.md`, README hoặc lịch sử Git. Khi sửa regression/cần hiểu lý do code, tìm lịch sử theo file/chủ đề và chỉ mở commit liên quan. Đọc `FEATURE_IDEAS.md` khi đối chiếu một tính năng mới; đó là ý tưởng, không phải yêu cầu đã được duyệt.

## 4. Khi yêu cầu xung đột với nguyên tắc

- Kiểm tra để xác định có xung đột thực sự; không xin phê duyệt cho lựa chọn nhỏ phù hợp nguyên tắc.
- Trước khi thực hiện phần xung đột, nêu nguyên tắc bị ảnh hưởng, phương án giữ nguyên, lợi ích/bất lợi và phạm vi của phương án thay đổi.
- Cho người dùng chọn: giữ nguyên; ngoại lệ cục bộ; hoặc đổi nguyên tắc toàn dự án. Tiếp tục phần độc lập đã được cho phép trong lúc chờ.
- Nếu người dùng đã chỉ định rõ quyết định và phạm vi, không hỏi lại.
- Đồng ý với một đề xuất cục bộ chỉ áp dụng cho phạm vi đề xuất đó. Không tự suy ra thay đổi toàn dự án.
- Sau khi được duyệt, cập nhật `docs/decisions.md`. Nếu đổi nguyên tắc chung, sửa cả file này và tài liệu chuyên đề liên quan. Nếu chỉ là ngoại lệ, giữ nguyên nguyên tắc chung và thêm chỉ dẫn ngoại lệ cần thiết vào mục tương ứng.
- Không sửa nguyên tắc để hợp thức hóa việc đã tự làm. Chi tiết quy trình: `docs/decisions.md`.

## 5. Thực hiện và kiểm chứng

- Thay đổi schema phải có migration SQL riêng. `schema.sql` là baseline cho cài đặt mới, không phải bằng chứng production đã áp dụng migration.
- Không chỉnh baseline một cách âm thầm: đồng bộ khi cần và ghi lại thay đổi đáng kể trong changelog. Không chạy lại migration cũ chỉ vì file còn trong repo.
- Chạy kiểm tra phù hợp phạm vi. Với engine vay, dùng test hiện có `node tests/loan-engine.test.js`; UI cần kiểm tra trình duyệt, font tiếng Việt và màn hình liên quan khi có môi trường.
- Chỉ báo một kiểm tra đã pass khi thực sự chạy. Phân biệt kiểm tra local, trình duyệt, migration thực tế và deploy.
- Báo ngắn: đã đổi gì, đã kiểm tra gì, điều gì chưa xác minh. Không coi ghi chú trạng thái cũ là xác nhận hiện tại.
- Ghi `CHANGELOG.md` cho thay đổi đáng kể về tính năng, hành vi, dữ liệu hoặc triển khai, theo định dạng ngày — mô tả — file ảnh hưởng. Không chép lại diff hoặc ghi mọi chỉnh sửa nhỏ.

## 6. Nguồn thông tin

Code/schema mô tả implementation hiện có; hướng dẫn và quyết định đã duyệt mô tả ý định. Git lưu lịch sử thay đổi; tài liệu quyết định lưu lý do và phạm vi ngoại lệ. Nếu các nguồn mâu thuẫn, chỉ rõ mâu thuẫn, không tự coi code hiện tại là sự chấp thuận đổi nguyên tắc.

Bản đồ tài liệu và hướng dẫn tổ chức repo: `docs/README.md`. Những link tại đây là chỉ dẫn tra cứu, không phải yêu cầu đọc tất cả.
