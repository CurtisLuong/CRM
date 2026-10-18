# Sổ Khách — Design System v4 "Precision Tonal" (BẢN NHÁP — chờ Curtis duyệt, M0)

> 2026-10-19 · Thay `docs/DESIGN_SYSTEM.md` v3 "Signal" **sau khi duyệt** (ghi `decisions.md`). Vì sao chọn hướng này: `docs/v3/design-language.md`.
> Bản mẫu: `docs/v3/mockups/*.html` (mở bằng trình duyệt; `?theme=dark`; danh sách `?sheet=1`). Ảnh: `docs/v3/mockups/shots/`.
> **Precision Tonal** = cách phân cấp của Material 3 Expressive (cái quan trọng thì to, có chữ, nằm gần ngón tay) + vẻ ngoài tĩnh, gần đơn sắc, số liệu đơn cách kiểu Linear / Vercel Geist / IBM Carbon.

## 0. Năm luật cứng (kiểm được, chặn merge)

| # | Luật | Cách kiểm |
|---|---|---|
| L1 | **Màn đầu** 360×780: Hôm nay thấy trọn ≥ 2 thẻ đầy đủ của nhóm gấp nhất (thẻ thứ 3 lộ một phần) · Danh sách ≥ 7 khách · Hồ sơ thấy tên + SLA + Việc tiếp theo + Lần trước + 4 nút liên hệ · Hiệu quả thấy 4 con số | e2e đếm phần tử trong viewport |
| L2 | **Mỗi thẻ đúng 1 hành động hiện ra** (Gọi · Xong · Ghi kết quả). Chạm thẻ = mở khách (desktop: panel phải). Hành động khác ở hồ sơ / panel / ⋯ | e2e: 1 nút trong mỗi `[data-card]` |
| L3 | **Không mã, không ISO, không "[object Object]"**: mọi giá trị qua formatter + nhãn `src/config/*`. Ngày giờ: "Hôm nay 14:00", "Hôm qua", "2 ngày trước", "Thứ Năm 16/10", "04/10/2026" | unit test formatter + e2e quét chữ cấm |
| L4 | **Không hiện ô trống**: trường chưa có thì ẩn; còn thiếu gom thành chip "Còn thiếu: …" (viền đứt) | e2e: không có "Chưa biết" |
| L5 | **Không trắng màn**: ErrorBoundary từng khối; lỗi → khối đó báo + Thử lại | e2e seed khách có trường sai kiểu |

## 1. Ngôn ngữ

1. **Ba cấp thông tin trong mọi thẻ khách**
   - **Cấp 1:** tên (18/650, chữ đậm nhất màn) + **một nút hành động lớn có chữ** (48px, màu nhấn) + thời hạn ngay dưới tên (đỏ = quá hạn, vàng = sắp/đang trễ).
   - **Cấp 2:** lưới nhãn nhỏ / giá trị (Gọi gần nhất · Đã gọi · Nguồn…) dưới một vạch chia mảnh; giờ và số dùng chữ đơn cách.
   - **Cấp 3:** ghi chú cuối (1 dòng, chữ phụ, trong ngoặc kép) + thanh SLA.
2. **Mỗi khách một thẻ**, cách nhau 8–10px, bo 18px, viền mảnh. **Vạch dọc 3px bên trái** mang màu thời hạn (đỏ quá hạn, vàng sắp/đang trễ, không màu khi bình thường) → quét dọc màn là thấy khách gấp.
3. **Một màu nhấn** (xanh "Precision Blue") chỉ dành cho hành động chính và mục đang chọn. Còn lại gần đơn sắc. Đỏ/vàng/xanh lá chỉ cho thời hạn/kết quả; tím chỉ cho AI.
4. **Số liệu kiểu thiết bị đo:** giờ, SĐT, số lớn dùng JetBrains Mono; SLA là **thanh 7 đoạn** (mỗi đoạn = 1 phần thời gian mục tiêu của bậc), đơn sắc, chuyển vàng khi quá mục tiêu, đỏ khi quá hạn mức.
5. **Sáng và tối ngang hàng**; tối dùng bề mặt sáng dần thay bóng. Không kính mờ trên nội dung, không gradient trang trí, không phát sáng.

## 2. Token (`src/styles/tokens.css`)

| Token | Sáng | Tối | Vai trò |
|---|---|---|---|
| `--bg` | `#F2F4F7` | `#0A0D12` | Nền app |
| `--surface` | `#FFFFFF` | `#121821` | Thẻ, sheet |
| `--surface-2` | `#ECEFF3` | `#19212C` | Nút phụ, ô nền phụ |
| `--surface-3` | `#E3E7EC` | `#212A36` | Popover |
| `--text` | `#0D1117` | `#EDF1F6` | Chữ chính |
| `--text-2` | `#444C56` | `#AAB4C0` | Chữ phụ (cấp 2–3) |
| `--text-3` | `#5D6672` (5.3:1 trên bg) | `#8893A1` (5.7:1) | Nhãn nhỏ — không nhỏ hơn 11.5px |
| `--border` / `--hairline` | `#D9DEE5` / `#E3E7EC` | `#2A3441` / `#222B37` | Viền ô nhập / viền thẻ, vạch chia |
| `--accent` | `#2B5CFF` (5.1:1 với chữ trắng) | `#6F8FFF` (6.5:1 với chữ `#0A0D12`) | Hành động chính, đang chọn, focus |
| `--accent-tonal` | `#E1E8FF` | `#1D2B5A` | Nền nút hành động trên thẻ gọn |
| `--danger` | `#C0262D` | `#FF6E6E` | Quá hạn, lỗi |
| `--warning` | `#8A5300` | `#F2B34B` | Sắp hạn, đang trễ, quá mục tiêu SLA |
| `--success` | `#1A7F4B` | `#4FD08E` | Xong, đúng nhịp |
| `--ai` | `#6B3FD4` | `#B596FF` | Chỉ AI |
| `--track` / `--bar` | `#E7EBF0` / `#0D1117` | `#222B37` / `#EDF1F6` | Thanh SLA |

