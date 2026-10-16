# Sổ Khách — Design System v3 "Signal"

> **Version:** 3.0 · 2026-10-16 · **Quyết định:** D-014 (thay phần visual của D-009). **Áp dụng:** web v2 (React + Tailwind). v1 giữ DS v2 tới cutover.
> **Companion:** `UX_GUIDELINES.md` (hành vi, thứ tự thông tin, số chạm). File này chỉ quy định **giao diện**.

## 0. Luật cho AI coding agent

- **MUST** dùng token (`src/styles/tokens.css` → Tailwind theme) và component `src/ui/*`. Không hardcode màu/khoảng cách/bóng; không tạo component trùng chức năng.
- **MUST** giữ ngữ nghĩa màu: đỏ/vàng/xanh lá **chỉ** cho thời hạn/kết quả; violet + sparkle **chỉ** cho AI; accent (Signal Blue) cho hành động chính, trạng thái chọn, focus. Không bao giờ dùng màu là tín hiệu duy nhất (luôn kèm chữ/icon).
- **MUST** mỗi vùng tác vụ 1 CTA chính; phân cấp bằng cỡ chữ, độ đậm, khoảng trắng, độ cao bề mặt — không bằng tô màu mọi card.
- **MUST** test cả **sáng và tối**, mobile 360/390/430px và desktop ≥1024px, dấu tiếng Việt.
- **NEVER:** neon/glow, gradient nền trang trí, glassmorphism làm nền nội dung, card lồng card, chữ viết hoa toàn bộ, serif, biểu đồ nhiều màu trang trí, animation lặp vô hạn.
- Khi cần token/component mới: thêm vào nguồn chung trong task sở hữu `src/ui` (xem `tasks.md`), ghi vào file này.

## 1. Ngôn ngữ thị giác

**"Signal" = bảng điều khiển của một người làm nghề**: sạch, chính xác, dày thông tin vừa đủ, phản hồi tức thì. Cảm giác "tương lai" đến từ:

1. **Cấu trúc rõ:** lưới 4px, cột thẳng, nhãn dữ liệu nhỏ đều nhau, số liệu dùng chữ số đơn cách.
2. **Bề mặt phân tầng:** nền → bề mặt → bề mặt nổi; tối dùng độ sáng bề mặt thay cho bóng.
3. **Tín hiệu sống:** trạng thái đồng bộ, đếm ngược thời hạn, vòng SLA, chấm "đang trực tuyến" — chuyển động ngắn, có mục đích.
4. **Điều khiển bằng bàn phím/lệnh:** Command palette, phím tắt hiển thị bằng `Kbd`.
5. **Một màu nhấn duy nhất** (Signal Blue) trên nền trung tính lạnh; AI có màu riêng (violet).

## 2. Token

Định nghĩa một lần ở `src/styles/tokens.css` (`:root` = sáng, `[data-theme="dark"]` = tối; mặc định theo `prefers-color-scheme`, người dùng chọn được Sáng/Tối/Tự động). Tương phản đã kiểm (WCAG AA): chữ thường ≥ 4.5:1, viền điều khiển ≥ 3:1.

### 2.1 Màu

| Token | Sáng | Tối | Vai trò |
|---|---|---|---|
| `--bg` | `#F4F6F9` | `#0A0E13` | Nền app |
| `--surface` | `#FFFFFF` | `#10161D` | Card, sheet, input |
| `--surface-2` | `#EEF2F6` | `#161E27` | Hàng hover/chọn, header phụ, thanh dính |
| `--surface-3` | `#E4E9EF` | `#1D2732` | Popover, menu, phần tử nổi trên surface-2 |
| `--text` | `#0E1621` (18:1) | `#E7ECF2` (15:1) | Nội dung chính |
| `--text-2` | `#475467` (7.7:1) | `#A7B2BF` (8.5:1) | Nội dung phụ, metadata |
| `--text-3` | `#5F6B7A` (5.4:1) | `#8794A3` (5.9:1) | Chú thích ít ưu tiên — không nhỏ hơn 12px |
| `--border` | `#DCE3EA` | `#253141` | Divider, viền card |
| `--border-strong` | `#8291A2` (3.2:1) | `#5B6E86` (3.5:1) | Viền input, control chưa chọn |
| `--accent` | `#2251E5` | `#7C9DFF` | CTA chính, tab/chọn đang active, link, focus |
| `--accent-fg` | `#FFFFFF` (6.2:1) | `#0A1433` (7:1) | Chữ trên nền accent |
| `--accent-soft` | `#EAF0FF` | `#17254A` | Nền chip/ô đang chọn |
| `--danger` / `--danger-bg` | `#B42318` / `#FEF0EF` | `#FF7A70` / `#2A1416` | Quá hạn, lỗi, nguy cơ |
| `--warning` / `--warning-bg` | `#8A5300` / `#FFF5E0` | `#F2B34B` / `#2A1F0C` | Đến hạn, quá mục tiêu, cần chú ý |
| `--success` / `--success-bg` | `#126B3E` / `#E9F7EF` | `#4CCB8A` / `#0F2219` | Xong, đã xác nhận, đúng nhịp |
| `--ai` / `--ai-bg` | `#6B3FD4` / `#F3EEFF` | `#B596FF` / `#1E1636` | **Chỉ AI** |
| `--focus` | `= --accent` | `= --accent` | Vòng focus 2px + offset 2px |

