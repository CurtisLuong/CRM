# Tài liệu CRM và cách tổ chức repo

## Mục đích

Giữ root dễ nhìn và giúp AI chỉ đọc thông tin cần cho task. `CLAUDE.md` chứa nguyên tắc cốt lõi; tài liệu chuyên đề chứa chi tiết. Không cần đọc tuần tự toàn bộ bộ tài liệu.

## Danh mục

| File | Nội dung | Khi nào đọc/cập nhật |
|---|---|---|
| `/CLAUDE.md` | Phạm vi, nguyên tắc, quy trình làm việc, chỉ dẫn context | AI đọc lúc bắt đầu; cập nhật khi đổi nguyên tắc chung |
| `/README.md` | Hướng dẫn setup và sử dụng cho chủ dự án | Setup/chạy/deploy; giữ nội dung README hiện có |
| `architecture.md` | Kiến trúc, dữ liệu và bản đồ code | Sửa kiến trúc, DB, auth, offline |
| `design.md` | Quy tắc thiết kế và kiểm tra UI | Sửa giao diện |
| `pitfalls.md` | Lỗi đã gặp, cách tránh và kiểm tra | Đọc phần liên quan đến khu vực đang sửa |
| `decisions.md` | Quyết định thay đổi và ngoại lệ đã duyệt | Khi có xung đột nguyên tắc hoặc cần tiền lệ |
| `project-status.md` | Snapshot và điểm cần xác minh | Handoff hoặc task phụ thuộc trạng thái |
| `loan-module.md` | Quy tắc tính vay, cập nhật lãi suất, gỡ lỗi | Sửa module vay; tài liệu hiện có, không được tái tạo trong bộ này |
| `gio-hang.md` | Giỏ hàng, chỉnh sửa và nhập Excel | Sửa catalog; tài liệu hiện có, không được tái tạo trong bộ này |
| `sale-focus-roadmap.md` | Tham chiếu CRM (FUB, Salesforce, LionDesk, Meey), lộ trình đề xuất và thông tin nên thu thập thêm | Khi chọn tính năng tiếp theo; là đề xuất, chưa phải yêu cầu đã duyệt |

## Cấu trúc đề xuất

```text
repo/
├── CLAUDE.md
├── README.md
├── index.html
├── manifest.json
├── sw.js
├── css/
│   ├── style.css
│   └── loan.css
├── js/
│   ├── config.js
│   ├── lunar.js
│   ├── db.js
│   ├── app.js
│   ├── catalog.js
│   ├── catalog-ui.js
│   └── loan/
├── icons/
├── SQL/
│   ├── schema.sql
│   └── migrations/
│       └── ...các migration hiện có...
├── docs/
│   ├── README.md
│   ├── architecture.md
│   ├── design.md
│   ├── pitfalls.md
│   ├── decisions.md
│   ├── project-status.md
│   ├── loan-module.md
│   ├── gio-hang.md
│   ├── CHANGELOG.md
│   └── FEATURE_IDEAS.md
├── tests/
│   └── loan-engine.test.js
└── dev/
    └── loan-demo.html
```

Đây là cấu trúc đích đề xuất, không phải mô tả repo đã được sắp xếp. Bộ tài liệu được soạn từ CLAUDE.md người dùng cung cấp; chưa kiểm tra checkout thực tế.

## Chuyển đổi theo hai bước

### Bước 1 — Chỉ tách tài liệu

- Đặt `CLAUDE.md` mới ở root; đặt sáu file tài liệu đi kèm trong `docs/`.
- Giữ README, code, SQL, changelog và feature ideas ở vị trí hiện tại.
- Giữ `docs/loan-module.md` và `docs/gio-hang.md` hiện có; bộ này không chứa nội dung thay thế cho chúng.
- Trong bước này, đường dẫn `schema.sql`, `CHANGELOG.md`, `FEATURE_IDEAS.md` vẫn là đường dẫn root như file nguồn.
- Kiểm tra `docs/decisions.md` hiện có trước khi thay thế. Nếu đã có quyết định, hợp nhất nội dung, không xóa lịch sử.

### Bước 2 — Dọn root khi đã kiểm tra tham chiếu

| Hiện tại theo file nguồn | Vị trí đề xuất |
|---|---|
| `schema.sql` | `SQL/schema.sql` |
| `fix_rls_recursion.sql` | `SQL/migrations/fix_rls_recursion.sql` |
| `fix_table_grants.sql` | `SQL/migrations/fix_table_grants.sql` |
| Migration lẻ khác trong `SQL/` | `SQL/migrations/`, sau khi kiểm tra phụ thuộc |
| `CHANGELOG.md` | `docs/CHANGELOG.md` |
| `FEATURE_IDEAS.md` | `docs/FEATURE_IDEAS.md` |

1. Kiểm tra file thực tế và thay đổi chưa commit.
2. Tìm tham chiếu đến từng đường dẫn trong code, tài liệu, script và workflow.
3. Di chuyển theo nhóm nhỏ; giữ nguyên nội dung và tên migration hiện có.
4. Cập nhật đường dẫn trong README, CLAUDE.md và tài liệu liên quan. Ví dụ: đổi `schema.sql` thành `SQL/schema.sql` sau khi file thực sự được chuyển.
5. Kiểm tra link và các lệnh bị ảnh hưởng. Nếu không đổi asset/code runtime, không cần mở rộng kiểm tra thành một đợt test toàn app.

Di chuyển file migration không có nghĩa là phải chạy lại migration trên Supabase. Không suy ra thứ tự chạy từ tên file cũ; dùng lịch sử áp dụng và quan hệ phụ thuộc.

## Những file nên giữ ở root

Giữ `index.html`, `manifest.json`, `sw.js` ở root để tránh đổi đường dẫn runtime và phạm vi Service Worker khi chỉ đang dọn tài liệu. Không tạo thư mục `src/` hoặc `public/` chỉ để root đẹp hơn: việc đó có thể thay đổi cách hosting phục vụ app.

Các file cấu hình thật sự của Git, hosting hoặc AI có thể vẫn cần ở root. Nếu đã có `AGENTS.md`, tránh sao chép toàn bộ hướng dẫn vào đó: giữ nội dung đặc thù của công cụ và tham chiếu nguồn hướng dẫn chung. Kiểm tra cách công cụ đọc file trước khi rút gọn.

Không cần tạo thêm file chỉ để phân loại vài dòng. Nếu một tài liệu hết hữu ích, hợp nhất hoặc bỏ chỉ dẫn đến nó; giữ bộ hướng dẫn ngắn và nhất quán.

## Quy ước duy trì

- File Markdown mới dùng tên chữ thường, dấu gạch nối; giữ `CLAUDE.md` và `README.md` theo tên thông dụng. Dùng tên thống nhất, tránh `claud.md` và nhiều biến thể cùng nội dung.
- Mỗi nguyên tắc chi tiết có một nơi chính; file khác chỉ tóm tắt hoặc trỏ đến.
- Không chuyển mọi entry changelog thành quyết định. Chỉ ghi quyết định đáng kể và ngoại lệ được duyệt.
- Không lặp lại lịch sử trong project-status. Chỉ giữ trạng thái có ích cho handoff và điểm chưa xác minh.
- Tài liệu dài được đọc theo tiêu đề/chủ đề, không mặc định nạp toàn bộ.
