import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { APT_TYPES } from '@/config/aptTypes';
import { SOURCES } from '@/config/sources';
import { CARE_STAGE_DISPLAY, CARE_STAGE_OPTIONS } from '@/config/stages';
import { useCustomers, useRepositoryAccount, useSyncStatus } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { callAttemptsOf, isQualified, normStage, sourceListOf } from '@/domain/customer/normalize';
import { apartmentGroup } from '@/domain/search/search';
import { openQuickAction } from '@/features/quick-actions/store';
import {
  type AssignmentMode,
  assignmentFollowers,
  assignmentNote,
  canAssignCustomer,
  type TeamMember,
} from '@/features/team/model';
import { Avatar, Badge, Button, CustomerCard, cn, IconButton, Sheet, useToast } from '@/ui';
import {
  type CustomerFilters,
  type CustomerGroup,
  customerGroupCounts,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  listCardSub,
  type SortRule,
  sortCustomers,
  v1FilterCustomers,
  virtualWindow,
} from './model';

type SavedSegment = {
  id: string;
  name: string;
  group: CustomerGroup;
  filters: CustomerFilters;
  sort: SortRule[];
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
// Thẻ gọn cao 64px + khe 8px = 72px; virtualWindow cần đúng nhịp này.
const CARD_HEIGHT = 64;
const CARD_GAP = 8;
const ITEM_HEIGHT = CARD_HEIGHT + CARD_GAP;

const CHIP =
  'inline-flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-small font-semibold transition-colors duration-(--dur-fast) focus-visible:outline-2 focus-visible:outline-focus';
const chipClass = (active: boolean) =>
  cn(CHIP, active ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface text-text hover:bg-surface-2');

function loadSaved(userId: string): SavedSegment[] {
  try {
    return JSON.parse(localStorage.getItem(`${STORE}:${userId}`) || '[]');
  } catch {
    return [];
  }
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
  const [sort, setSort] = useState<SortRule[]>(DEFAULT_SORT);
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
  const scrollRef = useRef<HTMLElement>(null);

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
    () => sortCustomers(v1FilterCustomers(rows, group, filters, userId), sort),
    [rows, group, filters, userId, sort],
  );
  const setFilter = <K extends keyof CustomerFilters>(key: K, value: CustomerFilters[K]) => {
    setActiveSaved('');
    setFilters((prev) => ({ ...prev, [key]: value }));
    setScrollTop(0);
  };
  const applySaved = (item: SavedSegment) => {
    setGroup(item.group);
    setFilters(item.filters);
    setSort(item.sort);
    setView(item.view);
    setActiveSaved(item.id);
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
    const next = [...saved, { id, name, group, filters: { ...filters }, sort: [...sort], view }];
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
        <label className="text-small text-text-2">
          Trạng thái
          <select
            aria-label="Lọc trạng thái"
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value as CustomerFilters['status'])}
            className="mt-1 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text"
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
        <label className="text-small text-text-2">
          Bậc
          <select
            aria-label="Lọc bậc"
            value={filters.stage}
            onChange={(e) => setFilter('stage', e.target.value)}
            className="mt-1 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text"
          >
            <option value="">Tất cả bậc</option>
            {CARE_STAGE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {CARE_STAGE_DISPLAY[s] || s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-small text-text-2">
          Ngày đăng ký
          <select
            aria-label="Lọc ngày đăng ký"
            value={filters.date}
            onChange={(e) => setFilter('date', e.target.value as CustomerFilters['date'])}
            className="mt-1 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text"
          >
            <option value="all">Mọi thời điểm</option>
            <option value="today">Hôm nay</option>
            <option value="week">Tuần này</option>
            <option value="month">Tháng này</option>
          </select>
        </label>
        <label className="text-small text-text-2">
          Loại căn
          <select
            aria-label="Lọc loại căn"
            value={filters.apt}
            onChange={(e) => setFilter('apt', e.target.value)}
            className="mt-1 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text"
          >
            <option value="">Tất cả loại căn</option>
            {[...new Set(['Studio', '1N', '2N', '3N', ...APT_TYPES.map((x) => apartmentGroup(x))])].map((apt) => (
              <option key={apt} value={apt}>
                {apt}
              </option>
            ))}
          </select>
        </label>
        <label className="text-small text-text-2">
          Kênh
          <select
            aria-label="Lọc kênh"
            value={filters.source}
            onChange={(e) => setFilter('source', e.target.value)}
            className="mt-1 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text"
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
          <label className="text-small text-text-2">
            Người phụ trách
            <select
              aria-label="Lọc người phụ trách"
              value={filters.owner}
              onChange={(e) => setFilter('owner', e.target.value)}
              className="mt-1 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text"
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
      <label className="block text-small text-text-2">
        Sắp xếp nhiều khoá
        <select
          aria-label="Sắp xếp danh sách"
          value={sort.map((s) => `${s.key}:${s.direction}`).join(',')}
          onChange={(e) => {
            const next = e.target.value.split(',').map((rule) => {
              const [key, direction] = rule.split(':');
              return { key, direction } as SortRule;
            });
            setSort(next);
            setActiveSaved('');
          }}
          className="mt-1 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text"
        >
          <option value="updated:desc,name:asc">Cập nhật mới · tên A–Z</option>
          <option value="name:asc">Tên A–Z</option>
          <option value="name:desc">Tên Z–A</option>
          <option value="registered:desc,name:asc">Đăng ký mới · tên</option>
          <option value="registered:asc,name:asc">Đăng ký cũ · tên</option>
          <option value="stage:asc,interest:desc">Bậc · mức quan tâm</option>
          <option value="interest:desc,name:asc">Quan tâm cao · tên</option>
        </select>
      </label>
    </div>
  );

  const groupOptions: { value: CustomerGroup; label: string; count: number }[] = [
    { value: 'potential', label: 'Tiềm năng', count: counts.potential },
    { value: 'new', label: 'Khách mới', count: counts.leads },
    ...(team.length || counts.team ? [{ value: 'team' as const, label: 'Khách nhóm', count: counts.team }] : []),
  ];
  const now = Date.now();
  const range = virtualWindow(
    visible.length,
    Math.min(scrollTop, Math.max(0, (visible.length - 1) * ITEM_HEIGHT)),
    viewportHeight,
    ITEM_HEIGHT,
  );
  const slice = visible.slice(range.start, range.end);

  const list = (
    <section ref={scrollRef} aria-label="Danh sách khách" className="mt-2">
      <div style={{ height: range.totalHeight, position: 'relative' }}>
        <ul className="flex flex-col gap-2" style={{ position: 'absolute', insetInline: 0, top: range.offset }}>
          {slice.map((customer) => {
            const sub = listCardSub(customer, now);
            const subNode =
              sub.lead || sub.rest ? (
                <>
                  {sub.lead && (
                    <span
                      className={
                        sub.lead.tone === 'over'
                          ? 'font-semibold text-danger'
                          : sub.lead.tone === 'soon'
                            ? 'font-semibold text-warning'
                            : undefined
                      }
                    >
                      {sub.lead.text}
                    </span>
                  )}
                  {sub.lead && sub.rest ? ' · ' : ''}
                  {sub.rest}
                </>
              ) : undefined;
            return (
              <li key={customer.id} className="h-16">
                <CustomerCard
                  compact
                  className="h-full"
                  name={customer.full_name}
                  sub={subNode}
                  tone={sub.lead?.tone}
                  onOpen={() => navigate(`/khach-hang/${customer.id}`)}
                  action={{ label: 'Gọi', icon: 'call', onClick: () => openQuickAction(customer.id, 'call') }}
                />
              </li>
            );
          })}
        </ul>
      </div>
      {visible.length === 0 && (
        <div className="p-8 text-center text-body text-text-2">Không tìm thấy khách khớp bộ lọc.</div>
      )}
    </section>
  );

  return (
    <main className="mx-auto w-full max-w-5xl p-4 pb-24 lg:p-6">
      <div className="flex items-center gap-2">
        <input
          aria-label="Tìm khách"
          value={filters.query}
          onChange={(e) => setFilter('query', e.target.value)}
          placeholder="Tên, SĐT, dự án, ghi chú…"
          className="min-h-11 min-w-0 flex-1 rounded-control border border-border-strong bg-surface px-3 text-body text-text placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-focus"
        />
        <IconButton icon="more" label="Thêm thao tác" variant="ghost" onClick={() => setMoreOpen(true)} />
      </div>

      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        <Button icon="filter" onClick={() => setFilterOpen(true)} className="shrink-0 rounded-full">
          Lọc
        </Button>
        {groupOptions.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={group === item.value}
            onClick={() => {
              setGroup(item.value);
              setFilters(item.value === 'new' ? { ...DEFAULT_FILTERS, status: 'open' } : DEFAULT_FILTERS);
              setActiveSaved('');
              setScrollTop(0);
            }}
            className={chipClass(group === item.value)}
          >
            {item.label} {item.count}
          </button>
        ))}
        {saved.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={activeSaved === item.id}
            onClick={() => applySaved(item)}
            className={chipClass(activeSaved === item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className="mt-2 flex min-h-5 items-center justify-between gap-3">
        <p aria-live="polite" className="text-small text-text-2">
          <span className="text-body-strong text-text">{visible.length.toLocaleString('vi-VN')} khách</span>
        </p>
      </div>

      {list}

      <Sheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="Lọc khách"
        footer={
          <>
            <Button onClick={reset}>Xoá lọc</Button>
            <Button variant="primary" className="flex-1" onClick={() => setFilterOpen(false)}>
              Xem {visible.length.toLocaleString('vi-VN')} khách
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {controls}
          <div className="space-y-2 border-hairline border-t pt-4">
            <p className="text-body-strong">Lưu tệp</p>
            <div className="flex gap-2">
              <input
                aria-label="Tên tệp mới"
                value={segmentName}
                onChange={(e) => setSegmentName(e.target.value)}
                placeholder="Tên tệp khách"
                className="min-h-11 min-w-0 flex-1 rounded-control border border-border-strong bg-surface px-3 text-body text-text"
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
      </Sheet>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title="Thêm thao tác">
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
      </Sheet>

      <Sheet
        open={!!selected}
        onOpenChange={(open) => !open && (params.id ? navigate('/khach-hang') : setSelectedLocal(null))}
        title={selected?.full_name || 'Thông tin khách'}
        description={selected?.phone || undefined}
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={selected.full_name} size={56} />
              <div>
                <div className="text-body-strong">{selected.full_name}</div>
                <div className="font-data text-mono-data text-text-2">{selected.phone}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{isQualified(selected) ? 'Tiềm năng' : 'Khách mới'}</Badge>
              <Badge>
                {CARE_STAGE_DISPLAY[normStage(selected.care_stage) || ''] ||
                  normStage(selected.care_stage) ||
                  'Chưa có bậc'}
              </Badge>
              {selected.apt_type && <Badge>{selected.apt_type}</Badge>}
            </div>
            <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-small">
              <dt className="text-text-2">Kênh</dt>
              <dd>
                {sourceListOf(selected.source)
                  .map((s) => SOURCES[s] || s)
                  .join(' · ') || 'Chưa rõ'}
              </dd>
              <dt className="text-text-2">Đã gọi</dt>
              <dd>{callAttemptsOf(selected).length} lần</dd>
              <dt className="text-text-2">Người phụ trách</dt>
              <dd>{team.find((p) => (p.user_id || p.id) === selected.owner_id)?.name || 'Tôi'}</dd>
            </dl>
            <Button
              className="w-full"
              variant="primary"
              icon="call"
              onClick={() => openQuickAction(selected.id, 'call')}
            >
              Gọi {selected.full_name}
            </Button>
            <Button className="w-full" onClick={() => navigate(`/ho-so/${selected.id}`)}>
              Mở hồ sơ đầy đủ
            </Button>
            {canAssign && (
              <Button className="w-full" onClick={openAssignment} icon="assign">
                Giao khách
              </Button>
            )}
          </div>
        )}
      </Sheet>
      <Sheet
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
            <label className="block space-y-1 text-small text-text-2">
              <span>Người nhận</span>
              <select
                aria-label="Người nhận khách"
                value={assignTo}
                onChange={(event) => setAssignTo(event.target.value)}
                className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text"
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
                <legend className="text-small text-text-2">Sau khi giao</legend>
                <label className="flex min-h-11 items-center gap-3 rounded-control border border-border p-3 text-body">
                  <input
                    type="radio"
                    name="assign-mode"
                    value="keep"
                    checked={assignMode === 'keep'}
                    onChange={() => setAssignMode('keep')}
                  />
                  <span>
                    Tôi vẫn theo dõi{' '}
                    <span className="block text-small text-text-2">Tôi chỉ xem; người nhận là người phụ trách.</span>
                  </span>
                </label>
                <label className="flex min-h-11 items-center gap-3 rounded-control border border-border p-3 text-body">
                  <input
                    type="radio"
                    name="assign-mode"
                    value="handoff"
                    checked={assignMode === 'handoff'}
                    onChange={() => setAssignMode('handoff')}
                  />
                  <span>
                    Giao hẳn <span className="block text-small text-text-2">Khách rời danh sách của tôi.</span>
                  </span>
                </label>
              </fieldset>
            )}
            <label className="block space-y-1 text-small text-text-2">
              <span>Ghi chú cho người nhận (tuỳ chọn)</span>
              <textarea
                aria-label="Ghi chú giao khách"
                value={assignNote}
                onChange={(event) => setAssignNote(event.target.value)}
                rows={3}
                maxLength={500}
                className="w-full rounded-control border border-border-strong bg-surface p-3 text-body text-text"
                placeholder="Ví dụ: khách hẹn xem nhà mẫu thứ 7"
              />
            </label>
          </div>
        )}
      </Sheet>
    </main>
  );
}

export const route: FeatureRoute = { path: '/khach-hang/:id?', element: <Customers /> };
