import { type ReactNode, useState } from 'react';
import type { FeatureRoute } from '@/app/routes';
import { THEME_OPTIONS, type ThemePref, useThemePref } from '@/app/theme';
import type { CallResult } from '@/config/callResults';
import type { CallSlotKey } from '@/config/followup';
import {
  ActionBar,
  AIBlock,
  Badge,
  BottomNav,
  BriefCard,
  Button,
  DeadlineTag,
  EmptyState,
  ErrorState,
  FactRow,
  Header,
  HealthDot,
  IconButton,
  Kbd,
  ListRow,
  Loading,
  MetricTile,
  MiniChart,
  NextActionCard,
  OutcomePicker,
  QueueRow,
  RowList,
  SegmentedControl,
  Sheet,
  SignalCard,
  Skeleton,
  SlaRing,
  SlotPicker,
  StageChip,
  SyncIndicator,
  Tabs,
  Timeline,
  ToastProvider,
  useToast,
} from '@/ui';

/** Gallery component src/ui (T2.C2): mọi biến thể + trạng thái, cả sáng/tối. Trang dev, không phải màn người dùng. */

const noop = () => {};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex flex-col gap-3">
      <h2 id={`${id}-h`} className="text-section">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function ButtonsDemo() {
  return (
    <Section id="button" title="Button · IconButton">
      <Row>
        <Button variant="primary" icon="call">
          Gọi chị Lan
        </Button>
        <Button variant="secondary" icon="note">
          Ghi chú
        </Button>
        <Button variant="ghost">Để sau</Button>
        <Button variant="danger">Xoá khách</Button>
        <Button variant="ai" icon="ai">
          Tóm tắt
        </Button>
      </Row>
      <Row>
        <Button variant="primary" loading>
          Đang lưu
        </Button>
        <Button variant="secondary" disabled>
          Không khả dụng
        </Button>
      </Row>
      <Row>
        <IconButton icon="call" label="Gọi" />
        <IconButton icon="message" label="Zalo" />
        <IconButton icon="note" label="Ghi chú" />
        <IconButton icon="ai" label="Hỏi AI" variant="ai" />
        <IconButton icon="settings" label="Cài đặt" variant="ghost" />
        <IconButton icon="call" label="Gọi (tắt)" disabled />
      </Row>
    </Section>
  );
}

function StatusDemo() {
  return (
    <Section id="status" title="DeadlineTag · StageChip · SlaRing · HealthDot · Badge · Kbd">
      <Row>
        <DeadlineTag tag={{ state: 'far', text: 'còn 2 ngày' }} />
        <DeadlineTag tag={{ state: 'soon', text: 'còn 45 phút' }} time="14:30" />
        <DeadlineTag tag={{ state: 'due', text: 'đến hạn' }} time="14:30" />
        <DeadlineTag tag={{ state: 'missed', text: '2 giờ' }} />
        <DeadlineTag tag={{ state: 'done', text: '' }} time="09:12" />
      </Row>
      <Row>
        <StageChip stage="Đăng kí mới" />
        <StageChip stage="Đang chăm sóc" sla={{ value: 0.4, target: 0.6, label: 'Đã 2/5 ngày ở bậc' }} />
        <StageChip stage="Xem dự án" sla={{ value: 0.8, target: 0.6, label: 'Quá mục tiêu: 4/5 ngày' }} />
        <StageChip
          stage="Booking & Làm hồ sơ"
          label="Booking"
          sla={{ value: 1.2, target: 0.6, label: 'Quá hạn mức: 6/5 ngày' }}
        />
        <StageChip stage="Nuôi dài hạn" />
        <StageChip stage="Loại" label="Không chốt" />
      </Row>
      <Row>
        <SlaRing value={0.3} target={0.6} label="30% hạn mức" size={24} />
        <SlaRing value={0.75} target={0.6} label="Quá mục tiêu" size={24} />
        <SlaRing value={1} target={0.6} label="Quá hạn mức" size={24} />
      </Row>
      <Row>
        <HealthDot health="ok" showText />
        <HealthDot health="late" showText />
        <HealthDot health="risk" showText />
        <HealthDot health="unknown" showText />
      </Row>
      <Row>
        <Badge>Hải Phòng</Badge>
        <Badge variant="status" tone="success">
          Đã xác nhận
        </Badge>
        <Badge variant="status" tone="warning">
          Cần chú ý
        </Badge>
        <Badge variant="status" tone="danger">
          Nguy cơ
        </Badge>
        <Badge variant="ai">Gợi ý AI</Badge>
        <Badge variant="count">3</Badge>
        <Kbd keys={['⌘', 'K']} />
      </Row>
    </Section>
  );
}

