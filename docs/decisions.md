# Quyết định và ngoại lệ đã duyệt

## Mục đích

Git lưu thay đổi code; file này lưu quyết định có tác động đến nguyên tắc, lý do và phạm vi áp dụng. Không phải bản sao changelog hoặc danh sách mọi ý tưởng thảo luận.

Lựa chọn nền tảng ban đầu (Supabase, Cloudflare Pages, local-first) không có ngày duyệt riêng; không tự tạo ngày/người duyệt cho chúng.

## Chỉ mục nhanh (đọc bảng này trước, mở chi tiết khi cần)

| Mã | Chủ đề | Trạng thái | Còn hiệu lực ở v2? |
|---|---|---|---|
| D-001 | 2 lớp khách (`qualified_at`) + nguồn 3 trục | Đang áp dụng | ✅ giữ nguyên |
| D-002 | Vỏ Android Capacitor đọc nhật ký gọi, gọi thẳng | Đang áp dụng | ✅ giữ vỏ; phần "web không build" thay bởi D-011 |
| D-003 | Nhóm sale, giao khách, followers chỉ xem | Đã code, SQL chưa chạy | ✅ giữ nguyên |
| D-004 | Điều hướng Tổng quan · Khách hàng (3 nhóm khách) | Lịch sử | Nhóm khách giữ; tab thay bởi D-013 |
| D-005 | Khung giờ gọi 1 nguồn (`callSlots`) | Đang áp dụng | ✅ nguồn chuyển sang `src/config/followup.ts` |
| D-006 | Icon 1 nguồn | Đang áp dụng | ✅ nguồn chuyển sang `src/config/icons.ts` |
| D-007 | 4 tab chính | Lịch sử | Thay bởi D-013 (vẫn 4 tab) |
| D-008 | Phễu 5 giai đoạn + SLA + tự chuyển | Đang áp dụng | ✅ nguồn chuyển sang `src/config/velocity.ts` |
| D-009 | Design System v2 Cool Porcelain | Lịch sử | Thay bởi D-014 (giữ quy tắc màu semantic) |
| D-010 | Tự chuyển SLA + định nghĩa đến hạn/quá hạn (`countdownTag`) | Đang áp dụng | ✅ giữ nguyên |
| D-011 | v2 dùng build step: Vite + React + TS + Tailwind + Radix | Đã duyệt hướng 2026-10-16 | Áp dụng từ T1.1 |
| D-012 | Hợp đồng bảo toàn dữ liệu, migration chỉ thêm | Đã duyệt hướng 2026-10-16 | Áp dụng ngay (cả v1) |
| D-013 | IA/UX v2: Hôm nay · Khách hàng · Công việc · Hiệu quả | Đã duyệt hướng 2026-10-16 | Áp dụng cho v2 |
| D-014 | Design System v3 "Signal" (sáng + tối) | Đã duyệt hướng 2026-10-16 | Áp dụng cho v2 |
| D-015 | Bộ máy Tín hiệu là nguồn duy nhất cho ưu tiên/gợi ý/thông báo | Đã duyệt hướng 2026-10-16 | Áp dụng cho v2 |
| D-016 | T2.B5 dùng thứ tự UX; giữ parity v1 riêng | Ngoại lệ cục bộ đã duyệt 2026-10-16 | Chỉ nghiệm thu T2.B5 |
| D-017 | T3.6 được dùng react-hook-form cùng Zod | Ngoại lệ cục bộ đã duyệt 2026-10-16 | Chỉ T3.6 |
| D-018 | T3.8 được thêm thư viện XLSX để nhập Excel | Ngoại lệ cục bộ đã duyệt 2026-10-16 | Chỉ T3.8 |
| D-019 | T3.5 tích hợp hồ sơ với contract máy tính vay của T3.9 | Đã duyệt 2026-10-16 | Chỉ tích hợp T3.9 ↔ T3.5 |
| D-020 | Hoãn ba thao tác xóa nested record trong cutover v2 | Ngoại lệ cục bộ đã duyệt 2026-10-17 | Chỉ chấp nhận gap T5.1; giữ D-012 và v1 |
| D-021 | Đồng bộ v2 gộp cột mảng theo phần tử + bỏ được op bị server từ chối | Đã duyệt hướng 2026-10-17 (sửa trước cutover) | Hàng đợi v2; v1 giữ ghi đè tới cutover |
| D-022 | T6.7 nghiệm thu không cần bộ đánh giá 50–100 ghi chú thật; theo dõi trên production | Ngoại lệ cục bộ đã duyệt 2026-10-17 | Chỉ T6.7 |

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
- Bổ sung 2026-10-13 (chủ dự án yêu cầu): vỏ thêm GỌI THẲNG — `CallLogPlugin.dial` + quyền `CALL_PHONE` (APK 1.4). Vẫn trong phạm vi ngoại lệ (chỉ `android-app/` có build); web chỉ gọi plugin khi có `window.Capacitor`, thiếu plugin → dùng link `tel:` như cũ.

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
- Cập nhật 2026-10-08 (người dùng yêu cầu trực tiếp): nhóm "Đang chăm" đổi tên lại thành **Tiềm năng**. Tiềm năng / Khách nhóm không hiện số trên tab (số khách nằm ở dòng dưới thanh công cụ); Khách mới giữ badge (đăng ký hôm qua + hôm nay, chưa có cuộc gọi đầu). Lọc trạng thái (Đang chăm/Đã xong · Cần gọi/Đã loại) chuyển vào panel Bộ lọc, mặc định Đang chăm / Cần gọi. Đổi kiểu xem thẻ/danh sách nằm trong menu 3 chấm. Header thu gọn ở tab Khách hàng có icon Lọc bên trái nút đồng bộ (chấm đỏ khi đang lọc).
- Cập nhật 2026-10-09 (người dùng yêu cầu trực tiếp): trạng thái Khách mới đổi thành Tất cả (mặc định, đã loại xếp cuối) · Chưa gọi · Cần gọi lại · Đã loại; ô "Khách mới chờ gọi" ở Tổng quan mở Khách mới với lọc Chưa gọi.
- Cập nhật 2026-10-09: số tab chính tăng lên 4 — xem **D-007** (thay quy tắc "chỉ 2 tab" của mục này).
- Cập nhật 2026-10-09 (người dùng yêu cầu trực tiếp): trên điện thoại / màn hẹp (<900px) 2 tab Tổng quan · Khách hàng chuyển xuống thanh điều hướng dưới, kèm nút ＋ thêm khách ở giữa (thay tab header + nút ＋ nổi ở màn hẹp). Desktop giữ tab trên header. Vẫn chỉ 2 tab chính.

