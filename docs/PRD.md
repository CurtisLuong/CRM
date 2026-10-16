# PRD — Sổ Khách CRM v2 (đại tu)

> **Phiên bản:** 1.0 · 2026-10-16 · **Trạng thái:** Đã duyệt hướng (chat 2026-10-16), chưa code.
> **Đọc khi:** chọn/thiết kế tính năng, viết task, nghiệm thu. Chi tiết giao diện: `DESIGN_SYSTEM.md`; hành vi: `UX_GUIDELINES.md`; kỹ thuật: `architecture.md`; thứ tự làm: `tasks.md`.
> **Nguồn:** codebase v1 (2026-10-16), `docs/CRM bất động sản 2026.md` (nghiên cứu thị trường), `docs/sale-focus-roadmap.md`, `docs/FEATURE_IDEAS.md`.

## 1. Bối cảnh và mục tiêu

Sổ Khách là CRM nội bộ của một sale bất động sản (chủ yếu nhà ở xã hội Hải Phòng/Hưng Yên), mở rộng được cho vài đồng nghiệp. Dùng trên Android (web + vỏ Capacitor) và MacBook; nhập liệu được khi mất mạng.

v1 đã có nền nghiệp vụ tốt (2 lớp khách, phễu 5 giai đoạn + SLA, nhịp follow-up, nhật ký gọi Android, giỏ hàng + ghép căn, tính vay, AI hồ sơ, nhóm). Vấn đề của v1: **thông tin có nhưng rời rạc**, hành động cần nhiều chạm, gợi ý nằm rải ở nhiều nhóm, khó đánh giá cách chăm khách và marketing, `app.js` 7.800 dòng khó phát triển song song.

**Mục tiêu v2:** biến dữ liệu sẵn có thành **một vòng làm việc khép kín** — *biết làm gì tiếp → làm bằng ít chạm nhất → hệ thống ghi nhớ và đề xuất bước sau → học từ dữ liệu để chăm và marketing tốt hơn*.

> Nguyên tắc dẫn đường (từ nghiên cứu): **mỗi tương tác hữu ích phải để lại trí nhớ đáng tin và một bước tiếp theo phù hợp, với ít thao tác nhất từ sale.**

## 2. Ràng buộc không thương lượng

1. **Bảo toàn 100% dữ liệu.** Không xoá/đổi tên cột, không đổi nghĩa mã đã lưu (`care_stage`, `CALL_RESULTS`, `source`, `disqualify_reason`, kind việc…), migration chỉ **thêm**. Chi tiết: `architecture.md` §3.
2. **Local-first + offline** giữ nguyên: đọc IndexedDB trước, ghi local + hàng đợi, last-write-wins theo trường.
3. **Quyền dữ liệu**: RLS + GRANT như hiện có; D-003 (owner/followers/admin).
4. **AI chỉ đề xuất**, không tự ghi/gửi/gọi/đổi stage. Automation chỉ chạy theo quy tắc đã duyệt (D-008, D-010).
5. **Một nguồn cấu hình** cho khung giờ gọi (D-005), phễu/SLA (D-008), thời hạn (D-010), icon (D-006), danh mục nguồn/kết quả/lý do.
6. Không làm: multi-tenant SaaS, thanh toán, auto-send tin nhắn, power dialer, điểm số hộp đen, enrichment B2B, dashboard đồ sộ.

## 3. Người dùng và công việc cần làm

| Người dùng | Bối cảnh | Việc cần làm chính |
|---|---|---|
| **Sale chính (chủ dự án)** | Điện thoại Android cả ngày, Mac buổi tối; gọi + Zalo là kênh chính; lead từ Facebook Ads/landing | Gọi đúng người đúng lúc; ghi lại nhanh; không quên lời hứa; biết cách chăm nào hiệu quả; biết campaign nào ra khách thật |
| **Đồng nghiệp (sale)** | Được giao khách | Xem việc của mình, chăm khách được giao |
| **Trưởng nhóm (admin)** | Chủ dự án kiêm | Giao khách, xem toàn nhóm |

## 4. Năm ưu tiên sản phẩm → khu vực app