function NavDemo() {
  const [tab, setTab] = useState('today');
  return (
    <Section id="nav" title="Header · SyncIndicator · BottomNav · ActionBar">
      <div className="overflow-hidden rounded-card border border-border">
        <Header title="Hôm nay" onSearch={noop} sync={<SyncIndicator state={{ kind: 'synced', at: '14:02' }} />} />
        <Header title="Hồ sơ khách — Nguyễn Thị Lan" compact sync={<SyncIndicator state={{ kind: 'offline' }} />} />
      </div>
      <Row>
        <SyncIndicator state={{ kind: 'synced', at: '14:02' }} />
        <SyncIndicator state={{ kind: 'pending', count: 3 }} />
        <SyncIndicator state={{ kind: 'offline' }} />
        <SyncIndicator state={{ kind: 'error' }} onOpen={noop} />
      </Row>
      {/* transform → khung chứa cho phần tử fixed, để xem BottomNav trong gallery. */}
      <div className="relative h-20 overflow-hidden rounded-card border border-border [transform:translateZ(0)]">
        <BottomNav
          tabs={[
            { value: 'today', label: 'Hôm nay', icon: 'home', badge: 2 },
            { value: 'customers', label: 'Khách hàng', icon: 'customers' },
            { value: 'tasks', label: 'Công việc', icon: 'task' },
            { value: 'insight', label: 'Hiệu quả', icon: 'chart' },
          ]}
          active={tab}
          onSelect={setTab}
          onAdd={noop}
        />
      </div>
      <div className="overflow-hidden rounded-card border border-border">
        <ActionBar
          actions={[
            { icon: 'call', label: 'Gọi', onClick: noop },
            { icon: 'message', label: 'Zalo', onClick: noop },
            { icon: 'note', label: 'Ghi chú', onClick: noop },
            { icon: 'call_sched', label: 'Hẹn', onClick: noop },
          ]}
        />
      </div>
    </Section>
  );
}

function RowsDemo() {
  const toast = useToast();
  return (
    <Section id="rows" title="QueueRow · ListRow">
      <div className="overflow-hidden rounded-card border border-border">
        <RowList label="Hàng đợi">
          <QueueRow
            name="Nguyễn Thị Lan"
            action="Gọi lại lần 2"
            reason="Hẹn chiều nay"
            deadline={{ state: 'due', text: 'đến hạn' }}
            time="14:30"
            onOpen={noop}
            onCall={noop}
            onZalo={noop}
            onSwipeLeft={() => toast({ title: 'Đã xong: Gọi lại lần 2', onUndo: noop })}
          />
          <QueueRow
            name="Trần Văn Hưởng"
            action="Gửi bảng giá"
            reason="Khách hỏi toà B"
            deadline={{ state: 'missed', text: '2 giờ' }}
            onOpen={noop}
            onCall={noop}
            onZalo={noop}
          />
          <QueueRow
            name="Phạm Đức Trường Giang Nguyễn Hoàng Long"
            action="Hẹn xem dự án"
            reason="Tên rất dài được cắt gọn"
            deadline={{ state: 'soon', text: 'còn 40 phút' }}
            time="20:00"
            onOpen={noop}
            onCall={noop}
          />
        </RowList>
      </div>
      <div className="overflow-hidden rounded-card border border-border">
        <RowList label="Danh sách khách">
          <ListRow
            name="Lê Thị Ngữ"
            stage="Đang chăm sóc"
            health="ok"
            meta="NOXH Hưng Yên · 3 ngày trước"
            onOpen={noop}
            onCall={noop}
            onZalo={noop}
          />
          <ListRow
            name="Vũ Minh Tự"
            stage="Xem dự án"
            health="late"
            meta="Hải Phòng · 9 ngày"
            deadline={{ state: 'far', text: 'T6' }}
            onOpen={noop}
            onCall={noop}
          />
          <ListRow name="Đỗ Thị Đường" stage="Đăng kí mới" health="unknown" meta="Chưa liên hệ" onOpen={noop} />
        </RowList>
      </div>
    </Section>
  );
}

