# Sổ Khách — Design System

> **Version:** 2.0 · 2026-10-15 · **Direction:** Modern Tech / Cool Porcelain (light-first)
> **Purpose:** Single source of truth cho giao diện CRM của solo agent / tiny team.
> **Companion:** `UX_GUIDELINES.md` quy định **hành vi, thứ tự thông tin và luồng thao tác**.

## 0. Quy tắc cho AI coding agent

- **MUST:** Khi tạo/sửa UI, đọc tài liệu này và `UX_GUIDELINES.md`; tái sử dụng token, icon, component, hành vi hiện có. Không tự chế design language riêng cho một màn.
- **MUST:** Ưu tiên khả năng đọc, sự rõ ràng và hiệu quả thao tác hơn hiệu ứng thị giác.
- **MUST:** Đỏ / vàng / xanh lá **chỉ** thể hiện mức độ khẩn cấp hoặc kết quả/độ ổn định; **violet + sparkle** chỉ dành cho AI. Hành động chính là **graphite**, không phải xanh lá/đỏ.
- **MUST:** Một màn có 1 điểm tập trung hành động rõ ràng. Không tạo hierarchy bằng cách tô màu mọi card.
- **SHOULD:** Sửa token/component gốc thay vì override cục bộ; bảo toàn luồng dữ liệu/logic hiện có.
- **NEVER:** Dùng serif cho heading, palette be/rêu/cam đất kiểu cũ, neon glow, glassmorphism làm nền chính, card lồng card, biểu đồ nhiều màu chỉ để trang trí.
- Nếu code hiện tại khác đặc tả mới: **coi tài liệu này là chuẩn thiết kế đích**, nhưng triển khai thay đổi trong đúng phạm vi task; không tự ý refactor toàn ứng dụng hoặc đổi nghiệp vụ. Khi tài liệu này xung đột quy tắc **thiết kế cũ** trong `CLAUDE.md`/`docs/decisions.md`, báo xung đột để đồng bộ tài liệu; không xóa lịch sử quyết định.

## 1. Ngôn ngữ thị giác

**Modern Tech / Cool Porcelain:** sáng, lạnh nhẹ, sắc nét, có chiều sâu rất tiết chế; futuristic từ tương tác và cấu trúc thông tin, không từ glow/gradient. Mặc định light mode; dark mode chỉ xây khi có task riêng và phải dùng semantic tokens tương đương.

### 1.1 Design tokens — bảng chuẩn đề xuất

> Token dưới đây là **chuẩn đích mới** (không khẳng định đã có trong code). Tạo/mapping thành CSS variables tại một nơi; tránh hardcode rải rác.

| Token | Hex | Vai trò |
|---|---|---|
| `--bg` | `#F6F8FA` | Nền app, Cool Porcelain |
| `--surface` | `#FFFFFF` | Card, input, sheet |
| `--surface-subtle` | `#F1F4F7` | Header phụ, hover/selected trung tính |
| `--text` | `#17212B` | Nội dung chính / primary button |
| `--text-secondary` | `#526170` | Nội dung phụ, metadata |
| `--text-muted` | `#667085` | Chú thích ít ưu tiên; không dùng quá nhỏ |
| `--border` | `#DDE4EA` | Divider, card/input border |
| `--border-strong` | `#B8C5D0` | Input focus-neutral / selected border |
| `--danger` / `--danger-bg` | `#B4232E` / `#FFF1F2` | Quá hạn, nguy cơ cần xử lý ngay |
| `--warning` / `--warning-bg` | `#996100` / `#FFF7E7` | Sắp tới hạn, cảnh báo cần chú ý |
| `--success` / `--success-bg` | `#166534` / `#ECFDF3` | Hoàn thành, tạm ổn, đã xác nhận |
| `--ai` / `--ai-bg` | `#6539C6` / `#F5F1FF` | AI-only: icon, label, insight |
| `--focus-ring` | `#365F9B` | Focus bàn phím; **không** phải màu mức độ ưu tiên |

**Ý nghĩa màu là semantic, không theo thực thể:** loại công việc, stage, avatar, loại căn, kênh liên hệ và chart series mặc định dùng graphite/blue-grey trung tính; không chiếm đỏ/vàng/xanh lá hoặc violet-AI. Mức quan tâm khách (nguội → nóng) dùng **text + icon/độ đậm trung tính**, không mượn màu cảnh báo. `Đến hạn` và `quá hạn` cùng họ đỏ nhưng ghi rõ nhãn chữ; `sắp đến hạn` vàng; `chưa đến hạn` trung tính; `đã xử lý` xanh lá. **Không bao giờ dựa vào màu làm tín hiệu duy nhất.**