Mọi quyết định thiết kế ưu tiên theo thứ tự này (khi xung đột, mục trên thắng):

| # | Ưu tiên | Câu hỏi sale | Khu vực chính v2 |
|---|---|---|---|
| 1 | **What to do next?** | "Giờ tôi gọi ai, nói gì?" | **Hôm nay** (Next Best Action, hàng đợi, phiên gọi) |
| 2 | **Chất lượng chăm sóc** | "Cách chăm của tôi ổn chưa, sửa gì?" | **Hiệu quả › Chăm sóc** + chỉ báo sức khoẻ trên từng khách |
| 3 | **Gợi ý thông minh ready-to-action** | "Có cơ hội nào tôi đang bỏ lỡ?" | Bộ máy **Tín hiệu** (rule) + AI giải thích/soạn nháp, hiện ở Hôm nay/hồ sơ/Hiệu quả |
| 4 | **Trí nhớ khách để retarget** | "Ai hợp với sản phẩm mới này?" | **Hồ sơ › Trí nhớ** + **Khách hàng › Tệp & Retarget** |
| 5 | **Đánh giá marketing** | "Nguồn/campaign nào ra khách thật?" | **Hiệu quả › Marketing** |
| — | Phần CRM cần thiết khác | | Danh sách, công việc, giỏ hàng, tính vay, nhóm, cài đặt |

Thêm một yêu cầu xuyên suốt: **tối ưu số chạm** cho Gọi / Zalo / Ghi chú / Hẹn lịch (ngân sách chạm ở `UX_GUIDELINES.md` §3).

## 5. Đối chiếu v1 → v2 (gap analysis)

Ký hiệu: ✅ giữ nguyên nghiệp vụ (port sang v2) · 🔁 giữ nghiệp vụ, làm lại UX · ➕ bổ sung mới · 🧩 gom nhiều phần rời thành một tính năng.

