# DESIGN.md — Realty CRM (Sổ Khách v3)

Rules for every human and AI worker who touches the UI. Short on purpose: **use the components; don't rebuild them.**
Live reference: run `npm run dev` and open the UI kit page (`src/pages/UiKit.tsx`).

## 0. The three hard rules

1. **Use what exists.** Before writing any UI, look in `src/components/crm` (CRM pieces) and `src/components/ui` (shadcn primitives). If it exists, use it. If it almost fits, extend it with a prop. Never make a look-alike.
2. **No raw colors, sizes or fonts.** Only token utilities (`bg-surface-100`, `text-ink-muted`, `text-alert-text`, `rounded-md`, `text-label`…). No hex, no `rgb()`, no Tailwind palette colors (`bg-blue-500`, `text-red-600`). `npm run check:colors` must pass.
3. **Color means urgency, nothing else.** Green / yellow / red are ONLY for time and urgency. Everything interactive is `ion` (cyan). Never use a signal color for decoration, a category, a chart series or a brand accent.

## 1. Signals (the core of an action-based CRM)

| Signal | Token | Meaning | Glyph | Copy |
|---|---|---|---|---|
| ok | `ok` | on track, on time, done | ● | "Đúng hẹn" |
| soon | `soon` | coming up, in progress, deadline near | ◆ | "Còn 45 phút", "Hôm nay 15:00" |
| alert | `alert` | overdue, act now | ▲ (pulses) | "Trễ 2 ngày", "Làm ngay" |

- Compute levels ONLY with `signalFor(due)` and `slaFor(stage, hours)` from `@/lib/crm`. Never decide a color by hand.
- Always glyph + words (`<SignalBadge>`), never color alone.
- Text in a signal color uses `*-text` (`text-alert-text`); fills/dots use the base (`bg-alert`); backgrounds use `*-tint`; text on a solid fill uses `on-*`.
- Only `alert` may glow (`shadow-glow-alert`) or pulse. `glow-ion` only for focus/AI/selected.
- Sort every list red → yellow → green (`LEVEL_ORDER`), most overdue first.

## 2. Pipeline & SLA

- Stages (`STAGES` in `@/lib/crm/stages.ts`): 1 Đăng ký mới → 2 Đang tiếp cận → 3 Đang chăm sóc ⇄ 3b Chăm dài hạn → 4 Booking & hồ sơ → 5 Ký HĐMB | Loại. Allowed moves: `STAGE_MOVES`.
- Stage is neutral (`<StageChip>`, ion segments). Urgency of the next step is separate (`<SignalBadge>`). A deal can be "Đã cọc" AND red.
- Every open stage has an SLA {ideal, max} in hours. Ideal → ok, ≤ max → soon, > max → alert with the overrun. Chăm dài hạn measures time since the last touch. Ký HĐMB / Loại stop the clock.
- Show SLA with `<SlaMeter>` (detail) or `<SlaMeter compact>` (rows). History with `<Timeline>`: stages outer, actions inside. When moving a customer, write `stage.end` = next `stage.start` in one transaction.

## 3. Actions

- Nine actions, one icon each (`ACTIONS`, Lucide): Gọi `Phone`, Hẹn lịch gọi `CalendarClock`, Nhắn `MessageCircleMore`, Ghi chú `NotebookPen`, Gặp `Coffee`, Xem nhà mẫu `MapPinHouse`, Booking `HandCoins`, Làm giấy tờ `FolderCheck`, Ký HĐ `Signature`.
- `<ActionButton display="inline|icon|stacked">`: inline when there is room, icon in dense rows (tooltip + aria-label automatic), stacked in mobile bars.
- Button variant follows urgency, not the action: overdue item → `alert` ("Làm ngay"), today → `primary`, rest → `secondary`/`ghost`. One `primary` (or `alert`) per view/row.
- `destructive` is for deleting and always sits behind a `<Dialog tone="alert">`. Prefer undo toasts over "are you sure?" for reversible actions.

## 4. Layout

