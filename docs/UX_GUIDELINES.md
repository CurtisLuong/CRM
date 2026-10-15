# Sổ Khách — UX Guidelines

> **Version:** 1.1 · 2026-10-15 · **Audience:** AI coding agents & product developers
> **Scope:** Quy tắc UX nhất quán cho CRM của **solo real estate agent / tiny team**.
> **Companion:** `DESIGN_SYSTEM.md` quy định visual tokens/components. **File này quy định trải nghiệm và logic hiển thị; không tự định nghĩa màu.**

## 0. North Star & thứ tự ưu tiên

**CRM = Action Workspace, không phải Reporting Dashboard.** Mỗi màn giúp trả lời: **Làm gì tiếp? Vì sao? Làm thế nào? Làm xong thì sao?**

Giữ thứ tự ưu tiên sản phẩm:

1. **What to do next?** Đưa ra hành động cụ thể, dễ thực hiện ngay.
2. **Relationship quality.** Sale có đang chăm đúng nhịp, đúng nhu cầu, đúng cách không?
3. **Smart, ready-to-action suggestions.** Insight phải giải thích được và dẫn tới hành động.
4. **Customer memory.** Lưu thông tin bền vững để chăm sóc/giới thiệu sản phẩm phù hợp về sau.
5. **Marketing effectiveness.** Đánh giá nguồn và chất lượng khách qua toàn phễu, không chỉ số lead.

**Nguyên tắc cốt lõi:** Action > Context > Evidence > Analytics. Ít bước, ít nhập lại, ít quyết định thừa. Không đánh đổi tính đúng đắn dữ liệu lấy automation.

## 1. Universal interaction rules

- **Action-first:** nội dung hành động xuất hiện trước KPI/báo cáo trên Focus và đầu tab Tổng quan hồ sơ; báo cáo chi tiết để trong Insights.
- **One obvious next step:** vùng tác vụ có 1 primary CTA; các lựa chọn khác secondary/overflow. Không ép người dùng xử lý mọi cảnh báo cùng lúc.
- **Show why:** mọi ưu tiên/gợi ý có lý do ngắn dựa trên dữ liệu: lịch hẹn, lần liên hệ, stage, ghi chú, v.v.; có đường mở chi tiết.
- **Make action reversible:** thao tác cập nhật trạng thái/giao việc/hoãn phải có review hoặc Undo khi khả thi; hành động không thể hoàn tác yêu cầu xác nhận.
- **Automation theo quy tắc đã duyệt (D-008, D-010):** ưu tiên tự động hóa để giảm bấm và giảm rối. Khi quá hạn mức SLA ở giai đoạn có cấu hình tự chuyển, app **tự chuyển và tạo lịch kèm theo đúng quy tắc**, không hỏi xác nhận lại từng lần; giữ thông báo, lịch sử và Hoàn tác/Mở lại hiện có. Chỉ những chuyển đổi đã được duyệt trong `VELOCITY_CONFIG` mới tự chạy; không tự mở rộng sang mọi giai đoạn.
- **Không suy diễn cam kết/kết quả:** bấm Gọi không có nghĩa là đã trao đổi thành công. Gửi Zalo/SMS, gắn nhãn nhạy cảm và automation mới chưa được duyệt vẫn cần xác nhận; AI chỉ đề xuất, không thay quyền của rule engine đã được duyệt.
- **Progressive disclosure:** màn đầu hiển thị đủ để hành động; chi tiết mở khi cần. Tránh lặp lại cùng KPI trên nhiều khối.
- **Preserve context:** trở về danh sách giữ vị trí scroll/filter/tab; mở hồ sơ từ Focus có đường về Focus; hoàn thành việc thì tiến tới việc tiếp theo.
- **Consistent outcomes:** cùng loại action có cùng nhãn/icon, bước xác nhận, kết quả, thông báo, cách lỗi trên mọi màn.
- **No fabricated intelligence:** chỉ số/%, đề xuất thời điểm gọi, lead score, insight AI phải có dữ liệu và phương pháp; thiếu dữ liệu → nêu “Chưa đủ dữ liệu”, không dựng kết luận.

## 2. Navigation & information architecture

