# UI/UX migration — 2026-10-15

## Phạm vi và ranh giới

Theo yêu cầu rà soát toàn webapp bằng `DESIGN_SYSTEM.md` v2 và `UX_GUIDELINES.md` v1. Đây là thay đổi local, chưa deploy. Không chạy SQL, không truy cập dữ liệu khách thật, không build APK. Giữ HTML/CSS/JS thuần và các ID/handler hiện có.

Không thay engine vay, schema/RLS/GRANT, IndexedDB/queue/sync, owner/followers, tiêu chí Đạt/Loại, dữ liệu stage/interest, cấu hình SLA hoặc nhịp/khung giờ follow-up. Sau khi chốt D-010, Tổng quan và nhãn hạn đã được sửa để cùng định nghĩa đến hạn/quá hạn với Công việc/hồ sơ; không đổi thời hạn lưu trong dữ liệu. Những hàm nghiệp vụ này vẫn là nguồn tính toán; UI chỉ đọc và trình bày kết quả. Chỉ thêm hành vi UI (keyboard, giữ vị trí, bảo vệ bản nháp, chống bấm Lưu lặp, phản hồi lỗi) và các metric nhịp chăm sóc chỉ đọc có mô tả mẫu số/nguồn.

## Bản đồ rà soát

| Khu vực | Thay đổi / kiểm tra |
|---|---|
| Khởi động, đăng nhập | Nền/typography/nút theo token; lỗi đăng nhập có role alert; giữ Auth |
| App shell | Header/nav trắng; graphite cho active và Quick Add; safe area; nhãn active cho assistive technology; giữ 4 tab và tìm kiếm chung |
| Tổng quan | Hành động tiếp theo và hàng đợi xem trước từ thứ tự `dashActionGroups` hiện có; nhóm việc đầy đủ vẫn truy cập được; chỉ số chuyển xuống sau phần hành động; trạng thái rỗng có nút thêm khách |
| Tiềm năng / Khách mới / Khách nhóm | Nhãn stage/quan tâm/liên lạc trung tính; typography/card/list/filter/sort chung; giữ matcher, lọc, phân trang, export và quyền |
| Hồ sơ — Tổng quan | Liên hệ → việc tiếp theo → tiến độ/ngữ cảnh → AI → căn hộ/ghi chú/vay; thu gọn bìa mặc định; vẫn xem đầy đủ tên dài |
| Hồ sơ — Tương tác / Thông tin / Lịch sử | Token/heading chung, lịch sử và tài liệu giữ nguyên; keyboard cho tab; quay lại đúng màn/vị trí và phục hồi focus khi có thể |
| Công việc | Giữ nhóm/thứ tự/đánh dấu xong; mobile chuyển dòng thời gian lên trên dòng việc để tên dài không bị bó hẹp; hạn có chữ + màu |
| Hẹn gọi / Thêm việc / Nhật ký gọi | Bottom sheet mobile; nút/field đủ chạm; giữ preset D-005 và kết quả D-002; nhãn Lưu nói rõ có hẹn/loại kèm theo; chặn lưu cuộc gọi lặp và hiện lỗi |
| Form khách / OCR | Form dài toàn màn mobile, footer Lưu/Huỷ; Escape/Back/Huỷ hỏi nếu có thay đổi chưa lưu; chống submit lặp, giữ nội dung khi lỗi; không đổi mapping OCR/payload |
| Phân tích | Thêm tỷ lệ khách có cuộc trao đổi, bước tiếp theo, số cam kết quá hạn, trung vị gọi lần đầu; nguồn/mẫu số rõ; một quan sát nổi bật, các quan sát khác thu gọn; không đổi ngưỡng/tập khách của insight cũ; mẫu số 0 ở phễu hiển thị “—” |
| Giỏ hàng / Ghép căn-khách / Nhập-Xuất | Shared token/control; bảng rộng cuộn trong vùng riêng; giữ phân lớp dự án/tòa/căn, giá VAT/KPBT và matching |
| Tính vay | Biến `.lm-` tham chiếu token chung, light-first, control đủ chạm; sticky action trên mobile tránh bottom nav; giữ engine và block CSS in PDF |
| Tiện ích | Giao khách / đồng nghiệp / mẫu Zalo / chọn tin / AI settings dùng shell chung; chỉ AI dùng violet; giữ quyền và bước xác nhận trước ghi/gửi |
| Accessibility / motion | Dialog có tên, validation alert, trạng thái tab, focus-visible, vùng chạm, reduced-motion, giữ `[hidden]` |
| PWA | Theme/manifest đồng bộ màu mới; cache v95; giữ network-first và fallback hiện có |

## Hai xung đột đã chốt — D-010

1. **Tự chuyển SLA:** người dùng xác nhận đây là triết lý sản phẩm: giảm bấm và giảm rối bằng automation. Giữ nguyên `runSlaAutomation`/`VELOCITY_CONFIG` và lịch hẹn kèm theo quy tắc; không thêm xác nhận từng lần. Đã cập nhật hướng dẫn gốc, UX và tài liệu SLA; các giai đoạn chỉ cảnh báo vẫn giữ nguyên.
2. **Định nghĩa quá hạn:** mọi màn dùng `countdownTag` của Công việc/hồ sơ. `taskDueInfo` và `callReminder` đọc từ đó. Tổng quan phân biệt rõ đến hạn/quá hạn; KPI hẹn gọi quá hạn không đếm thời gian đang trong khung hoặc trong 30 phút sau cuối khung. Việc cả ngày chỉ quá hạn khi sang ngày kế tiếp.

