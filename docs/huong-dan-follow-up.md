# Hướng dẫn: Nhịp follow-up & Mẫu tin Zalo

Tài liệu cho chủ dự án (người dùng app). Phần 1 là cách dùng hằng ngày; phần 2 là cách tự chỉnh thông số.

---

## Phần 1 — Cách dùng hằng ngày

### Thói quen gợi ý
Mỗi sáng mở **Tổng quan** → làm lần lượt danh sách **Việc hôm nay** từ trên xuống. Gọi xong khách nào, app gợi ý luôn lần gọi sau → bấm **Lưu**. Khách đó tự rời khỏi danh sách và quay lại đúng ngày hẹn.

### 1. Sau mỗi cuộc gọi — app gợi ý lịch gọi lại
Khi ghi cuộc gọi (bấm 📞 rồi quay lại app, hoặc bấm "Ghi cuộc gọi"), chọn **kết quả** → ngay dưới hiện khung xanh:

> 📅 Gợi ý gọi lại: **Thứ Sáu 9/10, 12:00–13:00** — Gọi lại (lần 3)
> [Đặt lịch này] [Chọn giờ khác] [Không hẹn]

- **Đặt lịch này** (chọn sẵn): bấm Lưu là xong, lịch hẹn được đặt.
- **Chọn giờ khác**: lưu xong mở hộp đặt lịch để bạn tự chọn (lý do đã điền sẵn).
- **Không hẹn**: chỉ ghi cuộc gọi, không đặt lịch.

#### Khách mới — nhịp 5 lần gọi, xoay 4 khung giờ

4 khung (dùng chung toàn app — `callSlots`, D-005): **A sáng 09:00–10:00 · B trưa 11:30–12:15 · C chiều 14:30–15:30 · D tối 20:00–20:45**. Khung của 1 cuộc gọi = khung chứa (hoặc gần nhất với) giờ gọi thực tế.

| Lần gọi | Khi nào | Khoảng cách | Chọn khung | Ví dụ (đăng ký 08:00 Thứ Hai) |
|---|---|---|---|---|
| Lần 1 | Lead vừa về (chưa gọi lần nào) | Sớm nhất 15 phút sau đăng ký | Khung hợp lệ gần nhất | 09:00–10:00 T2 (A) |
| Lần 2 | Lần 1 không liên lạc được | Trong 24h từ lúc đăng ký, quanh mốc ~12h | Khác khung lần 1; ưu tiên D → C → B | 20:00–20:45 T2 (D) |
| Lần 3 | Lần 2 hỏng | Cách lần 2 ít nhất 24h | Bỏ khung lần 1, 2; ngày đầu tiên còn khung hợp lệ, ưu tiên D → C → B → A | 14:30–15:30 T4 (C) |
| Lần 4 | Lần 3 hỏng | Cách lần 3 ít nhất 48h | Khung duy nhất chưa gọi | 11:30–12:15 T7 (B) |
| Lần 5 | Lần 4 hỏng | Cách lần 4 ít nhất 96h | Khung có tỉ lệ **nói chuyện được** cao nhất trong nhật ký gọi của bạn (cần ≥5 cuộc/khung; chưa đủ dữ liệu → D → C → B → A), trừ khung giờ đăng ký | 20:00–20:45 T4 tuần sau (D) |
| Hết vòng | Lần 5 hỏng | — | Mặc định **"Loại + nhắn Zalo"**: bấm Lưu → khách tự chuyển Loại "Không liên lạc được" và mở hộp Zalo (mẫu "Gọi chưa được"). Chọn "Để sau" nếu muốn giữ. | Tự đổi trạng thái |

- Gợi ý **lần 1** hiện trong hộp Khách mới (khách chưa gọi, chưa có lịch): "📅 Gợi ý gọi lần 1: … [Hẹn gọi theo gợi ý]".
- Chủ nhật được bỏ qua (theo `skipSunday`). Lỡ tay loại → mở khách trong Khách mới (lọc Đã loại) → khôi phục như thường.

#### Khách Tiềm năng và các kết quả khác