**Giữ cấu trúc hiện hữu khi triển khai theo từng bước:** 4 tab nghiệp vụ `Tổng quan` (đề xuất nhãn hiển thị **Focus**) · `Khách hàng` · `Công việc` · `Phân tích` (đề xuất nhãn **Insights**). Nút `+` ở giữa là **Quick Add**, không phải tab thứ năm. Chỉ đổi tên/route/menu khi task phê duyệt; không đổi ngầm handler/ID.

| Khu vực | Câu hỏi được trả lời | Nội dung chính |
|---|---|---|
| **Focus** | Tôi nên làm gì ngay? | Next Best Action → urgent queue → actionable insight → phần việc còn lại |
| **Customers** | Tôi biết gì về khách? | Search/filter, memory, stage, relationship, hồ sơ |
| **Tasks** | Toàn bộ cam kết cần quản lý? | Quá hạn, hôm nay, sắp tới, đã xong, theo loại |
| **Insights** | Tôi chăm sóc/bán hàng/marketing tốt chứ? | Relationship health → pipeline/conversion → marketing ROI/quality |
| **Quick Add (`+`)** | Tôi cần ghi lại điều gì nhanh? | Thêm khách, công việc, ghi chú, hẹn gọi (theo ngữ cảnh) |
| **Utilities / Account** | Công cụ ít dùng? | Tính vay, giỏ hàng, mẫu tin, thành viên, cài đặt... |

Mobile: nav cố định dưới; **giữ 1 nơi tìm kiếm thống nhất**, Cmd/Ctrl+K nếu hỗ trợ; các search/filter không được tạo panel thứ hai trùng chức năng. Desktop có thể mở rộng layout nhưng không thay đổi ý nghĩa tab.

## 3. Focus — chuẩn dashboard

**Không bắt đầu bằng 4 KPI card lớn.** Thứ tự từ trên xuống:

1. **Compact header:** ngày/lời chào + tóm tắt 1 dòng (số việc, quá hạn nếu có), không chiếm nhiều viewport.
2. **Next Best Action (NBA):** 1 việc ưu tiên, kèm *hành động / khách / lý do / deadline / CTA / mở hồ sơ*. Nếu không có việc → trạng thái “Đã xử lý các việc ưu tiên” + đề xuất bước hữu ích khác, không tạo việc giả.
3. **Focus Queue:** 3–5 item hiển thị trước, có quick action. Bộ lọc `Ưu tiên | Hôm nay | Khách mới | Tất cả` tùy dữ liệu; tổng số không đồng nghĩa mức nguy cấp.
4. **Smart suggestion:** tối đa 1 insight nổi bật, không chen trước việc gấp. Có CTA hoặc chỉ rõ điều cần kiểm tra.
5. **Overview nhỏ:** các chỉ số phụ, hoạt động gần đây hoặc shortcut. Phân tích sâu chuyển Insights.

**NBA không phải quảng cáo AI.** Ưu tiên trước hết dùng rule-based logic kiểm tra được; AI có thể giúp giải thích/tóm tắt, không tự quyền ghi đè mức độ ưu tiên.

### Thứ tự ưu tiên công việc (policy có thể cấu hình)

- **P0:** Hẹn/việc quá hạn, các cam kết với khách tới hạn, tác vụ có rủi ro rõ. Dựa trên deadline đáng tin cậy và tính trọng yếu.
- **P1:** Đến hạn hôm nay; khách mới cần liên hệ trong khung SLA hợp lệ; follow-up đã cam kết.
- **P2:** Tác vụ chưa đến hạn / nuôi dưỡng / bổ sung thông tin.
- Trong cùng mức, xét `due_at`, stage/opportunity có căn cứ, lần tương tác gần nhất; **không suy ra “khách nóng” chỉ từ AI hoặc cảm giác**.
- Có ngoại lệ rõ ràng (vd hồ sơ Booking cần xác nhận gấp) nhưng cần nguồn/điều kiện; tránh double count cùng một khách/việc trong queue.
- **Hạn giờ là nguồn sự thật.** Không gắn đỏ chỉ vì một task đứng đầu hàng đợi. Nếu thiếu deadline → neutral, trừ khi có quy tắc khẩn cấp khác được xác minh.
- **Một định nghĩa đến hạn/quá hạn (D-010):** mọi màn đọc `countdownTag` trong `js/app.js`. Việc có giờ: từ mốc đến hết mốc +30 phút là “đến hạn”, sau đó mới “quá hạn”. Hẹn gọi: tính đến hết khung +30 phút (không có giờ kết thúc thì dùng giờ bắt đầu). Đúng mốc +30 phút vẫn là đến hạn. Việc cả ngày: đến hạn suốt ngày đó, quá hạn từ 00:00 ngày hôm sau; không cộng thêm 30 phút. Đây là thời hạn công việc, không phải hạn mức SLA của phễu.