function CardsDemo() {
  const [aiLoading, setAiLoading] = useState(false);
  return (
    <Section id="cards" title="NextActionCard · SignalCard · AIBlock">
      <NextActionCard
        reason="Khách hẹn gọi lại · quá 2 lần chưa liên lạc"
        name="Nguyễn Thị Lan"
        action="Gọi lại lần 3"
        deadline={{ state: 'due', text: 'đến hạn' }}
        time="14:30"
        evidence={['Bậc: Đang chăm sóc', 'Liên hệ cuối 5 ngày', 'Quan tâm 2PN toà B']}
        brief="Mua để ở · cần 2PN · vay 70% · chồng quyết định"
        primary={{ label: 'Gọi', icon: 'call', onClick: noop }}
        secondary={[
          { label: 'Zalo', icon: 'message', onClick: noop },
          { label: 'Dời', icon: 'call_sched', onClick: noop },
        ]}
      />
      <SignalCard
        icon="idle"
        title="5 khách lâu chưa liên hệ"
        why="quá 14 ngày không có tương tác (n=5)"
        cta={{ label: 'Xem 5 khách', onClick: noop }}
        onSnooze={noop}
        onDismiss={noop}
      />
      <AIBlock source="dựa trên 3 ghi chú gần nhất" loading={aiLoading} onUse={noop} onEdit={noop} onDiscard={noop}>
        Chị Lan quan tâm căn 2PN toà B, đang chờ chồng xem tài chính. Nên gửi bảng tính vay 70% trước cuộc gọi.
      </AIBlock>
      <Row>
        <Button variant="ghost" onClick={() => setAiLoading((v) => !v)}>
          {aiLoading ? 'Hiện nội dung AI' : 'Xem trạng thái đang tạo'}
        </Button>
      </Row>
    </Section>
  );
}

function ProfileDemo() {
  return (
    <Section id="profile" title="BriefCard · FactRow · Timeline · Tabs">
      <BriefCard
        items={[
          { label: 'Mua để', value: 'Ở' },
          { label: 'Cần', value: '2PN, tầng trung, toà B' },
          { label: 'Tài chính', value: 'Vay 70% · có 600 triệu' },
          { label: 'Người quyết định', value: null, ask: 'Ngoài chị còn ai cùng quyết?' },
          { label: 'Phản đối', value: 'Xa trường học' },
          { label: 'Lời hứa mở', value: 'Em gửi bảng giá trước T6' },
          { label: 'Liên hệ cuối', value: '12/10 · Zalo' },
        ]}
      />
      <div className="divide-y divide-border rounded-card border border-border bg-surface px-4">
        <FactRow label="Thu nhập hộ" value="25 triệu/tháng" source="Sale · 12/10" onEdit={noop} />
        <FactRow label="Nơi làm việc" value="KCN Đình Vũ" source="AI đã duyệt · 120 ngày" stale onEdit={noop} />
        <FactRow label="Số người ở" source="—" onEdit={noop} />
      </div>
      <Tabs
        label="Hồ sơ"
        items={[
          {
            value: 'timeline',
            label: 'Dòng thời gian',
            count: 4,
            content: (
              <Timeline
                days={[
                  {
                    day: 'Hôm nay',
                    entries: [
                      {
                        id: '1',
                        icon: 'talked',
                        title: 'Nói chuyện được',
                        time: '09:12',
                        body: 'Khách hẹn chiều gọi lại.',
                      },
                      {
                        id: '2',
                        icon: 'sla',
                        title: 'Chuyển sang Đang chăm sóc',
                        time: '08:00',
                        auto: 'Tự động · SLA',
                      },
                    ],
                  },
                  {
                    day: 'Thứ Hai, 12/10',
                    entries: [
                      { id: '3', icon: 'message', title: 'Đã gửi Zalo', time: '20:05', body: 'Mẫu: Giới thiệu dự án' },
                      { id: '4', icon: 'ai', title: 'Tóm tắt hồ sơ', time: '20:10', auto: 'AI' },
                    ],
                  },
                ]}
              />
            ),
          },
          { value: 'memory', label: 'Trí nhớ', content: <EmptyState icon="history" title="Chưa có ghi nhớ" /> },
          { value: 'needs', label: 'Nhu cầu', content: <p className="text-body">2PN · 1,8–2,2 tỷ</p> },
        ]}
      />
    </Section>
  );
}

function PickersDemo() {
  const [outcome, setOutcome] = useState<CallResult | null>(null);
  const [day, setDay] = useState('today');
  const [slot, setSlot] = useState<CallSlotKey | null>('C');
  return (
    <Section id="pickers" title="OutcomePicker · SlotPicker">
      <OutcomePicker value={outcome} onValueChange={setOutcome} />
      <SlotPicker
        days={[
          { value: 'today', label: 'Hôm nay' },
          { value: 'tomorrow', label: 'Mai' },
          { value: 'mon', label: 'T2' },
          { value: 'tue', label: 'T3' },
          { value: 'wed', label: 'T4' },
        ]}
        day={day}
        onDayChange={setDay}
        slot={slot}
        onSlotChange={setSlot}
        suggested="C"
      />
    </Section>
  );
}

