# Sổ Khách — DESIGN.md (bản UI "Realty CRM", D-028)

> Luật giao diện cho mọi người và mọi AI worker. Ngắn có chủ đích: **dùng component có sẵn, đừng dựng lại.**
> Nguồn thiết kế: `realty-crm-ui/` (Curtis làm bằng Claude Design, 28/10/2026). Bản trong app là bản chạy thật — khi hai nơi khác nhau, file này + `src/` thắng; luật nghiệp vụ luôn lấy từ `src/config` + `src/domain`, không lấy từ kit.
> Xem trực tiếp: `npm run dev` → **`/dev/ui-kit`** (mọi component với dữ liệu mẫu, sáng/tối, 360px và desktop). Hành vi, thứ tự thông tin, số chạm: `docs/UX_GUIDELINES.md`.

## 0. Ba luật cứng

1. **Dùng cái đã có.** Trước khi viết UI, tìm trong `src/components/crm` (mảnh CRM) và `src/components/ui` (primitive shadcn). Có thì dùng; gần đúng thì thêm prop. Không làm bản na ná.
2. **Không màu, cỡ chữ, font thô.** Chỉ class token (`bg-surface-100`, `text-ink-muted`, `text-alert-text`, `rounded-md`, `text-label`…). Không hex, `rgb()`, màu bảng Tailwind (`bg-blue-500`). Test `tests/design/no-raw-colors.test.ts` chặn trong `npm run check`.
3. **Màu chỉ nói độ gấp.** Xanh lá / vàng / đỏ CHỈ cho thời gian và độ gấp. Mọi thứ bấm được là `ion` (xanh lơ). Không dùng màu tín hiệu để trang trí, phân loại, chuỗi biểu đồ hay màu thương hiệu.

Luật đo được giữ từ D-023 (có e2e, vẫn chặn merge): **L1** màn đầu 360×780 thấy đủ việc chính · **L2** mỗi thẻ/dòng đúng 1 hành động hiện ra, chạm thẻ = mở khách · **L3** không mã lưu DB, ngày ISO, `[object Object]` (qua `src/ui/display.ts` + `src/lib/crm/format.ts`) · **L4** không hiện ô trống, thiếu thì gom "Còn thiếu: …" · **L5** không trắng màn: lỗi một khối chỉ ẩn khối đó + "Thử lại".

## 1. Token (`src/styles/tokens.css` → `@theme` trong `src/app/index.css`)

| Nhóm | Class | Dùng cho |
|---|---|---|
| Nền | `bg-surface-0` (nền app) · `bg-surface-100` (thẻ, sheet) · `bg-surface-200` (hover, ô phụ) · `border-line` | Bề mặt, viền |
| Chữ | `text-ink` · `text-ink-muted` | Chữ chính / phụ (đều ≥ 4,5:1) |
| Tương tác | `bg-ion` `text-on-ion` · `bg-ion-tint` · `text-ion` · `shadow-glow-ion` | Nút chính, đang chọn, focus, AI. Không bao giờ nói độ gấp |
| Tín hiệu | `ok` · `soon` · `alert` — mỗi loại: `bg-ok` (chấm/khối) · `text-ok-text` (chữ) · `bg-ok-tint` (nền) · `text-on-ok` (chữ trên khối) | Chỉ thời gian/độ gấp (§2) |
| Biểu đồ | `chart-1` (một chuỗi / kỳ này) · `chart-prev` (so sánh) · `chart-2` · `chart-3` | Tối đa 3 chuỗi |
| Lớp nổi | `shadow-overlay` · `--scrim` | Sheet, dialog |
| Chữ | `text-display` 32/700 · `text-title` 20/600 · `text-body` 15/400 · `text-label` 13/500 · `text-caption` 12/400 · `text-numeric` 14 mono · `text-countdown` 13 mono · `text-overline` 11 mono HOA | Không cỡ chữ tự đặt |
| Bo góc | `rounded-sm` 6 (badge, ô nhập) · `rounded-md` 10 (nút, thẻ) · `rounded-lg` 16 (hộp thoại, ô lớn) | |

