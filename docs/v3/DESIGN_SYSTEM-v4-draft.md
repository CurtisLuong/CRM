# Sổ Khách — Design System v4 "Gọn" (BẢN NHÁP — chờ Curtis duyệt, M0)

> 2026-10-18 · Thay `docs/DESIGN_SYSTEM.md` v3 "Signal" **sau khi duyệt** (ghi `decisions.md` D-0xx). Bản mẫu: `docs/v3/mockups/*.html` (mở bằng trình duyệt; `?theme=dark`, danh sách `?sheet=1`).
> Vì sao đổi: v3 đúng hướng nhưng toàn **lời khuyên**, không có **giới hạn đo được** → code thực tế mỗi dòng 5–6 nút, mã thô lộ ra, bộ lọc che danh sách (`docs/v3/current-state-ui.md`). v4 giữ phần nhìn tốt của v3 và thêm luật kiểm được bằng e2e.

## 0. Năm luật cứng (kiểm được, chặn merge)

| # | Luật | Cách kiểm |
|---|---|---|
| L1 | **Ngân sách màn đầu** ở 360×780 (trừ header 52 + thanh dưới 64): Hôm nay ≥ 6 khách (thẻ Gọi tiếp + 5 dòng; app hiện tại 2–3) · Danh sách ≥ 8 khách · Hồ sơ thấy tên + Việc tiếp theo + Lần trước + 4 nút liên hệ · Hiệu quả thấy 4 con số | e2e đếm phần tử trong viewport |
| L2 | **Một dòng = một hành động hiện ra** (Gọi, hoặc ô Xong cho việc, hoặc "Ghi kết quả"). Chạm dòng = mở khách (desktop: panel phải). Hành động khác ở hồ sơ / panel / menu ⋯ | e2e: ≤ 1 nút trong mỗi `[data-row]` |
| L3 | **Không mã, không ISO, không "[object Object]"**: mọi giá trị đi qua formatter + nhãn trong `src/config/*`. Ngày giờ: "Hôm nay 14:00", "Hôm qua", "Thứ Năm 16/10", "04/10/2026" | unit test formatter + e2e quét chữ cấm (`_`, `T\d\d:`, `object Object`, mã nguồn/kết quả gọi) |
| L4 | **Không hiện ô trống**: trường chưa có thì ẩn; thông tin còn thiếu gom thành chip "Còn thiếu: …" (viền đứt) | e2e: không có chữ "Chưa biết" |
| L5 | **Không trắng màn**: mỗi khối có ErrorBoundary riêng; lỗi → khối đó hiện "Không hiển thị được phần này" + Thử lại, phần còn lại vẫn chạy | e2e seed khách có trường sai kiểu |

## 1. Giữ nguyên từ v3

- **Màu:** toàn bộ bảng token v3 (`src/styles/tokens.css`, đã kiểm AA) + ngữ nghĩa: đỏ/vàng/xanh lá chỉ cho thời hạn/kết quả; violet chỉ cho AI; accent cho hành động chính/đang chọn.
- **Chữ:** Be Vietnam Pro + JetBrains Mono (giờ, SĐT, số), thang cỡ v3.
- **Icon:** registry `src/config/icons.ts` (D-006), lucide stroke 1.75.
- Chuyển động, truy cập (vùng chạm ≥ 44, focus, reduced-motion), sáng/tối.

## 2. Thay đổi

### 2.1 Token thêm

| Token | Sáng | Tối | Dùng |
|---|---|---|---|
| `--hairline` | `#E8EDF2` | `#1C2530` | Vạch chia dòng, viền nhóm (nhẹ hơn `--border`) |
| `--accent-tonal` | `#DFE7FF` | `#1C2D5C` | Nền nút Gọi tròn trên dòng |
| `--scrim` | `rgb(14 22 33/.45)` | `rgb(0 0 0/.6)` | Nền mờ sau sheet |

### 2.2 Bề mặt & nút

- **Bỏ viền nút phụ**: nút phụ = `tonal` (nền `--surface-2`, không viền). Chỉ ô nhập và chip chưa chọn có viền.
- **Nhóm thay thẻ**: danh sách = 1 khối `--surface` bo 14px, các dòng chia bằng `--hairline`. Không bọc từng dòng thành thẻ. Không thẻ lồng thẻ.
- **Chip đang chọn = nền chữ đậm** (`--text` trên `--surface`), không dùng accent → accent chỉ còn cho hành động.
- Bỏ native `<select>` trên màn chính (bậc, sắp xếp): dùng chip + sheet.

### 2.3 Chữ

- Tiêu đề màn **chỉ 1 lần** (trên thanh đầu, 20/600). Bỏ H1 lặp trong nội dung. Hồ sơ: thanh đầu chỉ có ← và ⋯; tên khách là tiêu đề (22/600).
- Tên khách trên dòng 15/600; dòng phụ 13/400 `--text-2`; giờ hạn mono bên phải dòng 1, mang màu thời hạn.
- Tiêu đề nhóm 13/600 `--text-2` + số đếm `--text-3` ("Gọi lại — chưa liên lạc được 3").

### 2.4 Khung

