# Quyết định và ngoại lệ đã duyệt

## Mục đích

Git lưu thay đổi code; file này lưu quyết định có tác động đến nguyên tắc, lý do và phạm vi áp dụng. Không phải bản sao changelog hoặc danh sách mọi ý tưởng thảo luận.

Các lựa chọn nền tảng được mô tả trong CLAUDE.md nguồn đã được giữ ở `CLAUDE.md`, `architecture.md` và `design.md`. Không tự tạo ngày duyệt hoặc người duyệt cho chúng.

Hiện chưa có ngoại lệ đã duyệt được xác định từ file nguồn.

## Ba loại kết quả

| Kết quả | Hành động |
|---|---|
| Giữ nguyên | Làm phương án phù hợp nguyên tắc; ghi quyết định nếu cần tránh tranh luận lại |
| Ngoại lệ cục bộ | Ghi giới hạn tại đây; giữ nguyên quy tắc chung; thêm chỉ dẫn tại nguyên tắc liên quan nếu cần |
| Đổi nguyên tắc toàn dự án | Ghi quyết định; sửa CLAUDE.md và tài liệu chuyên đề liên quan để thống nhất |

## Quy trình khi có xung đột

1. Xác định nguyên tắc cụ thể trong tài liệu và yêu cầu/giải pháp đang xung đột.
2. Kiểm tra implementation, phụ thuộc và phạm vi người dùng đã cho phép. Không hỏi lại quyết định đã rõ.
3. Trình bày ngắn phương án giữ nguyên và phương án thay đổi, kèm lợi ích, bất lợi, phạm vi và chi phí liên quan.
4. Nếu chưa được quyết định, hỏi rõ: giữ nguyên, ngoại lệ cho phạm vi nêu, hay đổi nguyên tắc toàn dự án.
5. Chờ trước khi thực hiện phần xung đột; tiếp tục phần độc lập đã được cho phép.
6. Ghi kết quả đã duyệt và cập nhật đúng tài liệu. Không tự mở rộng việc thực hiện ra các màn/module khác chỉ vì nguyên tắc chung được đổi; phạm vi code vẫn theo yêu cầu đã duyệt.

Một lời đồng ý với đề xuất cục bộ đang được trình bày chỉ áp dụng cục bộ. Nếu phạm vi chấp thuận không đủ rõ để triển khai, hỏi ngắn trước khi thực hiện phần phụ thuộc.

## Mẫu ghi quyết định

Sao chép mẫu khi có quyết định thực tế. Không để placeholder thành quyết định đang có hiệu lực.

```markdown
### D-001 — [Tên quyết định]

- Ngày: [ngày người dùng chấp thuận]
- Loại: Giữ nguyên / Ngoại lệ cục bộ / Đổi nguyên tắc toàn dự án
- Nguyên tắc liên quan: [file và mục]
- Quyết định: [điều được chấp thuận]
- Phạm vi: [màn, component, module hoặc toàn dự án]
- Lý do và đánh đổi: [ngắn gọn]
- Chấp thuận: [tóm tắt xác nhận của người dùng; link issue/PR nếu có]
- Tài liệu đã cập nhật: [file]
- Trạng thái: Đang áp dụng / Hết hiệu lực / Thay bởi D-...
```

Nếu là ngoại lệ, thêm điều kiện hết hiệu lực hoặc giới hạn khi có. Không cần tạo bảng ngoại lệ thứ hai ở mọi tài liệu; dùng chỉ dẫn đến mã quyết định tại đây.

## Sổ quyết định

Ví dụ và mẫu trong bộ tài liệu không phải sự chấp thuận cho một thay đổi code hoặc kiến trúc.

### D-001 — Hai lớp khách + quy tắc nguồn khách