- Giao diện: tối ("mission control") và sáng ngang hàng; người dùng chọn Sáng / Tối / Tự động (`src/app/theme.ts` đặt `data-theme`). Biến thể `dark:` / `light:` theo cùng thuộc tính.
- Font tự host (`src/styles/fonts.css`): Be Vietnam Pro (chữ) + JetBrains Mono (số, giờ, đồng hồ, overline) — chạy được khi mất mạng.
- Biến shadcn (`background`, `primary`, `muted`, `popover`, `input`, `ring`, `destructive`…) đã trỏ vào token → primitive thêm bằng `npx shadcn add` tự khớp màu. **Ngoại lệ `accent`:** tên này vẫn là token cũ (= `ion`); primitive mới có `bg-accent`/`text-accent-foreground` thì đổi sang `bg-surface-200 text-ink`.

## 2. Tín hiệu

| Mức | Nghĩa | Ký hiệu | Chữ |
|---|---|---|---|
| `ok` | đúng hẹn, đúng nhịp, xong | ● | "Đúng hẹn" |
| `soon` | sắp tới, đến hạn, trong ngày | ◆ | "Còn 45:00", "Hôm nay 15:00" |
| `alert` | quá hạn, làm ngay | ▲ (nhấp nháy) | "Trễ 2 ngày", "Làm ngay" |

- Tính mức CHỈ bằng `signalFor(due, now, { allDay })` (mốc quá hạn D-010: có giờ = sau mốc +30 phút; cả ngày = từ hôm sau) và `slaFor` / `slaMeterFor(customer, now)` (SLA D-008 từ `src/domain/velocity`). Không tự chọn màu.
- Luôn ký hiệu + chữ (`<SignalBadge>`), không chỉ màu. Chỉ `alert` được phát sáng (`shadow-glow-alert`) hoặc nhấp nháy.
- Danh sách xếp đỏ → vàng → xanh (`LEVEL_ORDER`), quá hạn lâu nhất trước. **Ngoại lệ:** hàng đợi Hôm nay giữ thứ tự ưu tiên D-015 (`src/domain/signals`, nhóm theo `SIGNALS_CONFIG.groupOrder`) — màu chỉ hiện mức, không xếp lại.

## 3. Phễu & SLA

- Bậc = giá trị `care_stage` đã lưu (`src/config/stages.ts`): 1 Đăng kí mới → 2 Đang tiếp cận → 3 Đang chăm sóc (nhánh **Nuôi dài hạn**, không tính SLA) → 4 Xem dự án → 5 Booking & Làm hồ sơ → Đã ký HĐMB | Không chốt. Component đọc qua `stageDef()` / `STAGES` / `STAGE_PATH` (`src/lib/crm/stages.ts`); bậc cũ đã gộp tự quy về bậc mới.
- Bậc là trung tính (`<StageChip>`, vạch ion). Độ gấp của bước tiếp theo nằm riêng (`<SignalBadge>`). Khách có thể "Booking" VÀ đỏ.
- SLA mỗi bậc {mục tiêu, hạn mức} lấy từ `src/config/velocity.ts`: dưới mục tiêu → ok, dưới hạn mức → soon, quá hạn mức → alert kèm phần quá. Đã ký / Không chốt / Nuôi dài hạn không tính SLA.
- Hiện SLA bằng `<SlaMeter>` (chi tiết) hoặc `<SlaMeter compact>` (dòng); của một khách thì `<SlaMeter {...slaMeterFor(c, now)} />`. Bản đồ phễu `<StagePath>`. Lịch sử `<Timeline>`: bậc ở trục ngoài, hành động bên trong.

## 4. Hành động