**Contrast:** văn bản thường ≥ 4.5:1; văn bản lớn và thành phần UI không phải chữ ≥ 3:1 (WCAG AA). Các màu chữ trên nền trạng thái đã được chọn để đạt ≥ 4.5:1; kiểm tra lại khi đổi màu/opacity. Không dùng chữ `--text-muted` với opacity giảm trên nền sáng.

### 1.2 Typography

- Dùng **sans-serif**, ưu tiên `Inter` (hoặc font sans hiện có hỗ trợ tiếng Việt tốt); fallback hệ thống. Font heading serif `Georgia/Times` cũ **được thay thế**.
- Phân cấp: Page title `24–28px / 600–700`; Section title `17–18px / 600`; card title / tên khách `15–16px / 600`; body `14–15px / 400`; secondary `13–14px / 400`; meta `12–13px / 400`. Số KPI chủ đạo có thể `22–28px / 600`.
- Dùng `font-variant-numeric: tabular-nums` cho KPI, thời gian, số tiền; dòng body line-height `1.45–1.6`. Chỉ bôi đậm cho tiêu đề, thực thể cần quét nhanh, con số chủ đạo — **không bôi đậm cả đoạn**.
- Không viết hoa toàn bộ nhãn; tránh italic trang trí. Tên khách dài phải ellipsis nhưng xem được đầy đủ; không cắt nội dung quan trọng như giờ hẹn.
- Kiểm tra hiển thị tiếng Việt: “Trường”, “Hưởng”, “Ngữ”, “Tự”, “Đường”.

### 1.3 Spacing, shape, elevation

- Scale spacing: `4 / 8 / 12 / 16 / 20 / 24 / 32px`; khoảng cách 2 section thường `20–24px`.
- Mobile page gutter `16px` (ở 320–359px cho phép `12px`); bố cục mobile-first; thử `320 / 375 / 390 / 430px`, desktop ≥ `900px`.
- Radius: controls `10–12px`, card `14–16px`, pill `999px`; icon container `10–12px`.
- Card: nền trắng, viền 1px `--border`, shadow cực nhẹ hoặc không; dùng divider để nhóm dòng. **Không** lồng 2–3 lớp card chỉ nhằm phân cấp.
- Desktop: max-width vùng đọc tập trung khoảng `720px` khi phù hợp; danh sách/bảng/analytics có thể rộng hơn có chủ đích.

## 2. Component contract

| Component | Quy tắc bắt buộc |
|---|---|
| `AppShell` | Header/safe area/bottom nav dùng màu surface nhất quán, đường phân cách mảnh; không đổi màu nền theo từng tab. |
| `Section` | Title 17–18px semibold; metadata/CTA nhỏ hơn, không cạnh tranh với title. |
| `Card` | Chỉ dùng khi cần nhóm nội dung/hành động; list rows có thể nằm trực tiếp trên surface, không cần 1 card mỗi dòng. |
| `PrimaryButton` | Graphite background + chữ trắng; 1 CTA chính trong một vùng tác vụ; disabled có trạng thái riêng. |
| `SecondaryButton` | Surface + border + chữ graphite; không tô status color cho nút Gọi/Zalo/Thêm. |
| `StatusBadge` | Nhãn + icon (nếu cần) + 1 trong 3 semantic colors, chỉ khi có ý nghĩa deadline/kết quả thực. |
| `NeutralBadge` | Stage, loại việc, phân loại khách, nguồn, product: xám/blue-grey + chữ dễ đọc. |
| `AIInsight` | Violet + biểu tượng `ai`/sparkle + nhãn `Gợi ý AI`; nêu phát hiện, căn cứ và CTA; không dùng màu AI cho cảnh báo. |
| `NextAction` | 1 nhiệm vụ ưu tiên, tên khách, lý do, hạn (nếu có), CTA và truy cập hồ sơ; nổi bằng hierarchy/spacing, **không mặc định dùng đỏ**. |
| `ListRow` | Tên/thao tác rõ; metadata nhỏ; trạng thái độc lập; ưu tiên dạng dòng gọn thay card cao. |
| `Tabs / Filters` | Active dùng graphite hoặc underline; badge đếm trung tính trừ khi đếm thật sự là alert. Có trạng thái focus. |
| `Dialog / Sheet` | Mobile ưu tiên bottom sheet cho lựa chọn nhanh; tác vụ dài dùng full-screen view; luôn có Close/Cancel. |
| `Empty / Loading / Error` | Hiển thị trạng thái và việc tiếp theo; skeleton không gây dịch chuyển bố cục, error không che hành động khôi phục. |