function MetricsDemo() {
  const week = [
    { label: 'T2', value: 8 },
    { label: 'T3', value: 12 },
    { label: 'T4', value: 9 },
    { label: 'T5', value: 15 },
    { label: 'T6', value: 11 },
  ];
  return (
    <Section id="metrics" title="MetricTile · MiniChart">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile
          label="Gọi được"
          value="67%"
          ratio="12/18 khách"
          period="7 ngày"
          trend={{ dir: 'up', text: '+8 điểm so với tuần trước' }}
        />
        <MetricTile label="Đúng nhịp" value="9" ratio="9/14" smallSample="n=14 — mẫu nhỏ" />
        <MetricTile
          label="Booking"
          value="1,25 tỷ"
          period="tháng 10"
          trend={{ dir: 'flat', text: 'như tháng trước' }}
        />
        <MetricTile label="Giờ gọi tốt" value={null} />
      </div>
      <div className="grid gap-4 rounded-card border border-border bg-surface p-4 lg:grid-cols-3">
        <MiniChart
          kind="spark"
          title="Cuộc gọi / ngày"
          data={week}
          compare={week.map((w) => ({ ...w, value: w.value - 3 }))}
        />
        <MiniChart kind="bar" title="Khách mới theo ngày" data={week} />
        <MiniChart
          kind="funnel"
          title="Phễu tháng 10"
          data={[
            { label: 'Đăng kí mới', value: 40 },
            { label: 'Đang tiếp cận', value: 28 },
            { label: 'Đang chăm sóc', value: 15 },
            { label: 'Xem dự án', value: 6 },
            { label: 'Booking', value: 2 },
          ]}
        />
      </div>
    </Section>
  );
}

function FeedbackDemo() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  return (
    <Section id="feedback" title="Sheet · Toast · EmptyState · Skeleton · ErrorState">
      <Row>
        <Button variant="primary" icon="note" onClick={() => setOpen(true)}>
          Mở sheet Ghi chú
        </Button>
        <Button onClick={() => toast({ title: 'Đã xong việc', description: 'Gọi lại lần 2 — chị Lan', onUndo: noop })}>
          Toast Hoàn tác
        </Button>
        <Button onClick={() => toast({ title: 'Lưu không thành công', tone: 'error', onRetry: noop })}>
          Toast lỗi
        </Button>
      </Row>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setNote('');
        }}
        title="Ghi chú cho chị Lan"
        description="Đang chăm sóc · 0912 *** 678"
        dirty={note.trim().length > 0}
        footer={
          <>
            <Button
              className="flex-1"
              onClick={() => {
                setOpen(false);
                setNote('');
              }}
            >
              Huỷ
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={!note.trim()}
              onClick={() => {
                setOpen(false);
                setNote('');
                toast({ title: 'Đã lưu ghi chú', onUndo: noop });
              }}
            >
              Lưu
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-label text-text-2">Nội dung</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="rounded-control border border-border-strong bg-surface px-3 py-2 text-body placeholder:text-text-3"
            placeholder="Khách nói gì, hẹn gì…"
          />
        </label>
      </Sheet>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-card border border-border bg-surface">
          <EmptyState
            icon="customers"
            title="Chưa có khách trong tệp này"
            hint="Thêm khách hoặc đổi bộ lọc để xem nhiều hơn."
            action={{ label: 'Thêm khách', icon: 'new_lead', onClick: noop }}
          />
        </div>
        <div className="rounded-card border border-border bg-surface p-4">
          <Loading label="Đang tải hàng đợi">
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </Loading>
        </div>
        <div className="rounded-card border border-border bg-surface">
          <ErrorState detail="Mất kết nối khi đồng bộ. Dữ liệu đã lưu trên máy." onRetry={noop} />
        </div>
      </div>
    </Section>
  );
}

const SECTIONS = [
  ['button', 'Button'],
  ['status', 'Trạng thái'],
  ['nav', 'Điều hướng'],
  ['rows', 'Dòng'],
  ['cards', 'Card'],
  ['profile', 'Hồ sơ'],
  ['pickers', 'Chọn'],
  ['metrics', 'Số liệu'],
  ['feedback', 'Phản hồi'],
] as const;

function Gallery() {
  const [pref, setPref] = useThemePref();
  return (
    <ToastProvider>
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pt-6 pb-28">
        <header className="flex flex-col gap-3">
          <h1 className="text-title">Component src/ui</h1>
          <p className="text-small text-text-2">Gallery Design System v3 — mọi biến thể và trạng thái, sáng và tối.</p>
          <SegmentedControl<ThemePref>
            label="Giao diện"
            options={THEME_OPTIONS}
            value={pref}
            onValueChange={setPref}
            className="max-w-sm"
          />
          <nav aria-label="Mục" className="flex flex-wrap gap-x-3 gap-y-1">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="text-small text-accent underline-offset-2 hover:underline">
                {label}
              </a>
            ))}
          </nav>
        </header>
        <ButtonsDemo />
        <StatusDemo />
        <NavDemo />
        <RowsDemo />
        <CardsDemo />
        <ProfileDemo />
        <PickersDemo />
        <MetricsDemo />
        <FeedbackDemo />
      </main>
    </ToastProvider>
  );
}

export const route: FeatureRoute = { path: '/dev/ui', element: <Gallery /> };
