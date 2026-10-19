# Sổ Khách — UX Guidelines v2

> **Version:** 2.0 · 2026-10-16 · **Quyết định:** D-013 (IA), D-015 (tín hiệu), D-010 (thời hạn), D-008 (tự chuyển SLA).
> **Companion:** `DESIGN_SYSTEM.md` (giao diện). File này quy định **trải nghiệm, thứ tự thông tin, luồng và số chạm**; không định nghĩa màu. Phạm vi tính năng: `PRD.md`.

## 0. North Star

**CRM = bàn làm việc hành động, không phải dashboard báo cáo.** Mỗi màn trả lời: *Làm gì tiếp? Vì sao? Làm bằng 1–2 chạm thế nào? Xong rồi hệ thống nhớ gì và đề xuất gì?*

Thứ tự ưu tiên (mục trên thắng khi xung đột):

1. **What to do next** — hành động cụ thể, làm được ngay.
2. **Chất lượng chăm sóc** — đúng nhịp, đúng lời hứa, học từ dữ liệu.
3. **Gợi ý ready-to-action** — có lý do + bằng chứng + nút làm luôn.
4. **Trí nhớ khách** — lưu bền để chăm và retarget sản phẩm khác.
5. **Hiệu quả marketing** — chất lượng nguồn qua cả phễu.

Nguyên tắc cốt lõi: **Action > Context > Evidence > Analytics.** Ít chạm, ít nhập lại, ít quyết định thừa. Không đánh đổi tính đúng dữ liệu lấy tự động hoá.

## 1. Luật tương tác chung

- **Một bước rõ ràng:** mỗi vùng 1 CTA chính; lựa chọn khác ở secondary/overflow.
- **Show why:** mọi ưu tiên/gợi ý có lý do ngắn từ dữ liệu (hạn, lần liên hệ, bậc, ghi chú) và đường mở chi tiết.
- **Hành động ở nơi đang nhìn:** Gọi/Zalo/Ghi chú/Hẹn có mặt trên dòng hàng đợi, dòng danh sách, hồ sơ (thanh dính), command palette — không bắt mở hồ sơ để gọi.
- **Không suy diễn kết quả:** bấm Gọi ≠ đã nói chuyện; mở Zalo ≠ đã gửi. Kết quả do sale xác nhận (1 chạm) hoặc nhật ký máy Android.
- **Có thể hoàn tác:** thao tác không phá huỷ → Toast Hoàn tác 5 giây; phá huỷ (xoá, loại hàng loạt) → xác nhận rõ.
- **Tự động hoá theo quy tắc đã duyệt (D-008, D-010):** quá hạn mức SLA ở giai đoạn có cấu hình tự chuyển → app tự chuyển + tạo lịch theo quy tắc, không hỏi lại từng lần; luôn có lịch sử, thông báo, Hoàn tác/Mở lại. Không tự mở rộng automation sang giai đoạn/hành động chưa duyệt.
- **AI chỉ đề xuất:** không tự gửi tin, gọi, ghi đè hồ sơ, đổi bậc, giao khách, đặt lịch. Đề xuất được điền sẵn, sale duyệt 1 lần.
- **Giữ ngữ cảnh:** quay lại giữ cuộn/lọc/tab; xong việc → tự tiến tới việc kế; mở hồ sơ từ Hôm nay có đường về Hôm nay.
- **Không trí tuệ giả:** chỉ số, %, giờ gọi tốt, gợi ý phải có dữ liệu + phương pháp; thiếu → "Chưa đủ dữ liệu".
- **Offline là bình thường:** mọi ghi đều lưu local ngay, hiện "Chờ đồng bộ"; không chặn thao tác vì mất mạng (trừ AI, tải tài liệu).

## 2. Kiến trúc thông tin (D-013)

