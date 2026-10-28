import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { ActionButton, ChipGroup, type Column, DataTable, FilterBar, LeadRow } from '@/components/crm';
import { Button as KitButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { APT_TYPES } from '@/config/aptTypes';
import { SOURCES } from '@/config/sources';
import { CARE_STAGE_BRANCH, CARE_STAGE_DISPLAY, CARE_STAGE_PICKER_ORDER } from '@/config/stages';
import { useCustomers, useRepositoryAccount, useSyncStatus } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { isQualified, normStage, sourceListOf } from '@/domain/customer/normalize';
import { apartmentGroup } from '@/domain/search/search';
import { CustomerSheet as QuickCustomerSheet } from '@/features/customer-sheet/CustomerSheet';
import { openQuickAction } from '@/features/quick-actions/store';
import {
  type AssignmentMode,
  assignmentFollowers,
  assignmentNote,
  canAssignCustomer,
  type TeamMember,
} from '@/features/team/model';
import type { Level, Stage } from '@/lib/crm';
import { cn } from '@/lib/utils';
import { Icon } from '@/ui/Icon';
import { useToast } from '../../ui/Toast';
import { CalendarRange } from './CalendarRange';
import {
  type CustomerFilters,
  type CustomerGroup,
  customDateLabel,
  customerGroupCounts,
  type DatePreset,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  dayKey,
  defaultFiltersFor,
  isFilterDirty,
  listCardSub,
  normalizeFilters,
  parseDayKey,
  parseSortChoice,
  type SortChoice,
  sortCustomers,
  v1FilterCustomers,
  virtualWindow,
} from './model';

type SavedSegment = {
  id: string;
  name: string;
  group: CustomerGroup;
  filters: CustomerFilters;
  sort: SortChoice;
  view: 'list' | 'cards';
};
type TeamPerson = {
  user_id?: string;
  id?: string;
  name?: string;
  full_name?: string;
  email?: string;
  is_admin?: boolean;
  is_me?: boolean;
};
const STORE = 'crm_v2_customer_segments';
// Chiều sắp xếp 3 tầng nhớ theo người dùng trên thiết bị (L4).
const SORT_STORE = 'crm_v2_customer_sort';
// Nhóm + bộ lọc + ô tìm nhớ trong phiên tab: rời màn (mở hồ sơ) rồi quay lại vẫn đúng chỗ (CL-01 L7).
// sessionStorage: tab mới = phiên mới → về Tiềm năng như trước.
const VIEW_STORE = 'crm_v2_customer_view';
// Thẻ gọn cao 64px + khe 8px = 72px; virtualWindow cần đúng nhịp này.
const CARD_HEIGHT = 64;
const CARD_GAP = 8;
const MOBILE_ITEM_HEIGHT = CARD_HEIGHT + CARD_GAP;
const DESKTOP_ITEM_HEIGHT = 40;

function Button({
  icon,
  loading,
  disabled,
  variant = 'secondary',
  ...props
}: React.ComponentProps<typeof KitButton> & { icon?: string; loading?: boolean }) {
  const content = icon ? (
    <>
      <Icon name={icon} size={20} />
      {props.children}
    </>
  ) : (
    props.children
  );
  return (
    <KitButton
      variant={variant === 'primary' ? 'primary' : variant === 'ghost' ? 'ghost' : 'secondary'}
      disabled={disabled || loading}
      {...props}
    >
      {content}
    </KitButton>
  );
}

function IconButton({ icon, label, onClick }: { icon: string; label: string; variant?: string; onClick: () => void }) {
  return (
    <KitButton variant="ghost" size="icon" aria-label={label} onClick={onClick}>
      <Icon name={icon} size={20} />
    </KitButton>
  );
}

function CustomerSheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-label={title}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <SheetBody>{children}</SheetBody>
        {footer && <SheetFooter>{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}

const CHIP =
  'inline-flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-label font-semibold transition-colors duration-(--dur-fast) focus-visible:outline-2 focus-visible:outline-ion';
const chipClass = (active: boolean) =>
  cn(CHIP, active ? 'border-ion bg-ion text-on-ion' : 'border-line bg-surface-100 text-ink hover:bg-surface-200');

function loadSaved(userId: string): SavedSegment[] {
  try {
    return JSON.parse(localStorage.getItem(`${STORE}:${userId}`) || '[]');
  } catch {
    return [];
  }
}

function loadSort(userId: string): SortChoice {
  try {
    return parseSortChoice(JSON.parse(localStorage.getItem(`${SORT_STORE}:${userId}`) || 'null'));
  } catch {
    return { ...DEFAULT_SORT };
  }
}

function saveSort(userId: string, choice: SortChoice) {
  if (!userId) return;
  try {
    localStorage.setItem(`${SORT_STORE}:${userId}`, JSON.stringify(choice));
  } catch {
    // Chế độ riêng tư / bộ nhớ đầy: chỉ mất phần nhớ lựa chọn, danh sách vẫn sắp đúng.
  }
}

type StoredView = { group: CustomerGroup; filters: CustomerFilters };

/** Đọc nhóm + bộ lọc của phiên này; dữ liệu hỏng/thiếu → null (về mặc định). */
function loadView(userId: string): StoredView | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(`${VIEW_STORE}:${userId}`) || 'null') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const value = raw as { group?: unknown; filters?: unknown };
    const group =
      value.group === 'new' || value.group === 'team' || value.group === 'potential' ? value.group : 'potential';
    return { group, filters: normalizeFilters(value.filters) };
  } catch {
    return null;
  }
}

