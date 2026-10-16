import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { APT_TYPES } from '@/config/aptTypes';
import { SOURCES } from '@/config/sources';
import { CARE_STAGE_DISPLAY, CARE_STAGE_OPTIONS } from '@/config/stages';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { callAttemptsOf, isQualified, normStage, sourceListOf } from '@/domain/customer/normalize';
import { apartmentGroup } from '@/domain/search/search';
import { Avatar, Badge, Button, ListRow, RowList, SegmentedControl, Sheet, useToast } from '@/ui';
import {
  type CustomerFilters,
  type CustomerGroup,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
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
const GROUPS = [
  { value: 'potential' as const, label: 'Tiềm năng' },
  { value: 'new' as const, label: 'Khách mới' },
  { value: 'team' as const, label: 'Khách nhóm' },
];

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
  const selected = params.id ? (rows.find((c) => c.id === params.id) ?? null) : selectedLocal;
  const [saving, setSaving] = useState(false);
  const [segmentName, setSegmentName] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const visible = useMemo(
    () => sortCustomers(v1FilterCustomers(rows, group, filters, userId), sort),
    [rows, group, filters, userId, sort],
  );
  const setFilter = <K extends keyof CustomerFilters>(key: K, value: CustomerFilters[K]) => {
    setActiveSaved('');
    setFilters((prev) => ({ ...prev, [key]: value }));
    setScrollTop(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const applySaved = (item: SavedSegment) => {
    setGroup(item.group);
    setFilters(item.filters);
    setSort(item.sort);
    setView(item.view);
    setActiveSaved(item.id);
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
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const ownRows = rows.filter((c) => c.owner_id === userId);
  const leadsCount = ownRows.filter((c) => !isQualified(c)).length;
  const potentialCount = ownRows.filter((c) => isQualified(c)).length;
  const teamCount = rows.filter((c) => c.owner_id && c.owner_id !== userId).length;

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

  const itemHeight = view === 'list' ? 72 : 120;
  const window = virtualWindow(visible.length, scrollTop, viewportHeight, itemHeight);
  const slice = visible.slice(window.start, window.end);
  const list = (
    <section
      ref={scrollRef}
      onScroll={(e) => {
        setScrollTop(e.currentTarget.scrollTop);
        setViewportHeight(e.currentTarget.clientHeight);
      }}
      className="h-[min(68dvh,680px)] overflow-auto overscroll-contain"
      aria-label="Danh sách khách"
    >
      <div style={{ height: window.totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', insetInline: 0, top: window.offset }}>
          {view === 'list' ? (
            <RowList label="Khách hàng" className="[&>li]:h-[72px]">
              {slice.map((c) => (
                <CustomerRow
                  key={c.id}
                  customer={c}
                  owner={team.find((p) => (p.user_id || p.id) === c.owner_id)}
                  onOpen={() => navigate(`/khach-hang/${c.id}`)}
                />
              ))}
            </RowList>
          ) : (
            <div className="grid gap-2 p-2">
              {slice.map((c) => (
                <CustomerCard key={c.id} customer={c} onOpen={() => navigate(`/khach-hang/${c.id}`)} />
              ))}
            </div>
          )}
        </div>
      </div>
      {visible.length === 0 && (
        <div className="p-8 text-center text-body text-text-2">Không tìm thấy khách khớp bộ lọc.</div>
      )}
    </section>
  );

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 p-4 pb-24 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-label text-text-3">KHÁCH HÀNG</p>
          <h2 className="text-title">Danh sách khách</h2>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setView(view === 'list' ? 'cards' : 'list')}
            icon={view === 'list' ? 'customers' : 'task'}
          >
            {view === 'list' ? 'Xem thẻ' : 'Xem danh sách'}
          </Button>
          <Button variant="primary" onClick={exportRows}>
            Xuất {visible.length}
          </Button>
        </div>
      </div>
      <SegmentedControl
        label="Nhóm khách"
        value={group}
        onValueChange={(v) => {
          setGroup(v);
          setFilters(v === 'new' ? { ...DEFAULT_FILTERS, status: 'open' } : DEFAULT_FILTERS);
          setActiveSaved('');
          setScrollTop(0);
        }}
        options={GROUPS.filter((g) => g.value !== 'team' || team.length || teamCount)}
      />
      <div className="rounded-card border border-border bg-surface p-3 sm:p-4">
        <label className="block text-small text-text-2" htmlFor="customer-search">
          Tìm trong danh sách
        </label>
        <input
          id="customer-search"
          value={filters.query}
          onChange={(e) => setFilter('query', e.target.value)}
          placeholder="Tên, số điện thoại, dự án, ghi chú…"
          className="mt-1 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-focus"
        />
        <div className="mt-3">{controls}</div>
      </div>
      {saved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-section">Tệp đã lưu</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {saved.map((item) => (
              <span key={item.id} className="inline-flex shrink-0 items-center gap-1">
                <Button variant={activeSaved === item.id ? 'primary' : 'secondary'} onClick={() => applySaved(item)}>
                  {item.name}
                </Button>
                <Button aria-label={`Xoá tệp ${item.name}`} onClick={() => void deleteSegment(item.id)}>
                  Xoá
                </Button>
              </span>
            ))}
          </div>
        </section>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-body-strong">
          {visible.length.toLocaleString('vi-VN')} khách{' '}
          <span className="text-small font-normal text-text-2">· xuất theo đúng bộ lọc</span>
        </p>
        <div className="flex gap-2">
          <input
            aria-label="Tên tệp mới"
            value={segmentName}
            onChange={(e) => setSegmentName(e.target.value)}
            placeholder="Tên tệp khách"
            className="min-h-11 min-w-36 rounded-control border border-border-strong bg-surface px-3 text-body text-text"
          />
          <Button onClick={() => void saveSegment()} disabled={!segmentName.trim()} loading={saving} icon="segment">
            Lưu tệp
          </Button>
          <Button onClick={reset}>Xoá lọc</Button>
        </div>
      </div>
      <section aria-label="Kết quả lọc" className="overflow-hidden rounded-card border border-border bg-surface">
        {list}
      </section>
      <p className="text-small text-text-3">
        {rows.length.toLocaleString('vi-VN')} khách đã nạp · danh sách chỉ dựng các dòng gần vị trí cuộn.
      </p>
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
            <a
              className="inline-flex min-h-11 items-center rounded-control bg-accent px-4 text-body-strong text-accent-fg"
              href={`tel:${selected.phone}`}
            >
              Gọi {selected.full_name}
            </a>
          </div>
        )}
      </Sheet>
      <div className="sr-only" aria-hidden>
        {potentialCount} tiềm năng, {leadsCount} khách mới, {teamCount} khách nhóm
      </div>
    </main>
  );
}