| Năng lực v1 (file chính) | Đánh giá | Hướng v2 |
|---|---|---|
| Tổng quan: NBA + 11 nhóm việc `dashActionGroups` (`js/app.js`) | Logic xếp ưu tiên tốt nhưng hard-code trong 1 hàm; trùng với `notifications.js` và insights | 🧩 Bộ máy **Tín hiệu** (registry rule, mỗi rule 1 file) nuôi Hôm nay + chuông + hồ sơ + Hiệu quả; thêm **sức làm theo khung giờ** và **phiên gọi** |
| Nhóm việc "Khách nóng nguội", "Chưa có việc tiếp theo"… | Đúng hướng (Smart Lists) | ✅ thành rule S07, S08 |
| Hộp ghi cuộc gọi khi quay lại app, gợi ý nhịp `FOLLOWUP.afterCall` (`js/calls.js`, `js/followup.js`) | Tốt; nhiều chạm, tách rời ghi chú/AI | 🔁 **Sheet sau hành động**: kết quả 1 chạm → ghi chú/giọng nói → AI trích trường → bước tiếp theo điền sẵn → Lưu 1 lần |
| Nhật ký gọi Android (Capacitor `CallLog`, D-002) | Tài sản lớn | ✅ giữ hợp đồng `window.CRMCalls`/`crm:resume`, không build lại APK |
| Zalo: link + chọn mẫu tin + điền biến (`zaloLink`, `fillGreeting`) | Không ghi lại lần nhắn → số liệu thiếu | 🔁 + ➕ ghi **tương tác Zalo** 1 chạm ("Đã nhắn") vào timeline |
| Việc tiếp theo `next_tasks` + hẹn gọi `next_call_at` | Một loại "việc" chung | ➕ **Lời hứa 2 chiều** (`side: me/customer`), giữ hạn gốc khi dời, snooze có lý do |
| Phễu 5 giai đoạn + SLA + tự chuyển (`js/velocity.js`, D-008/D-010) | Đúng, đã duyệt | ✅ port nguyên quy tắc; hiển thị rõ hơn |
| 2 lớp khách + lý do loại (D-001) | Tốt cho marketing | ✅ + ➕ lý do kết thúc có cấu trúc cho lớp 2 + **điều kiện retarget** |
| Hồ sơ: 4 tab, nhiều thẻ; hồ sơ nâng cao `advanced` (15 field text) | Thông tin phong phú nhưng là text tự do, không có nguồn/độ mới | 🧩 **Trí nhớ khách**: Brief 20 giây + fact có nguồn/độ mới + "chưa biết → nên hỏi" + nhu cầu theo đợt (interests) + người cùng quyết định |
| Trợ lý AI: tóm tắt, soạn Zalo, ghi chú → đề xuất (`js/ai.js`, `worker/ai-assist.js`) | Tốt, có hộp duyệt | 🔁 đặt đúng chỗ dùng (Brief, sheet sau gọi, retarget) + ➕ ghi chú giọng nói |
| Giỏ hàng + ghép khách↔căn có lý do (`property-search.js`) | Chỉ 1 chiều (khách → căn), chỉ khách đang chăm | 🔁 + ➕ **ghép ngược căn → khách** gồm cả khách ngoài phễu; độ mới giá/tồn |
| Phân tích: gợi ý theo quy tắc có ngưỡng mẫu, nhịp chăm sóc, phễu, nguồn khách | Hướng đúng, rời rạc | 🧩 **Hiệu quả** 3 phần: Chăm sóc · Phễu · Marketing; mọi số có tử/mẫu/cỡ mẫu + hành động |
| Nguồn khách 3 trục (`source`/`intake_method`/`campaign`), `fb_leads`, UTM `web_*` | Dữ liệu marketing có sẵn nhưng chưa khai thác | ➕ funnel theo nguồn/campaign/form, cohort, chi phí → CPL / chi phí mỗi khách Đạt |
| Thông báo trong app (`notifications.js`) | Trùng logic với Tổng quan | 🧩 đọc từ bộ máy Tín hiệu |
| Tìm kiếm chung có trọng số (`search.js`) | Tốt | ✅ + ➕ Command palette (Cmd/Ctrl+K) |
| Nhóm/giao khách (D-003, `team.js`) | Đã code, SQL chưa chạy | ✅ port |
| Tính vay + PDF + báo giá (`js/loan/`) | Engine có test | ✅ engine port nguyên; UI làm lại theo DS v3 |
| OCR nhập khách, nhập/xuất Excel, tài liệu, avatar/cover | Dùng được | ✅ port |
| Xoá khách = xoá cứng (kéo theo tài liệu) | Rủi ro mất dữ liệu | ➕ **xoá mềm** (`archived_at`), xoá cứng chỉ cho admin sau xác nhận |
| Không có nhật ký thay đổi phía server | Rủi ro mất dữ liệu khi ghi đè | ➕ **audit trigger** append-only (làm đầu tiên, trước v2) |

## 6. Phạm vi tính năng v2

Mỗi tính năng có mã `F-xx` dùng trong `tasks.md`. Mức: **P0** = bắt buộc cho cutover; **P1** = ngay sau cutover; **P2** = khi dữ liệu đủ.

### F-01 Hôm nay (ưu tiên 1) — P0

- **Next Best Action**: 1 việc quan trọng nhất kèm *khách · hành động · lý do có bằng chứng · hạn · Brief 20 giây*; nút Gọi/Zalo/Xong/Dời ngay trên thẻ.
- **Hàng đợi** 3–7 dòng đầu, lọc `Ưu tiên · Khách mới · Lời hứa · Cơ hội`; mỗi khách xuất hiện **1 lần** (lý do quan trọng nhất, các lý do khác dạng chip).
- **Sức làm theo khung giờ**: ước lượng phút cho từng việc (cấu hình), so với thời gian còn lại của khung hiện tại (`callSlots`). Quá tải → đề xuất *"Dời N việc P2 sang khung D"*; sale bấm 1 lần để áp dụng, hạn gốc được giữ.
- **Phiên gọi**: chạy lần lượt hàng đợi: Brief → Gọi → Sheet sau gọi → khách kế tiếp; thoát bất kỳ lúc nào.
- **Tổng kết cuối ngày** (sau 20:45 hoặc khi mở lúc tối): lời hứa đã giữ/trễ, cuộc gọi chưa ghi kết quả, ghi chú chưa đồng bộ, việc ngày mai.
- **Nghiệm thu:** khách hẹn 18:30 vẫn giữ chỗ khi có thêm lead mới; không tạo việc trùng; mở app lên là bấm Gọi được trong 1 chạm.