| Kết quả cuộc gọi | App gợi ý |
|---|---|
| Không nghe máy / Thuê bao / Máy bận (khách **Tiềm năng**) | Gọi lại sau 1 → 2 → 4 → 7 ngày (lần hỏng thứ 1, 2, 3, 4…). Khung (trong 4 khung chung) chọn theo nghề nghiệp, đổi luân phiên khung chính ↔ dự phòng. |
| Cúp máy (khách Tiềm năng) | Như trên nhưng **đổi sang khung giờ còn lại**. |
| Sai số | Gợi ý loại khách (lý do "Số sai"). |
| Bận, hẹn gọi lại | Lưu xong mở hộp chọn giờ (khách tự hẹn giờ). |
| Nói chuyện được — khách mới | Hẹn sau 1 ngày: "Chốt phân loại: Đạt hay Loại". |
| Nói chuyện được — khách Đang chăm | Theo **bậc hiện tại** (bảng dưới). |
| Khách Đang chăm gọi hỏng nhiều lần | Không gợi ý loại; sau mốc 7 ngày thì cứ 7 ngày gọi 1 lần, kèm nhắc "thử nhắn Zalo". |

Nhịp theo bậc:

| Bậc | Gọi lại sau | Lý do gợi ý |
|---|---|---|
| Đang chăm sóc | 3 ngày | Gửi thêm thông tin dự án |
| Xem dự án | 2 ngày | Hỏi cảm nhận sau khi xem dự án |
| Hỗ trợ hồ sơ | 2 ngày | Nhắc giấy tờ hồ sơ còn thiếu |
| Booking | 3 ngày | Nhắc tiến độ đóng tiền / ký HĐMB |
| Kí HĐMB | 30 ngày | Chăm sóc sau bán, xin giới thiệu |

**Khung giờ khách Tiềm năng** là 1 trong 4 khung chung, chọn theo ô **Nghề nghiệp** trong hồ sơ khách — nên điền nghề cho khách để giờ gợi ý chuẩn hơn. Lịch rơi vào Chủ nhật tự dời sang Thứ Hai.

### 2. Khi đổi bậc / bấm "Đạt" — hỏi luôn lịch tiếp theo
- Sửa khách và **chuyển bậc lên** (vd Đang chăm sóc → Xem dự án), hoặc bấm **Đạt** ở nhóm Khách mới, hoặc thêm khách mới có tick "đưa thẳng vào danh sách chăm sóc" → hiện hộp **"Hẹn lần liên hệ tiếp theo?"** với ngày giờ và nội dung gợi ý (sửa được nội dung).
- Chỉ hỏi khi khách **chưa có** lịch hẹn sắp tới.

### 3. Nhóm "Chưa có việc tiếp theo" ở Tổng quan
Gom khách Tiềm năng đang chăm mà **không có lịch hẹn** và **không còn việc nào chưa xong** trong "Việc tiếp theo" (việc đã tích xong không tính). Mục tiêu: nhóm này luôn trống. Bấm tên khách → hẹn gọi hoặc thêm việc.

### 4. Mẫu tin Zalo
- Bấm **icon Zalo** của khách → hộp có nút lớn **Mở Zalo** ở trên cùng (chỉ mở chat, không copy — dùng hằng ngày). Bên dưới chỉ có **1 tin nhắn gợi ý** (tối đa 2 khi có thêm 1 tình huống rõ ràng), kèm lý do gợi ý. Bấm tin gợi ý → app copy nội dung (đã điền tên, anh/chị, dự án) và mở Zalo → bạn **dán**. Cần mẫu khác → bấm dòng nhỏ **Chọn mẫu khác**.
- Cách app chọn tin gợi ý:
  - **Khách mới** (tab Khách mới), luôn 1 tin — theo lịch sử gọi: chưa gọi / mới gọi hỏng 1–2 lần → **Chào kết bạn**; gọi hỏng liên tiếp từ 3 lần → **Gọi chưa được**; đã nói chuyện được → **Gửi thông tin / bảng giá**. Cuộc gọi tự nạp từ máy Android chưa ghi chú mà 0 giây cũng tính là gọi hỏng.
  - **Khách Đang chăm** — theo **bậc đang ở**: Đang chăm sóc → Gửi thông tin · Xem dự án → Hỏi thăm sau khi xem · Hỗ trợ hồ sơ, Booking → Nhắc giấy tờ · Kí HĐMB → Chúc mừng.
  - Thêm tin thứ 2 (chỉ với khách Đang chăm): hôm nay/mai là sinh nhật → **Chúc mừng sinh nhật** (xếp lên trước); hoặc gọi hỏng liên tiếp từ 3 lần → **Gọi chưa được**.