### D-005 — Khung giờ gọi thống nhất toàn app (1 nguồn duy nhất)

- Ngày: 2026-10-08
- Loại: Nguyên tắc toàn dự án
- Quyết định: mọi gợi ý hẹn gọi và preset giờ trong app dùng chung 4 khung `FOLLOWUP_CONFIG.callSlots` trong `js/followup.js` (A Sáng 09:00–10:00 · B Trưa 11:30–12:15 · C Chiều 14:30–15:30 · D Tối 20:00–20:45). Sửa 1 khung ở đó → mọi chỗ đổi theo. Không khai báo khung giờ gọi ở file/chỗ khác; tính năng mới cần giờ gọi phải đọc `FOLLOWUP.callSlots()` (hoặc `CALL_SLOTS` trong app.js — dựng từ đó).
- Đang dùng ở: nút giờ hộp Hẹn gọi (`#sched-time`), nút giờ hộp Thêm việc (`#task-time`, giờ bắt đầu khung), nhịp gọi Khách mới (`leadNext`, `firstCall`), nhịp khách Tiềm năng theo nghề (`occupationSlots` → mã khung), gợi ý khi đổi bậc / bấm Đạt (`forStage`).
- Lý do: trước đây mỗi chỗ có giờ riêng (9–10h/14–15h/20–21h ở hộp hẹn, khung theo nghề tự do, 4 khung của nhịp khách mới) → gợi ý không khớp nhau, sửa 1 chỗ quên chỗ khác.
- Chấp thuận: người dùng yêu cầu trực tiếp (chat 2026-10-08): "gợi ý gọi phải unified trong toàn bộ app, sửa 1 cái là sửa tất cả".
- Tài liệu đã cập nhật: `CLAUDE.md`, `AGENTS.md`, `docs/huong-dan-follow-up.md`, `docs/CHANGELOG.md`
- Trạng thái: Đang áp dụng (chưa deploy lúc ghi)

### D-006 — Icon thống nhất toàn app (1 nguồn duy nhất)

- Ngày: 2026-10-09
- Loại: Nguyên tắc toàn dự án
- Quyết định: icon của bậc chăm sóc, hành động / loại việc và khái niệm chính chỉ khai báo ở `js/icons.js` (`ICON_PATHS`, `STAGE_ICON`); mọi chỗ dùng `icon()` / `stageIcon()` / `data-icon`. Một khái niệm = một icon ở mọi nơi; đổi 1 dòng là đổi toàn app. Bảng khái niệm → icon ở `docs/design.md` (mục "Icon thống nhất").
- Lý do: trước đây mỗi thẻ tự vẽ SVG (cùng "Hồ sơ" có 2 icon, "Căn hộ" dùng chung icon với "Tổng quan", nút gọi kiểu đặc lẫn kiểu nét…) → không nhất quán, sửa 1 chỗ quên chỗ khác.
- Chấp thuận: người dùng yêu cầu trực tiếp (chat 2026-10-09): "icon cho mỗi stage, action phải thống nhất trên toàn app. Cái này đổi thì vị trí khác cũng đổi".
- Tài liệu đã cập nhật: `CLAUDE.md`, `AGENTS.md`, `docs/design.md`, `docs/CHANGELOG.md`
- Trạng thái: Đang áp dụng (chưa deploy lúc ghi)

### D-007 — 4 tab chính: Tổng quan · Khách hàng · Công việc · Phân tích

- Ngày: 2026-10-09
- Loại: Đổi cách tổ chức UI (thay quy tắc "chỉ 2 tab chính" của D-004)
- Quyết định: thêm 2 tab ngang hàng: **Công việc** (mọi hẹn gọi + việc của khách mình phụ trách: Quá hạn · Hôm nay · 7 ngày tới · Sau đó · Chưa có hạn · Đã xong; lọc theo loại việc; tích xong tại chỗ) và **Phân tích** (Gợi ý từ dữ liệu theo quy tắc, có ngưỡng dữ liệu tối thiểu + Pipeline + Hiệu suất + các biểu đồ). Tổng quan gọn lại: 4 chỉ số · Việc cần làm hôm nay · 5 hẹn gần nhất ("Xem tất cả" → Công việc). Điện thoại: thanh dưới Tổng quan · Khách hàng · [＋] · Công việc · Phân tích; desktop: 4 tab trên header. Không làm tab "Công cụ" (công cụ giữ trong hồ sơ / menu).
- Lý do: Tổng quan đang gánh cả "làm gì ngay" lẫn toàn bộ việc sắp tới và báo cáo; tách ra mỗi màn rõ 1 việc. Mẫu giao diện người dùng gửi có 4 mục + nút ＋.
- Chấp thuận: người dùng duyệt đề xuất (chat 2026-10-09): "Làm tab công việc và phân tích như bạn đề xuất".
- Phạm vi: `index.html` (`#tab-tasks`, `#tab-analytics`, `#tasks-view`, `#analytics-view`, `#bottom-nav`), `js/app.js` (`setActiveView`, `renderTasksView`, `renderDashboard('analytics')`, `analyticsInsightsHtml`, `dashCardClick`), `js/icons.js` (`chart`, `insight`), `css/style.css`, `docs/design.md`.
- Tài liệu đã cập nhật: `docs/design.md`, `docs/FEATURE_IDEAS.md`, `docs/CHANGELOG.md`
- Trạng thái: Đang áp dụng (chưa deploy lúc ghi)

