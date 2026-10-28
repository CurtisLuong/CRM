import * as React from "react";
import { Moon, Plus, RotateCcw, Settings, Sun, Upload } from "lucide-react";
import { ACTIONS, type Stage } from "@/lib/crm";
import {
  Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Sheet, SheetBody, SheetContent,
  SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetToolbar, Skeleton, Textarea, Toaster, TooltipProvider, toast,
} from "@/components/ui";
import {
  ActionButton, ActionIcon, ActionItem, AppShell, BarChart, ChartCard, ChipGroup, DataTable, DatePicker, EmptyState, FilterBar, FilterSection,
  FunnelChart, InsightList, LeadRow, MatrixTable, MetricCard, NotificationBell, NotificationCenter, PageHeader, PipelineCard, SavedViews,
  SearchBar, Segmented, SelectField, Sidebar, SignalBadge, SlaMeter, SortControl, StageAgingChart, StageChip, StagePath, StatTile, TextField,
  Timeline, type Column, type SortValue, Avatar, NAV_DEFAULT,
} from "@/components/crm";
import { CUSTOMERS, JOURNEY_AN, NOTIFS, NOW, type Customer } from "./demo-data";

function Section({ id, title, children, note }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-overline">{title}</h2>
        {note && <p className="m-0 text-caption text-ink-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}
const Panel = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-lg border border-line bg-surface-100 p-4 ${className}`}>{children}</div>
);

export function UiKit() {
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  React.useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const [selected, setSelected] = React.useState<Customer | null>(null);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [bell, setBell] = React.useState(false);

  // filter state
  const [scope, setScope] = React.useState("funnel");
  const [signals, setSignals] = React.useState<string[]>(["alert"]);
  const [stages, setStages] = React.useState<string[]>(["caring"]);
  const [channels, setChannels] = React.useState<string[]>(["fb"]);
  const [sort, setSort] = React.useState<SortValue>({ field: "urgency", dir: "desc" });
  const [view, setView] = React.useState("hot");
  const LAB: Record<string, string> = { alert: "Quá hạn", soon: "Sắp tới", ok: "Đúng hẹn", new: "Đăng ký mới", approach: "Đang tiếp cận", caring: "Đang chăm sóc", booking: "Booking & hồ sơ", fb: "Facebook Ads", ref: "Giới thiệu", lp: "Landing page" };
  const chips = [
    ...signals.map((v) => ({ label: "Tín hiệu", value: LAB[v], onRemove: () => setSignals(signals.filter((x) => x !== v)) })),
    ...stages.map((v) => ({ label: "Bậc", value: LAB[v], onRemove: () => setStages(stages.filter((x) => x !== v)) })),
    ...channels.map((v) => ({ label: "Kênh", value: LAB[v], onRemove: () => setChannels(channels.filter((x) => x !== v)) })),
  ];
  const result = Math.max(0, 43 - chips.length * 9);
  const clearAll = () => { setSignals([]); setStages([]); setChannels([]); setScope("funnel"); };

  const columns: Column<Customer>[] = [
    { key: "name", label: "Khách", sortable: true, width: 200, render: (r) => <span className="flex items-center gap-2.5"><Avatar name={r.name} size={24} /><span className="truncate font-semibold">{r.name}</span></span> },
    { key: "phone", label: "Điện thoại", numeric: true, width: 130 },
    { key: "stage", label: "Stage", render: (r) => <StageChip stage={r.stage} /> },
    { key: "hrs", label: "SLA", sortable: true, sortValue: (r) => r.hrs ?? -1, render: (r) => (r.hrs == null ? <span className="text-ink-muted">—</span> : <SlaMeter stage={r.stage} elapsed={r.hrs} compact />) },
    { key: "next", label: "Việc tiếp", render: (r) => <span className="flex items-center gap-2"><ActionIcon action={r.action} size={16} className="text-ink-muted" />{r.next}</span> },
    { key: "due", label: "Hạn", render: (r) => (r.due === "—" ? <span className="text-ink-muted">—</span> : <SignalBadge level={r.level} size="sm">{r.due}</SignalBadge>) },
    { key: "src", label: "Nguồn" },
    { key: "upd", label: "Cập nhật", align: "right" },
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <AppShell
        sidebar={
          <Sidebar
            active="customers"
            onCreate={() => toast.info("Mở form Thêm khách")}
            items={NAV_DEFAULT.map((n) => (n.id === "today" ? { ...n, count: 34, level: "alert" as const } : n.id === "customers" ? { ...n, count: 248 } : n.id === "calendar" ? { ...n, count: 3, level: "soon" as const } : n))}
            user={{ name: "Curtis", sync: "Đồng bộ 13:15" }}
            footerItems={[{ id: "settings", label: "Cài đặt", icon: Settings }]}
          />
        }
        header={
          <PageHeader
            title="UI kit"
            count={45}
            noun="component"
            subtitle="Realty CRM · React + Tailwind v4 + shadcn/ui · tokens từ design system"
            actions={
              <>
                <NotificationBell count={43} level="alert" active={bell} onClick={() => setBell(!bell)} />
                <Button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun /> : <Moon />}{theme === "dark" ? "Sáng" : "Tối"}</Button>
                <Button variant="primary" onClick={() => toast.success("Đã lưu ghi chú", { description: "Nguyễn Văn An · 09:12", action: { label: "Hoàn tác", onClick: () => {} } })}><Plus />Thêm khách</Button>
              </>
            }
            toolbar={<SearchBar size="sm" shortcut="⌘K" className="max-w-80" />}
          />
        }
      >
        {bell && <div className="fixed right-6 top-20 z-40"><NotificationCenter variant="popover" sections={NOTIFS} onMarkAllRead={() => {}} onSeeAll={() => setBell(false)} /></div>}

        <Section id="signals" title="1 · Tín hiệu, stage, SLA" note="Màu chỉ nói độ gấp. Stage trung tính. SLA đếm thời gian ở bậc.">
          <Panel className="flex flex-wrap items-center gap-2">
            <SignalBadge level="ok">Đúng hẹn</SignalBadge>
            <SignalBadge level="soon">Còn 45:00</SignalBadge>
            <SignalBadge level="alert">Trễ 2 ngày</SignalBadge>
            <span className="mx-2 h-6 w-px bg-line" />
            {(["new", "approach", "caring", "nurture", "booking", "contract", "lost"] as Stage[]).map((s) => <StageChip key={s} stage={s} />)}
          </Panel>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            <Panel><SlaMeter stage="approach" elapsed={30} /></Panel>
            <Panel><SlaMeter stage="caring" elapsed={500} /></Panel>
            <Panel><SlaMeter stage="booking" elapsed={438} /></Panel>
          </div>
          <Panel className="overflow-x-auto p-0"><StagePath stage="caring" /></Panel>
        </Section>

        <Section id="actions" title="2 · Hành động" note="Lucide, cùng tên với lucide-react. inline · icon (tooltip) · stacked.">
          <Panel className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <ActionButton action="call" variant="primary" />
              <ActionButton action="schedule" />
              <ActionButton action="message" />
              <ActionButton action="visit" />
              <Button variant="alert">Làm ngay</Button>
            </div>
            <div className="flex flex-wrap gap-2">{ACTIONS.map((a, i) => <ActionButton key={a.id} action={a.id} display="icon" variant={i === 0 ? "alert" : "secondary"} />)}</div>
            <div className="flex flex-wrap gap-1">{ACTIONS.map((a) => <ActionButton key={a.id} action={a.id} display="stacked" variant="ghost" />)}</div>
          </Panel>
        </Section>

        <Section id="today" title="3 · Hôm nay — hàng đợi hành động">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            <StatTile level="alert" label="Quá hạn" value={34} delta="Lâu nhất: trễ 4 ngày" />
            <StatTile level="soon" label="Đến giờ hôm nay" value={7} delta="Gần nhất 14:00" />
            <StatTile level="ok" label="Đúng hẹn" value={18} delta="Không cần làm gì hôm nay" />
          </div>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
            <div className="flex flex-col gap-2">
              <ActionItem level="alert" title="Gọi lại — khách chờ báo giá" customer="Lê Minh Quân" context="Facebook Ads · 2PN" time="Trễ 2 ngày" action="call" actionLabel="Làm ngay" onAction={() => toast.info("Bắt đầu gọi…")} />
              <ActionItem level="soon" title="Dẫn khách xem nhà mẫu" customer="Nguyễn Văn An" context="Happy Home · căn góc" time="Còn 45:00" action="visit" />
              <ActionItem level="ok" title="Nhắc đóng cọc đợt 2" customer="Đỗ Thanh Tùng" context="Hạn 05/11" time="Đúng hẹn" action="booking" compact />
            </div>
            <div className="flex flex-col gap-4">
              <div className="overflow-hidden rounded-md border border-line">
                <LeadRow name="Bân Ca" phone="0912 345 678" project="FB Ads" stage="approach" level="alert" time="Trễ 4 ngày" nextStep="Gọi lại báo giá" />
                <LeadRow name="Nguyễn Văn An" phone="0987 654 321" project="Happy Home" stage="caring" level="soon" time="Còn 45:00" nextStep="Xem nhà mẫu" selected />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <PipelineCard name="Phạm Hồng Nhung" unit="Marquee Homes · 1PN" price="1,32 tỷ" level="alert" time="Trễ 1 ngày" />
                <PipelineCard name="Đỗ Thanh Tùng" unit="Happy Home · 3PN" price="2,40 tỷ" level="ok" time="05/11" />
              </div>
            </div>
          </div>
        </Section>

        <Section id="forms" title="4 · Form">
          <Panel>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              <TextField label="Họ tên" required defaultValue="Bùi Hương Lan" />
              <TextField label="Số điện thoại" numeric inputMode="tel" defaultValue="0342 851 805" />
              <SelectField label="Giới tính" defaultValue="Nữ" options={["Nữ", "Nam", "Khác"]} />
              <DatePicker label="Ngày sinh" defaultValue="10/06/1980" hint="46 tuổi · Mệnh Mộc · Song Tử" />
              <TextField label="Thu nhập" optional numeric placeholder="25" suffix="triệu/tháng" />
              <TextField label="SĐT người thân" numeric defaultValue="0912 34" error="Số điện thoại cần 10 chữ số" />
              <SelectField label="Lý do kết thúc" required placeholder="Chọn lý do" options={["Không đủ điều kiện NOXH", "Đã mua dự án khác", "Tài chính chưa đủ"]} />
              <SearchBar shortcut="⌘K" />
            </div>
          </Panel>
        </Section>

        <Section id="data" title="5 · Bảng dữ liệu + Drawer khách" note="Bấm một dòng để mở Drawer. Bộ lọc mở ở bên phải.">
          <FilterBar chips={chips} result={result} onOpen={() => setFilterOpen(true)} onClearAll={clearAll} sort={sort} onSort={() => setFilterOpen(true)} />
          <DataTable caption="Danh sách khách" columns={columns} rows={CUSTOMERS} loading={loading} selectedId={selected?.id} onRowClick={setSelected}
            pagination={{ page, total: 248, pageSize: 20, onPage: setPage }} />
          <div className="flex gap-2"><Button size="sm" onClick={() => { setLoading(true); setTimeout(() => setLoading(false), 1500); }}>Thử trạng thái đang tải</Button></div>
        </Section>

        <Section id="feedback" title="6 · Trạng thái rỗng, Skeleton, Toast, Dialog">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            <Panel className="p-0"><EmptyState kind="customers" compact actions={<><Button variant="primary">Thêm khách</Button><Button><Upload />Nhập Excel</Button></>} /></Panel>
            <Panel className="p-0"><EmptyState kind="done" compact /></Panel>
            <Panel className="p-0"><EmptyState kind="error" compact actions={<Button variant="primary"><RotateCcw />Thử lại</Button>} /></Panel>
            <Panel className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton circle className="size-10" /><div className="flex flex-1 flex-col gap-2"><Skeleton className="w-3/5" /><Skeleton className="h-2.5 w-1/3" /></div></div>)}
            </Panel>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => toast.success("Đã lưu ghi chú", { description: "Nguyễn Văn An", action: { label: "Hoàn tác", onClick: () => {} } })}>Toast thành công</Button>
            <Button onClick={() => toast.info("Đã tạo việc: Gọi lại 14:00")}>Toast thông tin</Button>
            <Button onClick={() => toast.error("Lỗi kết nối", { description: "Không gửi được tin Zalo.", duration: Infinity, action: { label: "Thử lại", onClick: () => {} } })}>Toast lỗi</Button>
            <LostDialog />
          </div>
        </Section>

        <Section id="notifications" title="7 · Thông báo">
          <Panel><NotificationCenter sections={NOTIFS} subtitle="Tín hiệu tính từ dữ liệu khách, cùng nguồn với Hôm nay." onMarkAllRead={() => {}} onSettings={() => {}} /></Panel>
        </Section>

        <Section id="charts" title="8 · Biểu đồ & báo cáo" note="Màu series: chart-1, chart-prev (so sánh), chart-2/3. Mẫu nhỏ: gạch chéo.">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
            <MetricCard label="Gọi khách mới" level="alert" value="4,1" unit="giờ" fraction="Trung vị · 15/45 đã gọi · SLA 15 phút" action={{ label: "Xem 30 khách chưa gọi" }} />
            <MetricCard label="Nói chuyện được" value="21" unit="%" fraction="3/14 khách mới đã gọi" delta={{ dir: "down", text: "−8 điểm so với tuần trước" }} />
            <MetricCard label="Chăm đúng nhịp" value="50" unit="%" fraction="1/2 khách trong phễu" sample={{ n: 2, min: 5 }} />
            <MetricCard label="Giữ lời hứa" value={null} emptyText="Chưa có lời hứa nào trong kỳ" />
          </div>
          <ChartCard title="Hiệu suất tuần" period="T2–T4, so với cùng kỳ" headline="Khách mới 9 so với 34 cùng kỳ tuần trước" headlineLevel="alert"
            legend={[{ color: "var(--chart-1)", label: "Tuần này" }, { color: "var(--chart-prev)", label: "Tuần trước (cùng kỳ)" }]} action={{ label: "Xem 9 khách mới" }}
            definition="So sánh tuần hiện tại (T2–T4) với cùng 3 ngày của tuần trước.">
            <BarChart series={[{ key: "now", label: "Tuần này", color: "var(--chart-1)" }, { key: "prev", label: "Tuần trước", color: "var(--chart-prev)" }]}
              data={[{ label: "Khách mới", now: 9, prev: 34 }, { label: "Cuộc gọi", now: 5, prev: 14 }, { label: "Nói chuyện", now: 1, prev: 2 }, { label: "Đạt", now: 0, prev: 0 }, { label: "Booking / Ký", now: 0, prev: 1 }]} />
          </ChartCard>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
            <ChartCard title="Nghe máy theo khung giờ" period="30 ngày" headline="Chưa đủ mẫu để chọn khung giờ" headlineLevel="soon" sample={{ n: 20, min: 40 }}
              legend={[{ color: "var(--chart-1)", label: "Tỉ lệ nghe máy" }, { hatched: true, label: "Mẫu nhỏ (< 10 cuộc)" }]}>
              <BarChart minSample={10} max={100} format={(v) => `${v ?? "—"}%`} series={[{ key: "value", label: "Nghe máy", color: "var(--chart-1)" }]}
                data={[{ label: "Sáng", sub: "2/8", value: 25, n: 8 }, { label: "Trưa", sub: "0/2", value: 0, n: 2 }, { label: "Chiều", sub: "2/9", value: 22, n: 9 }, { label: "Tối", sub: "1/1", value: 100, n: 1 }]} />
            </ChartCard>
            <ChartCard title="Nguồn khách" headline="Facebook Ads mang 97% khách; Đạt 23%">
              <BarChart layout="horizontal" height={170} series={[{ key: "value", label: "Khách", color: "var(--chart-1)" }]}
                data={[{ label: "Facebook Ads", value: 56, n: 56 }, { label: "Giới thiệu", value: 1, n: 1 }, { label: "Landing page", value: 1, n: 1 }]} minSample={5} />
            </ChartCard>
          </div>
          <ChartCard title="Phễu & tốc độ" period="46 khách vào phễu" headline="Đăng ký mới → Đang tiếp cận chỉ 37%, và 26 khách mới quá SLA" headlineLevel="alert" sample={{ n: 3, min: 5 }} action={{ label: "Xem 26 khách quá SLA" }}>
            <FunnelChart total={46} steps={[{ label: "Đăng ký mới", count: 46, avg: "3n 10h", overdue: 26 }, { label: "Đang tiếp cận", count: 17, avg: "2n 19h" }, { label: "Đang chăm sóc", count: 3, avg: "14n 18h" }, { label: "Booking & hồ sơ", count: 0 }, { label: "Ký HĐMB", count: 0 }]}
              outside={[{ label: "Chăm dài hạn", count: 10 }, { label: "Loại", count: 1 }]} />
          </ChartCard>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(420px,1fr))]">
            <ChartCard title="Tuổi bậc so với SLA" headline="26 khách mới đã quá hạn gọi đầu" headlineLevel="alert">
              <StageAgingChart rows={[{ stage: "new", ok: 3, soon: 4, alert: 26 }, { stage: "approach", ok: 9, soon: 6, alert: 2 }, { stage: "caring", ok: 1, soon: 2 }, { stage: "nurture", ok: 7, soon: 2, alert: 1 }, { stage: "booking" }]} />
            </ChartCard>
            <ChartCard title="Phễu theo nguồn" headline="Facebook Ads: liên lạc được chỉ 9% (5/56)" headlineLevel="alert">
              <MatrixTable rowHeader="Nguồn" columns={["Hợp lệ", "Liên lạc", "Đạt", "Booking", "Ký"]} rows={[
                { label: "Facebook Ads", meta: "56 khách", cells: [{ num: 56, den: 56 }, { num: 5, den: 56 }, { num: 13, den: 56 }, { num: 3, den: 56 }, { num: 0, den: 56 }] },
                { label: "Giới thiệu", meta: "1 khách", cells: [{ num: 1, den: 1 }, { num: 0, den: 1 }, { num: 1, den: 1 }, { num: 1, den: 1 }, { num: 0, den: 1 }] },
              ]} />
            </ChartCard>
          </div>
          <ChartCard title="Cần cải thiện" headline="2 việc nên sửa tuần này">
            <InsightList items={[
              { level: "alert", title: "26 khách mới đăng ký hơn 24 giờ vẫn chưa được gọi", evidence: "26/29 khách mới · SLA gọi đầu 15 phút", action: { label: "Gọi lần lượt 26" } },
              { level: "soon", title: "Tỉ lệ liên lạc được thấp: 3/14 khách đã gọi", evidence: "Thử nhắn Zalo trước khi gọi, và đổi khung giờ gọi", action: { label: "Xem 14 khách" } },
            ]} />
          </ChartCard>
        </Section>
      </AppShell>

      {/* Customer drawer */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent width={480} aria-describedby={undefined}>
          {selected && (
            <>
              <SheetHeader>
                <span className="text-overline">Khách hàng · #A-{String(selected.id).padStart(4, "0")}</span>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription asChild>
                  <div><span className="font-mono">{selected.phone}</span><StageChip stage={selected.stage} />{selected.due !== "—" && <SignalBadge level={selected.level} size="sm">{selected.due}</SignalBadge>}</div>
                </SheetDescription>
              </SheetHeader>
              <SheetToolbar>{(["call", "schedule", "message", "note", "visit", "booking"] as const).map((a, i) => <ActionButton key={a} action={a} display="icon" size="sm" variant={i === 0 ? "primary" : "secondary"} />)}</SheetToolbar>
              <SheetBody>
                {selected.hrs != null && <div className="rounded-md border border-line bg-surface-0 p-3"><SlaMeter stage={selected.stage} elapsed={selected.hrs} /></div>}
                <span className="text-overline">Hành trình · 8 việc</span>
                <Timeline stages={JOURNEY_AN} now={NOW} collapsePast />
              </SheetBody>
              <SheetFooter>
                <Button>Mở trang đầy đủ</Button>
                <span className="flex-1" />
                <ActionButton action="call" variant="primary" />
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Filter drawer */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent width={420} aria-describedby={undefined}>
          <SheetHeader>
            <span className="text-overline">{result} khách khớp</span>
            <SheetTitle>Lọc & sắp xếp</SheetTitle>
          </SheetHeader>
          <SheetBody className="gap-6">
            <FilterSection title="Tệp đã lưu"><SavedViews active={view} onApply={setView} onSave={() => toast.info("Đặt tên cho tệp…")} onDelete={() => {}} views={[{ id: "today", label: "Hôm nay", count: 41 }, { id: "hot", label: "Khách nóng", count: 6 }, { id: "fbweek", label: "FB tuần này", count: 9 }]} /></FilterSection>
            <FilterSection title="Phạm vi"><Segmented block value={scope} onChange={setScope} label="Phạm vi" options={[{ value: "funnel", label: "Trong phễu", count: 49 }, { value: "nurture", label: "Chăm dài hạn", count: 10 }, { value: "ended", label: "Đã kết thúc", count: 1 }]} /></FilterSection>
            <FilterSection title="Tín hiệu" summary={signals.length ? `${signals.length} đã chọn` : null} onReset={signals.length ? () => setSignals([]) : null}>
              <ChipGroup multiple value={signals} onChange={setSignals} label="Tín hiệu" options={[{ value: "alert", label: "Quá hạn", level: "alert", count: 34 }, { value: "soon", label: "Sắp tới", level: "soon", count: 7 }, { value: "ok", label: "Đúng hẹn", level: "ok", count: 8 }]} />
            </FilterSection>
            <FilterSection title="Bậc chăm sóc" summary={stages.length ? `${stages.length} đã chọn` : null} onReset={stages.length ? () => setStages([]) : null}>
              <ChipGroup multiple value={stages} onChange={setStages} label="Bậc chăm sóc" options={[{ value: "new", stage: "new", count: 29 }, { value: "approach", stage: "approach", count: 17 }, { value: "caring", stage: "caring", count: 3 }, { value: "booking", stage: "booking", count: 0 }]} />
            </FilterSection>
            <FilterSection title="Kênh" onReset={channels.length ? () => setChannels([]) : null}>
              <ChipGroup multiple value={channels} onChange={setChannels} label="Kênh" options={[{ value: "fb", label: "Facebook Ads", count: 56 }, { value: "ref", label: "Giới thiệu", count: 1 }, { value: "lp", label: "Landing page", count: 1 }]} />
            </FilterSection>
            <FilterSection title="Sắp xếp"><SortControl value={sort} onChange={setSort} /></FilterSection>
          </SheetBody>
          <SheetFooter>
            <Button variant="ghost" onClick={clearAll}><RotateCcw />Xoá lọc</Button>
            <span className="flex-1" />
            <Button variant="primary" onClick={() => setFilterOpen(false)}>Xem {result} khách</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <Toaster theme={theme} />
    </TooltipProvider>
  );
}

function LostDialog() {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>Dialog: chuyển sang Loại</Button>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Chuyển Hồng D sang Loại?</DialogTitle>
          <DialogDescription>Khách sẽ rời hàng đợi và mọi đồng hồ SLA dừng lại. Có thể mở lại sau.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <SelectField label="Lý do" required placeholder="Chọn lý do" options={["Không đủ điều kiện NOXH", "Đã mua dự án khác", "Tài chính chưa đủ", "Không liên lạc được"]} />
          <TextField label="Liên hệ lại sau" optional numeric placeholder="90" suffix="ngày" hint="Để trống nếu không retarget" />
          <Textarea placeholder="Ghi chú kết thúc (tuỳ chọn)" />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button variant="primary" onClick={() => { setOpen(false); toast.success("Đã chuyển Hồng D sang Loại", { action: { label: "Hoàn tác", onClick: () => {} } }); }}>Chuyển sang Loại</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