**Row contract:** tên khách + action verb + deadline/trạng thái + nút thao tác; chạm row mở ngữ cảnh/hồ sơ, nút call thực hiện cuộc gọi; tránh vô tình gọi khi chạm dòng. Sau action thành công: xác nhận → cập nhật queue → giữ scroll / đưa next item hợp lý.

## 4. After-action workflow (quan trọng nhất sau Focus)

**Trigger:** người dùng bấm Gọi/Zalo/hoàn thành nhiệm vụ. **Không đánh đồng click với kết quả thực tế.**

**Call workflow mẫu:**

`Mở khách → Gọi → Quay lại app → Chọn kết quả → (ghi chú ngắn) → Gợi ý bước tiếp theo → Người dùng xác nhận → Lưu timeline/task → Item tiếp theo`

Kết quả tối thiểu: `Đã trao đổi` · `Khách bận/hẹn lại` · `Không liên hệ được` · `Không phù hợp` · `Bỏ qua, chưa ghi nhận`. Từng kết quả mở form liên quan, tránh bắt điền thông tin không cần thiết.

- Đã trao đổi: ghi nhu cầu/trở ngại, thay đổi quan tâm **chỉ khi xác nhận**, có thể tạo next step.
- Hẹn lại: chọn thời gian cụ thể + xác nhận; không tự đặt lịch âm thầm.
- Không liên hệ được: lưu attempt, gợi ý follow-up hợp lý dựa `js/followup.js`; tránh spam hoặc gợi ý thời điểm “tối ưu” khi thiếu dữ liệu.
- Không phù hợp: cập nhật lý do/sản phẩm quan tâm, giữ dữ liệu phục vụ đúng mục đích; cho phép đưa vào nuôi dài hạn nếu phù hợp.
- Lưu timeline/event với nguồn (`manual`, `system`, `ai_suggestion_accepted` nếu được hỗ trợ), người thực hiện, thời gian; chống lưu trùng từ double tap/retry.

**Quick Add:** từ ngữ cảnh khách → mặc định gắn khách hiện tại; từ Focus → cho chọn khách. Sau lưu đưa user về đúng ngữ cảnh, feedback rõ.

## 5. Hồ sơ khách — relationship + memory

**Tab Tổng quan:** thông tin liên hệ + hành động nhanh → **Việc tiếp theo** → stage/relationship snapshot → AI suggestion khi có căn cứ → sản phẩm quan tâm → ghi chú gần đây. Hồ sơ chi tiết/tài liệu/timeline ở tab liên quan; không nhồi vào overview.

> **Migration note:** Code cũ quy định hàng `Tiến độ · Quan tâm · Liên lạc` luôn trên cùng, rồi `Việc tiếp theo`, `Trợ lý AI`, `Căn hộ`, `Ghi chú`, `Tính vay`. Giữ thứ tự cũ **cho đến khi task cải tổ hồ sơ được yêu cầu**; UX đích đưa hành động và thông tin liên hệ rõ hơn lên đầu. Không âm thầm reorder trong task đổi màu.

**Customer Memory tối thiểu** (thu thập dần, không bắt nhập đủ khi tạo lead):

- Identity/contact: tên, kênh liên hệ, owner, nguồn, consent/preferences liên hệ.
- Intent: an cư/đầu tư/cho người thân; loại sản phẩm/dự án quan tâm, khu vực, loại căn.
- Fit: khoảng ngân sách, khả năng vay nếu khách chia sẻ, thời điểm mua, tiêu chí/rào cản.
- Engagement: lịch sử cuộc gọi/tin nhắn/ghi chú/hẹn, lần liên hệ cuối, lịch tiếp theo, outcome.
- Lifecycle: stage, lý do thay đổi, booking/hợp đồng nếu có, lý do không phù hợp, mức quan tâm kèm căn cứ.