| Khu vực | Câu hỏi | Nội dung |
|---|---|---|
| **Hôm nay** (tab 1, mặc định) | Tôi làm gì ngay? | NBA → sức làm khung hiện tại → hàng đợi (Ưu tiên · Khách mới · Lời hứa · Cơ hội) → 1 tín hiệu cơ hội → Phiên gọi; tối: Tổng kết ngày |
| **Khách hàng** (tab 2) | Tôi biết gì về khách? | Tiềm năng · Khách mới · Tệp & Retarget · Khách nhóm (chỉ khi có nhóm); lọc, sắp xếp, tệp đã lưu |
| **＋ Ghi nhanh** (giữa) | Ghi lại điều gì? | Khách mới (SĐT + tên) · Ghi chú/giọng nói · Việc/lời hứa · Chụp phiếu (OCR); theo ngữ cảnh đang xem |
| **Công việc** (tab 3) | Toàn bộ cam kết? | Quá hạn · Hôm nay · 7 ngày · Sau đó · Chưa có hạn · Đã xong; lọc loại việc và **Em hứa / Khách hẹn** |
| **Hiệu quả** (tab 4) | Tôi chăm/bán/marketing tốt chứ? | Chăm sóc · Phễu · Marketing |
| **Hồ sơ khách** | Khách này cần gì, bước tiếp? | Xem §5 |
| **Command palette** (Cmd/Ctrl+K, ô tìm header) | Đi đâu/làm gì nhanh? | Tìm khách, lệnh, màn — **nơi tìm kiếm duy nhất** |
| **Tiện ích** (menu avatar) | Công cụ ít dùng | Giỏ hàng, Tính vay, Mẫu tin Zalo, Nhóm, Nhập/Xuất, Cài đặt AI, Chi phí campaign, Giao diện |

Desktop ≥1024px: rail trái thay bottom nav, chọn dòng mở hồ sơ ở panel phải (không rời danh sách).

## 3. Ngân sách số chạm (bắt buộc nghiệm thu)

Tính từ màn đang đứng tới khi dữ liệu đã lưu local. "Gõ" không tính chạm.

| Hành động | Tối đa | Luồng chuẩn |
|---|---|---|
| Gọi khách đang ở Hôm nay / danh sách | **1** | Nút Gọi trên dòng (Android vỏ: gọi thẳng) |
| Ghi kết quả "không nghe máy" + lịch gọi lại | **2** | Sheet sau gọi tự mở → chọn kết quả (lịch gợi ý đã chọn sẵn) → Lưu |
| Ghi "nói chuyện được" + ghi chú + bước tiếp | **3** + gõ/nói | Kết quả → ghi chú → Lưu (bước tiếp điền sẵn; AI diff tick tuỳ chọn) |
| Nhắn Zalo theo mẫu + ghi lại | **3** | Zalo → (mẫu gợi ý chọn sẵn) Sao chép & mở → quay lại: Đã gửi |
| Thêm ghi chú cho khách đang xem | **2** + gõ | Ghi chú → Lưu |
| Ghi chú từ bất kỳ đâu | **3** + gõ | ＋ → Ghi chú → chọn khách (gợi ý khách vừa xem/gọi) → Lưu |
| Hẹn gọi lại | **2** | Hẹn → (ngày + khung gợi ý sẵn) Lưu; đổi khung = +1 |
| Hoàn tất việc | **1** | Tích/vuốt → Toast Hoàn tác |
| Thêm khách nhanh | **2** + gõ | ＋ → Khách mới (SĐT, tên; nguồn = lần trước) → Lưu |

Ưu tiên giảm chạm bằng: **điền sẵn theo quy tắc** (`FOLLOWUP`, mẫu Zalo gợi ý, khách ngữ cảnh), **gộp bước** (kết quả + ghi chú + lịch trong 1 sheet), **cử chỉ** (vuốt), **nhớ lựa chọn gần nhất**. Không giảm chạm bằng cách bỏ xác nhận ở thao tác có hậu quả (gửi, xoá, giao).

## 4. Hôm nay — chuẩn màn