### D-008 — Phễu 5 giai đoạn + SLA (velocity) từng giai đoạn

- Ngày: 2026-10-09
- Loại: Đổi quy ước dữ liệu toàn dự án (bộ bậc `care_stage`) + quy tắc tự xử lý mới
- Quyết định:
  1. **5 giai đoạn + 1 milestone:** Đăng kí mới → Đang tiếp cận → Đang chăm sóc → Xem dự án → Booking & Làm hồ sơ → ★ Ký HĐMB. Gộp "Hỗ trợ hồ sơ" + "Booking" (từ lúc Booking là đồng hồ làm hồ sơ chạy). Ký HĐMB thành nút "Xác nhận đã Ký HĐMB" = Deal Won, khách vào mục "Đã mua" (giá trị lưu giữ `Kí HĐMB`). 1 khách = 1 căn.
  2. **Nuôi dài hạn** tách từ Đang chăm sóc: khách chưa đủ tiền ngay, hẹn 3–6 tháng; ra khỏi phễu chính, không tính tốc độ / tỉ lệ chuyển đổi.
  3. **SLA mỗi giai đoạn = mục tiêu + hạn mức:** Đăng kí mới < 30 phút / 4 giờ (đăng ký sau 22h → tính từ 7h sáng hôm sau; 0h–6h → 7h cùng ngày) · Đang tiếp cận 1–2 ngày / 7 ngày · Đang chăm sóc 7–10 ngày / 20 ngày · Xem dự án 7 / 14 ngày · Booking & Làm hồ sơ 45 ngày / 2,5 tháng. Quá mục tiêu → nhãn vàng; quá hạn mức → đỏ đậm + thông báo.
  4. **Tự xử lý quá hạn mức (tự chuyển + ghi lịch sử + hoàn tác):** Đang tiếp cận quá 7 ngày chưa nói chuyện được → Loại "Không liên lạc được" (mở lại = đồng hồ tính lại); Đang chăm sóc quá 20 ngày → Nuôi dài hạn + hẹn gọi lại 3 tháng (nút Hoàn tác 3 ngày). Khách đã quá hạn trước khi có tính năng được tính hạn mức từ 2026-10-10.
  5. **Checklist ngầm bậc Booking & Làm hồ sơ** (không thêm cột phễu): Xác nhận cư trú (3–5 ngày) · Xác nhận điều kiện nhà ở (~15 ngày sau bước 1) · CĐT/Sở thẩm định đạt (5–7 ngày) · Thông báo ký HĐMB.
  6. **Một nguồn duy nhất:** mọi con số SLA ở `js/velocity.js` (`VELOCITY_CONFIG`) — sửa 1 nơi là đổi toàn app (giống D-005).
- Lý do: phễu 7 bậc dàn trải, không đo được tốc độ; cần mốc rõ để biết khách nào đang ứ và tự dọn khách nguội khỏi phễu.
- Chấp thuận: người dùng gửi đặc tả (chat 2026-10-09) và chọn: Xem dự án 7 / 14 ngày; tự chuyển có ghi lịch sử + hoàn tác; khách cũ Hỗ trợ hồ sơ + Booking → Booking & Làm hồ sơ; 1 khách = 1 căn.
- Phạm vi: `SQL/add_funnel_velocity.sql` (ràng buộc bậc, cột `booking_steps`, `sla_anchor_at`), `SQL/schema.sql`, `js/velocity.js` (mới), `js/app.js`, `js/db.js` (`historyMeta`), `js/notifications.js` (rule `sla_over`), `js/followup.js`, `js/icons.js` (`nurture`, `sla`), `index.html`, `css/style.css`.
- Tài liệu đã cập nhật: `CLAUDE.md`, `AGENTS.md`, `docs/funnel-velocity.md`, `docs/architecture.md`, `docs/design.md`, `docs/huong-dan-follow-up.md`, `docs/CHANGELOG.md`
- Trạng thái: Đang áp dụng (chưa chạy SQL, chưa deploy lúc ghi)


### D-009 — Design System v2 và UX thống nhất toàn webapp

