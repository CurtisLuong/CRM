# Hướng dẫn: Nhóm & giao khách cho đồng nghiệp

## Cài đặt một lần (trưởng nhóm làm)
1. **Chạy SQL** `SQL/add_team_assign.sql` trên Supabase (SQL Editor → dán cả file → Run). Phải chạy **trước** khi deploy code mới.
2. **Đặt bạn làm trưởng nhóm**: trong cùng SQL Editor chạy (thay email của bạn):
   ```sql
   update public.profiles set role = 'admin'
     where id = (select id from auth.users where lower(email) = lower('email-cua-ban@gmail.com'));
   ```
   Kiểm tra: `select u.email, p.role from auth.users u join public.profiles p on p.id = u.id;`
3. Mở app → menu avatar → **Đồng nghiệp** → đặt **Tên hiển thị** của bạn (vd "Duy") → Lưu tên.
4. **Thêm đồng nghiệp**: đồng nghiệp mở app, bấm **Tạo tài khoản mới** ở màn đăng nhập. Sau đó bạn vào **Đồng nghiệp** → nhập email của họ → **Thêm**. Nhắc họ đặt tên hiển thị của họ.

Người tự đăng ký mà bạn chưa thêm vào nhóm: không thấy ai trong nhóm, không được giao khách.

## Giao khách
Mở hồ sơ khách (hoặc hộp Khách mới) → **👥 Giao khách** → chọn người nhận → chọn 1 trong 2:

| Chọn | Kết quả |
|---|---|
| **Tôi vẫn theo dõi** | Đồng nghiệp phụ trách. Khách chuyển sang nhóm **Khách nhóm** với nhãn `👤 Tên`, bạn **chỉ xem** (không sửa, không ghi cuộc gọi). |
| **Giao hẳn** | Đồng nghiệp phụ trách. Khách biến khỏi danh sách của bạn. Là trưởng nhóm, bạn vẫn xem được ở nhóm **Khách nhóm**. |

- Có ô ghi chú cho người nhận (vd "khách hẹn xem nhà mẫu thứ 7"). Việc giao được ghi vào dòng thời gian chăm sóc của khách.
- **Lấy lại khách**: trưởng nhóm mở khách → Giao khách → chọn **Tôi (lấy lại)**.
- Lịch hẹn gọi, ghi chú, tài liệu đi theo khách sang người nhận.
- Giao được cả khi mất mạng — app đồng bộ khi có mạng. Nếu người nhận đã có khách **trùng số điện thoại**, việc giao bị từ chối và app báo lại; khách vẫn thuộc bạn.

## Khách đã giao nằm ở đâu
Tab **Khách hàng** chia 3 nhóm (dải tab ngay dưới thanh tìm kiếm):
- **Tiềm năng**: khách bạn đang phụ trách (đã Đạt).
- **Khách mới**: khách mới bạn đang phụ trách (chưa Đạt).
- **Khách nhóm**: khách đồng nghiệp phụ trách mà bạn thấy được — khách đã giao nhưng bạn vẫn theo dõi; trưởng nhóm thấy thêm mọi khách của nhóm (kể cả khách đã giao hẳn). Thẻ có nhãn `👤 Tên người phụ trách`; mở ra chỉ xem.
  - Trưởng nhóm: Bộ lọc (icon phễu) → **Người phụ trách**: Tất cả · Tôi đang theo dõi · từng đồng nghiệp.

## Ai được làm gì
| | Người phụ trách | Người theo dõi | Trưởng nhóm (khách người khác) |
|---|---|---|---|
| Xem hồ sơ | ✓ | ✓ | ✓ |
| Sửa, ghi chú, ghi cuộc gọi, đổi tiến độ | ✓ | — | — |
| Giao khách / lấy lại | ✓ | — | ✓ |
| Xoá khách | ✓ | — | ✓ |
| Hiện trong Việc hôm nay, chuông nhắc, thống kê Tổng quan | ✓ | — | — |

## Lưu ý
- Lead từ landing page vẫn vào tài khoản trưởng nhóm; bạn chia cho đồng nghiệp bằng Giao khách.
- Báo giá vay đã lưu vẫn thuộc người tạo, không đi theo khách.
- Xoá đồng nghiệp khỏi nhóm không tự chuyển khách của họ — lọc theo tên họ rồi giao lại.
