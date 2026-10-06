# Các bẫy kỹ thuật đã gặp

Nguồn: CLAUDE.md người dùng cung cấp. File nguồn mô tả các lỗi bên dưới đã được sửa; bộ tài liệu này chưa kiểm tra lại code hoặc production.

Chỉ đọc phần liên quan đến task. Không cần nạp toàn bộ file ở đầu mọi phiên.

## 1. JavaScript/CDN: tên global supabase

**Khi đọc:** sửa `js/app.js`, khởi tạo client, thứ tự script hoặc cách load SDK.

Thư viện `@supabase/supabase-js` được load qua CDN dạng script thông thường, tạo global `supabase`. Khai báo client bằng tên global trùng có thể gây:

```text
SyntaxError: Identifier 'supabase' has already been declared
```

Lỗi này có thể khiến toàn bộ `app.js` không chạy, kể cả gắn event listener, nên nút bấm trông như không phản hồi.

**Quy tắc:** giữ tên client khác global của SDK; file nguồn ghi tên đang dùng là `sb`. Nếu đổi cách load thư viện, kiểm tra lại scope và thứ tự script.

**Kiểm tra:** mở console, reload app và thử thao tác bị ảnh hưởng. Không kết luận lỗi UI trước khi kiểm tra script có chạy hay không.

## 2. Supabase: RLS tự tham chiếu profiles

**Khi đọc:** sửa role, auth, policy trên `profiles` hoặc helper kiểm tra admin.

Policy trên chính `profiles` truy vấn lại `profiles` để kiểm tra admin có thể gây:

```text
infinite recursion detected in policy
```

**Quy tắc:** dùng helper kiểm tra role tách riêng theo cơ chế hiện có, `public.is_admin()` dạng security definer được mô tả trong `schema.sql`. Không viết lại policy tự tham chiếu bảng của chính nó.

**Kiểm tra:** xem policy/helper thực tế; thử hành vi liên quan dưới các role cần thiết khi có môi trường. Không coi kiểm tra bằng tài khoản đặc quyền là bằng chứng policy cho sale đúng.

**Lịch sử:** file nguồn ghi `fix_rls_recursion.sql` đã áp dụng. Giữ làm tham khảo, không mặc định chạy lại.

## 3. Supabase: RLS không thay GRANT

**Khi đọc:** tạo bảng, sửa quyền truy cập, hoặc gặp lỗi permission denied.

Bật RLS nhưng thiếu GRANT cần thiết cho `authenticated` vẫn có thể gây:

```text
permission denied for table
```

**Quy tắc:** kiểm tra cả quyền ở tầng bảng và RLS policy. Chỉ cấp các thao tác cần thiết; không tắt RLS hoặc mở quyền quá rộng để làm lỗi biến mất.

**Kiểm tra:** đối chiếu GRANT và policy; thử thao tác với user/role thực sự dùng app.

**Lịch sử:** file nguồn ghi `fix_table_grants.sql` đã áp dụng. Giữ làm tham khảo, không mặc định chạy lại.

## 4. PWA: Service Worker giữ CSS/JS cũ

**Khi đọc:** sửa `sw.js`, APP_SHELL, cache hoặc xử lý app không cập nhật sau deploy.

File nguồn ghi chiến lược cũ trả cache trước rồi revalidate sau khiến app vẫn dùng CSS/JS cũ; F5 không giải quyết được. Chiến lược đã đổi sang network-first: thử mạng trước, dùng cache khi mất mạng.

**Quy tắc:** giữ chiến lược network-first hiện có nếu chưa được duyệt đổi. Mỗi lần sửa APP_SHELL trong `sw.js`, tăng version `CACHE_NAME`, ví dụ `v2` → `v3`, theo quy ước hiện tại.

**Kiểm tra:** xác nhận asset thực sự đang chạy sau cập nhật; kiểm tra online và fallback offline khi task ảnh hưởng cache. Unregister Service Worker có thể hỗ trợ chẩn đoán trên thiết bị test, nhưng không thay thế việc sửa cơ chế cập nhật cho người dùng.

Không di chuyển `sw.js` sang thư mục khác chỉ để dọn root; phạm vi kiểm soát app có thể thay đổi.

## 5. CSS: display ghi đè hidden

**Khi đọc:** sửa CSS của modal, auth screen, thành phần ẩn/hiện hoặc điều kiện render.

Rule `display` có thể làm phần tử vẫn hiện dù JS đặt `el.hidden = true`. File nguồn ghi đã thêm đầu `style.css`:

```css
[hidden] {
  display: none !important;
}
```

**Quy tắc:** giữ hành vi của thuộc tính `hidden`; không thêm CSS làm phá trạng thái này.

**Kiểm tra:** thử cả `hidden = true` và `hidden = false` trong luồng thực tế, kể cả chuyển màn hoặc mở/đóng modal.

## 6. Font: dấu tiếng Việt trong heading

**Khi đọc:** đổi font, heading hoặc style tên khách.

File nguồn ghi `"Iowan Old Style"` trên macOS từng làm vỡ dấu ở các chữ ư/ơ có dấu: “ường”, “ưởng”, “ữ”, “ự”. Lỗi chỉ lộ ở heading/tên khách trong khi body sans vẫn đúng.

**Quy tắc:** tránh đưa lại font này mà chưa kiểm tra. Font heading được ghi là `"Georgia", "Times New Roman", serif`.

**Kiểm tra:** thử tên có ư/ơ và dấu trong h1/h2, không chỉ body. Kiểm tra trình duyệt/thiết bị liên quan khi có môi trường; không suy ra mọi hệ thống đều đúng từ một lần thử trên Mac.

## Cập nhật file này

Chỉ thêm lỗi có bằng chứng và có khả năng lặp lại. Mỗi mục cần: khi nào đọc, triệu chứng, nguyên nhân/quy tắc và cách kiểm tra. Giữ ngắn; không sao chép toàn bộ changelog hay hội thoại debugging.

Nếu sửa lỗi dẫn đến thay đổi nguyên tắc, ghi quyết định tại `docs/decisions.md`; phần này chỉ ghi cách tránh lặp lỗi.