Mỗi thông tin quan trọng cần nhận biết **nguồn** và **độ mới**; dữ liệu cũ/không chắc phải cho phép sửa, không dùng như fact để tự động phân loại khách. Không nhân đôi thông tin ở nhiều trường và free-text nếu đã có structured fields phù hợp.

**Retargeting:** lọc nhóm dựa trên tiêu chí rõ (`2PN`, ngân sách, khu vực, khung thời gian, đã cho phép liên hệ). Hiển thị lý do match, thời điểm cập nhật, danh sách khách đủ điều kiện; cho sale **review trước khi gửi liên hệ**. Không tái sử dụng dữ liệu ngoài mục đích/consent hợp lệ, tránh tiết lộ dữ liệu riêng tư trong team.

## 6. Relationship Health — đo cách chăm sóc khách

**Đừng đồng nhất “gọi nhiều” với “chăm sóc tốt”.** Nên đo (chỉ khi có đủ sự kiện):

| Chỉ báo | Ý nghĩa UX | Action gợi ý |
|---|---|---|
| First response time | Tốc độ liên hệ lead mới | Mở nhóm chưa liên hệ đúng SLA |
| Contact rate | % lead thực sự liên hệ được | Xem nhóm chưa liên hệ và lịch sử attempts |
| Next-step coverage | % khách đang chăm có bước tiếp theo rõ ràng | Tạo/điều chỉnh follow-up |
| Overdue commitments | Lịch hẹn đã cam kết bị trễ | Xử lý Focus Queue |
| Stage aging / SLA | Khách ở một stage quá lâu | Xem lý do kẹt và cập nhật kế hoạch |
| Outcome by attempt | Kết quả theo số lần tiếp cận | Điều chỉnh nhịp chăm sóc, tránh spam |

Mọi metric phải định nghĩa **tử số, mẫu số, khoảng thời gian, nguồn**, điều kiện dữ liệu; chia cho 0 → `—`, không hiện 0% sai nghĩa. Khi cỡ mẫu nhỏ, dùng cảnh báo hạn chế hoặc “Chưa đủ dữ liệu”. Insight không quy lỗi/đánh giá cá nhân chỉ từ metric rời rạc.

## 7. Suggestions / AI — ready to action

Dùng 1 pattern **Insight → Evidence → Suggested action → Confirm/Ignore** tại Focus, hồ sơ và Insights.

- `Rule-based insight`: suy từ deadline, activity và stage; **không gắn nhãn AI** nếu không sử dụng AI.
- `AI suggestion`: luôn có nhận diện AI nhất quán theo `DESIGN_SYSTEM.md`; phân biệt dữ liệu thật, suy luận, giả thuyết; không giả số liệu/% tăng hiệu quả.
- Ví dụ hợp lệ: “5 khách chưa liên hệ được sau ≥3 ngày” → **Xem 5 khách**; chỉ gợi ý gọi khung 15–17h nếu có dữ liệu lịch sử tương ứng và đủ mẫu, nếu không nói “Thử lịch gọi khác”.
- Hiển thị vì sao gợi ý xuất hiện, thời điểm dữ liệu cập nhật và CTA (`Xem khách`, `Tạo lịch`, `Soạn tin`); không chỉ đưa lời khuyên chung chung.
- **AI không tự gửi tin, gọi, ghi đè profile, giao khách, đặt lịch, hoặc đổi stage**. Action có thể prefill nhưng người dùng review & confirm; Undo nếu phù hợp.
- Chống nhiễu: 1 insight nổi bật mỗi khu vực; cho Dismiss/Snooze, tránh lặp lại gợi ý đã bỏ qua nếu chưa có dữ liệu mới.
- API/worker thiếu (`WORKER_URL`...) → ẩn AI action không dùng được, không để card giả hoạt động; rule-based insight vẫn có thể hiển thị ở vùng riêng.

## 8. Marketing Intelligence — đo chất lượng, không chỉ số lượng

Luồng phân tích chuẩn (nếu có attribution):

`Nguồn / Campaign → Lead → Liên hệ được → Qualified → Xem dự án → Booking → Ký HĐMB`