- Ngày: 2026-10-15
- Loại: Đổi nguyên tắc thiết kế toàn dự án; giữ logic nghiệp vụ hiện có
- Quyết định: `docs/DESIGN_SYSTEM.md` và `docs/UX_GUIDELINES.md` là chuẩn UI/UX mới, thay `docs/design.md`: Modern Tech / Cool Porcelain, sans-serif, CTA graphite, màu theo mức độ thời hạn/kết quả, violet dành riêng cho AI. Tổng quan ưu tiên hành động trước chỉ số; hồ sơ ưu tiên liên hệ → việc tiếp theo → ngữ cảnh. Giữ 4 tab và ID/handler hiện có.
- Phạm vi: toàn webapp, bao gồm CSS vay có namespace `.lm-`; không đổi engine vay, persistence, schema/RLS, owner, nhịp follow-up, native Android hoặc xuất PDF. Thêm logic UI bảo vệ bản nháp/chống bấm Lưu lặp, phục hồi vị trí và số liệu nhịp chăm sóc chỉ đọc.
- Chấp thuận: người dùng đã thay tài liệu thiết kế, yêu cầu đồng bộ tham chiếu trong AGENTS/CLAUDE, rồi yêu cầu rà soát/sửa UI/UX toàn app, giữ logic cũ và hỏi ngay khi xung đột (chat 2026-10-15).
- Lịch sử: quy tắc visual và thứ tự KPI/hồ sơ cũ được thay bởi quyết định này; giữ các mục D-001–D-008 làm lịch sử và nguồn quy tắc nghiệp vụ.
- Hai xung đột về tự chuyển SLA và định nghĩa quá hạn đã được người dùng chốt ngày 2026-10-15; xem D-010. D-009 vẫn chỉ ghi nhận thay đổi UI/UX.
- Tài liệu: `AGENTS.md`, `CLAUDE.md`, `docs/DESIGN_SYSTEM.md`, `docs/UX_GUIDELINES.md`, `docs/README.md`, `docs/pitfalls.md`, audit `docs/audits/ui-ux-design-system-2026-10-15.md`.
- Trạng thái: triển khai local; hai điểm nghiệp vụ đã chốt tại D-010; chưa deploy.


### D-010 — Tự chuyển SLA và thống nhất thời hạn công việc

- Ngày: 2026-10-15
- Loại: Xác nhận nguyên tắc tự động hóa toàn dự án và thống nhất trạng thái thời hạn
- Quyết định:
  1. Giữ tự chuyển khi quá hạn mức SLA theo D-008/`VELOCITY_CONFIG`, gồm lịch hẹn kèm theo quy tắc; không thêm xác nhận từng lần. Giai đoạn chỉ cảnh báo vẫn giữ nguyên. Có lịch sử, thông báo, Hoàn tác/Mở lại như hiện có. Đây là chủ đích sản phẩm nhằm giảm số lần bấm, không phải automation do AI tự quyết.
  2. Mọi màn dùng cách tính hiện có của Công việc/hồ sơ (`countdownTag`, `js/app.js`): việc có giờ quá hạn sau mốc +30 phút; hẹn gọi sau cuối khung +30 phút (thiếu cuối khung dùng giờ bắt đầu); đúng ranh giới vẫn đến hạn. Việc cả ngày quá hạn từ đầu ngày hôm sau, không cộng 30 phút.
  3. Tổng quan và nhãn hạn đọc cùng nguồn. KPI “hẹn gọi quá hạn” chỉ đếm trạng thái quá hạn, không tính các hẹn đang đến hạn. Không đổi hạn lưu trong dữ liệu, thứ tự nhóm, cấu hình SLA, quyền hoặc nhịp follow-up.
- Phạm vi: hướng dẫn gốc, UX guideline, tài liệu SLA và các chỗ trình bày thời hạn trong `js/app.js`. Giữ nguyên thân hàm `runSlaAutomation`, `VELOCITY_CONFIG` và các handler lưu nghiệp vụ.
- Lý do/đánh đổi: tự động hóa theo quy tắc đã duyệt giảm thao tác và rối; việc chưa quá cuối khung +30 phút vẫn được nhắc là đến hạn, nhưng không bị đếm là quá hạn sớm trên Tổng quan.
- Chấp thuận: người dùng xác nhận trực tiếp: “Khi quá SLA thì tự chuyển… tự động đỡ phải bấm nhiều gây rối”; “Thống nhất theo công việc, hồ sơ”.
- Tài liệu: `AGENTS.md`, `CLAUDE.md`, `docs/UX_GUIDELINES.md`, `docs/funnel-velocity.md`, audit UI/UX và changelog.
- Trạng thái: áp dụng local; chưa deploy.


### D-011 — v2 chuyển frontend sang có build step

- Ngày: 2026-10-16
- Loại: Đổi nguyên tắc toàn dự án
- Nguyên tắc liên quan: `CLAUDE.md` §2 cũ ("Frontend HTML/CSS/JavaScript thuần, không build step"); D-002 (phạm vi build chỉ ở `android-app/`)
- Quyết định: v2 dùng **Vite + React 19 + TypeScript (strict) + Tailwind CSS v4 + Radix UI primitives**, Zod cho schema dữ liệu, Vitest + Playwright cho kiểm thử, Biome cho lint/format, `vite-plugin-pwa` cho PWA. Cloudflare Pages build `npm ci && npm run build` → `dist/`. v1 giữ nguyên không build cho tới cutover (T5.4); sửa v1 trong giai đoạn chuyển đổi chỉ cho lỗi nghiêm trọng.
- Lý do: `js/app.js` 7.800 dòng dạng chuỗi HTML + biến toàn cục khiến đại tu UI và nhiều agent làm song song rất dễ xung đột; TypeScript + schema bắt lỗi dữ liệu sớm (quan trọng cho bảo toàn dữ liệu); Radix cho sheet/dialog/tab truy cập được; Tailwind + token giúp agent giữ đúng Design System; hệ sinh thái React là thứ agent AI viết đúng nhất. Chủ dự án không phải thao tác build: Cloudflare tự build khi push.
- Đánh đổi: thêm `package.json`/`node_modules`, cần Node khi chạy local, đổi build settings Cloudflare một lần lúc cutover; viết lại UI (logic nghiệp vụ được port có golden test).
- Phương án đã cân nhắc: giữ không build + tách ES modules (rẻ nhưng không có kiểu dữ liệu/component, khó làm UI mới); Svelte/Vue (gọn nhưng agent kém quen hơn, ít component truy cập sẵn).
- Phạm vi: toàn bộ web app v2. Không đổi Supabase, Worker, vỏ Android (D-002 vẫn hiệu lực cho `android-app/`).
- Chấp thuận: người dùng cho phép "có thể đổi luôn nguyên tắc no build thành build nếu các thư viện nền tảng sẵn có tối ưu hơn" (chat 2026-10-16); agent đánh giá là tối ưu hơn và chọn stack trên. Chủ dự án có thể đổi stack trước khi bắt đầu T1.1.
- Tài liệu: `CLAUDE.md`, `AGENTS.md`, `docs/architecture.md`, `docs/tasks.md`.
- Trạng thái: Đã duyệt hướng; chưa triển khai.