function saveView(userId: string, group: CustomerGroup, filters: CustomerFilters) {
  if (!userId) return;
  try {
    sessionStorage.setItem(`${VIEW_STORE}:${userId}`, JSON.stringify({ group, filters }));
  } catch {
    // Không nhớ được thì chỉ mất vị trí khi quay lại, danh sách vẫn chạy.
  }
}

type SortToggleProps<K extends keyof SortChoice> = {
  label: string;
  value: SortChoice[K];
  /** Hai chiều: phần tử [0] là mặc định (aria-pressed = đang ở chiều mặc định). */
  choices: readonly [
    { value: SortChoice[K]; text: string; arrow: '↑' | '↓' },
    { value: SortChoice[K]; text: string; arrow: '↑' | '↓' },
  ];
  onChange: (value: SortChoice[K]) => void;
};

/**
 * Một hàng cho một tầng sắp xếp (Curtis 2026-10-22): tên tầng + hai mũi tên ngược chiều,
 * chiều đang dùng sáng, chiều kia mờ. Cả hàng là một nút đổi chiều, vùng chạm 44px.
 */
function SortToggle<K extends keyof SortChoice>({ label, value, choices, onChange }: SortToggleProps<K>) {
  const atFirst = choices[0].value === value;
  const current = atFirst ? choices[0] : choices[1];
  const next = atFirst ? choices[1] : choices[0];
  const activeArrow = current.arrow;
  return (
    <button
      type="button"
      aria-label={`${label}: ${current.text}`}
      aria-pressed={atFirst}
      onClick={() => onChange(next.value)}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-line bg-surface-100 px-3 text-left transition-colors duration-(--dur-fast) focus-visible:outline-2 focus-visible:outline-ion"
    >
      <span className="min-w-0 truncate text-body">{label}</span>
      <span aria-hidden className="flex shrink-0 items-center gap-1">
        {(['↑', '↓'] as const).map((arrow) => (
          <span
            key={arrow}
            className={cn(
              'flex size-8 items-center justify-center rounded-[8px] font-semibold text-body',
              arrow === activeArrow ? 'bg-ion-tint text-ion' : 'text-ink-muted',
            )}
          >
            {arrow}
          </span>
        ))}
      </span>
    </button>
  );
}