**Quy tắc trạng thái thời hạn (D-010):** `chưa đến hạn` trung tính · `sắp đến hạn` (trong 60 phút / hôm nay) `--warning` · `đến hạn` `--warning` đậm + chữ "Đến hạn" · `quá hạn` `--danger` + chữ "Quá hạn" · `xong` `--success`. Nguồn trạng thái: `countdownTag` — UI không tự tính.

**Màu trung tính cho thực thể:** bậc phễu, loại việc, nguồn, loại căn, mức quan tâm, avatar dùng `--surface-2` + `--text-2` + icon. Không gán màu riêng cho từng bậc.

**Biểu đồ:** chuỗi chính `--accent`, chuỗi so sánh `--text-3`, tối đa thêm 2 sắc độ của accent; màu semantic chỉ khi dữ liệu là trạng thái (quá hạn/đúng hạn).

### 2.2 Typography

- **Sans:** `Be Vietnam Pro` (tự host qua `@fontsource/be-vietnam-pro`, weight 400/500/600/700; fallback `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`). Thiết kế cho tiếng Việt — dấu chồng không vỡ.
- **Mono (dữ liệu):** `JetBrains Mono` 500 cho giờ, đếm ngược, số tiền, mã căn, SĐT trong bảng, phím tắt. Không dùng mono cho câu văn.
- `font-variant-numeric: tabular-nums` cho mọi con số trong danh sách/KPI.

| Vai trò | Cỡ / dòng / weight | Dùng cho |
|---|---|---|
| `display` | 28/34 · 600 | Số KPI chủ đạo, tiêu đề NBA |
| `title` | 20/28 · 600 | Tiêu đề màn |
| `section` | 16/24 · 600 | Tiêu đề khối |
| `body-strong` | 15/22 · 600 | Tên khách, nhãn hành động |
| `body` | 15/22 · 400 | Nội dung |
| `small` | 13/18 · 400 | Metadata, lý do |
| `label` | 12/16 · 500 · tracking 0.02em | Nhãn dữ liệu, eyebrow (không viết hoa toàn bộ) |
| `mono-data` | 13/18 · 500 mono | Giờ, số tiền, mã |

Mỗi màn tối đa **3 cấp chữ nổi bật** (ví dụ title → section → body-strong). Không bôi đậm cả đoạn. Tên dài ellipsis + xem đủ khi chạm/hover; không cắt giờ hẹn.

### 2.3 Khoảng cách, bo góc, độ cao

- Lưới 4px; scale `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40`. Lề trang mobile 16px (12px khi < 360px). Giữa các section 24px; trong section 12–16px.
- Bo góc: control 10px · card 14px · sheet 20px (góc trên) · chip/pill 999px.
- Độ cao: `e0` phẳng (trên nền) · `e1` card = viền 1px `--border` (sáng có thể thêm `0 1px 2px rgb(16 24 40 / .04)`) · `e2` sticky bar/FAB = `0 4px 16px rgb(16 24 40 / .08)` · `e3` sheet/popover = `0 12px 32px rgb(16 24 40 / .14)`. Tối: dùng `--surface-2/3` thay bóng, viền 1px `--border`.
- Thanh dính (header, bottom nav, action bar) được dùng `backdrop-filter: blur(12px)` với nền `--surface` 85% — **chỉ** ở 3 vị trí này, có fallback nền đặc.

### 2.4 Chuyển động

- Thời lượng: `fast 120ms` (hover, nhấn) · `base 200ms` (mở menu, đổi tab) · `slow 280ms` (sheet, chuyển màn). Easing chuẩn `cubic-bezier(.2,.8,.2,1)`; thoát `cubic-bezier(.4,0,1,1)`.
- Hoàn tất việc: dòng thu gọn + chuyển xanh 200ms rồi rời hàng đợi; hiện Toast có Hoàn tác.
- Đếm ngược/trạng thái đồng bộ đổi giá trị không nhấp nháy; skeleton shimmer tối đa 1,2s/chu kỳ, dừng khi có dữ liệu.
- `prefers-reduced-motion`: tắt trượt/thu gọn, chỉ đổi opacity.

### 2.5 Icon