1. **Header gọn:** lời chào + 1 dòng tóm tắt ("12 việc · ~95 phút · 2 quá hạn"). Không 4 KPI lớn.
2. **Gọi tiếp (D-023):** không còn thẻ NBA riêng — thẻ đầu tiên của nhóm gấp nhất chính là việc đứng đầu registry tín hiệu (D-015); `SessionBar` "Gọi lần lượt N khách" ngay trên. Hết việc → "Đã xử lý các việc ưu tiên" + gợi ý hữu ích (tệp retarget, khách nguội), không tạo việc giả.
3. **Sức làm:** 1 dòng gọn dưới tóm tắt, **chỉ hiện khi Y > X** (D-023). Khung `callSlots` hiện tại còn X phút; việc trong hàng ước Y phút (phút/loại việc ở `config/capacity.ts`). Y > X → đề xuất "Dời N việc P2 sang khung kế" (1 chạm, giữ `due_original`, có Hoàn tác). Hẹn có giờ cụ thể với khách không bao giờ bị dời tự động.
4. **Hàng đợi (D-023):** chia theo nhóm tín hiệu `SIGNAL_GROUPS` (quá giờ hẹn, khách mới chưa gọi, gọi lại, việc hôm nay, chưa ghi kết quả…), mỗi nhóm có tiêu đề + số. Nhóm gấp nhất hiện thẻ đầy đủ (tên + nút Gọi; lần gọi gần nhất, số lần gọi, ghi chú cuối, SLA), nhóm sau hiện thẻ gọn; nhóm ít gấp thu thành dòng link. Bỏ 4 tab lọc cũ và nhãn P0 trên giao diện (mức P0/P1/P2 vẫn dùng để **sắp xếp**). Tổng số ≠ mức khẩn.
5. **Phiên gọi:** "Bắt đầu phiên gọi (N khách · ~M phút)" → lần lượt Brief → Gọi → Sheet sau gọi → Tiếp; có Bỏ qua (chọn lý do) và Dừng.
6. **Một tín hiệu cơ hội** (S12/S13/S14…) dạng SignalCard, không chen trên việc gấp.
7. **Tối (sau khung cuối):** Tổng kết ngày — lời hứa giữ/trễ, cuộc gọi chưa ghi, ghi chú chưa đồng bộ, việc mai.

**Mức ưu tiên tín hiệu:** P0 = quá hạn/đến hạn cam kết, khách mới trong SLA, hồ sơ Booking quá hạn; P1 = đến hạn hôm nay, follow-up đã cam kết, cơ hội có bằng chứng mới; P2 = nuôi dưỡng, bổ sung thông tin. Trong cùng mức: hạn sớm hơn → bậc sâu hơn → liên hệ cuối lâu hơn. Không suy "khách nóng" từ AI.

**Thời hạn (D-010) — một định nghĩa:** mọi màn đọc `countdownTag`. Việc có giờ: từ mốc tới mốc +30 phút là "đến hạn", sau đó "quá hạn". Hẹn gọi: tới hết khung +30 phút (không có giờ kết thúc dùng giờ bắt đầu). Việc cả ngày: đến hạn suốt ngày, quá hạn từ 00:00 hôm sau. Đây là thời hạn công việc, khác hạn mức SLA phễu.

**Card contract (D-023):** mỗi thẻ 1 nút hành động hiện ra; chạm thẻ = mở ngữ cảnh (sheet Brief/hồ sơ); nút Gọi = gọi; tránh gọi nhầm khi chạm dòng. Sau thao tác: phản hồi → cập nhật hàng → giữ vị trí cuộn.

## 5. Hồ sơ khách — quan hệ + trí nhớ

Thứ tự trên mobile: **Header** (tên, bậc + vòng SLA, sức khoẻ, nguồn) → **Bước tiếp theo/lời hứa** → **Brief** → tab dính `Dòng thời gian · Trí nhớ · Nhu cầu & căn · Tài liệu · Tính vay` → **ActionBar dính đáy** (Gọi · Zalo · Ghi chú · Hẹn).

- **Brief 20 giây** (rule-based, offline): mua để · cần gì · tài chính (vốn/vay) · người quyết định · phản đối gần nhất · lời hứa mở · lần liên hệ cuối. Thiếu → "Chưa biết" + câu nên hỏi (tối đa 2). AI Brief là lớp diễn đạt có nguồn, không thay rule Brief.
- **Trí nhớ** (thu thập dần, không bắt nhập đủ): Định danh & liên hệ (kênh/khung ưa thích, không liên hệ) · Ý định (mục đích, dự án, loại căn, khu vực) · Khả năng (vốn, vay, trả hàng tháng, thời điểm mua) · Hộ gia đình/người quyết định · Hồ sơ nâng cao v1 · Vòng đời (bậc, lý do, booking, lý do kết thúc, điều kiện retarget). Mỗi fact hiện nguồn + độ mới; > 90 ngày → "Cần xác nhận"; dữ liệu cũ không được dùng làm fact để tự phân loại.
- **Nhu cầu theo đợt:** mỗi đợt quan tâm 1 dòng (dự án, loại căn, ngân sách, trạng thái); căn khớp hiện ngay dưới với lý do "khớp/vướng".
- **Dòng thời gian hợp nhất:** cuộc gọi, Zalo/gặp, ghi chú, đổi bậc (kể cả tự động — có nhãn), việc xong, AI đã duyệt; lọc theo loại.
- **Khách mới (lớp 1):** sheet gọn — nhịp gọi 5 lần (`FOLLOWUP`), nút Đạt (cần ≥1 "nói chuyện được") / Loại (lý do mã D-001).
- **Kết thúc (Loại/Nuôi dài hạn ở lớp 2):** chọn lý do (1 chạm) + điều kiện retarget tuỳ chọn (ngày, giá, loại căn) — để tệp retarget và tín hiệu S13 dùng lại.