### D-012 — Hợp đồng bảo toàn dữ liệu cho đại tu

- Ngày: 2026-10-16
- Loại: Nguyên tắc toàn dự án (áp dụng ngay, cả v1)
- Quyết định: (1) migration chỉ **thêm**, cấm drop/rename/đổi kiểu/đổi nghĩa mã đã lưu; (2) giữ mô hình `customers` aggregate (mảng JSONB trên hàng) cho v2; (3) ghi theo trường (patch), không làm rơi trường/thuộc tính lạ; (4) audit trigger append-only `customer_changes` trước mọi việc khác; (5) xoá mềm `archived_at`; (6) backup + diễn tập khôi phục trước migration production và trước cutover; (7) v2 đọc/ghi được DB IndexedDB và queue của v1. Chi tiết: `architecture.md` §3.
- Lý do: người dùng yêu cầu "mọi dữ liệu phải được bảo toàn"; chuẩn hoá bảng (interactions/opportunities riêng) đem lại ít lợi ích ở quy mô hiện tại nhưng rủi ro chuyển dữ liệu và đồng bộ offline lớn.
- Đánh đổi: phân tích nặng chạy ở client; mảng JSONB có thể mất phần tử nếu 2 máy sửa cùng mảng cùng lúc (rủi ro đã chấp nhận từ v1, giảm nhờ audit).
- Chấp thuận: yêu cầu trực tiếp của người dùng (chat 2026-10-16).
- Tài liệu: `docs/architecture.md`, `CLAUDE.md`, `AGENTS.md`.
- Trạng thái: Đã duyệt hướng; audit/backup làm ở Phase 0.

### D-013 — Kiến trúc thông tin và UX v2

- Ngày: 2026-10-16
- Loại: Đổi cách tổ chức UI (thay D-007 về tên/nội dung tab; vẫn 4 tab + nút ＋)
- Quyết định: 4 tab **Hôm nay** (thay Tổng quan: Next Best Action, hàng đợi, sức làm, phiên gọi) · **Khách hàng** (Tiềm năng · Khách mới · Tệp & Retarget · Khách nhóm) · **Công việc** · **Hiệu quả** (thay Phân tích: Chăm sóc · Phễu · Marketing). Nút ＋ = Ghi nhanh (khách/ghi chú/việc). Tìm kiếm + lệnh toàn cục Cmd/Ctrl+K. Ngân sách số chạm cho Gọi/Zalo/Ghi chú/Hẹn theo `UX_GUIDELINES.md` §3. Desktop ≥1024px: thanh điều hướng trái + vùng chính + panel ngữ cảnh.
- Lý do: 5 ưu tiên sản phẩm của người dùng (chat 2026-10-16) và nghiên cứu `docs/CRM bất động sản 2026.md`.
- Tài liệu: `docs/PRD.md`, `docs/UX_GUIDELINES.md`.
- Trạng thái: Đã duyệt hướng; áp dụng cho v2.

### D-014 — Design System v3 "Signal"

- Ngày: 2026-10-16
- Loại: Đổi nguyên tắc thiết kế toàn dự án (thay phần visual của D-009)
- Quyết định: phong cách hiện đại / công nghệ / tương lai bằng cấu trúc và chuyển động chứ không bằng trang trí: nền lạnh, bề mặt phân tầng, chữ số đơn cách cho dữ liệu, chế độ **sáng + tối** ngang hàng (mặc định theo hệ thống), font **Be Vietnam Pro**, CTA chính dùng **accent Signal Blue** (thay graphite). Giữ từ D-009: đỏ/vàng/xanh lá chỉ cho thời hạn/kết quả, violet chỉ cho AI, không neon/glow, không card lồng card, một CTA chính mỗi vùng.
- Lý do: người dùng yêu cầu giao diện "hiện đại, công nghệ, tương lai" và phân cấp thị giác tốt (chat 2026-10-16).
- Tài liệu: `docs/DESIGN_SYSTEM.md` (v3).
- Trạng thái: Đã duyệt hướng; áp dụng cho v2 (v1 giữ D-009 đến cutover).

### D-015 — Bộ máy Tín hiệu (signals) là nguồn duy nhất cho ưu tiên việc và gợi ý