### F-02 Hành động nhanh + Sheet sau hành động (ưu tiên 1, tối ưu chạm) — P0

- Gọi / Zalo / Ghi chú / Hẹn lịch có mặt ở: dòng hàng đợi, dòng danh sách (vuốt hoặc nút), thanh hành động dính đáy hồ sơ, command palette.
- **Sheet sau gọi** tự mở khi quay lại app (web: ước lượng thời gian rời app; Android: nhật ký máy). Bước: chọn kết quả (4 nút lớn + "khác") → ghi chú gõ/giọng nói (tuỳ chọn) → đề xuất bước tiếp theo từ `FOLLOWUP` (điền sẵn khung giờ) → **Lưu** một lần. AI trích trường (nếu bật) hiện dạng diff để tick.
- **Zalo**: bấm Zalo → mẫu gợi ý theo tình huống đã chọn sẵn + biến đã điền → "Sao chép & mở Zalo" → quay lại app hỏi 1 chạm "Đã gửi?" để ghi tương tác.
- **Ghi chú nhanh**: từ bất kỳ đâu (nút ＋ hoặc hồ sơ), mặc định gắn khách đang xem; hỗ trợ đọc giọng nói tiếng Việt.
- Chống bấm lặp, hoàn tác 5 giây cho thao tác không phá huỷ.
- **Nghiệm thu:** đạt ngân sách chạm ở `UX_GUIDELINES.md` §3 trên Android thật.

### F-03 Lời hứa 2 chiều và bước tiếp theo — P0

- Việc có `side`: **em hứa** (sale phải làm: gửi bảng giá tối nay) / **khách hẹn** (chờ khách: "chị hỏi chồng, thứ Sáu trả lời") / không xác định (việc cũ).
- Dời hạn giữ `due_original` → đo được tỉ lệ giữ lời hứa; dời phải chọn lý do nhanh (khách bận, em bận, chờ thông tin…).
- Khách đang chăm luôn có ≥1 bước tiếp theo; thiếu → tín hiệu S07 đề xuất khung giờ 1 chạm.
- **Nghiệm thu:** cùng lời hứa được AI trích 2 lần không tạo 2 việc (khoá chống trùng); "thứ Sáu" hiển thị thành ngày tuyệt đối trước khi lưu.

### F-04 Bộ máy Tín hiệu và gợi ý thông minh (ưu tiên 3) — P0 (rule S01–S10), P1 (S11–S18)

Tín hiệu = rule kiểm chứng được trên dữ liệu, mỗi tín hiệu có: *lý do · bằng chứng · hành động có sẵn · mức ưu tiên · điều kiện dừng*. AI chỉ **giải thích/soạn nháp**, không đổi mức ưu tiên. Danh mục:

| Mã | Tín hiệu | Hành động sẵn sàng | Mức |
|---|---|---|---|
| S01 | Khách mới chưa gọi (theo SLA Đăng kí mới) | Gọi + Brief nguồn/campaign | P0 |
| S02 | Hẹn gọi đến hạn/quá hạn (`countdownTag`) | Gọi | P0 |
| S03 | Lời hứa của em đến hạn/quá hạn | Làm ngay / Soạn Zalo | P0 |
| S04 | Khách hẹn trả lời đã quá hạn | Gọi hỏi lại, kèm ngữ cảnh lời hẹn | P1 |
| S05 | Quá mục tiêu/hạn mức SLA giai đoạn (cảnh báo; tự chuyển giữ theo D-008/D-010) | Mở hồ sơ / đẩy bậc | P0–P1 |
| S06 | Gọi lại khách mới chưa liên lạc được (nhịp 5 lần) | Gọi theo khung gợi ý | P1 |
| S07 | Đang chăm nhưng không có bước tiếp theo | Hẹn khung gợi ý (1 chạm) | P1 |
| S08 | Khách quan tâm cao đang nguội (≥ N ngày) | Gọi / Zalo mẫu "thong_tin" | P1 |
| S09 | Cuộc gọi máy chưa ghi kết quả | Ghi kết quả | P1 |
| S10 | Bước hồ sơ Booking sắp/quá hạn | Zalo nhắc giấy tờ | P0 |
| S11 | Thiếu thông tin quan trọng trước bước kế (vốn, mục đích, người quyết định, thời điểm mua) | Đưa câu hỏi vào Brief cuộc gọi tới | P2 |
| S12 | Căn mới / giảm giá khớp khách (ghép ngược) | Xem danh sách + soạn tin | P1 |
| S13 | Đến ngày/điều kiện retarget đã lưu | Liên hệ lại với ngữ cảnh lý do cũ | P1 |
| S14 | Sau xem dự án ≥2 ngày chưa hỏi cảm nhận | Gọi / Zalo mẫu | P1 |
| S15 | Sinh nhật, kỷ niệm nhận nhà | Zalo chúc | P2 |
| S16 | Đã mua 30/90 ngày | Xin giới thiệu | P2 |
| S17 | Nghi trùng khách (cùng SĐT chuẩn hoá, tên gần giống) | Xem & gộp có duyệt | P1 |
| S18 | Nuôi dài hạn đến hạn gọi lại | Gọi / Zalo | P1 |

- Dismiss/Snooze theo tín hiệu; tín hiệu đã bỏ qua không quay lại nếu chưa có dữ liệu mới.
- **Nghiệm thu:** mỗi tín hiệu có test tình huống dương/âm; không tín hiệu nào hiện khi thiếu dữ liệu nền; parity với 11 nhóm việc của v1.

### F-05 Trí nhớ khách (ưu tiên 4) — P0 (Brief + fact), P1 (interests, household, consent)

- **Brief 20 giây** (rule-based, không cần mạng): ai · mua để ở/đầu tư · cần gì · tài chính (vốn/vay) · ai quyết định · phản đối gần nhất · lời hứa đang mở · lần liên hệ cuối. Thiếu → hiện **"Chưa biết"** + câu nên hỏi. AI Brief (nếu bật) là lớp diễn đạt thêm, có nguồn.
- **Fact có nguồn & độ mới**: mỗi trường quan trọng biết *ai nhập (sale/AI đã duyệt/khách khai/import) · lúc nào*; dữ liệu > 90 ngày đánh dấu "cần xác nhận lại".
- **Nhu cầu theo đợt (interests)**: một người có nhiều đợt quan tâm (dự án, loại căn, ngân sách, thời điểm, trạng thái, lý do kết thúc). Lead hỏi dự án thứ 2 → thêm đợt, không tạo khách mới.
- **Người cùng quyết định (household)**: tên, vai trò (vợ/chồng/bố mẹ/đồng sở hữu), SĐT tuỳ chọn, ghi chú — không tạo khách riêng.
- **Tuỳ chọn liên hệ**: kênh ưa thích, khung giờ ưa thích (ưu tiên hơn khung theo nghề), **không liên hệ** (chặn retarget/mẫu tin), Zalo name/link (bán tự động).
- **Kết thúc có cấu trúc**: khi Loại/Nuôi dài hạn ở lớp 2 → lý do (tài chính, thời điểm, không có hàng phù hợp, pháp lý/điều kiện NOXH, vị trí, chọn dự án khác, không liên lạc được, khác) + **điều kiện retarget** (sau ngày…, khi có sản phẩm giá ≤…, loại căn…).
- Hồ sơ nâng cao `advanced` của v1 giữ nguyên dữ liệu, hiển thị trong nhóm Trí nhớ.

### F-06 Tệp khách & Retarget (ưu tiên 4) — P1