## 6. Tín hiệu & gợi ý — ready to action (D-015)

Một pattern ở mọi nơi: **Tín hiệu → Bằng chứng → Hành động đề xuất → Làm / Hoãn / Ẩn.**

- **Rule (SignalCard):** suy từ hạn, hoạt động, bậc, giỏ hàng. Không gắn nhãn AI.
- **AI (AIBlock):** chỉ diễn giải/soạn nháp cho một tín hiệu hoặc khách cụ thể; nêu nguồn ("3 ghi chú gần nhất"); phân biệt dữ liệu thật / suy luận.
- Mỗi tín hiệu: lý do ngắn, số liệu có cỡ mẫu, thời điểm dữ liệu, CTA cụ thể (`Gọi`, `Soạn tin`, `Hẹn`, `Xem 5 khách`). Không lời khuyên chung chung.
- Chống nhiễu: tối đa 1 tín hiệu cơ hội nổi bật mỗi khu vực; Ẩn/Hoãn được nhớ (`user_settings.ui_state`); tín hiệu đã ẩn chỉ quay lại khi có dữ liệu mới.
- Worker/AI không có (`VITE_WORKER_URL` trống, offline) → ẩn hành động AI; tín hiệu rule vẫn chạy.

## 7. Luồng chuẩn

**Sau cuộc gọi** (tự mở khi quay lại app, hoặc từ "cuộc gọi chưa ghi"):
`Kết quả (1 chạm) → [ghi chú gõ/giọng nói] → [AI trích trường: diff tick] → Bước tiếp theo (điền sẵn từ FOLLOWUP, đổi được) → Lưu → khách kế (trong phiên gọi)`

| Kết quả | Mở thêm | Bước tiếp theo mặc định |
|---|---|---|
| Nói chuyện được | Ghi chú, AI trích, đổi bậc/quan tâm (chỉ khi sale chọn) | `FOLLOWUP.forStage` theo bậc |
| Không nghe / thuê bao / máy bận / cúp máy | — | `FOLLOWUP.afterCall` (lead: nhịp 5 lần; tiềm năng: 1→2→4→7 ngày, xoay khung) |
| Bận, hẹn gọi lại | Chọn giờ khách hẹn (bắt buộc xác nhận) | Hẹn đúng giờ khách nói |
| Sai số / không phù hợp | Lý do | Lead: gợi ý Loại; tiềm năng: gợi ý kết thúc + điều kiện retarget |

**Zalo:** Zalo → mẫu gợi ý (`FOLLOWUP.suggestTemplate`) đã điền biến → sửa nếu cần → Sao chép & mở Zalo → quay lại: "Đã gửi?" Có/Không → ghi `interactions`. Khách "không liên hệ" → chặn, hiện lý do.

**Ghi chú / giọng nói:** nhập → Lưu ngay (local) → AI (nếu bật, có mạng) trả đề xuất → hộp duyệt. Ghi chú không bao giờ mất vì AI lỗi.

**Lời hứa:** khi tạo việc chọn `Em hứa` / `Khách hẹn` (mặc định theo câu: AI/rule gợi ý). Dời hạn → chọn lý do nhanh, giữ hạn gốc.

**Đổi bậc:** chọn bậc → ghi chú tuỳ chọn → gợi ý lịch theo bậc (1 chạm nhận). Ký HĐMB = nút xác nhận riêng.

**Retarget:** Tệp (lọc hoặc chọn sản phẩm) → danh sách có lý do khớp → chọn khách → mẫu tin có biến sản phẩm → lần lượt Sao chép & mở Zalo → Đã gửi → tự tạo follow-up. Không gửi hàng loạt tự động.