- Ngày: 2026-10-06
- Loại: Quy ước dữ liệu toàn dự án (không xung đột nguyên tắc: vẫn một bảng `customers`, local-first, RLS như cũ)
- Nguyên tắc liên quan: `CLAUDE.md` §2 (dữ liệu khách, field bắt buộc); `docs/architecture.md` mục "Lớp khách và nguồn khách"
- Quyết định:
  1. **Hai lớp trên cùng bảng `customers`**, phân biệt bằng `qualified_at`. Lớp 1 "Khách mới" (trống): mọi khách mới nhập theo bất kỳ kênh nào, chỉ ghi cuộc gọi (`call_attempts`), Đạt hoặc Loại. Lớp 2 (có giá trị): trang chủ + hồ sơ đầy đủ. Không tách bảng `leads` riêng (tránh luồng đồng bộ thứ hai, sao chép khi Đạt, chống trùng trên 2 bảng).
  2. **Tiêu chí Đạt:** có ≥1 cuộc gọi kết quả `talked` và sale bấm Đạt → `qualified_at` + bậc `Đang chăm sóc`. Bậc `Đăng kí mới`/`Đang tiếp cận` thuộc lớp 1, không hiện ở trang chủ. Khách cũ ở 2 bậc này chuyển hết xuống lớp 1.
  3. **Lead bị loại vẫn giữ** (`disqualified_at`, `disqualify_reason` mã, `disqualify_note`) để đánh giá campaign/landing page. Lý do hay gặp: Chê giá cao, Phá campaign, Không đủ điều kiện, Không liên lạc được; ngoài ra Số sai, Nợ xấu, Dò giá, Tò mò, Khác (Khác bắt buộc ghi chú).
  4. **Nguồn khách tách 3 trục, không trộn:**
     - `source` (jsonb mảng) = **kênh** khách đến: `facebook_ads`, `website`, `referral`; sau này `google_ads`, `tiktok_ads`…
     - `intake_method` = **cách nhập**: `manual`, `ocr`, `import`, `api`.
     - `campaign` = **tên chiến dịch** (lead website dùng `web_last_campaign` từ UTM nếu trống).
  5. **Đặt mã kênh:** chữ thường, snake_case, dạng `<nền tảng>_<loại>`; mã đã dùng không bao giờ đổi nghĩa hay đổi tên. Thêm kênh = thêm 1 dòng vào `SOURCES` trong `js/app.js` (không cần migration). App không đoán mã lạ thành kênh khác mà hiện "Khác (mã)".
  6. **Mức quan tâm (Nóng/Ấm/Nguội) chỉ thuộc lớp 2** (bổ sung 2026-10-07): lead lưu mốc 20% nhưng không hiển thị, không tính thống kê/thông báo; khi Đạt hoặc vào thẳng chăm sóc → 60% (mốc bậc "Đang chăm sóc"), giữ nếu đã cao hơn.
- Phạm vi: bảng `customers`, `js/app.js`, form khách, tab "Khách mới"; API landing page (repo Marquee_Homes) giữ nguyên vì đã ghi `source: ["website"]`.
- Lý do và đánh đổi: tập trung trang chủ vào khách có giá trị; dữ liệu lớp 1 phục vụ phân tích ngược campaign. Đánh đổi: bảng `customers` có thêm vài cột chỉ dùng ở lớp 1.
- Chấp thuận: người dùng duyệt phương án 2 lớp, chọn chuyển hết khách bậc 1–2 xuống lớp 1, đưa danh sách lý do và 3 kênh chính, yêu cầu thiết kế nguồn rõ ràng để mở rộng (chat 2026-10-06).
- Tài liệu đã cập nhật: `docs/architecture.md`, `docs/CHANGELOG.md`, `SQL/add_lead_layer.sql`, `SQL/schema.sql`
- Trạng thái: Đang áp dụng

### D-002 — Vỏ Android (Capacitor) để tự ghi nhật ký cuộc gọi

- Ngày: 2026-10-07
- Loại: Ngoại lệ cục bộ
- Nguyên tắc liên quan: `CLAUDE.md` §1 ("Không yêu cầu app native") và §2 ("Frontend … không build step")
- Quyết định: Android dùng app vỏ Capacitor mở trang web hiện tại + module native đọc nhật ký cuộc gọi máy; desktop và iOS vẫn là web app (nhập tay / ước lượng khi quay lại app). Ghi cuộc gọi LÚC MỞ/QUAY LẠI app; ghi ngầm khi app đóng để sau nhưng thiết kế sẵn cổng (`window.CRMCalls.ingest`, phần tử `call_attempts` có `result` trống = "chưa ghi chú").
- Phạm vi: chỉ thư mục `android-app/` (vỏ + plugin, hướng dẫn ở `android-app/README.md`) được có bước build (Android Studio/Gradle) và phát hành bằng APK cài trực tiếp (không qua Google Play — Play hạn chế quyền READ_CALL_LOG). Toàn bộ web giữ nguyên tắc cũ: HTML/JS thuần, không build, chỉ phát hiện vỏ qua `window.CRMCallSource` và vẫn chạy đầy đủ khi không có vỏ.
- Lý do và đánh đổi: iOS không cho app nào đọc lịch sử cuộc gọi; web không có API này. Chủ dự án dùng Android nên ưu tiên tự động hoá trên Android. Đánh đổi: phải cài Android Studio, giữ khoá ký APK, build lại APK khi đổi phần native.
- Quy tắc gợi ý kết quả cuộc gọi (cùng ngày): 0s / dưới 30s / từ 30s, khác nhau giữa Khách mới và Tiềm năng (`CALL_RESULT_SETS` trong `js/calls.js`). Cuộc ≥30s chỉ gợi ý ghi chú, KHÔNG tự Đạt — chuyển Tiềm năng vẫn bấm tay. Cuộc gọi khách Tiềm năng ghi thêm 1 mốc vào dòng thời gian chăm sóc.
- Chấp thuận: người dùng chọn "Ngoại lệ cục bộ" và đề xuất desktop/iOS web, Android Capacitor (chat 2026-10-07).
- Tài liệu đã cập nhật: `CLAUDE.md`, `AGENTS.md`, `docs/architecture.md`, `docs/FEATURE_IDEAS.md`, `docs/CHANGELOG.md`
- Trạng thái: Đang áp dụng (giai đoạn 1 web + vỏ Android đã build 2026-10-07; chưa thử trên máy thật)

