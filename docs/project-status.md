# Trạng thái dự án — snapshot từ tài liệu nguồn

## Nguồn và giới hạn

Nội dung bên dưới được chuyển từ CLAUDE.md người dùng cung cấp. Tài liệu nguồn không cho biết thời điểm xác minh các trạng thái này.

Bộ tài liệu được biên soạn ngày 06/10/2026; đây không phải ngày kiểm tra app. Chưa xác minh repo, Supabase, GitHub, Cloudflare hoặc thiết bị thật trong quá trình biên soạn. Không coi snapshot này là xác nhận hiện tại.

Chỉ đọc file này khi cần tiếp nối công việc hoặc task phụ thuộc trạng thái triển khai/test.

## Đại tu v2 (cập nhật 2026-10-16)

- Đã có bộ quy định: `PRD.md`, `tasks.md`, `architecture.md` v2, `DESIGN_SYSTEM.md` v3, `UX_GUIDELINES.md` v2, `prompts.md`, D-011…D-015. **Chưa code v2.** Bước kế: Sóng 0 trong `tasks.md` (backup, audit trigger, đối soát schema, fixture/golden, hạ tầng `crm-v2` + staging, baseline).
- Chờ chủ dự án xác nhận stack D-011 trước T1.1.

## Migration production cần đối soát ở T0.3 (theo ghi chú phiên trước, chưa xác minh)

Ghi chú các phiên trước không đầy đủ và có chỗ không thống nhất → T0.3 xác định bằng truy vấn trên production, không dựa vào bảng này.

| File | Ghi chú phiên trước |
|---|---|
| `add_lead_layer.sql`, `add_loan_module.sql`, `add_funnel_velocity.sql` | Ghi là đã chạy |
| `add_zalo_templates.sql`, `add_team_assign.sql` (+ đặt admin), `add_ai_settings.sql`, `add_realtime_customers.sql` | Ghi là **chưa chạy** |
| `add_fb_leads.sql`, chuỗi catalog (`add_catalog_buildings` → `merge_project_trang_cat` → `add_apt_types_by_project` → `catalog_layers_v2`), `add_source.sql`, `add_cover_photo.sql` | Chưa rõ |

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