Không còn quyết định nghiệp vụ đang chờ trong phạm vi task này. D-010 ghi chính xác phạm vi được duyệt, không mở rộng automation sang hành động mới.

## Kiểm chứng

Kiểm thử dùng origin riêng, chặn request ra ngoài, Supabase giả và IndexedDB của origin test. Không dùng phiên/tài khoản thật.

- `node tests/loan-engine.test.js`: đạt — các phép tính/tiến độ/ân hạn/tất toán mẫu hiện có.
- `node tests/search.test.js`: đạt — 29 query cases, relevance/highlight/range, property matching, pagination.
- `node --test tests/fb-leads.test.mjs`: đạt — intake/webhook/cron/manual hiện có.
- `tests/search-browser.test.cjs`: đã sửa loader và selector tab đã lỗi thời, giữ nội dung kiểm tra dữ liệu; chạy lại đạt với 1.201 khách/1.201 căn, lỗi kéo trang, chuyển tài khoản, tìm/lọc/IME/phân trang và 320/375/1280px.
- `tests/ui-design-browser.test.cjs`: lượt đầy đủ đạt 109 trạng thái có ảnh ở 320/375/390/430/768/900/1024/1280px; không tràn ngang/lỗi JavaScript, không trùng ID, đúng token/hidden. Chuyển màn/mở sheet không thay bản ghi khách. Đã kiểm tra tab bằng phím, nhóm việc giữ mở sau redraw, guard bản nháp, Back/Escape, lưu offline đúng owner/stage, chống double-submit và giữ nội dung khi lỗi. Lượt bổ sung kiểm tra 50 trạng thái (có lặp lại các flow chính) gồm bảng giỏ hàng mở rộng ở 320/430px, bảng kết quả/lịch trả nợ/tất toán, AI loading/error. Đo tương phản tự động trên chữ hiện trong viewport, có nền/foreground tính được: không phát hiện dưới ngưỡng; không thay thế audit WCAG đầy đủ.
- Lưu bằng chứng local dưới `/private/tmp/crm-ui-audit/`; không phải dữ liệu production.

Chưa xác minh trên Android thật/APK, bàn phím ảo thật, Supabase production, xuất PDF thực tế hoặc bản deploy. Không thêm retargeting/gửi liên hệ, consent model, attribution/chi phí quảng cáo hay automation nghiệp vụ mới trong task UI này.

## Đối chiếu logic và phần thay đổi đã duyệt

- Trước khi chốt D-010, đã đối chiếu 19 thân hàm nghiệp vụ với HEAD và xác nhận giữ nguyên nội dung: `handleFormSubmit`, `runSlaAutomation`, `taskDueInfo`, `countdownTag`, `dashActionGroups`, `collectWorkItems`, `saveSchedule`, `saveTaskModal`, `qualifyLead`, `saveLeadDrop`, `leadMatchesFilter`, `matchesFilters`, `sortCustomers`, `visibleCustomers`, `visibleLeads`, `offerFollowup`, `onCareStageChange`, `calls.save`, `calls.previewAttempts`.
- Các file DB, velocity, followup, team, catalog, property/search, loan engine/store/PDF, SQL và Worker không thay đổi. `loan-ui.js` chỉ thêm accessible name cho field; block CSS in PDF trong `loan.css` giống HEAD.
- `node --check` trên mọi file JS thay đổi, `git diff --check`, và `cmp AGENTS.md CLAUDE.md`: đạt.
- Bằng chứng `business-functions.json`, `results.json`, ảnh UI ở thư mục tạm nêu trên. Những kiểm chứng này giảm rủi ro regression local, không chứng minh production hay thiết bị thật.

### Kiểm tra bổ sung sau D-010

- `taskDueInfo`, `callReminder`, phần nhãn và đếm quá hạn trong `dashActionGroups`/Tổng quan được sửa theo lựa chọn của người dùng. `countdownTag`, `runSlaAutomation`, handler lưu khách/cuộc gọi/hẹn việc, cấu hình SLA và follow-up giữ nguyên.
- `node tests/deadlines.test.js`: đạt 21 tình huống ranh giới/ngày không hợp lệ; thêm kiểm tra tự chuyển SLA, lịch gọi từ FOLLOWUP, metadata lịch sử, phạm vi owner, không chuyển giai đoạn chỉ cảnh báo, không tự loại lead đã trao đổi, không lặp chuyển ở lượt chạy kế.
- Browser regression kiểm tra cùng hẹn gọi trên Tổng quan/KPI/Công việc/hồ sơ: trong ân hạn là đến hạn, sau ân hạn là quá hạn. Các kiểm tra này dùng dữ liệu giả tại origin riêng.
- Bộ ảnh/test local mới: `/private/tmp/crm-ui-audit/deadline-unification/`. Cache app-shell v96; chưa deploy.