- Trên điện thoại Android (trình duyệt / app cài từ Chrome), nút Zalo mở **thẳng app Zalo**, không đi qua trang web zalo.me nữa. Máy chưa cài Zalo thì mới mở trang web.
- **Sửa nội dung mẫu**: menu avatar → **Mẫu tin Zalo**. Sửa tên/nội dung từng mẫu, **+ Thêm mẫu** riêng, **Xoá** mẫu tự thêm, **Khôi phục mặc định** nếu lỡ sửa hỏng. Mẫu để trống sẽ bị ẩn.
- Mọi mẫu mặc định đều tự giới thiệu: **"Em là {sale}, phòng kinh doanh dự án {du_an}"**.
- Ô tự điền trong mẫu:
  - `{ten}` → tên gọi khách (vd "Lan")
  - `{hoten}` → họ tên đầy đủ
  - `{sale}` → tên gọi của bạn = chữ cuối tên hiển thị ở menu avatar → Đồng nghiệp; chưa đặt → "Duy" (`ZALO_SENDER_NAME` trong `js/followup.js`)
  - `{du_an}` → ô "Dự án" của khách; khách chưa có dự án → cụm "dự án {du_an}" thành "nhà ở xã hội" (vd "phòng kinh doanh nhà ở xã hội")
  - Xưng hô `anh/chị` → giới tính **Nam → "anh"**, **Nữ → "chị"**, chưa rõ / khác → giữ **"anh/chị"** (cả "Anh/chị" đầu câu).
- Mẫu bạn chưa từng sửa tự lên nội dung mới; mẫu đã tự sửa giữ nguyên (muốn dùng bản mới → **Khôi phục mặc định**).
- Mẫu **Nhắc giấy tờ hồ sơ** có dấu `…` — sau khi dán vào Zalo, điền giấy tờ còn thiếu và hạn nộp.

---

## Phần 2 — Tự chỉnh thông số

Tất cả thông số nằm ở **đầu file `js/followup.js`**, khối `FOLLOWUP_CONFIG`. Mỗi dòng có chú thích tiếng Việt. Sửa xong → commit & push lên GitHub → Cloudflare tự deploy (vài phút) → mở lại app.

> Cách dễ nhất: nhờ AI (Claude/Codex) "sửa js/followup.js: …" theo ví dụ dưới. Nội dung mẫu tin thì **không cần sửa file** — sửa ngay trong app.

### ★ Khung giờ gọi dùng chung toàn app — `callSlots` (D-005)
```js
callSlots: {
  A: { range: '09:00-10:00', name: 'Sáng' },
  B: { range: '11:30-12:15', name: 'Trưa' },
  C: { range: '14:30-15:30', name: 'Chiều' },
  D: { range: '20:00-20:45', name: 'Tối' },
},
```
> **Nguyên tắc (D-005): mọi gợi ý hẹn gọi và preset giờ trong app phải dùng chung 4 khung này.** Sửa 1 khung ở đây là tự đổi ở: nút giờ trong hộp **Hẹn gọi**, nút giờ trong hộp **Thêm việc**, gợi ý sau cuộc gọi (khách mới + Tiềm năng), gợi ý khi đổi bậc / bấm Đạt, gợi ý gọi lần 1. Không khai báo khung giờ riêng ở chỗ khác; tính năng mới cần giờ gọi → đọc từ `callSlots` (`FOLLOWUP.callSlots()`).
- Đổi giờ: sửa `range` (dạng `GG:PP-GG:PP`, 24 giờ). Đổi chữ trên nút: sửa `name`. Thêm/bớt khung: thêm/xoá 1 dòng (mã A/B/C/D… là tên nội bộ; nhớ chỉnh `leadPriority` và `occupationSlots` cho khớp).

### Nhịp gọi khách mới — `leadPriority`, `leadGapHours`…
```js
leadPriority: ['D', 'C', 'B', 'A'],  // thứ tự ưu tiên khi chọn khung
leadFirstCallMinutes: 15,            // lần 1 sớm nhất 15 phút sau khi lead về
leadSecondWithinHours: 24, leadSecondTargetHours: 12,  // lần 2: trong 24h, quanh mốc +12h
leadGapHours: [24, 48, 96],          // lần 3, 4, 5 cách lần trước ít nhất…
leadBestSlotMinCalls: 5,             // khung cần ≥5 cuộc mới tính "phản hồi tốt nhất" (lần 5)
leadMaxAttempts: 5,                  // hỏng 5 lần liên tiếp → hết vòng (Loại + nhắn Zalo)
```