- Ngày: 2026-10-16
- Loại: Nguyên tắc toàn dự án (v2)
- Quyết định: mọi "việc nên làm", gợi ý, thông báo trong app và gợi ý ở Hiệu quả sinh từ registry rule `src/domain/signals/rules/*` (mỗi rule 1 file: điều kiện, bằng chứng, mức P0–P2, hành động, điều kiện dừng, ngưỡng dữ liệu). Ngưỡng/tham số ở `src/config/signals.ts`. Hôm nay, chuông, hồ sơ, Hiệu quả chỉ đọc kết quả registry; không tự viết logic ưu tiên riêng. AI chỉ giải thích/soạn nháp cho tín hiệu, không đổi mức ưu tiên. Thời hạn theo D-010; tự chuyển SLA theo D-008/D-010 không đổi.
- Lý do: v1 có 3 nơi tự tính ưu tiên (`dashActionGroups`, `notifications.js`, `analyticsInsightsHtml`) → dễ lệch nhau; registry cho phép nhiều agent thêm rule song song.
- Tài liệu: `docs/PRD.md` F-04, `docs/UX_GUIDELINES.md` §6, `docs/architecture.md` §2.
- Trạng thái: Đã duyệt hướng; áp dụng cho v2.

### D-016 — Ngoại lệ parity thứ tự ưu tiên của T2.B5

- Ngày: 2026-10-16
- Loại: Ngoại lệ cục bộ
- Nguyên tắc liên quan: `docs/tasks.md` thẻ T2.B5 yêu cầu thứ tự khớp golden v1; `docs/UX_GUIDELINES.md` §4 yêu cầu P0 → hạn → bậc → lâu chưa tương tác; D-015 và `docs/PRD.md` F-04.
- Quyết định: API `computeSignals` mặc định dùng thứ tự UX và đầy đủ rule S01–S10. Giữ bộ test parity v1 riêng để chứng minh điều kiện, thành viên và thứ tự của các nhóm việc/thông báo cũ; không sửa golden để hợp thức hoá thứ tự mới.
- Phạm vi: chỉ nghiệm thu T2.B5 và đầu ra bộ máy signals của task này; không đổi tiêu chí parity của task khác, không sửa v1, không mở rộng automation.
- Lý do và đánh đổi: trên fixture, việc hồ sơ Booking cần xử lý được đưa lên trước hẹn gọi; cảnh báo vượt mục tiêu SLA có thể thêm khách chưa xuất hiện trong hàng đợi v1. Do đó đầu ra mới có thể khác cả thứ tự lẫn tập khách, nhưng phải có test riêng theo UX và bằng chứng cho từng rule.
- Chấp thuận: Curtis chọn “Ngoại lệ cục bộ cho B5: dùng thứ tự UX, giữ test parity v1 riêng (đề xuất)” trong phiên tiếp quản nhóm Claude ngày 2026-10-16.
- Giới hạn: không dùng ngoại lệ này để bỏ kiểm tra dữ liệu/payload hay chấp nhận sai lệch ngoài S01–S10. Mở rộng phạm vi cần quyết định mới.
- Tài liệu đã cập nhật: `docs/decisions.md`; cổng merge T2.B5 ghi ngoại lệ vào CHANGELOG của task.
- Trạng thái: Đã duyệt; áp dụng khi nghiệm thu T2.B5.

### D-017 — Ngoại lệ thư viện form cho T3.6

- Ngày: 2026-10-16
- Loại: Ngoại lệ cục bộ
- Nguyên tắc liên quan: D-011 và AGENTS.md §3.10 chỉ cho phép thêm thư viện ngoài stack đã duyệt sau khi được chấp thuận; thẻ T3.6 yêu cầu react-hook-form + Zod.
- Quyết định: Cho phép T3.6 thêm `react-hook-form` để triển khai form tạo/sửa; tiếp tục dùng Zod cho schema và xác thực.
- Phạm vi: Chỉ `src/features/intake/**` và dependency phục vụ trực tiếp T3.6; không thay đổi stack D-011 hoặc cấp phép cho task khác.
- Lý do và đánh đổi: đáp ứng đúng yêu cầu form đã ghi trong T3.6, đổi lại thêm một dependency cần bảo trì.
- Chấp thuận: Curtis chọn “Ngoại lệ T3.6: thêm react-hook-form” trong phiên điều phối ngày 2026-10-16.
- Tài liệu đã cập nhật: `docs/decisions.md`, `scripts/agents/ownership.json`.
- Trạng thái: Đã duyệt; áp dụng khi nghiệm thu T3.6.

### D-018 — Ngoại lệ thư viện XLSX cho T3.8

- Ngày: 2026-10-16
- Loại: Ngoại lệ cục bộ
- Nguyên tắc liên quan: D-011 và AGENTS.md §3.10 yêu cầu duyệt trước khi thêm thư viện ngoài stack; thẻ T3.8 yêu cầu nhập Excel và cung cấp file mẫu.
- Quyết định: Cho phép T3.8 thêm một thư viện XLSX cần thiết để nhập dữ liệu Excel.
- Phạm vi: Chỉ T3.8 và dependency phục vụ trực tiếp việc nhập XLSX; không thay đổi stack D-011 hoặc cấp phép cho task khác.
- Lý do và đánh đổi: đáp ứng yêu cầu nhập Excel; thêm một dependency cần bảo trì và kiểm tra bảo mật.
- Chấp thuận: Curtis chọn “Ngoại lệ T3.8: thêm thư viện XLSX” trong phiên điều phối ngày 2026-10-16.
- Tài liệu đã cập nhật: `docs/decisions.md`, `scripts/agents/ownership.json`.
- Trạng thái: Đã duyệt; áp dụng khi nghiệm thu T3.8.

### D-019 — Phân chia máy tính vay và liên kết hồ sơ