- **Bộ lọc tệp** trên toàn bộ khách (kể cả Loại/Nuôi/Đã mua): loại căn, ngân sách/vốn, dự án đã quan tâm, mục đích, khu vực, nghề, thời điểm mua, lý do kết thúc, liên hệ cuối, đồng ý liên hệ. Lưu thành **tệp đã lưu** tự cập nhật.
- **Sản phẩm → khách**: chọn dự án/căn/loại căn (từ giỏ hàng) → xếp khách theo *ràng buộc cứng* (loại căn, trần tài chính nếu có, không "không liên hệ", không đang chăm bởi người khác) rồi *ưu tiên mềm* (hướng, tầng, diện tích, lịch sử quan tâm); mỗi khách có lý do "khớp ở đâu / vướng ở đâu".
- **Chiến dịch retarget**: chọn khách → mẫu tin có biến sản phẩm → lần lượt "Sao chép & mở Zalo" → "Đã gửi" → tự tạo follow-up; gắn nhãn chiến dịch để đo phản hồi.
- **Nghiệm thu:** căn đã bán/giá cũ không được giới thiệu như đã xác minh; khách "không liên hệ" không bao giờ xuất hiện trong danh sách gửi; không gửi tự động.

### F-07 Hiệu quả › Chăm sóc (ưu tiên 2) — P0 (4 chỉ số v1), P1 (đầy đủ)

Chỉ số (tử/mẫu/khoảng thời gian/cỡ mẫu luôn hiển thị; thiếu mẫu → "Chưa đủ dữ liệu"):