### D-003 — Nhóm sale + giao khách cho đồng nghiệp

- Ngày: 2026-10-08
- Loại: Mở rộng trong phạm vi (CLAUDE.md §1 "có thể mở rộng dần cho vài đồng nghiệp") — đổi mô hình quyền dữ liệu, KHÔNG phải multi-tenant
- Nguyên tắc liên quan: `CLAUDE.md` §2 (RLS + GRANT; local-first + last-write-wins)
- Quyết định:
  - `customers.owner_id` = NGƯỜI PHỤ TRÁCH (giữ nghĩa cũ); thêm `customers.followers uuid[]` = người cùng theo dõi, CHỈ XEM.
  - 3 kịch bản: khách của tôi / giao nhưng tôi vẫn theo dõi (followers chứa tôi) / giao hẳn (không còn trong followers).
  - Đồng nghiệp = `team_members`, trưởng nhóm (role `admin`) thêm bằng email; người nhận phải thuộc nhóm (RLS `with check` + trigger `guard_customer_assignment`).
  - Trưởng nhóm (admin) XEM mọi khách; khách người khác phụ trách cũng chỉ xem, riêng GIAO LẠI thì được. Mặc định danh sách "Của tôi" = phụ trách + đang theo dõi; "Cả nhóm" / từng người qua mục "Người phụ trách" trong Bộ lọc.
  - Chỉ người phụ trách ghi: chặn ở `js/db.js` (`assertWritable`) + RLS update/delete. Việc hôm nay, chuông nhắc, thống kê Tổng quan, nhật ký gọi máy: chỉ khách mình phụ trách.
  - Giao khách đi qua hàng đợi offline như mọi thao tác (update `owner_id` + `followers`, cờ `opts.assign`); server từ chối (trùng SĐT bên người nhận / sai quyền) → bỏ thao tác + báo.
- Phạm vi: `SQL/add_team_assign.sql`, `js/team.js`, `js/db.js`, `js/app.js`, `js/calls.js`. Tài liệu đính kèm (bảng `documents` + file `customer-docs`) ai xem được khách thì xem được. Báo giá vay (`loan_quotes`) vẫn theo người tạo.
- Lý do và đánh đổi: giữ 1 bảng `customers` + RLS, không cần backend riêng; last-write-wins vẫn đủ vì mỗi khách chỉ 1 người ghi. Đánh đổi: SĐT unique theo người phụ trách → giao cho người đã có cùng SĐT sẽ bị từ chối; lead landing page vẫn vào tài khoản trưởng nhóm rồi chia tay.
- Chấp thuận: người dùng chọn (chat 2026-10-08): thêm đồng nghiệp bằng email; trưởng nhóm xem hết; theo dõi = chỉ xem; nhắc việc chỉ cho người phụ trách.
- Tài liệu đã cập nhật: `CLAUDE.md`, `AGENTS.md`, `docs/architecture.md`, `docs/design.md`, `docs/huong-dan-nhom.md`, `docs/CHANGELOG.md`
- Trạng thái: Đã code 2026-10-08; chưa chạy SQL trên Supabase, chưa thử với tài khoản thật

### D-004 — Điều hướng 2 tab: Tổng quan · Khách hàng (3 nhóm khách)

- Ngày: 2026-10-08
- Loại: Đổi cách tổ chức UI (thay quy tắc "tầng 1 tối đa 3 tab" chốt 2026-10-06 trong `docs/design.md`)
- Quyết định: header chỉ còn Tổng quan · Khách hàng. Khách hàng chia 3 nhóm bằng dải tab dưới header: Đang chăm (thay tên "Tiềm năng", chỉ khách mình phụ trách) · Khách mới · Khách nhóm (khách đồng nghiệp phụ trách, D-003). Bộ lọc "Người phụ trách" chỉ còn trong Khách nhóm (trưởng nhóm).
- Lý do: phân cấp rõ hơn khi có thêm nhóm khách thứ 3; tab header không phình ra.
- Phạm vi: `index.html` (`#tab-customers`, `#cust-subtabs`), `js/app.js` (`custGroup`, `setActiveView`, `showCustomerGroup`, `matchesFilters`, tìm ở Tổng quan), `js/team.js`, `css/style.css`, `docs/design.md`.
- Chấp thuận: người dùng yêu cầu trực tiếp kèm cấu trúc cụ thể (chat 2026-10-08).
- Trạng thái: Đang áp dụng (chưa deploy lúc ghi)