- Every screen: `<AppShell sidebar={<Sidebar/>} header={<PageHeader/>}>`. Sidebar 232px / 64px collapsed (`[`), bottom tab bar on phones.
- `<PageHeader>`: LEFT title + total count (+ subtitle / signal badges), RIGHT 1–3 actions with the single primary LAST. Search + filters in `toolbar`, views in `tabs`.
- Open, don't navigate: a customer opens in a right `<Sheet>` (480px) with SlaMeter → Timeline → details; the list stays behind. `<Dialog>` only for decisions and ≤4 fields. Esc closes both.
- Spacing scale 4/8/16/24 (`gap-1/2/4/6`). Radius: `rounded-sm` badges/inputs, `rounded-md` buttons/cards, `rounded-lg` modals/tiles. Touch targets ≥ 44px. Mobile-first at 375px.

## 5. Data & forms

- Lists: `<DataTable>` compact 40px rows, sticky mono headers, hover `surface-200`, selected `ion-tint` + ion edge, `<Pagination>` 20/page, `loading` → skeleton rows, empty → `<EmptyState>`.
- Filters: chips not dropdowns (`<ChipGroup>` with counts), `<Segmented>` for scope, `<SortControl>` one field + worded direction (default "Độ gấp · Gấp nhất trước"). Panel in a right Sheet with saved views on top and "Xem N khách" in the footer; `<FilterBar>` above the list mirrors the state.
- Forms: `<TextField>`, `<SelectField>`, `<DatePicker>`, `<SearchBar>`. 44px controls, label above, hint/error below. Errors say what to fix. Units in `suffix` ("triệu/tháng", "VNĐ", "m²"). Phones/money/dates `numeric`.

## 6. Feedback

- Never a blank screen: `<Skeleton>` while loading (> 300ms), `<EmptyState kind>` with a reason + one action when empty, `kind="error"` + "Thử lại" on failure.
- `toast.success / info / error` (sonner, mounted once). Success 4s with "Hoàn tác" when reversible; errors stay until closed.
- Notifications are signals, not news: each says what, why (`SignalBadge`), and offers the action that clears it. Group ≥3 same-type signals in `<NotificationGroup>` with a bulk action. Bell count takes the color of the most urgent unread signal.

## 7. Charts

- Wrap every chart in `<ChartCard>`: overline title → **one takeaway sentence with a number** → (Cách tính on demand) → legend → chart → link to the customers behind it.
- Series colors: `chart-1` (one series / "this period"), `chart-prev` (comparison), `chart-2`, `chart-3`. Max 3 series. Signal colors only where they ARE signals (SLA aging, overdue badges).
- Rates always show their base ("2/8"). Below the sample threshold → hatched + "Mẫu nhỏ · n=…", and never the source of a headline. Compare like with like (partial week vs same days last week).
- Use `<MetricCard>`, `<BarChart>` (Recharts via shadcn `ChartContainer`), `<FunnelChart>`, `<StageAgingChart>`, `<MatrixTable>`, `<InsightList>`.

## 8. Copy (Vietnamese UI)

- Short, verb-first, sentence case: "Gọi lại", "Đặt lịch xem", "Thêm khách". No ALL CAPS except `text-overline` labels.
- Money "1,85 tỷ" / "650 triệu" (`fmtVND`), phone "0912 345 678" (`fmtPhone`), dates dd/mm/yyyy, times "T5 22/10 09:39" (`fmtWhen`), durations "4n 06h" (`fmtDur`).

## 9. Accessibility floor

- Real `<button>` / `<a>` / `<input>` + `<label>`; icon-only buttons need `aria-label` (ActionButton does it).
- Text ≥ 4.5:1 on its surface in both themes (tokens already pass); focus ring 2px `ion` everywhere.
- Motion respects `prefers-reduced-motion` (handled globally).

## 10. When something is missing

Add it to `src/components/crm` with: a JSDoc line saying when to use it, token-only styling, a demo on the UI kit page, and a line in this file. Then reuse it everywhere.
