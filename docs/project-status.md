# Trạng thái dự án — snapshot từ tài liệu nguồn

## Nguồn và giới hạn

Nội dung bên dưới được chuyển từ CLAUDE.md người dùng cung cấp. Tài liệu nguồn không cho biết thời điểm xác minh các trạng thái này.

Bộ tài liệu được biên soạn ngày 06/10/2026; đây không phải ngày kiểm tra app. Chưa xác minh repo, Supabase, GitHub, Cloudflare hoặc thiết bị thật trong quá trình biên soạn. Không coi snapshot này là xác nhận hiện tại.

Chỉ đọc file này khi cần tiếp nối công việc hoặc task phụ thuộc trạng thái triển khai/test.

## Trạng thái được ghi trong nguồn

| Hạng mục | Nội dung nguồn ghi | Cần xác minh khi nào |
|---|---|---|
| Hosting | Đã deploy tại https://crm-cop.pages.dev | Khi kiểm tra production hoặc triển khai |
| Auto-deploy | GitHub → Cloudflare Pages khi push main | Trước khi push có khả năng deploy |
| Chức năng cơ bản | Đăng nhập/đăng ký, tạo khách, filter/sort, offline sync đã chạy và được test thủ công | Khi sửa các luồng liên quan |
| Tài khoản/dữ liệu | Có một tài khoản role sale, chưa có khách thật | Khi thao tác dữ liệu; không giả định hiện vẫn trống |
| Baseline schema | `schema.sql` được mô tả đã vá các lỗi ở phần pitfalls | Khi setup/migration; kiểm tra schema thực tế |
| Migration cũ | `fix_rls_recursion.sql`, `fix_table_grants.sql` được ghi đã áp dụng | Khi xác định trạng thái DB; không chạy lại mặc định |
| Deep-link Zalo | Chưa test kỹ SĐT → Zalo trên môi trường thật | Khi sửa hoặc xác nhận tính năng này |

## Icon PWA

File nguồn ghi các icon:

- `icons/app-icon-192.png`
- `icons/app-icon-512.png`
- `icons/apple-touch-icon.png`

Được tạo từ `icons/Net_Icon.png`, logo mạng lưới xanh trên nền mint. Nguồn ghi đã center-crop bằng `sips` để cắt viền trắng thừa.

Không cần đọc hoặc tái tạo icon cho task không liên quan. Khi đổi asset, kiểm tra file và tham chiếu trong manifest/HTML/Service Worker.

## Cách cập nhật snapshot

Sau một lần xác minh thực tế, thay trạng thái liên quan bằng thông tin mới, ghi:

- Ngày kiểm tra.
- Môi trường: local / trình duyệt / Supabase / production.
- Kết quả và bằng chứng ngắn: commit, deployment, migration hoặc kiểm tra cụ thể.
- Phần chưa xác minh hoặc bị chặn.

Không dồn lịch sử vào file này; changelog/Git giữ lịch sử. Không cập nhật phần ngoài phạm vi task bằng suy đoán.