- Ngày: 2026-10-16
- Loại: Điều chỉnh phụ thuộc task
- Nguyên tắc liên quan: route máy tính vay thuộc T3.9; hồ sơ khách thuộc T3.5; task chỉ sửa file trong phạm vi ownership.
- Quyết định: T3.9 cung cấp route và `loanPath()` nhận `customerId`/thông tin căn. T3.5 phụ thuộc T3.9 và thêm nút từ hồ sơ với dữ liệu khách/căn đang xem. T3.9 được nghiệm thu theo contract route; T3.5 kiểm chứng caller.
- Phạm vi: Chỉ phân chia tích hợp T3.9 ↔ T3.5; T3.9 không sửa file hồ sơ.
- Lý do và đánh đổi: giữ ranh giới ownership và tránh vòng phụ thuộc; luồng đầy đủ từ hồ sơ chỉ có sau khi T3.5 hoàn thành.
- Chấp thuận: Curtis chọn “Chờ T3.5 rồi nối từ hồ sơ (đề xuất)” trong phiên điều phối ngày 2026-10-16.
- Tài liệu đã cập nhật: `docs/decisions.md`, `docs/tasks.md`.
- Trạng thái: Đã duyệt; áp dụng cho nghiệm thu T3.9 và tích hợp T3.5.


### D-020 — Hoãn ba thao tác xóa nested record trong cutover v2

- Ngày: 2026-10-17
- Loại: Ngoại lệ cục bộ — chấp nhận hoãn gap nghiệm thu
- Nguyên tắc liên quan: D-012 yêu cầu bảo toàn dữ liệu và xóa mềm; v1 hiện không lọc tombstone trong ghi chú hồ sơ, việc và cuộc gọi chờ.
- Quyết định: Trong phạm vi cutover hiện tại, hoãn xóa ghi chú hồ sơ, xóa việc và xóa cuộc gọi chờ. Chấp nhận ba gap này được ghi rõ trong audit T5.1 để task audit có thể hoàn tất. Giữ nguyên dữ liệu và hành vi v1; không dùng hard delete và không thêm tombstone chỉ ở v2.
- Phạm vi: Chỉ ba thao tác trên trong T5.1/cutover hiện tại. Không thay đổi D-012 toàn dự án; mọi triển khai tương lai cần giải pháp tương thích v1 được duyệt riêng.
- Lý do và đánh đổi: tombstone v2-only vẫn bị v1 hiển thị và sửa; xóa khỏi mảng làm mất dữ liệu. Hoãn giữ an toàn dữ liệu nhưng thiếu thao tác xóa trong cutover.
- Chấp thuận: Curtis chọn “Hoãn xóa; chấp nhận các gap trong T5.1” trong phiên điều phối ngày 2026-10-17.
- Tài liệu đã cập nhật: `docs/decisions.md`, `docs/audits/v2-parity.md`.
- Trạng thái: Đã duyệt; chỉ áp dụng cho T5.1/cutover hiện tại.

### D-021 — Đồng bộ v2 gộp cột mảng theo phần tử + bỏ được op bị server từ chối

- Ngày: 2026-10-17
- Loại: Đổi cách giải xung đột cho cột mảng JSONB của `customers` (trong v2); giữ D-012.
- Nguyên tắc liên quan: `docs/architecture.md` §3.1.4, §4 ("last-write-wins theo `updated_at`"); D-012; D-020.
- Bối cảnh: T5.2 (staging, khách d063bb16…) chứng minh mất ghi chú: Mac online thêm ghi chú; điện thoại offline thêm ghi chú khác rồi online → op `update` gửi nguyên mảng `notes_manual` cũ → ghi chú của Mac bị ghi đè. Ảnh hưởng mọi mảng (`call_attempts`, `next_tasks`, `notes_manual`, `care_stage_history`, `interactions`, `interests`, `household`). Cùng đợt: 1 op bị server từ chối (vd. `23514`) làm `flushQueue` dừng mãi, chỉ hiện "Lỗi đồng bộ". Chủ dự án chọn **sửa trước cutover** (không chấp nhận như v1).
- Quyết định:
  1. **Gộp 3 chiều phía client, ghi có điều kiện** (không cần SQL/RPC). Khi tạo op `update` có cột mảng, repository lưu `arrayBase` = mảng local ngay trước khi sửa (metadata chỉ ở máy như `assignmentRollback`; không gửi server; v1 bỏ qua). Khi flush: đọc `updated_at` + các cột mảng của hàng trên server → gộp theo danh tính phần tử (`id`, không có thì `at`) → `PATCH … where id = … and updated_at = <giá trị vừa đọc>`; máy khác ghi chen giữa (0 hàng khớp) → đọc lại, gộp lại (tối đa 3 lần), rồi ghi thường với bản gộp mới nhất. Không đổi định dạng op, không đổi cột khác (vẫn patch theo trường).
  2. **Luật gộp** (`src/data/arrayMerge.ts`): phần tử chỉ server có → giữ (máy khác thêm); phần tử local cố ý bỏ (có trong `arrayBase`, không còn trong payload — hoàn tác, mở lại việc, lùi bậc) → **không sống lại**; phần tử cả hai có → theo thuộc tính: thuộc tính local đổi so với bản gốc lấy local (kể cả xoá thuộc tính), còn lại lấy server → giữ sửa của máy khác và thuộc tính lạ; server đã bỏ mà local không sửa → bỏ theo server, local có sửa → giữ local; mảng đang xếp theo `at` thì phần tử máy khác được chèn đúng thứ tự thời gian. Op không có `arrayBase` (op do v1 ghi, op v2 cũ) → hợp nhất, không bỏ phần tử nào (thà hiện lại phần tử đã xoá còn hơn mất dữ liệu).
  3. **Op bị từ chối vĩnh viễn** (SQLSTATE lớp 22/23/42, PGRST1xx/2xx): op nằm lại trong hàng đợi, op sau của **cùng khách** chờ (giữ thứ tự), **khách khác vẫn đồng bộ**. Chỉ báo "Lỗi đồng bộ" mở sheet *Đồng bộ*: lý do tiếng Việt + "Bỏ thao tác này" (xác nhận) → op được chép vào meta `discarded-ops` (50 op gần nhất, khôi phục tay được) rồi mới xoá; khách quay về giá trị server khi không còn op chờ. Lỗi tạm thời (mạng/5xx/hết phiên/timeout) dừng và thử lại như v1.