- Registry duy nhất `src/config/icons.ts` (D-006): **khái niệm → icon** (dùng glyph `lucide-react`, stroke 1.75, `currentColor`). Component `<Icon name="call" />`; không import icon trực tiếp trong feature.
- Kích thước: 16 (inline chữ nhỏ) · 20 (dòng danh sách, nút) · 24 (nav, tiêu đề).
- Khái niệm giữ từ v1: `call`, `call_sched`, `call_again`, `message` (Zalo), `task`, `alarm`, `customers`, `new_lead`, `booking`, `contract`, `nurture`, `sla`, `ai`, `chart`, `insight`, `home`, `idle`, `hot`, các icon bậc (`STAGE_ICON`). Thêm: `note`, `voice`, `promise_me`, `promise_customer`, `segment`, `retarget`, `health`, `capacity`, `session` (phiên gọi), `command`, `sync`, `offline`.

## 3. Component contract (`src/ui`)

| Component | Quy tắc |
|---|---|
| `AppShell` | Mobile: header 56px + bottom nav 64px + safe-area. Desktop ≥1024: rail trái 72px (mở rộng 240px), vùng chính tối đa 760px cho màn đọc, panel ngữ cảnh phải 360px. Không đổi màu nền theo tab. |
| `BottomNav` | 4 tab + nút ＋ giữa (56px, accent). Tab active: icon + chữ `--accent`, chỉ báo 2px. Badge số chỉ khi là cảnh báo thật. |
| `Header` | Tiêu đề màn · ô tìm/lệnh (`Cmd K`) · `SyncIndicator` · avatar. Thu gọn khi cuộn. |
| `CommandPalette` | Radix Dialog; tìm khách (tên/SĐT/dự án/ghi chú), lệnh (Gọi X, Ghi chú cho X, Thêm khách…), màn. Điều khiển bằng phím; mobile mở full-screen. |
| `Button` | `primary` (accent) · `secondary` (surface + viền) · `ghost` · `danger` (chỉ hành động phá huỷ) · `ai` (viền/chữ violet). Cao 44px (mobile) / 36px (desktop compact). Có `loading`, `disabled`. |
| `IconButton` | 44×44 vùng chạm, `aria-label` bắt buộc. Gọi/Zalo/Ghi chú dùng `secondary`, không tô màu trạng thái. |
| `ActionBar` | Thanh dính đáy hồ sơ/sheet: Gọi · Zalo · Ghi chú · Hẹn (4 ô đều, icon + nhãn). |
| `NextActionCard` (NBA) | Eyebrow lý do (label) → tên khách (display/title) → hành động + hạn (`DeadlineTag`) → bằng chứng (chips) → Brief rút gọn → CTA chính + 2 phụ. Một card duy nhất mỗi màn. Không mặc định đỏ; chỉ `DeadlineTag` mang màu. |
| `QueueRow` | Avatar 36 · tên (body-strong) · hành động + lý do (small) · `DeadlineTag` phải · IconButton Gọi/Zalo. Chạm dòng = mở ngữ cảnh; vuốt trái = Xong/Dời; vuốt phải = Gọi. |
| `ListRow` | Như QueueRow, không bắt buộc deadline; có `HealthDot` + `StageChip`. Không bọc mỗi dòng 1 card. |
| `DeadlineTag` | Nhận kết quả `countdownTag` → chữ + màu semantic + mono cho giờ ("Quá hạn 2 giờ", "Đến hạn", "14:30"). |
| `StageChip` | Trung tính + icon bậc + vòng SLA mini tuỳ chọn. |
| `SlaRing` | Vòng tiến độ thời gian ở bậc: trung tính → `--warning` (quá mục tiêu) → `--danger` (quá hạn mức); vạch mốc mục tiêu. |
| `HealthDot` | 8px + chữ ẩn cho screen reader: Đúng nhịp (success) / Đang trễ (warning) / Nguy cơ (danger) / Chưa đủ dữ liệu (viền trung tính). |
| `SignalCard` | Tín hiệu rule: icon khái niệm + tiêu đề + "Vì sao" (bằng chứng, số liệu có n) + CTA + Ẩn/Hoãn. **Không** dùng màu AI. |
| `AIBlock` | Viền trái 2px `--ai`, nhãn "Gợi ý AI" + sparkle, nội dung, nguồn ("dựa trên 3 ghi chú gần nhất"), nút Dùng/Sửa/Bỏ. Trạng thái đang tạo: skeleton violet nhạt. |
| `BriefCard` | Lưới 2 cột label/giá trị (mua để · cần · tài chính · người quyết định · phản đối · lời hứa mở · liên hệ cuối). Giá trị thiếu: chữ `--text-3` "Chưa biết" + gợi ý câu hỏi. |
| `FactRow` | Nhãn · giá trị · nguồn/độ mới (label, `--text-3`: "Sale · 12/10", "AI đã duyệt · 3 ngày") · sửa inline. Dữ liệu cũ > 90 ngày: icon đồng hồ + "Cần xác nhận". |
| `Timeline` | Dòng thời gian hợp nhất; icon khái niệm theo loại; nhóm theo ngày; mốc tự động (SLA, AI) có nhãn nguồn. |
| `OutcomePicker` | 4 nút lớn (Nói chuyện được · Không nghe/không liên lạc · Bận, hẹn lại · Sai số/không phù hợp) + "Khác" mở đủ `CALL_RESULTS`. |
| `SlotPicker` | Chip ngày (Hôm nay/Mai/T2…) + chip khung `callSlots` (A/B/C/D, tên + giờ mono); khung gợi ý được chọn sẵn và có nhãn "Gợi ý". |
| `Sheet` | Radix Dialog dạng bottom sheet (mobile) / side sheet (desktop). Có tay nắm, Đóng, bảo vệ bản nháp khi đóng ngoài ý muốn. |
| `MetricTile` | Giá trị (display, mono số) · nhãn · tử/mẫu ("12/18 khách") · kỳ · xu hướng (▲▼ + chữ) · cảnh báo cỡ mẫu. Không có dữ liệu → "—" + "Chưa đủ dữ liệu". |
| `MiniChart` | Sparkline/bar/funnel SVG tự vẽ, trục tối giản, nhãn trực tiếp, không legend nếu ≤2 chuỗi; có bảng dữ liệu thay thế cho screen reader. |
| `Tabs`, `SegmentedControl` | Active = accent (chữ + gạch dưới 2px hoặc nền `--accent-soft`). |
| `Badge` | `neutral` · `status` (semantic) · `ai` · `count`. |
| `Toast` | Đáy màn trên bottom nav; có Hoàn tác khi phù hợp; lỗi có "Thử lại". |
| `SyncIndicator` | Chấm + chữ ngắn: Đã đồng bộ 14:02 · Chờ 3 thay đổi · Ngoại tuyến · Lỗi đồng bộ (nhấn xem chi tiết). |
| `EmptyState`, `Skeleton`, `ErrorState` | Mỗi danh sách/khối đều có; empty nói việc tiếp theo hữu ích; skeleton giữ đúng kích thước. |
| `Kbd` | Hiển thị phím tắt (desktop). |

