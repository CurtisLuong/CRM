import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { FeatureRoute } from '@/app/routes';
import { EmptyState, LeadRow, PageHeader } from '@/components/crm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast as sonnerToast } from '@/components/ui/sonner';
import { Textarea } from '@/components/ui/textarea';
import { CLOSE_REASONS } from '@/config/reasons';
import { CARE_STAGE_DISPLAY } from '@/config/stages';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import {
  customerSegmentReasons,
  DEFAULT_RETARGET_FILTERS,
  filterRetargetCustomers,
  isRetargetEligible,
  type RetargetFilters,
} from '@/domain/matching/segments';
import { copyAndOpenZalo } from '@/features/quick-actions/zalo';
import { customerNeed } from '@/lib/crm/customer-need';

type SavedSegment = { id: string; name: string; filters: RetargetFilters };
const STORAGE = 'crm_v2_retarget_segments';
const FIELD =
  'min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion';
const Pill = ({ children }: { children: ReactNode }) => (
  <span className="rounded-full border border-line bg-surface-200 px-2 py-1 text-caption">{children}</span>
);
function readSegments(userId: string): SavedSegment[] {
  try {
    const value = JSON.parse(localStorage.getItem(`${STORAGE}:${userId}`) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function messageFor(customer: Customer, project: string, aptType: string, body: string): string {
  return body
    .replaceAll('{{ten}}', customer.full_name || '')
    .replaceAll('{{du_an}}', project || 'dự án phù hợp')
    .replaceAll('{{loai_can}}', aptType || 'loại căn phù hợp');
}

export function RetargetPage() {
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const userId = account?.sync.local.userId || '';
  const [filters, setFilters] = useState<RetargetFilters>(DEFAULT_RETARGET_FILTERS);
  const [saved, setSaved] = useState<SavedSegment[]>([]);
  const [segmentName, setSegmentName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [campaign, setCampaign] = useState('');
  const [project, setProject] = useState('');
  const [aptType, setAptType] = useState('');
  const [template, setTemplate] = useState(
    'Chào {{ten}}, tôi có thông tin cần xác minh về {{du_an}} ({{loai_can}}). Anh/chị có muốn tôi gửi chi tiết không?',
  );
  const [followUpDate, setFollowUpDate] = useState(() =>
    new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
  );
  const [working, setWorking] = useState('');

  useEffect(() => {
    if (!userId) {
      setSaved([]);
      return;
    }
    const local = readSegments(userId);
    setSaved(local);
    let alive = true;
    void account?.remote
      .getUiStateRemote()
      .then((rawState: unknown) => {
        const state = rawState as { retarget?: { segments?: unknown } } | null | undefined;
        const remote = state?.retarget?.segments;
        if (!alive || !Array.isArray(remote)) return;
        setSaved(remote as SavedSegment[]);
        localStorage.setItem(`${STORAGE}:${userId}`, JSON.stringify(remote));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [account, userId]);

  const visible = useMemo(
    () =>
      filterRetargetCustomers(customers, filters, userId).sort((a, b) => {
        const score = (customer: Customer) => customerSegmentReasons(customer, filters).length;
        return score(b) - score(a) || (b.updated_at || '').localeCompare(a.updated_at || '');
      }),
    [customers, filters, userId],
  );
  const selectedVisible = selected.filter((id) => visible.some((customer) => customer.id === id));

  useEffect(() => {
    setSelected((current) => current.filter((id) => visible.some((customer) => customer.id === id)));
  }, [visible]);

  const saveSegments = async (next: SavedSegment[]) => {
    setSaved(next);
    if (userId) localStorage.setItem(`${STORAGE}:${userId}`, JSON.stringify(next));
    const synced = await account?.remote.saveUiStateRemote({ retarget: { segments: next } });
    return synced === true;
  };
  const saveSegment = async () => {
    const name = segmentName.trim();
    if (!name) return;
    const next = [...saved, { id: crypto.randomUUID(), name, filters: { ...filters } }];
    const synced = await saveSegments(next);
    setSegmentName('');
    sonnerToast.success(synced ? 'Đã lưu tệp retarget' : 'Đã lưu trên thiết bị', {
      description: 'Tệp tự cập nhật theo điều kiện đã lưu.',
    });
  };
  const exportEligible = () => {
    // Re-read eligibility at the export boundary; do not trust stale UI selection.
    const latest = account?.customers.getSnapshot() || [];
    const ids = new Set(selectedVisible);
    const rows = latest.filter((customer) => ids.has(customer.id) && isRetargetEligible(customer, userId));
    const csv = [
      'Tên,Số điện thoại,Bậc,Dự án quan tâm,Loại căn,Lý do phù hợp',
      ...rows.map((customer) =>
        [
          customer.full_name,
          customer.phone,
          CARE_STAGE_DISPLAY[customer.care_stage || ''] || customer.care_stage || '',
          customer.projects?.join(' · ') ||
            customer.interests
              ?.map((item) => item?.project)
              .filter(Boolean)
              .join(' · ') ||
            '',
          customer.apt_type || '',
          customerSegmentReasons(customer, filters).join(' · '),
        ]
          .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
          .join(','),
      ),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'tep-retarget.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const latestEligible = (customerId: string) => {
    const latest = account?.customers.getSnapshot().find((item) => item.id === customerId);
    if (!latest || !isRetargetEligible(latest, userId))
      throw new Error('Khách không còn đủ điều kiện liên hệ; đã chặn thao tác.');
    return latest;
  };
  const openDraft = async (customer: Customer) => {
    try {
      latestEligible(customer.id);
      const text = messageFor(customer, project, aptType, template);
      await copyAndOpenZalo(text, customer.phone);
      sonnerToast.success('Đã sao chép bản nháp', {
        description: 'Kiểm tra lại nội dung trong Zalo trước khi tự gửi.',
      });
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : 'Chưa mở được Zalo');
    }
  };
  const markSent = async (customerId: string) => {
    if (!account || !campaign.trim() || working) return;
    setWorking(customerId);
    try {
      const customer = latestEligible(customerId);
      const tag = `${campaign.trim()} · ${project || 'chưa chọn dự án'}`;
      const at = new Date().toISOString();
      const oldInteractions = Array.isArray(customer.interactions) ? customer.interactions : [];
      const oldTasks = Array.isArray(customer.next_tasks) ? customer.next_tasks : [];
      const taskKey = `retarget:${tag}:${customer.id}`;
      const alreadyFollowed = oldTasks.some((task) => task?.key === taskKey);
      const due = new Date(`${followUpDate}T09:00:00`).toISOString();
      await account.customers.update(customer.id, {
        interactions: [
          ...oldInteractions,
          {
            at,
            channel: 'zalo',
            kind: 'sent',
            note: 'Gửi thủ công từ chiến dịch retarget.',
            template: template,
            campaign: tag,
            by: userId,
            origin: 'v2',
          },
        ],
        ...(!alreadyFollowed
          ? {
              next_tasks: [
                ...oldTasks,
                {
                  at,
                  text: `Theo dõi phản hồi · ${tag}`,
                  kind: 'message',
                  due,
                  due_allday: true,
                  side: 'me',
                  source: 'manual',
                  key: taskKey,
                },
              ],
            }
          : {}),
      });
      sonnerToast.success('Đã ghi nhận đã gửi', { description: 'Lịch theo dõi được thêm; tin chưa được gửi tự động.' });
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : 'Chưa ghi nhận được lần gửi');
    } finally {
      setWorking('');
    }
  };
  const recordResponse = async (customerId: string, response: 'replied' | 'no_response') => {
    if (!account || working) return;
    setWorking(customerId);
    try {
      const customer = latestEligible(customerId);
      const tag = `${campaign.trim()} · ${project || 'chưa chọn dự án'}`;
      const oldInteractions = Array.isArray(customer.interactions) ? customer.interactions : [];
      const wasSent = oldInteractions.some((item) => item?.campaign === tag && item?.kind === 'sent');
      if (!wasSent) throw new Error('Chỉ ghi phản hồi sau khi đã ghi nhận gửi chiến dịch.');
      await account.customers.update(customer.id, {
        interactions: [
          ...oldInteractions,
          {
            at: new Date().toISOString(),
            channel: 'zalo',
            kind: response,
            note: response === 'replied' ? 'Có phản hồi chiến dịch.' : 'Chưa có phản hồi tại thời điểm kiểm tra.',
            campaign: tag,
            by: userId,
            origin: 'v2',
          },
        ],
      });
      sonnerToast.success(response === 'replied' ? 'Đã ghi nhận phản hồi' : 'Đã ghi nhận chưa phản hồi');
    } catch (error) {
      sonnerToast.error(error instanceof Error ? error.message : 'Chưa lưu được kết quả');
    } finally {
      setWorking('');
    }
  };

  if (!account)
    return (
      <main className="mx-auto max-w-5xl p-4">
        <EmptyState title="Chưa có dữ liệu tài khoản" text="Đăng nhập để tạo tệp retarget." />
      </main>
    );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 pb-10">
      <PageHeader
        title="Tệp & Retarget"
        count={visible.length}
        noun="khách phù hợp"
        subtitle="Lọc khách bạn phụ trách, kiểm tra điều kiện rồi tự liên hệ."
        sticky={false}
      />
      <section className="rounded-md border border-line bg-surface-100 p-4 " aria-label="Điều kiện lọc tệp">
        <h2 className="text-title">Điều kiện tệp</h2>
        <p className="mb-3 text-caption text-ink-muted">
          Khách đã tắt liên hệ và khách người khác phụ trách luôn bị loại. “Có thể liên hệ” không thay thế việc xác nhận
          đồng ý trong từng cuộc trao đổi.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label htmlFor="retarget-apt-type" className="text-label">
            Loại căn
            <Input
              id="retarget-apt-type"
              className={FIELD}
              value={filters.aptType}
              onChange={(e) => setFilters({ ...filters, aptType: e.target.value })}
              placeholder="VD: 2N"
            />
          </label>
          <label htmlFor="retarget-project-filter" className="text-label">
            Dự án đã quan tâm
            <Input
              id="retarget-project-filter"
              className={FIELD}
              value={filters.project}
              onChange={(e) => setFilters({ ...filters, project: e.target.value })}
            />
          </label>
          <label htmlFor="retarget-purpose" className="text-label">
            Mục đích
            <Input
              id="retarget-purpose"
              className={FIELD}
              value={filters.purpose}
              onChange={(e) => setFilters({ ...filters, purpose: e.target.value })}
              placeholder="Ở, đầu tư…"
            />
          </label>
          <label htmlFor="retarget-region" className="text-label">
            Khu vực
            <Input
              id="retarget-region"
              className={FIELD}
              value={filters.region}
              onChange={(e) => setFilters({ ...filters, region: e.target.value })}
              placeholder="Hải Phòng…"
            />
          </label>
          <label htmlFor="retarget-occupation" className="text-label">
            Nghề nghiệp
            <Input
              id="retarget-occupation"
              className={FIELD}
              value={filters.occupation}
              onChange={(e) => setFilters({ ...filters, occupation: e.target.value })}
            />
          </label>
          <label htmlFor="retarget-timeline" className="text-label">
            Thời điểm mua dự kiến
            <Input
              id="retarget-timeline"
              className={FIELD}
              value={filters.timeline}
              onChange={(e) => setFilters({ ...filters, timeline: e.target.value })}
              placeholder="VD: 6 tháng"
            />
          </label>
          <label htmlFor="retarget-close-reason" className="text-label">
            Lý do kết thúc
            <select
              id="retarget-close-reason"
              className={FIELD}
              value={filters.closeReason}
              onChange={(e) => setFilters({ ...filters, closeReason: e.target.value })}
            >
              <option value="">Tất cả</option>
              {Object.entries(CLOSE_REASONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="retarget-max-budget" className="text-label">
            Ngân sách tối đa khách (VND)
            <Input
              id="retarget-max-budget"
              className={FIELD}
              inputMode="numeric"
              value={filters.maxBudget}
              onChange={(e) => setFilters({ ...filters, maxBudget: e.target.value.replace(/[^\d]/g, '') })}
              placeholder="Chỉ lọc khi có dữ liệu ngân sách"
            />
          </label>
          <label htmlFor="retarget-contacted-before" className="text-label">
            Liên hệ cuối trước ngày
            <Input
              id="retarget-contacted-before"
              className={FIELD}
              type="date"
              value={filters.contactedBefore}
              onChange={(e) => setFilters({ ...filters, contactedBefore: e.target.value })}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label htmlFor="retarget-segment-name" className="min-w-48 flex-1 text-label">
            Tên tệp
            <Input
              id="retarget-segment-name"
              className={FIELD}
              value={segmentName}
              onChange={(e) => setSegmentName(e.target.value)}
              placeholder="VD: Khách tìm căn 2N"
            />
          </label>
          <Button onClick={() => void saveSegment()} disabled={!segmentName.trim()} variant="primary">
            Lưu tệp
          </Button>
          <Button
            onClick={() => {
              setFilters(DEFAULT_RETARGET_FILTERS);
              setSelected([]);
            }}
          >
            Xoá lọc
          </Button>
        </div>
        {saved.length > 0 && (
          <section className="mt-3 flex flex-wrap gap-2" aria-label="Tệp đã lưu">
            {saved.map((segment) => (
              <span key={segment.id} className="inline-flex gap-1">
                <Button
                  onClick={() => {
                    setFilters(segment.filters);
                    setSelected([]);
                  }}
                >
                  {segment.name}
                </Button>
                <Button
                  aria-label={`Xoá tệp ${segment.name}`}
                  onClick={() => void saveSegments(saved.filter((item) => item.id !== segment.id))}
                >
                  Xoá
                </Button>
              </span>
            ))}
          </section>
        )}
      </section>
      <section className="rounded-md border border-line bg-surface-100 p-4 " aria-label="Chiến dịch retarget">
        <h2 className="text-title">Chiến dịch đo phản hồi</h2>
        <p className="mb-3 text-caption text-ink-muted">
          Catalog hiện không cung cấp mốc xác minh giá/tồn cho màn này. Không hiển thị giá, tồn kho hay khẳng định căn
          còn bán; xác minh với nguồn bán trước khi đưa thông tin vào tin nhắn.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label htmlFor="retarget-campaign" className="text-label">
            Tên chiến dịch
            <Input
              id="retarget-campaign"
              className={FIELD}
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="VD: Khách quan tâm Tràng Cát T10"
            />
          </label>
          <label htmlFor="retarget-project" className="text-label">
            Dự án cần xác minh (tuỳ chọn)
            <Input
              id="retarget-project"
              className={FIELD}
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="Không tự chèn giá/tồn kho"
            />
          </label>
          <label htmlFor="retarget-apt-type-message" className="text-label">
            Loại căn cần xác minh
            <Input
              id="retarget-apt-type-message"
              className={FIELD}
              value={aptType}
              onChange={(e) => setAptType(e.target.value)}
              placeholder="VD: 2N"
            />
          </label>
          <label htmlFor="retarget-follow-up" className="text-label">
            Ngày theo dõi sau khi gửi
            <Input
              id="retarget-follow-up"
              className={FIELD}
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
            />
          </label>
          <label htmlFor="retarget-template" className="text-label sm:col-span-2">
            Mẫu tin · biến: {'{{ten}}'}, {'{{du_an}}'}, {'{{loai_can}}'}
            <Textarea
              id="retarget-template"
              className="min-h-24 w-full rounded-sm border border-line bg-surface-100 px-3 py-2 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={!selectedVisible.length} onClick={exportEligible}>
            Xuất {selectedVisible.length} khách đã chọn
          </Button>
          <Pill>
            {customers.reduce(
              (count, customer) =>
                count +
                (customer.interactions || []).filter(
                  (item) => item?.campaign?.startsWith(`${campaign.trim()} ·`) && item?.kind === 'sent',
                ).length,
              0,
            )}{' '}
            lần gửi ·{' '}
            {customers.reduce(
              (count, customer) =>
                count +
                (customer.interactions || []).filter(
                  (item) => item?.campaign?.startsWith(`${campaign.trim()} ·`) && item?.kind === 'replied',
                ).length,
              0,
            )}{' '}
            phản hồi đã ghi nhận
          </Pill>
        </div>
      </section>
      {visible.length ? (
        <section
          className="overflow-hidden rounded-md border border-line bg-surface-100"
          aria-label="Danh sách khách retarget"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line p-3">
            <label className="flex items-center gap-2 text-caption">
              <input
                type="checkbox"
                checked={visible.length > 0 && selectedVisible.length === visible.length}
                onChange={(e) => setSelected(e.target.checked ? visible.map((c) => c.id) : [])}
              />
              Chọn {visible.length} khách
            </label>
            <span className="text-caption text-ink-muted">Dữ liệu cục bộ; kiểm tra lại trước khi gửi.</span>
          </div>
          <ul className="divide-y divide-border">
            {visible.map((customer) => {
              const tag = `${campaign.trim()} · ${project || 'chưa chọn dự án'}`;
              const sent = (customer.interactions || []).some(
                (item) => item?.campaign === tag && item?.kind === 'sent',
              );
              const replied = (customer.interactions || []).some(
                (item) => item?.campaign === tag && item?.kind === 'replied',
              );
              const responseRecorded = (customer.interactions || []).some(
                (item) => item?.campaign === tag && (item?.kind === 'replied' || item?.kind === 'no_response'),
              );
              return (
                <li key={customer.id} className="flex flex-col gap-3 p-3">
                  <div className="flex items-start gap-3">
                    <input
                      aria-label={`Chọn ${customer.full_name}`}
                      type="checkbox"
                      checked={selectedVisible.includes(customer.id)}
                      onChange={(e) =>
                        setSelected((value) =>
                          e.target.checked
                            ? [...new Set([...value, customer.id])]
                            : value.filter((id) => id !== customer.id),
                        )
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <LeadRow name={customer.full_name} phone={customer.phone} need={customerNeed(customer)} />
                      <div className="flex flex-wrap gap-2 px-4 py-2">
                        <Pill>
                          {CARE_STAGE_DISPLAY[customer.care_stage || ''] || customer.care_stage || 'Chưa rõ bậc'}
                        </Pill>
                        {customer.retarget_hint?.note && (
                          <span className="text-caption text-ink-muted">
                            Điều kiện đã lưu: {customer.retarget_hint.note}
                          </span>
                        )}
                      </div>
                      <p className="px-4 pb-2 text-caption text-ink-muted">
                        Phù hợp vì: {customerSegmentReasons(customer, filters).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pl-6">
                    {selectedVisible.includes(customer.id) ? (
                      <>
                        <Button disabled={!campaign.trim()} onClick={() => void openDraft(customer)}>
                          Sao chép &amp; mở Zalo
                        </Button>
                        <Button
                          disabled={!campaign.trim() || working === customer.id || sent}
                          onClick={() => void markSent(customer.id)}
                        >
                          {sent ? 'Đã ghi nhận gửi' : 'Đã gửi'}
                        </Button>
                        {sent && (
                          <>
                            <Button
                              disabled={working === customer.id || replied}
                              onClick={() => void recordResponse(customer.id, 'replied')}
                            >
                              {replied ? 'Đã có phản hồi' : 'Có phản hồi'}
                            </Button>
                            <Button
                              disabled={working === customer.id || responseRecorded}
                              onClick={() => void recordResponse(customer.id, 'no_response')}
                            >
                              {responseRecorded && !replied ? 'Đã ghi nhận chưa phản hồi' : 'Chưa phản hồi'}
                            </Button>
                          </>
                        )}
                      </>
                    ) : (
                      <span className="self-center text-caption text-ink-muted">Chọn khách để chuẩn bị liên hệ.</span>
                    )}
                    <span className="self-center text-caption text-ink-muted">
                      Không tự gửi · xác minh nội dung trước khi gửi.
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <EmptyState
          title="Chưa có khách phù hợp"
          text="Mở rộng điều kiện hoặc kiểm tra các dữ liệu có trong hồ sơ khách."
          actions={
            <Button
              onClick={() => {
                setFilters(DEFAULT_RETARGET_FILTERS);
                document.getElementById('retarget-apt-type')?.focus();
              }}
            >
              Đổi điều kiện
            </Button>
          }
        />
      )}
    </main>
  );
}

export const route: FeatureRoute = { path: '/khach-hang/retarget', element: <RetargetPage /> };