- Chín hành động, mỗi cái một icon (`ACTIONS` trong `src/lib/crm/actions.ts`; icon từ `src/config/icons.ts` — D-006): Gọi `call` · Hẹn gọi `call_sched` · Zalo `message` · Ghi chú `note` · Cafe và Gặp `cafe` · Tham quan `visit` · Booking `booking` · Hồ sơ `docs` · Kí HĐ `contract`. Mã trùng mã loại việc đã lưu (`src/config/taskKinds.ts`).
- `<ActionButton display="inline|icon|stacked">`: inline khi đủ chỗ, icon ở dòng dày (tooltip + aria-label tự có), stacked ở thanh dưới điện thoại.
- Kiểu nút theo độ gấp, không theo hành động: quá hạn → `alert` ("Làm ngay"), hôm nay → `primary`, còn lại → `secondary`/`ghost`. **Một** nút `primary` (hoặc `alert`) mỗi màn/dòng.
- `destructive` chỉ để xoá và luôn qua `<Dialog tone="alert">`. Thao tác đảo được thì dùng toast "Hoàn tác" thay cho "Bạn chắc chứ?".
- Feature không import `lucide-react` trực tiếp: icon theo khái niệm qua `<Icon name>` (`src/ui/Icon.tsx`) hoặc `ACTIONS`. Component trong `src/components` được dùng glyph chung (mũi tên, đóng, dấu tích).

## 5. Bố cục

- Mọi màn: `<AppShell sidebar={<Sidebar/>} bottomNav={<BottomNav/>} header={<PageHeader/>}>`. Sidebar 232px / thu gọn 64px (phím `[`) từ 768px; dưới 768px là `<BottomNav>` 4 tab (`NAV_TABS`, D-013). Route dùng khung mới khai báo `handle: { bare: true }` (không lồng khung cũ).
- `<PageHeader>`: TRÁI tiêu đề + tổng số (+ phụ đề / badge tín hiệu), PHẢI 1–3 hành động, nút chính ĐỨNG CUỐI. Tìm + lọc ở `toolbar`, góc nhìn ở `tabs`.
- Mở, không chuyển trang: khách mở trong `<Sheet>` bên phải (480px; điện thoại toàn màn) với SlaMeter → Timeline → chi tiết; danh sách vẫn ở sau. `<Dialog>` chỉ cho quyết định và ≤ 4 ô. Esc và nút Back Android đóng cả hai (`installCRMBack` trong `src/app/layout.back.ts` — khung cũ đã gắn; khung mới phải gắn lại khi thay `RootLayout`).
- Khoảng cách 4/8/16/24 (`gap-1/2/4/6`). Vùng chạm ≥ 44px. Thiết kế từ 360px lên; kiểm 360 / 390 / 1280, sáng/tối, không cuộn ngang.

## 6. Dữ liệu & form

- Danh sách: `<DataTable>` dòng gọn 40px, tiêu đề mono dính, hover `surface-200`, đang chọn `ion-tint` + mép ion, `<Pagination>` 20/trang, `loading` → dòng skeleton, rỗng → `<EmptyState>`. Điện thoại: `<LeadRow>` thay bảng.
- Lọc: chip, không dropdown (`<ChipGroup>` có số đếm), `<Segmented>` cho phạm vi, `<SortControl>` một trường + chiều bằng chữ (mặc định "Độ gấp · Gấp nhất trước"). Bảng lọc trong Sheet phải: góc nhìn đã lưu ở trên, "Xem N khách" ở chân; `<FilterBar>` trên danh sách phản ánh trạng thái lọc.
- Form: `<TextField>`, `<SelectField>`, `<DatePicker>`, `<SearchBar>`. Ô 44px, nhãn trên, gợi ý/lỗi dưới. Lỗi nói cách sửa. Đơn vị ở `suffix` ("triệu/tháng", "VNĐ", "m²"). SĐT/tiền/ngày dùng `numeric`.

## 7. Phản hồi

- Không bao giờ trắng màn: `<Skeleton>` khi tải > 300ms; `<EmptyState kind>` có lý do + một hành động khi rỗng; `kind="error"` + "Thử lại" khi lỗi. **Đọc lỗi ≠ dữ liệu trống.**
- `toast.success / info / error` (sonner, gắn một lần). Thành công 4s, có "Hoàn tác" khi đảo được; lỗi ở lại tới khi đóng.
- Thông báo là tín hiệu, không phải tin tức: mỗi cái nói cái gì, vì sao (`SignalBadge`) và có hành động xoá nó. Loại thông báo = nhóm tín hiệu D-015 (`NOTIF_TYPES` ← `SIGNAL_GROUPS`). ≥ 3 cùng loại gom trong `<NotificationGroup>` có hành động hàng loạt. Số trên chuông mang màu của tín hiệu gấp nhất chưa đọc.