- Báo cáo tối thiểu: lead volume, contact rate, qualified rate, stage conversion, booking, signed; nếu có chi phí chuẩn mới hiển thị CPL / cost per qualified / CAC.
- Chọn `7/30/90 ngày`, campaign/product và attribution model nếu đủ dữ liệu. Không coi lead đến từ Facebook là doanh số do campaign tạo nếu chưa có quy tắc attribution.
- Mỗi insight chỉ ra **sự thay đổi + cỡ mẫu + giai đoạn phễu + action** (vd kiểm tra chất lượng lead từ campaign), không kết luận từ một vài leads.
- So sánh campaign trên **chất lượng khách** và kết quả; không lấy số việc/số lượt gọi làm KPI marketing chính.

## 9. Tiny team, permissions & data trust

- Mỗi khách/việc có owner rõ. Với `Khách nhóm`, xem/sửa/giao phụ thuộc quyền; **read-only phải khóa nút sửa và endpoint**, không chỉ ẩn UI.
- Hành động giao khách ghi lại ai giao, ai nhận, thời điểm; không tự thông báo/giao hàng loạt khi chưa xác nhận.
- Trùng khách theo SĐT và trùng tác vụ phải có cảnh báo/merge có kiểm soát; không tự gộp ghi chú và quyền sở hữu.
- Bảo vệ PII: chỉ hiện thông tin cần dùng, tránh log số điện thoại/ghi chú nhạy cảm vào analytics, tôn trọng xóa/opt-out/không liên hệ và phân quyền truy cập.
- Offline/sync lỗi: hiển thị trạng thái rõ, tránh tuyên bố đã lưu khi chưa đồng bộ; chống double-submit và có retry an toàn.

## 10. UX states & acceptance tests

Mỗi flow mới phải có: **idle → loading → success → error → empty/no data**; hỗ trợ back/cancel, không mất dữ liệu khi đóng sheet ngoài ý muốn. Icon-only action có accessible name; kiểm tra thao tác một tay, vùng chạm, focus/keyboard và mobile 320–430px.

### Acceptance checklist cho mỗi task

- [ ] Màn/flow trả lời đúng 1 câu hỏi chính của khu vực; thứ tự **Action → Context → Evidence**.
- [ ] Action chính thấy rõ trong viewport; click row và quick-action không xung đột.
- [ ] Nếu có suggestion: có lý do, dữ liệu đủ, hành động cụ thể; AI/automation chưa được duyệt cần confirm trước write/send. Quy tắc tự chuyển SLA đã duyệt chạy tự động, có lịch sử/thông báo/Hoàn tác hoặc Mở lại thay cho xác nhận lặp.
- [ ] Sau thao tác: phản hồi kết quả, lưu timeline/next step đúng, UI refresh và trở về đúng ngữ cảnh.
- [ ] Không làm mất/đổi logic stage, deadline, owner, permission, consent; không tự tạo business rules chưa duyệt.
- [ ] Đủ empty/loading/error/offline nếu liên quan; accessibility & responsive; visual đúng `DESIGN_SYSTEM.md`.

## 11. Hướng dẫn sử dụng 2 file khi giao việc cho coding agent

1. Đính kèm/đặt cố định **cả hai tài liệu**; nêu rõ **màn, user goal, dữ liệu sẵn có, scope, trạng thái cần test**.
2. Agent kiểm tra code thực tế và xác nhận component/handler có sẵn trước khi chỉnh; không tưởng tượng DB schema, API hoặc feature đang tồn tại.
3. Triển khai **incremental**: (a) visual token migration → (b) Focus/NBA → (c) after-call → (d) customer memory/relationship → (e) Insights/marketing → (f) AI nâng cao.
4. Khi business rule thiếu (SLA, ranking, quyền, consent, attribution), **đưa thành câu hỏi/đề xuất cấu hình**, không tự quyết định như fact.
5. Trước khi bàn giao: mô tả **files changed / UX behavior changed / tests / outstanding assumptions**; mọi ngoại lệ so với 2 file phải được ghi rõ.

**Rule of thumb:** Không thêm một thành phần chỉ vì nó làm dashboard “đầy đủ hơn”. Chỉ thêm khi nó giúp sale **quyết định, thực hiện hoặc học được cách chăm khách tốt hơn**.