## 4. Bố cục mẫu

- **Hôm nay (mobile):** header gọn (lời chào + "12 việc · ~95 phút · 2 quá hạn") → NBA → thanh sức làm khung hiện tại → hàng đợi (lọc) → 1 SignalCard → lối tắt.
- **Hồ sơ (mobile):** header (avatar, tên, StageChip + SlaRing, HealthDot) → Bước tiếp theo → Brief → Timeline/Trí nhớ/Nhu cầu/Tài liệu (tab dính) → ActionBar dính đáy.
- **Desktop ≥1024:** rail trái · danh sách/hàng đợi giữa · hồ sơ hoặc Brief ở panel phải (chọn dòng không đổi màn).
- **Hiệu quả:** MetricTile 2 cột (mobile) / 4 cột (desktop) → biểu đồ nhỏ → danh sách "Cần cải thiện" có CTA.

## 5. Responsive & truy cập

- Breakpoint: `sm` < 640 · `md` 640–1023 · `lg` ≥ 1024. Kiểm tra 320/360/390/430/768/1280.
- Vùng chạm ≥ 44×44 (tối thiểu 24×24 + khoảng cách theo WCAG 2.2); thao tác chính trong tầm ngón cái (nửa dưới màn).
- Bàn phím: mọi dialog/sheet bẫy focus và trả focus; `aria-live="polite"` cho đếm kết quả, Toast, trạng thái đồng bộ; icon-only có nhãn.
- Bottom nav / ActionBar / bàn phím ảo không che input đang nhập hoặc dòng cuối.

## 6. Definition of Done — UI

- [ ] Chỉ dùng token + component `src/ui`; không màu/khoảng cách tự chế.
- [ ] Đúng ngữ nghĩa màu (semantic, accent, AI); không phụ thuộc màu đơn thuần.
- [ ] Phân cấp ≤ 3 cấp nổi bật; 1 CTA chính mỗi vùng.
- [ ] Sáng + tối; 360–430px + ≥1024px; dấu tiếng Việt đúng ở tiêu đề và tên.
- [ ] Đủ trạng thái loading/empty/error/offline/disabled; focus/keyboard; reduced-motion.
- [ ] Không đổi logic/dữ liệu ngoài phạm vi task; đối chiếu `UX_GUIDELINES.md`.

**Thứ tự ưu tiên khi xung đột:** đúng dữ liệu & riêng tư → truy cập → luật UX → ngữ nghĩa màu → chi tiết thị giác.