### Khách Tiềm năng: khung theo nghề nghiệp — `occupationSlots`
```js
occupationSlots: {
  'Tự do':           { main: 'A', alt: 'C' },  // sáng / chiều
  'Công ty, DN':     { main: 'B', alt: 'D' },  // trưa / tối
  'Công, viên chức': { main: 'B', alt: 'D' },
  'Công an, Bộ đội': { main: 'B', alt: 'D' },
  '':                { main: 'A', alt: 'D' },  // chưa rõ nghề
},
```
- `main` = khung chính, `alt` = khung dự phòng — ghi **mã khung** trong `callSlots`, không ghi giờ.
- Kinh nghiệm chọn khung: công nhân / nhân viên công ty → trưa hoặc tối; công chức → trưa hoặc tối (tránh đầu giờ sáng); công an, bộ đội → trưa hoặc tối; tự do / kinh doanh → sáng hoặc chiều. Không gọi sau 21:00 hoặc trước 8:00.
- Ví dụ: công nhân KCN hay nghe máy buổi tối → đổi `'Công ty, DN'` thành `{ main: 'D', alt: 'B' }`.

### Nhịp gọi lại khách Tiềm năng khi không liên lạc được
```js
missDelaysDays: [1, 2, 4, 7],   // lần hỏng 1 → 1 ngày, lần 2 → 2 ngày, lần 3 → 4, lần 4 → 7
qualifiedMissRepeatDays: 7,     // sau các mốc trên cứ 7 ngày gọi 1 lần
```
- Muốn dồn dập hơn: `[0, 1, 2, 4]` (0 = gọi lại ngay trong hôm nay nếu khung giờ chưa qua, đã qua thì sang mai).
- Muốn bớt làm phiền: `[2, 4, 7, 14]`.
- (Khách mới dùng nhịp riêng ở mục trên; `leadMaxAttempts` cũng là ngưỡng hiện gợi ý "Loại" trong hộp Khách mới.)

### Khách mới đã nói chuyện được
```js
leadTalkedDays: 1,
leadTalkedReason: 'Chốt phân loại: Đạt hay Loại',
```

### Nhịp theo bậc — `stages`
```js
'Xem dự án': { days: 2, reason: 'Hỏi cảm nhận sau khi xem dự án' },
```
Đổi `days` (số ngày) hoặc `reason` (lý do hiện ở lịch hẹn). Xoá cả dòng → bậc đó không gợi ý.

### Bỏ qua Chủ nhật
`skipSunday: true` → lịch rơi vào Chủ nhật dời sang Thứ Hai. Đặt `false` nếu bạn làm cả Chủ nhật (NOXH khách hay đi xem dự án cuối tuần).

### Mẫu Zalo gợi ý theo tình huống
```js
leadMissedTemplateAfter: 3,       // khách MỚI gọi hỏng liên tiếp ≥ 3 lần → gợi ý "Gọi chưa được"
qualifiedMissedTemplateAfter: 3,  // khách TIỀM NĂNG gọi hỏng ≥ 3 lần → thêm "Gọi chưa được" làm tin thứ 2 (0 = tắt)
birthdayTemplateDays: 1,          // khách TIỀM NĂNG: 0 = chỉ đúng ngày sinh nhật, 1 = hôm nay hoặc mai
stageTemplate: { 'Xem dự án': 'sau_xem', ... },  // khách TIỀM NĂNG: bậc → mã mẫu
```
Mã mẫu: `chao`, `goi_nho`, `thong_tin`, `sau_xem`, `nhac_ho_so`, `sinh_nhat`, `chuc_mung`. Mẫu tự thêm trong app có mã dạng `u_…` (không gắn vào gợi ý tự động được, chỉ chọn tay).

### Ngưỡng ở Tổng quan (trong `js/app.js`, cạnh `dashActionGroups`)
- `DASH_IDLE_WARM_DAYS = 14` — khách Đang chăm bao lâu chưa liên hệ thì vào nhóm "lâu chưa chăm".
- `DASH_LEAD_RETRY_H = 24` — khách mới gọi chưa được bao lâu thì vào nhóm "Gọi lại".
- `DASH_BIRTHDAY_DAYS = 7` — nhắc sinh nhật trong mấy ngày tới.
- "Khách nóng" (≥ 60%) và "nguội sau 7 ngày" dùng chung với chuông thông báo: `hotInterestMin`, `idleDays` trong `js/notifications.js`.

---

## Cài đặt một lần
Chạy `SQL/add_zalo_templates.sql` trên Supabase (SQL Editor → dán → Run) để **mẫu tin đồng bộ giữa MacBook và Android**. Chưa chạy thì app vẫn dùng được, nhưng mẫu sửa trên máy nào chỉ nằm ở máy đó (riêng mẫu "Chào kết bạn" vẫn đồng bộ như cũ).