Icon: **một khái niệm = một icon trên toàn app**. Tái sử dụng `js/icons.js` (`ICON_PATHS`, `STAGE_ICON`, `icon()`, `stageIcon()`, `data-icon`); mặc định `24×24`, stroke ~`1.8`, `currentColor`; kích thước trong list `18–20px`. Các icon khái niệm hiện có (`call`, `call_sched`, `call_again`, `message`, `task`, `alarm`, `customers`, `new_lead`, `booking`, `contract`, `ai`...) **giữ mapping**; thêm concept mới vào registry, không duplicate SVG. Icon UI thuần (back/close/more/filter) có thể dùng bộ chung.

## 3. Responsive & accessibility

- Mobile-first; bottom navigation, search, filter, sheet có vùng chạm **≥44×44px** khi khả thi (tối thiểu 24×24 CSS px theo WCAG 2.2 AA, tránh mục tiêu sát nhau). Respect `env(safe-area-inset-*)`.
- Header không che nội dung; bottom nav/sticky CTA không che dòng cuối, bàn phím hoặc form. Chỉ dùng 1 CTA nổi chính ở một thời điểm.
- Trạng thái: default / hover / focus-visible / active / disabled / loading / success / error. Không dùng hover làm cách duy nhất truy cập action (mobile không có hover).
- Đảm bảo tab, dialog, input, menu hoạt động qua keyboard, focus rõ, `aria-label` cho icon-only buttons, `aria-live` ở số đếm kết quả/validation phù hợp.
- Motion 120–220ms cho phản hồi ngắn; hỗ trợ `prefers-reduced-motion`; **không** glow/pulse liên tục hoặc animation trang trí chặn thao tác.

## 4. Mapping với code hiện tại (kiểm tra trước khi sửa)

- CSS chủ yếu tại `css/style.css`; module vay `css/loan.css`, **giữ namespace `.lm-`**. Không tạo style module vay làm ảnh hưởng global.
- Các class cũ `.dcard`, `.dcard-head`, `.dcard-go`, `--card-*`, `.call-soon/.call-due/.call-missed`, `.kind-*` có thể **mapping** sang tokens mới trước khi đổi markup; tránh phá screen đang hoạt động.
- Các nguồn semantic cũ: `CARE_STAGE_COLORS`, `CONTACT_STATUS_COLORS`, `INTEREST_TIERS`, `TASK_KINDS` (`js/app.js`) và `js/icons.js`. **Di chuyển màu trạng thái thời hạn về quy tắc semantic này**, còn stage/kind/interest chuyển thành neutral; giữ nguyên dữ liệu nghiệp vụ.
- Nếu dùng `[hidden]` từ JS, giữ `[hidden] { display: none !important; }` và test cả hiện/ẩn.
- Header, bottom nav, tab và customer detail hiện tồn tại: **giữ route/ID/handler cũ trong bước đổi theme**, chỉ thay cấu trúc khi task UX tương ứng yêu cầu.

## 5. Definition of done — UI task

- [ ] Dùng token chung; không hardcode palette riêng, không đưa thêm màu mới.
- [ ] Semantic đỏ-vàng-xanh chỉ dùng cho mức ưu tiên/kết quả; violet chỉ dùng cho AI.
- [ ] Heading/body/metadata phân cấp đúng, không chữ phụ quá nhạt; test contrast.
- [ ] Một CTA trọng tâm; list/card gọn; không lồng khung không cần thiết.
- [ ] Icon/mapping nhất quán; mobile 320–430px không tràn, không bị nav che.
- [ ] Đủ loading/empty/error/keyboard/focus/reduced-motion khi liên quan.
- [ ] Không thay đổi logic/data/điều hướng ngoài scope; kiểm tra liên kết với `UX_GUIDELINES.md`.

**Nguyên tắc ưu tiên khi xung đột:** correctness & privacy → accessibility → UX rules → semantic colors → visual details. Ghi rõ đề xuất ngoại lệ, không tự áp dụng toàn app.
