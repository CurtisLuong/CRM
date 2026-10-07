# Lộ trình "sale-focus" — tham chiếu CRM nổi tiếng (2026-10-07)

> Đây là **đề xuất**, chưa phải yêu cầu đã duyệt (giống `FEATURE_IDEAS.md`). Bước 1 (dashboard) đã làm; các bước sau cần chủ dự án chọn trước khi code. Mục nào cần migration được ghi rõ.

## 1. Các CRM tham chiếu làm gì hay

| CRM | Điểm mạnh nên học | Không nên chép |
|---|---|---|
| **Follow Up Boss** | *Smart Lists*: danh sách tự cập nhật "ai cần gọi hôm nay" (lead mới, quá hạn follow-up, có hoạt động mới). *Speed to lead*: đo thời gian từ lúc lead vào tới lần liên hệ đầu — chỉ số liên quan nhất tới tỉ lệ chốt. *Action Plans*: chuỗi nhắc việc tự động theo kịch bản. Khuyến nghị thói quen 30 phút follow-up mỗi sáng. | Email/SMS hàng loạt kiểu Mỹ. |
| **Salesforce** | Pipeline theo bậc có giá trị deal, *Next Step* bắt buộc trên mỗi cơ hội, *Closed Lost Reason*, báo cáo tỉ lệ chuyển đổi giữa các bậc, *Contact Roles* (ai là người quyết định). | Độ phức tạp, phân quyền nhiều tầng. |
| **LionDesk** | Nhắc việc + nhắc sinh nhật/kỷ niệm, chiến dịch chăm sóc tự động (drip), phân nhóm khách, theo dõi giao dịch sau khi chốt. | Video email, power dialer. |
| **Meey CRM** (VN) | Quản lý khách + **nguồn hàng** + **nhu cầu** và tự đề xuất ghép khách ↔ hàng; quản lý đầu việc, lịch hẹn, lịch sử tương tác; làm việc nhóm; báo cáo quỹ hàng/khách/công việc. | Sàn giao dịch, mua bán thổ cư (không hợp NOXH). |

Kết luận chung: CRM mạnh cho môi giới không thắng nhờ biểu đồ, mà nhờ **trả lời được câu "hôm nay gọi ai, nói gì"** và **không để khách nào rơi rớt**. App hiện đã có nền tốt (2 lớp khách, nhật ký gọi, lịch hẹn, giỏ hàng + ghép căn, tính vay) — thiếu chủ yếu là *nhịp follow-up tự động* và *thông tin đủ điều kiện NOXH*.

## 2. Bước 1 — Tổng quan thành "bàn làm việc" (ĐÃ LÀM 2026-10-07)

Không cần migration, chỉ dùng dữ liệu đang có:

- 4 chỉ số nhanh: Việc cần làm (kèm số quá giờ hẹn) · Khách mới chờ gọi (kèm tốc độ gọi lần đầu) · Cuộc gọi tuần này · Chốt tháng này.
- **Việc hôm nay** (kiểu Smart Lists), theo ưu tiên: đến/quá giờ hẹn gọi → hẹn còn lại hôm nay → khách mới chưa gọi → gọi lại khách chưa liên lạc được (sau 24h) → đã nói chuyện nhưng chưa phân loại → cuộc gọi chưa ghi chú → khách nóng đang nguội (≥7 ngày) → tiềm năng lâu chưa chăm (≥14 ngày) → sinh nhật 7 ngày tới. Khách đã có lịch hẹn tương lai không bị nhắc trùng. Mỗi dòng có nút gọi (tự mở hộp ghi cuộc gọi khi quay lại).
- Lịch hẹn 7 ngày tới · Pipeline đang chăm theo bậc (số khách, số khách nóng, tổng giá căn; bấm để lọc danh sách) · Hiệu suất tuần so với tuần trước + tốc độ gọi khách mới (trung vị 30 ngày, % gọi trong 1 giờ).
- Biểu đồ báo cáo cũ (phễu, khách mới theo tuần, mức quan tâm, căn hộ quan tâm) + mới **Nguồn khách** (số khách & % lên Tiềm năng theo kênh) chuyển vào mục **Phân tích & báo cáo** thu gọn.

## 3. Đề xuất các bước tiếp theo (theo thứ tự giá trị / công sức)

### Bước 2 — Nhịp follow-up tự động (không cần migration)
- **Gợi ý lịch gọi lại sau mỗi cuộc gọi** theo kết quả: không nghe máy → +1 ngày, rồi 2 → 4 → 7 ngày; "bận, hẹn lại" → hỏi giờ; sau "Xem dự án" → +2 ngày. Sale chỉ cần bấm xác nhận. (Tương tự Action Plans của FUB.)
- **Mỗi khách đang chăm phải có "việc tiếp theo"** (Next Step của Salesforce): thêm nhóm "Khách chưa có việc tiếp theo" vào Việc hôm nay.
- **Nhiều mẫu tin Zalo theo tình huống** (chào lần đầu, gửi bảng giá, nhắc hồ sơ, chúc sinh nhật, chúc mừng nhận nhà) — mở rộng "Lời chào Zalo" hiện có. Có thể cần thêm cột ở bảng settings → kiểm tra trước.