**Giao khách (D-003):** chọn người nhận → theo dõi hay giao hẳn → xác nhận; ghi ai giao/ai nhận/lúc nào.

## 8. Hiệu quả — đo để cải thiện

- **Chăm sóc:** tốc độ gọi lần đầu, tỉ lệ liên lạc được, nghe máy theo khung, phủ bước tiếp theo, giữ lời hứa, cam kết quá hạn, tuổi giai đoạn vs SLA, nhịp chạm, chuyển đổi theo số lần chạm (định nghĩa: `PRD.md` F-07). Mỗi chỉ số dẫn tới danh sách khách cần xử lý.
- **Phễu:** 5 giai đoạn + milestone, tốc độ vs SLA, chuyển đổi có mẫu số, lý do kết thúc, cohort.
- **Marketing:** `Nguồn/Campaign/Form → Lead → Hợp lệ → Liên lạc được → Đạt → Xem dự án → Booking → Ký HĐMB`; chi phí → CPL/chi phí mỗi Đạt/Booking chỉ khi đã nhập chi phí; tình trạng đường thu lead.
- Mọi số: **tử / mẫu / kỳ / nguồn**; chia 0 → "—"; mẫu nhỏ → cảnh báo; kỳ 7/30/90 ngày; cohort phải đủ thời gian theo dõi. Không quy lỗi cá nhân từ một chỉ số; không kết luận nhân quả.
- **Bài học tuần:** ≤3 phát hiện (rule, đủ ngưỡng mẫu) + hành động; AI chỉ diễn giải số đã tính.

## 9. Nhóm, quyền, tin cậy dữ liệu

- Mỗi khách/việc có người phụ trách rõ. Khách nhóm chỉ xem → nút sửa bị khoá **và** repository chặn (`assertWritable`), không chỉ ẩn UI.
- Trùng khách (SĐT chuẩn hoá) → cảnh báo trước khi lưu + gộp có duyệt (giữ mọi lịch sử, nguồn, xoá mềm bản thừa). Không tự gộp.
- PII: chỉ hiện thông tin cần; không gửi SĐT cho AI; tôn trọng "không liên hệ"; xuất dữ liệu chỉ cho người có quyền.
- Đồng bộ: trạng thái rõ (chờ/đã/lỗi + thử lại); không nói "đã lưu lên máy chủ" khi mới lưu local; chống bấm lặp.

## 10. Trạng thái & nội dung chữ

- Mỗi luồng có: idle → loading → success → error → empty/no data; back/cancel; không mất dữ liệu khi đóng sheet ngoài ý muốn (bảo vệ bản nháp).
- Giọng chữ: ngắn, động từ trước ("Gọi chị Lan", "Dời sang 20:00"), xưng hô trung tính; số/giờ theo định dạng Việt (14:30, 12/10, 2,8 tỷ).
- Thuật ngữ thống nhất: *Khách mới* (lớp 1) · *Tiềm năng* (lớp 2) · *Bước tiếp theo* · *Lời hứa* (Em hứa / Khách hẹn) · *Hẹn gọi* · *Phiên gọi* · *Tín hiệu* · *Gợi ý AI* · *Tệp khách* · *Nuôi dài hạn* · *Đã mua* · *Không chốt*.

## 11. Checklist nghiệm thu UX (mỗi task)

- [ ] Màn trả lời đúng 1 câu hỏi chính; thứ tự Action → Context → Evidence.
- [ ] Đạt ngân sách chạm §3 cho hành động liên quan (đếm trên mobile).
- [ ] Gợi ý có lý do + bằng chứng + CTA; AI/automation chưa duyệt phải qua duyệt trước khi ghi/gửi.
- [ ] Sau thao tác: phản hồi, lưu đúng timeline/bước tiếp, cập nhật UI, về đúng ngữ cảnh, có Hoàn tác khi phù hợp.
- [ ] Không đổi logic bậc/hạn/owner/quyền/consent; không tạo business rule chưa duyệt.
- [ ] Đủ empty/loading/error/offline; truy cập & responsive; giao diện đúng `DESIGN_SYSTEM.md`.

**Rule of thumb:** chỉ thêm thành phần khi nó giúp sale **quyết định, thực hiện hoặc học cách chăm khách tốt hơn**.