| Chỉ số | Định nghĩa | Hành động khi kém |
|---|---|---|
| Tốc độ gọi lần đầu | Trung vị (cuộc gọi đầu − đăng ký, theo giờ làm SLA); % < 30 phút | Mở khách mới chưa gọi |
| Tỉ lệ liên lạc được | Lead có ≥1 `talked` / lead đã gọi | Xem khung giờ nghe máy tốt |
| Nghe máy theo khung | `talked` / cuộc có kết quả, theo `callSlots` | Dồn cuộc quan trọng vào khung tốt |
| Phủ bước tiếp theo | Khách trong phễu có hẹn/việc mở / tổng | Mở nhóm S07 |
| Giữ lời hứa | Lời hứa "em" xong trước hạn gốc (+30') / lời hứa đến hạn | Xem lời hứa trễ |
| Cam kết quá hạn | Theo `countdownTag` | Xử lý ở Hôm nay |
| Tuổi giai đoạn vs SLA | Phân bố khách theo mục tiêu/hạn mức | Mở khách ứ đọng |
| Nhịp chạm | Khách đang chăm có lần chạm ≤ N ngày | Mở khách nguội |
| Chuyển đổi theo số lần chạm | Tỉ lệ lên bậc theo số lần gọi/nhắn | Điều chỉnh nhịp follow-up |

- **Bài học tuần** (rule, có ngưỡng mẫu): tối đa 3 phát hiện + hành động; AI chỉ diễn giải số đã tính.
- **Sức khoẻ từng khách** (đúng nhịp / đang trễ / nguy cơ) hiển thị ở danh sách và hồ sơ, giải thích được.

### F-08 Hiệu quả › Phễu — P0 (parity v1)

Phễu 5 giai đoạn + milestone, tốc độ từng giai đoạn vs SLA, tỉ lệ chuyển đổi có mẫu số, lý do kết thúc, cohort theo tháng đăng ký.

### F-09 Hiệu quả › Marketing (ưu tiên 5) — P1

- Theo **kênh / campaign / form** (từ `source`, `campaign`, `web_*` UTM, `fb_leads.form_name/ad_id`): lead → hợp lệ (không số sai/phá campaign) → liên lạc được → Đạt → Xem dự án → Booking → Ký HĐMB; thời gian tới từng mốc; lý do loại theo kênh.
- **Chi phí** nhập tay theo campaign/kỳ (bảng mới `campaign_costs`) → chi phí/lead, chi phí/khách Đạt, chi phí/Booking. Không có chi phí → ẩn các chỉ số này, không hiện 0.
- So sánh theo **cohort** (cùng kỳ đăng ký, đã theo dõi đủ N ngày); cảnh báo cỡ mẫu nhỏ; không kết luận nhân quả.
- Tình trạng **đường thu lead**: lần nhận gần nhất, số lỗi (`fb_leads.status='error'`), để phân biệt "không có lead" với "connector hỏng".

### F-10 Danh sách khách, tìm kiếm, Command palette — P0

Parity v1 (Tiềm năng · Khách mới · Khách nhóm, lọc/sắp xếp/xem thẻ-danh sách, xuất/nhập Excel) + tìm kiếm toàn cục Cmd/Ctrl+K (khách, lệnh, màn), danh sách ảo hoá, vuốt hành động trên mobile, khung chia đôi danh sách/hồ sơ trên desktop.

### F-11 Hồ sơ khách v2 — P0

Thứ tự: Header (tên, bậc, sức khoẻ, SLA) + **thanh hành động dính** (Gọi · Zalo · Ghi chú · Hẹn) → Bước tiếp theo/lời hứa → Brief → Timeline hợp nhất (cuộc gọi, ghi chú, Zalo, bậc, việc xong) → Trí nhớ (fact theo nhóm) → Nhu cầu & căn khớp → Tài liệu → Tính vay. Lớp 1 (Khách mới) dùng sheet gọn: nhịp gọi, Đạt/Loại.

### F-12 Các module port (P0 parity)

Công việc (tab), Khách mới (lớp 1, D-001), giỏ hàng + nhập Excel (`gio-hang.md`), tính vay + PDF + báo giá (`loan-module.md`), nhóm/giao khách (D-003), OCR nhập khách, tài liệu/ảnh, mẫu tin Zalo, cài đặt AI, kiểm tra cập nhật APK, thông báo trong app, nhập lead Facebook (Worker không đổi).

### F-13 Ghi chú giọng nói + AI trích xuất — P1

Đọc giọng nói tiếng Việt trên thiết bị (Web Speech API, nếu có) hoặc Worker STT; văn bản → `parse_note` → diff để duyệt. Phủ định ("không phải 3 tỷ, tối đa 2,8 tỷ"), ngày tương đối, số tiền phải xử lý đúng hoặc đánh dấu "chưa chắc". Audio không lưu mặc định.

### F-14 Tin cậy dữ liệu — P0

Audit trail server, xoá mềm, trạng thái đồng bộ rõ (đang chờ/đã đồng bộ/lỗi), không mất ghi chú khi offline rồi đóng app, chống trùng thao tác, phát hiện trùng khách có duyệt, xuất toàn bộ dữ liệu (JSON giữ quan hệ) cho chủ dự án.

## 7. Ngoài phạm vi v2

Auto-send Zalo/SMS; đọc hộp thư Zalo cá nhân; ghi âm cuộc gọi; voice agent; lead score xác suất; dự báo doanh thu; Zalo OA/ZBS (cân nhắc sau F-09); push khi app đóng (để v2.1, xem `FEATURE_IDEAS.md`); hồ sơ điều kiện NOXH chi tiết (P2, sau v2 — dữ liệu dùng `interests`/`advanced`).

## 8. Chỉ số thành công (đo bằng pilot 4–6 tuần sau cutover)

Tuần đầu ghi baseline trên v1 (T0.6). Không hứa % trước baseline.

| Nhóm | Chỉ số |
|---|---|
| Tốc độ thao tác | Số chạm/thời gian: ghi kết quả gọi, ghi chú, nhắn Zalo theo mẫu, hẹn lịch |
| Chất lượng chăm sóc | % khách có bước tiếp theo; % lời hứa đúng hạn; trung vị gọi lần đầu |
| Tin cậy | 0 mất ghi chú/khách trong bộ nghiệm thu; 0 việc/tin trùng; lỗi đồng bộ có người xử lý |
| Kinh doanh | Xem dự án, Booking, Ký HĐMB theo cohort (đọc dài hạn, không nhân quả) |

## 9. Phụ lục — danh sách parity bắt buộc trước cutover

Danh sách đầy đủ ở `tasks.md` T5.1. Mọi thao tác ghi của v1 (`window.CRM.*` trong `legacy/js/db.js`) phải có tương đương v2 với cùng định dạng dữ liệu.