## 8. Biểu đồ

- Mọi biểu đồ trong `<ChartCard>`: tiêu đề overline → **một câu kết luận có số** → ("Cách tính" khi bấm) → chú giải → biểu đồ → link tới các khách đằng sau.
- Màu chuỗi: `chart-1`, `chart-prev`, `chart-2`, `chart-3`; tối đa 3. Màu tín hiệu chỉ ở chỗ chính nó là tín hiệu (tuổi bậc SLA, badge quá hạn).
- Tỉ lệ luôn kèm mẫu ("2/8"). Dưới ngưỡng mẫu → vân chéo + "Mẫu nhỏ · n=…", không bao giờ làm câu kết luận. So cùng điều kiện (tuần dở so với cùng số ngày tuần trước).
- Dùng `<MetricCard>`, `<BarChart>` (Recharts 3 qua `ChartContainer`), `<FunnelChart>`, `<StageAgingChart>`, `<MatrixTable>`, `<InsightList>`.
- Biểu đồ import từ `@/components/crm/charts` (không có trong barrel `@/components/crm`) và **tải lười** (`React.lazy` / route `lazy`): Recharts ~100KB gzip không được vào bundle chính (giới hạn precache PWA 2 MB làm hỏng build).

## 9. Chữ (tiếng Việt)

- Ngắn, động từ đứng đầu, viết hoa đầu câu: "Gọi lại", "Đặt lịch xem", "Thêm khách". Không VIẾT HOA trừ `text-overline`.
- Tiền "1,85 tỷ" / "650 triệu" (`fmtVND`), SĐT "0912 345 678" (`fmtPhone`), ngày dd/mm/yyyy, giờ "T5 22/10 09:39" (`fmtWhen`), khoảng "4n 06h" (`fmtDur`). Nhãn lấy từ `src/config/*` / `src/ui/display.ts`.

## 10. Tiếp cận

- `<button>` / `<a>` / `<input>` + `<label>` thật; nút chỉ icon cần `aria-label` (ActionButton tự có).
- Chữ ≥ 4,5:1 trên nền của nó ở cả hai giao diện (`src/styles/tokens.test.ts` kiểm); focus 2px `ion` mọi nơi.
- Chuyển động theo `prefers-reduced-motion` (đã xử lý chung).

## 11. Đang chuyển từ bản cũ (D-023 → D-028)

- **Mới — dùng cho mọi màn mới/làm lại:** `src/components/ui/*` (primitive), `src/components/crm/*` (import từ `@/components/crm`), `src/lib/crm` (nối luật app ↔ component), `cn` từ `@/lib/utils`.
- **Cũ — chỉ giữ cho màn chưa chuyển, không dùng ở code mới:** `src/ui/*` (trừ `display.ts`, `Icon.tsx`, `BlockBoundary.tsx` vẫn dùng chung), trang `/dev/ui`, các tên token cũ (`bg-surface`, `text-text-2`, `bg-accent`, `text-danger`, `rounded-card`, `text-small`…) — chúng đã trỏ vào màu mới nên màn cũ đổi màu theo ngay. Màn nào chuyển sang component mới thì đổi luôn class sang tên mới.
- Thứ tự chuyển màn: Hôm nay → Khách hàng (danh sách + Sheet khách) → Thông báo → Hiệu quả → form. Hết màn dùng thì xoá `src/ui/*` cũ, `/dev/ui`, khối "TÊN CŨ" trong `tokens.css` / `index.css` và tên cũ trong `src/lib/utils.ts`.

## 12. Khi thiếu component

Thêm vào `src/components/crm` kèm: một dòng JSDoc nói khi nào dùng, chỉ class token, một demo trên `/dev/ui-kit`, một dòng trong file này. Rồi dùng lại ở mọi nơi. Primitive shadcn mới (`npx shadcn add`) chỉ Lead thêm hoặc task mở rõ (có thể kéo thêm thư viện).