function CustomerRow({ customer, owner, onOpen }: { customer: Customer; owner?: TeamPerson; onOpen: () => void }) {
  const stage = normStage(customer.care_stage) || undefined;
  const source = sourceListOf(customer.source)
    .map((s) => SOURCES[s] || s)
    .join(' + ');
  const apt = customer.apt_type || '';
  return (
    <ListRow
      name={customer.full_name}
      stage={stage}
      stageLabel={stage ? CARE_STAGE_DISPLAY[stage] || stage : undefined}
      meta={[apt, source, owner?.name].filter(Boolean).join(' · ')}
      onOpen={onOpen}
      onCall={() => {
        window.location.href = `tel:${customer.phone}`;
      }}
      onZalo={() => {
        if (customer.phone)
          window.open(`https://zalo.me/${customer.phone.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer');
      }}
    />
  );
}
function CustomerCard({ customer, onOpen }: { customer: Customer; onOpen: () => void }) {
  const stage = normStage(customer.care_stage) || 'Chưa có bậc';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-28 items-start gap-3 rounded-card border border-border bg-surface p-3 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
    >
      <Avatar name={customer.full_name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-strong">{customer.full_name}</span>
        <span className="mt-1 block font-data text-mono-data text-text-2">{customer.phone}</span>
        <span className="mt-2 flex flex-wrap gap-1">
          <Badge>{CARE_STAGE_DISPLAY[stage] || stage}</Badge>
          {customer.apt_type && <Badge>{customer.apt_type}</Badge>}
        </span>
      </span>
    </button>
  );
}

export const route: FeatureRoute = { path: '/khach-hang/:id?', element: <Customers /> };