- **Mobile thanh đầu 52px**: tiêu đề · 🔍 · chấm đồng bộ (8px, chữ ẩn cho screen reader; chạm → chi tiết) · ⋯. Không còn ô chữ "Lỗi đồng bộ" làm cắt tiêu đề; lỗi = chấm đỏ + Toast.
- **Hồ sơ mobile**: thanh 4 nút Gọi (accent, rộng hơn) · Zalo · Ghi chú · Hẹn **thay** thanh điều hướng dưới (không chồng 2 thanh).
- **Desktop ≥ 1024**: rail trái 76px; Hôm nay & Danh sách = **2 cột** (danh sách 380–460px + panel khách đang chọn, chọn dòng không đổi màn); Hồ sơ = 2 cột (nội dung + cột phải 320px "Đã biết", "Thông tin thêm"); 4 nút liên hệ nằm trong dòng dưới tên, không nổi.

## 3. Component (thêm / đổi trong `src/ui`)

| Component | Quy tắc |
|---|---|
| `ActionRow` (thay `QueueRow` + `ListRow`) | Cao ≥ 56px; [avatar 36 tuỳ chọn] · dòng 1: tên + thời điểm phải · dòng 2: lý do/bậc · dự án · **1** hành động phải (`CallButton` / `CheckButton` / nút tonal nhỏ). Chữ quá dài cắt `…`, giờ không bao giờ bị cắt |
| `CallButton` | Tròn 44px, nền `--accent-tonal`, icon accent, `aria-label="Gọi <tên>"` |
| `RowGroup` | Tiêu đề nhóm + số đếm + khối dòng. Nhóm rỗng không hiện |
| `NextCallCard` (thay `NextActionCard`) | Eyebrow "Gọi tiếp · 1/N" + thời hạn → tên (18/600) → lý do 1 dòng → "Lần trước: …" 1 dòng → [Gọi] (primary) + [Gọi lần lượt N khách] (tonal). Một thẻ duy nhất mỗi màn |
| `ProfileHeader` | Tên · SĐT mono + sao chép · `StageButton` (chip + vòng SLA + ▾, chạm → sheet đổi bậc) · HealthDot · nguồn |
| `KnownFacts` (thay `BriefCard`) | Chỉ ô đã biết (lưới 2 cột mobile, 1 cột cột phải desktop) + hàng chip "Còn thiếu:" viền đứt; chạm chip → câu hỏi gợi ý + ô nhập |
| `LastTouch` | "Lần trước · <thời điểm>" + kết quả đậm + ghi chú |
| `TimelineFilter` | Chip Tất cả · Cuộc gọi · Ghi chú · Zalo · Bậc (có số); nhóm theo ngày ("Hôm qua · 17/10") |
| `SavedListChips` | Hàng chip cuộn ngang: [Lọc] · Tiềm năng · Khách mới · tệp đã lưu (có số) |
| `FilterSheet` | Bottom sheet nhóm chip; chân dính: Xoá lọc · **Xem N khách**; "Lưu thành tệp" ở đầu sheet |
| `StatTile` (thay `MetricTile` trên màn Hiệu quả chính) | Nhãn · số 28/600 · tử/mẫu · xu hướng (mũi tên + chữ, màu chỉ khi tốt/xấu). **Cả ô bấm được** → danh sách/trang con |
| `ImproveList` | Dòng "việc cần cải thiện" + 1 nút (Xem / Ghi) |
| `BlockBoundary` | ErrorBoundary cho từng khối (L5) |

Giữ nguyên: `Sheet`, `Toast`, `CommandPalette`, `OutcomePicker`, `SlotPicker`, `DeadlineTag`, `SlaRing`, `HealthDot`, `AIBlock`, `Kbd`, `EmptyState`, `Skeleton`.

## 4. Bố cục màn (theo bản mẫu)

| Màn | Thứ tự (mobile) |
|---|---|
| Hôm nay | Tóm tắt 1 dòng ("Thứ Bảy 18/10 · 14 việc · ~70 phút" + "3 quá hạn") → `NextCallCard` → nhóm theo **nhóm tín hiệu có sẵn** (`SIGNAL_GROUPS`: quá giờ hẹn, khách mới chưa gọi, gọi lại, việc hôm nay, chưa ghi kết quả…) → nhóm ít gấp thu thành dòng link (Khách nóng đang nguội, Chưa có việc tiếp, Tổng kết ngày). Bỏ 4 tab Ưu tiên/Khách mới/Lời hứa/Cơ hội và nhãn P0 |
| Hồ sơ | Tên/bậc → Việc tiếp theo → Lần trước → Đã biết → tab (Dòng thời gian · Trí nhớ · Nhu cầu & căn · Tài liệu · Tính vay) + lọc → "Thông tin thêm (N trường)" → Lưu trữ vào ⋯ |
| Danh sách | Ô tìm → `SavedListChips` → "96 khách · sắp xếp ▾" → dòng. Retarget, Đồng nghiệp, Xuất, Khách lưu trữ vào ⋯ |
| Hiệu quả | Kỳ (7 ngày / 30 ngày / Tháng này) → 4 `StatTile` → Cần cải thiện → Phễu → link trang con Chăm sóc · Phễu & SLA · Marketing (nội dung chi tiết hiện có chuyển vào đây) |

## 5. Definition of Done — UI (v4)

- [ ] Đạt L1–L5 (có e2e).
- [ ] Chỉ token + component `src/ui`; đúng ngữ nghĩa màu.
- [ ] Sáng + tối; 360 / 390 / 430 / ≥ 1024; dấu tiếng Việt; không cuộn ngang.
- [ ] Không đổi logic/dữ liệu: màn chỉ đọc từ `src/domain/*`, `src/config/*`.