Bo góc: nút 14 · thẻ 18 · thẻ gọn 16 · sheet 20 · chip 999. Bóng sáng: `e1` `0 1px 2px rgb(13 17 23/.05)`; tối: không bóng.
Font giữ **Be Vietnam Pro** + **JetBrains Mono** (đã cài; không thêm thư viện). Tên khách 18/650 (thẻ gọn 16/650), tiêu đề màn 20/650, nhãn 11.5/500, chữ phụ 13–13.5.

## 3. Component (`src/ui`)

| Component | Quy tắc |
|---|---|
| `CustomerCard` (đầy đủ) | Cấp 1–2–3 như §1. Dùng cho **nhóm gấp nhất** ở Hôm nay (quá giờ hẹn gọi, khách mới chưa gọi). `data-due` → vạch trái |
| `CustomerCard compact` | Tên 16/650 + 1 dòng (thời hạn/trạng thái **đứng đầu dòng** để không bị cắt) + nút vuông 44 nền `--accent-tonal`. Dùng cho nhóm sau ở Hôm nay, Danh sách, Công việc. Chạm để mở |
| `ActionButton` | 48px, chữ + icon, nền accent; trên thẻ gọn: 44×44 chỉ icon + `aria-label` |
| `SlaBar` | 7 đoạn, nhãn bậc trái, "còn N ngày" đậm phải; màu theo `src/domain/velocity` (không tự tính) |
| `SessionBar` | Dải đậm (nền `--text`, chữ `--surface`) "Gọi lần lượt N khách · ~X phút" + [Bắt đầu]. Một dải duy nhất trên Hôm nay |
| `ProfileHeader` | Tên 22–24/650 · SĐT mono + sao chép · [Bậc ▾] (chạm → sheet) · Đúng nhịp · nguồn · `SlaBar` |
| `KnownFacts` | Ô đã biết + chip "Còn thiếu" viền đứt |
| `LastTouch`, `TimelineFilter`, `SavedListChips`, `FilterSheet`, `StatTile`, `ImproveList`, `BlockBoundary` | Như bản mẫu; `StatTile` số lớn dùng mono, cả ô bấm được |

Giữ: `Sheet`, `Toast`, `CommandPalette`, `OutcomePicker`, `SlotPicker`, `HealthDot`, `AIBlock`, `Kbd`, `EmptyState`, `Skeleton`.

## 4. Khung & bố cục

- **Mobile:** thanh đầu 52px (tiêu đề · 🔍 · chấm đồng bộ · ⋯); thanh dưới 4 tab + ＋. Hồ sơ: thanh dưới thay bằng 4 nút Gọi · Zalo · Ghi chú · Hẹn.
- **Desktop ≥ 1024:** rail trái 76px; Hôm nay & Danh sách 2 cột (thẻ 380–460px + panel khách đang chọn); Hồ sơ 2 cột (nội dung + cột phải 320px).
- **Hôm nay:** tóm tắt → `SessionBar` → nhóm gấp (thẻ đầy đủ) → nhóm sau (thẻ gọn) → dòng link (Khách nóng đang nguội, Chưa có việc tiếp, Tổng kết ngày). Nhóm lấy từ `SIGNAL_GROUPS` có sẵn; bỏ 4 tab cũ và nhãn P0.
- **Hồ sơ:** tên/bậc/SLA → Việc tiếp theo (vạch trái nếu quá hạn) → Lần trước → Đã biết → tab + lọc dòng thời gian → Thông tin thêm.
- **Danh sách:** tìm → chip tệp → "96 khách · sắp xếp ▾" → thẻ gọn. Retarget/Đồng nghiệp/Xuất/Lưu trữ vào ⋯.
- **Hiệu quả:** kỳ → 4 `StatTile` → Cần cải thiện → Phễu → trang con chi tiết.

## 5. Definition of Done — UI

- [ ] L1–L5 có e2e.
- [ ] Chỉ token + component `src/ui`; một màu nhấn; màu thời hạn chỉ ở vạch trái + chữ thời hạn.
- [ ] Sáng + tối; 360 / 390 / 430 / ≥ 1024; dấu tiếng Việt; không cuộn ngang.
- [ ] Không đổi logic/dữ liệu: chỉ đọc `src/domain/*`, `src/config/*`.