function Customers() {
  const params = useParams();
  const navigate = useNavigate();
  const account = useRepositoryAccount();
  const rows = useCustomers();
  const syncStatus = useSyncStatus();
  const toast = useToast();
  const userId = account?.sync.local.userId || '';
  const [group, setGroup] = useState<CustomerGroup>('potential');
  const [filters, setFilters] = useState<CustomerFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortChoice>(DEFAULT_SORT);
  // Đồng hồ dùng cho sắp xếp + dòng phụ: cập nhật mỗi phút, không đổi theo mỗi lần cuộn (memo ổn định).
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<'list' | 'cards'>('list');
  const [saved, setSaved] = useState<SavedSegment[]>([]);
  const [activeSaved, setActiveSaved] = useState('');
  const [team, setTeam] = useState<TeamPerson[]>([]);
  const [selectedLocal, setSelectedLocal] = useState<Customer | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTo, setAssignTo] = useState('');
  const [assignMode, setAssignMode] = useState<AssignmentMode>('keep');
  const [assignNote, setAssignNote] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);
  const selected = params.id ? (rows.find((c) => c.id === params.id) ?? null) : selectedLocal;
  const [saving, setSaving] = useState(false);
  const [segmentName, setSegmentName] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState<{ from: string; to: string } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  // Chỉ lưu vị trí sau khi đã khôi phục xong, tránh ghi đè bằng mặc định lúc màn vừa dựng.
  const [hydrated, setHydrated] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  // One page scroll surface: list gestures can always reach the search chips above it.
  // Keep rendering bounded to the viewport, relative to the list's page position.
  useEffect(() => {
    const list = scrollRef.current;
    if (!list) return;
    let frame = 0;
    const measure = () => {
      setScrollTop(Math.max(0, -list.getBoundingClientRect().top));
      setViewportHeight(window.innerHeight);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    if (list.parentElement?.parentElement) observer.observe(list.parentElement.parentElement);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (userId) setSort(loadSort(userId));
  }, [userId]);

  // Khôi phục nhóm + bộ lọc + ô tìm của phiên này (CL-01 L7); chỉ chạy khi biết người dùng.
  useEffect(() => {
    if (!userId) return;
    const stored = loadView(userId);
    setGroup(stored?.group ?? 'potential');
    setFilters(stored?.filters ?? DEFAULT_FILTERS);
    setHydrated(true);
  }, [userId]);

  useEffect(() => {
    if (!userId || !hydrated) return;
    saveView(userId, group, filters);
  }, [userId, hydrated, group, filters]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!userId) {
      setSaved([]);
      return;
    }
    const local = loadSaved(userId);
    setSaved(local);
    try {
      const cachedTeam = JSON.parse(localStorage.getItem(`crm_team:${userId}`) || '[]');
      if (Array.isArray(cachedTeam)) setTeam(cachedTeam);
    } catch {
      setTeam([]);
    }
    let alive = true;
    void account?.remote
      .getUiStateRemote()
      .then((value: unknown) => {
        const state = value as { customers?: { segments?: unknown } } | null | undefined;
        const remote = state?.customers?.segments;
        if (!alive || !Array.isArray(remote)) return;
        setSaved(remote);
        localStorage.setItem(`${STORE}:${userId}`, JSON.stringify(remote));
      })
      .catch(() => {});
    void account?.remote
      .teamList()
      .then((members: TeamPerson[] | undefined) => {
        if (!alive || !members) return;
        setTeam(members);
        localStorage.setItem(`crm_team:${userId}`, JSON.stringify(members));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [account, userId]);

  useEffect(() => {
    const message = syncStatus.assignError;
    if (!message || !account) return;
    toast({ title: message, tone: 'error' });
    account.sync.status.set({ assignError: null });
  }, [account, syncStatus.assignError, toast]);

  const visible = useMemo(
    () =>
      sortCustomers(
        v1FilterCustomers(rows, group, filters, userId, new Date(now)),
        sort,
        now,
        filters.query.trim() !== '',
        userId,
      ),
    [rows, group, filters, userId, sort, now],
  );
  const changeSort = (next: SortChoice) => {
    setSort(next);
    saveSort(userId, next);
    setActiveSaved('');
    setScrollTop(0);
  };
  const setFilter = <K extends keyof CustomerFilters>(key: K, value: CustomerFilters[K]) => {
    setActiveSaved('');
    setFilters((prev) => ({ ...prev, [key]: value }));
    setScrollTop(0);
  };
  /** Chọn preset ngày (trừ Tuỳ chọn): áp ngay, bỏ khoảng cũ. */
  const applyDatePreset = (value: Exclude<DatePreset, 'custom'>) => {
    setActiveSaved('');
    setFilters((prev) => ({ ...prev, date: value, dateFrom: undefined, dateTo: undefined }));
    setCalendarOpen(false);
    setDateDraft(null);
    setScrollTop(0);
  };
  /** Mở khung lịch với khoảng đang dùng (hoặc hôm nay) — chưa áp dụng. */
  const openCalendar = () => {
    const oldFrom = filters.date === 'custom' && parseDayKey(filters.dateFrom) ? filters.dateFrom : undefined;
    const oldTo = filters.date === 'custom' && parseDayKey(filters.dateTo) ? filters.dateTo : undefined;
    const from = oldFrom ?? dayKey(now);
    setDateDraft({ from, to: oldTo ?? from });
    setCalendarOpen(true);
  };
  const cancelCalendar = () => {
    setCalendarOpen(false);
    setDateDraft(null);
  };
  const confirmCalendar = () => {
    if (!dateDraft) return;
    const a = parseDayKey(dateDraft.from);
    if (!a) return;
    const b = parseDayKey(dateDraft.to) ?? a;
    const from = dayKey(Math.min(a.getTime(), b.getTime()));
    const to = dayKey(Math.max(a.getTime(), b.getTime()));
    setActiveSaved('');
    setFilters((prev) => ({ ...prev, date: 'custom', dateFrom: from, dateTo: to }));
    setCalendarOpen(false);
    setDateDraft(null);
    setScrollTop(0);
  };
  /** "Xoá lọc" cạnh phễu: về mặc định của nhóm, giữ nguyên sắp xếp và ô tìm (CL-01 L3). */
  const clearFilters = () => {
    setFilters((prev) => ({ ...defaultFiltersFor(group), query: prev.query }));
    setActiveSaved('');
    setScrollTop(0);
  };
  /** Đóng sheet Lọc thì bỏ bản nháp lịch (chưa Xác nhận = chưa áp dụng). */
  const handleFilterOpen = (open: boolean) => {
    setFilterOpen(open);
    if (!open) {
      setCalendarOpen(false);
      setDateDraft(null);
    }
  };
  const applySaved = (item: SavedSegment) => {
    setGroup(item.group);
    // Tệp lưu từ bản cũ thiếu trường mới → đọc như mặc định, không lỗi (CL-01).
    setFilters(normalizeFilters(item.filters));
    const next = parseSortChoice(item.sort);
    setSort(next);
    saveSort(userId, next);
    setView(item.view);
    setActiveSaved(item.id);
    setCalendarOpen(false);
    setDateDraft(null);
    setScrollTop(0);
  };
  const persistSegments = async (next: SavedSegment[]) => {
    setSaved(next);
    if (userId) localStorage.setItem(`${STORE}:${userId}`, JSON.stringify(next));
    const ok = await account?.remote.saveUiStateRemote({ customers: { segments: next } });
    return ok === true;
  };
  const saveSegment = async () => {
    const name = segmentName.trim();
    if (!name) return;
    setSaving(true);
    const id = crypto.randomUUID();
    const next = [...saved, { id, name, group, filters: { ...filters }, sort: { ...sort }, view }];
    const synced = await persistSegments(next);
    setSaving(false);
    setSegmentName('');
    setActiveSaved(id);
    toast({
      title: synced ? 'Đã lưu tệp khách' : 'Đã lưu trên thiết bị',
      description: synced ? 'Tệp sẽ tự cập nhật theo bộ lọc.' : 'Tệp sẽ đồng bộ khi có mạng.',
    });
  };
  const deleteSegment = async (id: string) => {
    const synced = await persistSegments(saved.filter((s) => s.id !== id));
    if (activeSaved === id) setActiveSaved('');
    toast({ title: synced ? 'Đã xoá tệp' : 'Đã xoá tệp trên thiết bị' });
  };
  const exportRows = () => {
    const esc = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [
      'Tên,Số điện thoại,Trạng thái,Bậc,Loại căn,Kênh,Ngày đăng ký',
      ...visible.map((c) =>
        [
          c.full_name,
          c.phone,
          isQualified(c) ? 'Tiềm năng' : 'Khách mới',
          normStage(c.care_stage),
          c.apt_type,
          sourceListOf(c.source)
            .map((s) => SOURCES[s] || s)
            .join(' + '),
          c.registered_at || c.created_at,
        ]
          .map(esc)
          .join(','),
      ),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'danh-sach-khach.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  const reset = () => {
    setFilters(DEFAULT_FILTERS);
    setSort(DEFAULT_SORT);
    saveSort(userId, DEFAULT_SORT);
    setCalendarOpen(false);
    setDateDraft(null);
    setActiveSaved('');
    setScrollTop(0);
  };

  const counts = customerGroupCounts(rows, userId);
  const teamMembers = team
    .map((person) => ({
      user_id: person.user_id || person.id || '',
      full_name: person.full_name || person.name,
      email: person.email,
      is_admin: person.is_admin,
      is_me: person.is_me,
    }))
    .filter((person) => person.user_id) as TeamMember[];
  const canAssign = !!selected && canAssignCustomer(selected, userId, teamMembers) && teamMembers.length > 1;
  const assignableMembers = selected ? teamMembers.filter((person) => person.user_id !== selected.owner_id) : [];
  const openAssignment = () => {
    if (!selected || !canAssign) return;
    setAssignTo('');
    setAssignMode('keep');
    setAssignNote('');
    setAssignOpen(true);
  };
  const saveAssignment = async () => {
    if (!selected || !account || !assignTo || assignBusy) return;
    const recipient = teamMembers.find((person) => person.user_id === assignTo);
    if (!recipient || !canAssignCustomer(selected, userId, teamMembers)) return;
    const keep = assignMode === 'keep' && assignTo !== userId;
    const followers = assignmentFollowers(selected.followers, userId, assignTo, keep ? 'keep' : 'handoff');
    const note = assignmentNote(recipient, assignTo, userId, keep ? 'keep' : 'handoff', assignNote);
    setAssignBusy(true);
    try {
      await account.customers.update(
        selected.id,
        { owner_id: assignTo, followers },
        { assign: true, assignmentNote: note },
      );
      setAssignOpen(false);
      toast({
        title:
          assignTo === userId
            ? 'Đã lấy khách về'
            : `Đã giao cho ${recipient.full_name || recipient.email || 'đồng nghiệp'}`,
        description: account.sync.isOnline() ? 'Đang đồng bộ.' : 'Ngoại tuyến · thay đổi đã xếp hàng đồng bộ.',
      });
    } catch (error) {
      toast({
        title: 'Chưa giao được khách',
        description: error instanceof Error ? error.message : 'Thử lại.',
        tone: 'error',
      });
    } finally {
      setAssignBusy(false);
    }
  };

  const controls = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="text-label text-ink-muted">
          Trạng thái
          <select
            aria-label="Lọc trạng thái"
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value as CustomerFilters['status'])}
            className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface-100 px-3 text-body text-ink"
          >
            {(group === 'new'
              ? [
                  ['open', 'Trong phễu'],
                  ['all', 'Tất cả'],
                  ['new', 'Chưa gọi'],
                  ['calling', 'Đã gọi'],
                  ['dropped', 'Đã loại'],
                ]
              : [
                  ['active', 'Đang chăm'],
                  ['nurture', 'Nuôi dài hạn'],
                  ['won', 'Đã mua'],
                  ['dropped', 'Không chốt'],
                  ['done', 'Đã xong'],
                  ['all', 'Tất cả'],
                ]
            ).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-label text-ink-muted">
          Bậc chăm sóc
          <select
            aria-label="Lọc bậc chăm sóc"
            value={filters.stage}
            onChange={(e) => setFilter('stage', e.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface-100 px-3 text-body text-ink"
          >
            <option value="">Tất cả bậc chăm sóc</option>
            {CARE_STAGE_PICKER_ORDER.map((s) => {
              const branch = CARE_STAGE_BRANCH[s];
              return (
                <option key={s} value={s}>
                  {branch ? `↳ ${CARE_STAGE_DISPLAY[s] || s} · ${branch.hint}` : CARE_STAGE_DISPLAY[s] || s}
                </option>
              );
            })}
          </select>
        </label>
        <label className="text-label text-ink-muted">
          Ngày đăng ký
          <select
            aria-label="Lọc ngày đăng ký"
            value={calendarOpen ? 'custom' : filters.date}
            onChange={(e) => {
              const value = e.target.value as DatePreset;
              if (value === 'custom') openCalendar();
              else applyDatePreset(value);
            }}
            className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface-100 px-3 text-body text-ink"
          >
            <option value="all">Mọi thời điểm</option>
            <option value="yesterday">Hôm qua</option>
            <option value="today">Hôm nay</option>
            <option value="week">Tuần này</option>
            <option value="month">Tháng này</option>
            <option value="custom">
              {filters.date === 'custom'
                ? customDateLabel(filters.dateFrom, filters.dateTo, new Date(now))
                : 'Tuỳ chọn…'}
            </option>
          </select>
        </label>
        <label className="text-label text-ink-muted">
          Loại căn
          <select
            aria-label="Lọc loại căn"
            value={filters.apt}
            onChange={(e) => setFilter('apt', e.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface-100 px-3 text-body text-ink"
          >
            <option value="">Tất cả loại căn</option>
            {[...new Set(['Studio', '1N', '2N', '3N', ...APT_TYPES.map((x) => apartmentGroup(x))])].map((apt) => (
              <option key={apt} value={apt}>
                {apt}
              </option>
            ))}
          </select>
        </label>
        <label className="text-label text-ink-muted">
          Kênh
          <select
            aria-label="Lọc kênh"
            value={filters.source}
            onChange={(e) => setFilter('source', e.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface-100 px-3 text-body text-ink"
          >
            <option value="">Tất cả kênh</option>
            {Object.entries(SOURCES).map(([s, l]) => (
              <option key={s} value={s}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {group === 'team' && team.some((p) => p.is_me && p.is_admin) && (
          <label className="text-label text-ink-muted">
            Người phụ trách
            <select
              aria-label="Lọc người phụ trách"
              value={filters.owner}
              onChange={(e) => setFilter('owner', e.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface-100 px-3 text-body text-ink"
            >
              <option value="">Tất cả khách nhóm</option>
              <option value="following">Tôi đang theo dõi</option>
              {team.map((p) => {
                const id = p.user_id || p.id || '';
                return (
                  <option key={id} value={id}>
                    {p.full_name || p.name || p.email || id}
                  </option>
                );
              })}
            </select>
          </label>
        )}
      </div>
      {calendarOpen && dateDraft && (
        <div className="space-y-1">
          <p className="font-semibold text-body">Chọn ngày đăng ký</p>
          <CalendarRange
            from={dateDraft.from}
            to={dateDraft.to}
            now={new Date(now)}
            onPick={(from, to) => setDateDraft({ from, to })}
            onConfirm={confirmCalendar}
            onCancel={cancelCalendar}
          />
        </div>
      )}
      {filters.date === 'custom' && !calendarOpen && (
        <Button variant="ghost" icon="calendar" className="self-start" onClick={openCalendar}>
          Chọn lại ngày
        </Button>
      )}
      <fieldset className="space-y-1 rounded-md border border-line p-3">
        <legend className="px-1 font-semibold text-body">Sắp xếp</legend>
        <SortToggle<'registered'>
          label="Ngày đăng ký"
          value={sort.registered}
          choices={[
            { value: 'desc', text: 'Mới nhất', arrow: '↓' },
            { value: 'asc', text: 'Cũ nhất', arrow: '↑' },
          ]}
          onChange={(value) => changeSort({ ...sort, registered: value })}
        />
        <SortToggle<'touch'>
          label="Lần tương tác"
          value={sort.touch}
          choices={[
            { value: 'untouched', text: 'Chưa tương tác trước', arrow: '↑' },
            { value: 'recent', text: 'Gần nhất trước', arrow: '↓' },
          ]}
          onChange={(value) => changeSort({ ...sort, touch: value })}
        />
        <SortToggle<'name'>
          label="Tên"
          value={sort.name}
          choices={[
            { value: 'asc', text: 'A–Z', arrow: '↑' },
            { value: 'desc', text: 'Z–A', arrow: '↓' },
          ]}
          onChange={(value) => changeSort({ ...sort, name: value })}
        />
      </fieldset>
    </div>
  );

  const groupOptions: { value: CustomerGroup; label: string }[] = [
    { value: 'potential', label: 'Tiềm năng' },
    { value: 'new', label: 'Khách mới' },
    ...(team.length || counts.team ? [{ value: 'team' as const, label: 'Khách nhóm' }] : []),
  ];
  const itemHeight = desktop ? DESKTOP_ITEM_HEIGHT : MOBILE_ITEM_HEIGHT;
  const range = virtualWindow(
    visible.length,
    Math.min(scrollTop, Math.max(0, (visible.length - 1) * itemHeight)),
    viewportHeight,
    itemHeight,
    desktop ? 1 : 4,
  );
  const slice = visible.slice(range.start, range.end);
  const tableColumns: Column<Customer>[] = [
    {
      key: 'name',
      label: 'Khách hàng',
      // Cột tên chứa tên + lý do + dự án → rộng nhất; tên được ưu tiên giữ đủ chữ.
      width: '40%',
      render: (customer) => {
        const sub = listCardSub(customer, now, userId);
        const project = Array.isArray(customer.projects)
          ? customer.projects.find((value) => typeof value === 'string' && value.trim())
          : undefined;
        const lastTouch = sub.lead?.text.startsWith('Quá SLA') ? sub.rest.split(' · ')[0] : undefined;
        return (
          <ul className="m-0 list-none p-0">
            <li data-card data-tone={sub.lead?.tone} className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                aria-label={`Mở ${customer.full_name}`}
                className="min-w-0 max-w-[60%] shrink-0 truncate text-left font-semibold text-ink hover:text-ion"
                onClick={() => navigate(`/khach-hang/${customer.id}`)}
              >
                {customer.full_name}
              </button>
              {sub.lead && <span className="truncate text-caption text-ink-muted">{sub.lead.text}</span>}
              {lastTouch && <span className="truncate text-caption text-ink-muted">{lastTouch}</span>}
              {project && <span className="truncate text-caption text-ink-muted">{project}</span>}
              <ActionButton
                action="call"
                display="icon"
                label={`Gọi ${customer.full_name}`}
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={(event) => {
                  event.stopPropagation();
                  openQuickAction(customer.id, 'call');
                }}
              />
            </li>
          </ul>
        );
      },
    },
    {
      key: 'phone',
      label: 'Điện thoại',
      width: '13%',
      render: (customer) => <span className="font-mono text-caption">{customer.phone}</span>,
    },
    {
      key: 'stage',
      label: 'Bậc',
      width: '16%',
      render: (customer) =>
        CARE_STAGE_DISPLAY[normStage(customer.care_stage) || ''] || normStage(customer.care_stage) || '—',
    },
    { key: 'unit', label: 'Loại căn', width: '12%', render: (customer) => customer.apt_type || '—' },
    {
      key: 'source',
      label: 'Kênh',
      width: '19%',
      render: (customer) =>
        sourceListOf(customer.source)
          .map((source) => SOURCES[source] || source)
          .join(' · ') || '—',
    },
  ];

  const list = (
    <section ref={scrollRef} aria-label="Danh sách khách" className="mt-1">
      <div style={{ height: range.totalHeight, position: 'relative' }}>
        {desktop ? (
          <div className="absolute inset-x-0" style={{ top: range.offset }}>
            <DataTable
              caption="Danh sách khách"
              columns={tableColumns}
              rows={slice}
              onRowClick={(customer) => navigate(`/khach-hang/${customer.id}`)}
              empty={<div className="p-8 text-center text-body text-ink-muted">Không tìm thấy khách khớp bộ lọc.</div>}
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-2" style={{ position: 'absolute', insetInline: 0, top: range.offset }}>
            {slice.map((customer) => {
              const sub = listCardSub(customer, now, userId);
              const stage = normStage(customer.care_stage);
              const leadLevel: Level | undefined =
                sub.lead?.tone === 'over' ? 'alert' : sub.lead?.tone === 'soon' ? 'soon' : undefined;
              return (
                <li
                  key={customer.id}
                  data-card
                  data-tone={sub.lead?.tone}
                  className="relative h-16 overflow-hidden rounded-md border border-line bg-surface-100"
                >
                  <div className="flex h-full items-center pr-2">
                    <div aria-hidden="true" className="min-w-0 flex-1">
                      <LeadRow
                        name={customer.full_name}
                        phone={customer.phone}
                        // Bậc đã có nhãn riêng trong dòng → bỏ chữ bậc khỏi dòng phụ cho đỡ lặp.
                        project={
                          sub.rest
                            .split(' · ')
                            .filter((part) => part !== (CARE_STAGE_DISPLAY[stage || ''] || stage))
                            .join(' · ') || undefined
                        }
                        stage={stage as Stage | undefined}
                        level={leadLevel}
                        time={sub.lead?.text}
                        onClick={() => navigate(`/khach-hang/${customer.id}`)}
                      />
                    </div>
                    <button
                      type="button"
                      aria-label={`Mở ${customer.full_name}`}
                      className="absolute inset-y-0 left-0 right-14 z-10 cursor-pointer opacity-0"
                      onClick={() => navigate(`/khach-hang/${customer.id}`)}
                    />
                    <ActionButton
                      action="call"
                      display="icon"
                      label={`Gọi ${customer.full_name}`}
                      variant="ghost"
                      className="relative z-20"
                      onClick={() => openQuickAction(customer.id, 'call')}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {visible.length === 0 && (
        <div className="p-8 text-center text-body text-ink-muted">Không tìm thấy khách khớp bộ lọc.</div>
      )}
    </section>
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pt-2 pb-24 lg:p-6">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Tìm khách"
          value={filters.query}
          onChange={(e) => setFilter('query', e.target.value)}
          placeholder="Tên, SĐT, dự án, ghi chú…"
          className="flex-1"
        />
        <IconButton icon="more" label="Thêm thao tác" variant="ghost" onClick={() => setMoreOpen(true)} />
      </div>

      <div className="mt-2 overflow-x-auto pb-1 [&_[role=group]>button]:min-h-11">
        <ChipGroup
          label="Nhóm khách"
          value={group}
          options={groupOptions.map((item) => ({
            value: item.value,
            label: item.label,
          }))}
          onChange={(value) => {
            if (value) {
              setGroup(value as CustomerGroup);
              setFilters(defaultFiltersFor(value as CustomerGroup));
              setCalendarOpen(false);
              setDateDraft(null);
              setActiveSaved('');
              setScrollTop(0);
            }
          }}
        />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <KitButton variant="secondary" aria-haspopup="dialog" onClick={() => setFilterOpen(true)}>
          <Icon name="filter" size={20} />
          Lọc
        </KitButton>
        <div className="min-w-0 flex-1 [&>button:first-child]:hidden">
          <FilterBar
            result={visible.length}
            onOpen={() => setFilterOpen(true)}
            onClearAll={clearFilters}
            chips={
              isFilterDirty(group, filters) ? [{ label: 'Bộ lọc', value: 'Đang áp dụng', onRemove: clearFilters }] : []
            }
          />
        </div>
        {isFilterDirty(group, filters) && (
          <KitButton variant="ghost" className="shrink-0" onClick={clearFilters}>
            Xoá lọc
          </KitButton>
        )}
      </div>

      {list}

      <CustomerSheet
        open={filterOpen}
        onOpenChange={handleFilterOpen}
        title="Lọc khách"
        footer={
          <>
            <Button onClick={reset}>Xoá lọc</Button>
            <Button variant="primary" className="flex-1" onClick={() => handleFilterOpen(false)}>
              Xem {visible.length.toLocaleString('vi-VN')} khách
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {controls}
          <div className="space-y-2 border-line border-t pt-4">
            <p className="font-semibold text-body">Lưu tệp</p>
            <div className="flex gap-2">
              <input
                aria-label="Tên tệp mới"
                value={segmentName}
                onChange={(e) => setSegmentName(e.target.value)}
                placeholder="Tên tệp khách"
                className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-surface-100 px-3 text-body text-ink"
              />
              <Button onClick={() => void saveSegment()} disabled={!segmentName.trim()} loading={saving} icon="segment">
                Lưu tệp
              </Button>
            </div>
            {saved.length > 0 && (
              <ul className="space-y-2">
                {saved.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-pressed={activeSaved === item.id}
                      onClick={() => applySaved(item)}
                      className={cn(chipClass(activeSaved === item.id), 'min-w-0 flex-1 justify-start')}
                    >
                      <span className="truncate">{item.name}</span>
                    </button>
                    <Button aria-label={`Xoá tệp ${item.name}`} onClick={() => void deleteSegment(item.id)}>
                      Xoá
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CustomerSheet>

      <CustomerSheet open={moreOpen} onOpenChange={setMoreOpen} title="Thêm thao tác">
        <div className="flex flex-col gap-2">
          <Button
            icon="retarget"
            onClick={() => {
              setMoreOpen(false);
              navigate('/khach-hang/retarget');
            }}
          >
            Tệp &amp; Retarget
          </Button>
          <Button
            icon="team"
            onClick={() => {
              setMoreOpen(false);
              navigate('/dong-nghiep');
            }}
          >
            Đồng nghiệp
          </Button>
          <Button
            icon="segment"
            onClick={() => {
              setMoreOpen(false);
              exportRows();
            }}
          >
            Xuất {visible.length.toLocaleString('vi-VN')} khách
          </Button>
          <Button asChild>
            <Link to="/khach-hang/luu-tru" onClick={() => setMoreOpen(false)}>
              Khách đã lưu trữ
            </Link>
          </Button>
        </div>
      </CustomerSheet>

      <QuickCustomerSheet
        customer={selected}
        userId={userId}
        canAssign={canAssign}
        onOpenChange={(open) => !open && (params.id ? navigate('/khach-hang') : setSelectedLocal(null))}
        onOpenProfile={(customer) => navigate(`/ho-so/${customer.id}`)}
        onAssign={openAssignment}
      />
      <CustomerSheet
        open={assignOpen}
        onOpenChange={(open) => {
          if (!assignBusy) setAssignOpen(open);
        }}
        title={`Giao khách${selected ? `: ${selected.full_name || ''}` : ''}`}
        description="Giao khách đi qua hàng đợi đồng bộ; quyền ghi vẫn thuộc người phụ trách."
        footer={
          <>
            <Button className="flex-1" onClick={() => setAssignOpen(false)} disabled={assignBusy}>
              Huỷ
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => void saveAssignment()}
              loading={assignBusy}
              disabled={!assignTo}
            >
              Xác nhận giao
            </Button>
          </>
        }
      >
        {selected && (
          <div className="space-y-4">
            <label className="block space-y-1 text-label text-ink-muted">
              <span>Người nhận</span>
              <select
                aria-label="Người nhận khách"
                value={assignTo}
                onChange={(event) => setAssignTo(event.target.value)}
                className="min-h-11 w-full rounded-md border border-line bg-surface-100 px-3 text-body text-ink"
              >
                <option value="">Chọn người nhận</option>
                {assignableMembers.map((person) => (
                  <option key={person.user_id} value={person.user_id}>
                    {person.user_id === userId ? 'Tôi (lấy lại)' : person.full_name || person.email || 'Đồng nghiệp'}
                  </option>
                ))}
              </select>
            </label>
            {assignTo !== userId && (
              <fieldset className="space-y-2">
                <legend className="text-label text-ink-muted">Sau khi giao</legend>
                <label className="flex min-h-11 items-center gap-3 rounded-md border border-line p-3 text-body">
                  <input
                    type="radio"
                    name="assign-mode"
                    value="keep"
                    checked={assignMode === 'keep'}
                    onChange={() => setAssignMode('keep')}
                  />
                  <span>
                    Tôi vẫn theo dõi{' '}
                    <span className="block text-label text-ink-muted">Tôi chỉ xem; người nhận là người phụ trách.</span>
                  </span>
                </label>
                <label className="flex min-h-11 items-center gap-3 rounded-md border border-line p-3 text-body">
                  <input
                    type="radio"
                    name="assign-mode"
                    value="handoff"
                    checked={assignMode === 'handoff'}
                    onChange={() => setAssignMode('handoff')}
                  />
                  <span>
                    Giao hẳn <span className="block text-label text-ink-muted">Khách rời danh sách của tôi.</span>
                  </span>
                </label>
              </fieldset>
            )}
            <label className="block space-y-1 text-label text-ink-muted">
              <span>Ghi chú cho người nhận (tuỳ chọn)</span>
              <textarea
                aria-label="Ghi chú giao khách"
                value={assignNote}
                onChange={(event) => setAssignNote(event.target.value)}
                rows={3}
                maxLength={500}
                className="w-full rounded-md border border-line bg-surface-100 p-3 text-body text-ink"
                placeholder="Ví dụ: khách hẹn xem nhà mẫu thứ 7"
              />
            </label>
          </div>
        )}
      </CustomerSheet>
    </main>
  );
}

export const route: FeatureRoute = {
  path: '/khach-hang/:id?',
  element: <Customers />,
  // Bảng khách desktop nhiều cột → khổ rộng (760px làm mất cột Kênh, cắt tên).
  handle: { wide: true },
};