### Bước 3 — Thu thập thông tin đúng cho NOXH (cần migration, nên làm sớm)
Đây là phần "qualification" — với NOXH, khách **có đủ điều kiện hay không** quan trọng hơn mức quan tâm. Đề xuất thêm vào hồ sơ (cho phép trống, thu thập dần):

| Nhóm | Field đề xuất | Vì sao |
|---|---|---|
| Điều kiện NOXH | Nhóm đối tượng (công nhân KCN, CB-CC-VC, LLVT, thu nhập thấp…); tình trạng nhà ở hiện tại (chưa có nhà / diện tích bình quân thấp); đã từng hưởng chính sách nhà ở chưa; điều kiện thu nhập (đạt / chưa rõ / không đạt) | Loại sớm khách không đủ điều kiện, tránh mất công ở bậc "Hỗ trợ hồ sơ". Ngưỡng cụ thể theo quy định hiện hành — cần kiểm tra lại khi làm. |
| Hồ sơ | Checklist giấy tờ có trạng thái (chưa có / đang làm / đã đủ): xác nhận đối tượng, xác nhận thực trạng nhà ở, xác nhận thu nhập, CCCD, giấy kết hôn/độc thân… | Bậc "Hỗ trợ hồ sơ" thường là nút thắt; dashboard có thể nhắc "hồ sơ còn thiếu X". Gắn với mục Tài liệu đã có. |
| Đợt mở bán | Đã nộp hồ sơ dự án nào, ngày nộp, số thứ tự, kết quả xét duyệt/bốc thăm | Đặc thù NOXH: nộp hồ sơ ≠ mua được. Nhắc theo mốc của chủ đầu tư. |
| Tài chính | Vốn tự có; cần vay (có/không, % ); ngân hàng dự kiến; lưu kết quả Tính vay vào hồ sơ | Nối module vay với khách — trả lời ngay "khách có kham nổi không". |
| Quyết định | Người cùng quyết định (vợ/chồng, bố mẹ) + SĐT; thời điểm dự kiến mua (0–3 / 3–6 / >6 tháng) | Contact Roles (Salesforce) + timeframe (FUB) — ưu tiên đúng người, đúng lúc. |
| Kết quả | Lý do không chốt ở lớp Tiềm năng (giá, không đủ điều kiện, mua dự án khác, tài chính, gia đình phản đối…) | Hiện chỉ lớp Khách mới có lý do loại; thiếu dữ liệu để biết vì sao mất deal. |
| Giới thiệu | Ai giới thiệu khách này (liên kết tới khách khác) | Đo giá trị của khách cũ; nền cho bước 4. |

### Bước 4 — Sau bán & khách giới thiệu (một phần cần migration)
- Mốc sau chốt: ngày ký HĐMB, ngày bàn giao, kỷ niệm nhận nhà → tự nhắc chăm sóc và xin giới thiệu (kiểu LionDesk).
- Hoa hồng dự kiến / đã nhận theo deal + **mục tiêu tháng** (số chốt, số cuộc gọi/ngày) hiển thị tiến độ trên Tổng quan.

### Bước 5 — Nhóm nhỏ (khi có đồng nghiệp dùng)
- Chia lead mới cho sale (luân phiên hoặc theo dự án), bảng xếp hạng hoạt động cho admin, xem Việc hôm nay của từng người. RLS/role admin đã có nền; cần thiết kế quyền cẩn thận trước khi làm.

### Bước 6 — Tự động hoá đầu vào
- Đẩy lead Facebook Lead Ads / landing page vào thẳng Supabase + thông báo ngay (tốc độ gọi lần đầu). Landing page đã ghi thẳng; Facebook Lead Ads và Zalo OA là bước tiếp.

## 4. Việc không nên làm (giữ app đơn giản)
Email marketing hàng loạt, video email, power dialer, chấm điểm AI phức tạp, multi-tenant — không hợp quy mô 1 sale / nhóm nhỏ và kênh liên lạc chính ở VN (gọi điện + Zalo).

## Nguồn
- Follow Up Boss — Agent productivity: https://www.followupboss.com/how-it-works/agent
- Hướng dẫn Smart Lists / báo cáo FUB: https://followupace.com/learn/follow-up-boss-automation/smart-list-workflows/ · https://followupace.com/blog/ultimate-guide-to-performance-reporting-in-follow-up-boss
- LionDesk tổng quan: https://www.capterra.com/p/151891/liondesk · https://www.privyr.com/crm-comparison/liondesk-vs-followupboss/
- Meey CRM ra mắt: https://baophapluat.vn/ra-mat-ung-dung-quan-ly-khach-hang-va-nguon-hang-danh-rieng-cho-nha-moi-gioi-bds-meey-crm-post403874.html