- Vì sao không chọn RPC Postgres gộp phía server: cần migration mới chạy trên staging + production, v1 không dùng được, thêm điểm hỏng khi chưa chạy SQL; ghi có điều kiện `updated_at` đã chặn race đọc–ghi mà không cần SQL.
- Rủi ro còn lại (chủ dự án nên biết):
  - **v1 vẫn ghi đè cả mảng tới cutover T5.4.** Nếu v1 (crm-cop) và v2 cùng sửa một khách khi một bên offline, op của v1 vẫn có thể xoá phần tử bên kia vừa thêm. Giảm thiểu: trong giai đoạn song song, sửa khách thật chủ yếu trên một phiên bản; bảng `customer_changes` (T0.2) lưu giá trị cũ để khôi phục.
  - Danh tính theo `at` (như v1): hai máy tạo phần tử cùng một mili-giây trong cùng mảng sẽ bị coi là một phần tử (gần như không xảy ra trong dùng thật).
  - Ghi có điều kiện thất bại 3 lần liên tiếp (tranh chấp liên tục, hoặc RLS cho đọc mà không cho sửa) → ghi thường với bản gộp mới nhất, như hành vi cũ.
  - Op `insert` (upsert cả hàng) không gộp — id khách là UUID mới nên chỉ trùng khi cùng 1 op bị đẩy 2 lần.
- Phạm vi: `src/data/{arrayMerge,queue,sync,supabase,syncStatus}.ts`, `src/data/repositories/customers.ts` (chỉ gắn `arrayBase`), sheet `src/features/sync/`, chỉ báo đồng bộ trên header. Không migration, không đổi schema, không đổi v1.
- Chấp thuận: chủ dự án quyết định "sửa trước cutover" sau báo cáo T5.2 ngày 2026-10-17 (task T5.9); phương án kỹ thuật do agent chọn trong phạm vi đó, không xung đột D-012.
- Tài liệu đã cập nhật: `docs/decisions.md`, `docs/architecture.md` §3.1, §4.
- Trạng thái: Đã duyệt hướng; T5.2 chạy lại kịch bản E2 trên staging để nghiệm thu.

### D-022 — T6.7 nghiệm thu không cần bộ đánh giá ghi chú thật; theo dõi trên production

- Ngày: 2026-10-17
- Loại: Ngoại lệ cục bộ — bỏ một điều kiện nghiệm thu
- Nguyên tắc liên quan: `docs/tasks.md` T6.7 "Xong khi" (bộ đánh giá 50–100 ghi chú không có lỗi nghiêm trọng); `docs/prompts.md` (bộ `tests/ai-eval/notes.jsonl` do chủ dự án chọn).
- Quyết định: Đánh dấu T6.7 xong khi chưa có bộ ghi chú thật. Phần mã đã merge ở T6.7a (6feeb97) và chỉ được kiểm bằng ghi chú giả (`tests/ai-eval/synthetic-notes.jsonl`). Chất lượng AI trên ghi chú thật sẽ được chủ dự án theo dõi khi dùng trên production.
- Lý do: chủ dự án chưa có sẵn 50–100 ghi chú thật, gom và ẩn danh mất nhiều thời gian. Rủi ro hạn chế vì AI chỉ đề xuất (CLAUDE.md §3.8): mọi thay đổi đều qua hộp duyệt, không tự ghi, gửi hay gọi, và không gửi SĐT.
- Rủi ro còn lại: AI có thể đọc sai ghi chú viết tắt hoặc không dấu (ngày tương đối như "t7", số tiền, mã căn, phủ định/đổi ý) và đề xuất sai. Sale phải đọc kỹ đề xuất trước khi bấm duyệt.
- Cách theo dõi: khi thấy đề xuất sai, chụp màn hình hoặc chép ghi chú (bỏ SĐT, tên khách) kèm đề xuất sai rồi gửi agent. Các ví dụ này được thêm vào `tests/ai-eval/` theo mẫu `owner-notes.template.jsonl`, rồi chạy `tests/ai-eval/run.mjs` để sửa prompt. Sai nghiêm trọng hoặc lặp lại thì quay Worker về phiên bản trước trên Cloudflare (Workers → Deployments → Rollback) trong lúc sửa prompt. Không bỏ `VITE_WORKER_URL`, vì làm vậy tắt luôn OCR nhập khách.
- Điều kiện để dùng được trên production: Worker AI v2 phải được chủ dự án deploy (agent không deploy).
- Phạm vi: Chỉ T6.7. Các tính năng AI sau vẫn phải có đánh giá theo `docs/prompts.md` trừ khi có quyết định riêng.
- Chấp thuận: Curtis trong phiên điều phối 2026-10-17: "Tôi sẽ quan sát tính năng này trên production luôn. Bạn ghi chú bước này và cho phép pass."
- Tài liệu đã cập nhật: `docs/decisions.md`, `docs/tasks.md` (T6.7 "Xong khi", việc chủ dự án Sóng 6), `scripts/agents/ownership.json`.
- Trạng thái: Đã duyệt; chỉ áp dụng cho T6.7.
