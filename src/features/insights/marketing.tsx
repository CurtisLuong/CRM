import { useEffect, useMemo, useState } from 'react';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { type MarketingLeadLog, marketingCohorts, marketingDimensions } from '@/domain/metrics/marketing';
import { Badge, EmptyState } from '@/ui';

const fmt = (value: number) => value.toLocaleString('vi-VN');
const ratio = (n: number, d: number) => `${fmt(n)}/${fmt(d)}`;
const percent = (n: number, d: number) => (d ? `${Math.round((n * 100) / d)}%` : '—');
type LogState = {
  loading: boolean;
  available: boolean;
  latest: string | null;
  errors: number;
  logs: MarketingLeadLog[];
};

export function MarketingSection({
  customers,
  account,
}: {
  customers: readonly Customer[];
  account: RepositoryAccount | null;
}) {
  const [dimension, setDimension] = useState<'source' | 'campaign' | 'form'>('source');
  const [logState, setLogState] = useState<LogState>({
    loading: true,
    available: false,
    latest: null,
    errors: 0,
    logs: [],
  });
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!account) {
        setLogState({ loading: false, available: false, latest: null, errors: 0, logs: [] });
        return;
      }
      if (!online) {
        setLogState({ loading: false, available: false, latest: null, errors: 0, logs: [] });
        return;
      }
      setLogState((state) => ({ ...state, loading: true }));
      try {
        // fb_leads contains raw PII; request metadata only. RLS limits this log to admins.
        const { data, error } = await account.sync.client
          .from('fb_leads')
          .select('customer_id,form_name,campaign_name,created_time,received_at,status')
          .order('received_at', { ascending: false })
          .limit(5000);
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        const latest = rows
          .map((row) => Date.parse(String(row.received_at || '')))
          .filter(Number.isFinite)
          .sort((a, b) => b - a)[0];
        const ownedIds = new Set(customers.map((customer) => customer.id));
        const logs = rows
          .filter((row) => row.customer_id && ownedIds.has(String(row.customer_id)))
          .map((row) => ({
            customer_id: String(row.customer_id),
            form_name: typeof row.form_name === 'string' ? row.form_name : null,
            campaign_name: typeof row.campaign_name === 'string' ? row.campaign_name : null,
            created_time: typeof row.created_time === 'string' ? row.created_time : null,
          }));
        if (active)
          setLogState({
            loading: false,
            available: true,
            latest: latest ? new Date(latest).toISOString() : null,
            errors: rows.filter((row) => row.status === 'error').length,
            logs,
          });
      } catch {
        if (active) setLogState({ loading: false, available: false, latest: null, errors: 0, logs: [] });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [account, customers, online]);

  const dimensions = useMemo(() => marketingDimensions(customers, logState.logs), [customers, logState.logs]);
  const cohorts = useMemo(() => marketingCohorts(customers, now), [customers, now]);
  const selected = dimensions[dimension];
  const latestLabel = logState.latest ? new Date(logState.latest).toLocaleString('vi-VN') : 'Chưa có bản ghi';
  const tabLabel = { source: 'Kênh', campaign: 'Campaign', form: 'Form' } as const;

  return (
    <section
      aria-labelledby="marketing-title"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-e1"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="marketing-title" className="text-heading">
            Marketing
          </h2>
          <p className="text-small text-text-2">
            Chất lượng lead theo dữ liệu CRM hiện có; một khách có thể mang nhiều kênh nên tổng từng kênh có thể lớn hơn
            số khách duy nhất. Không suy ra quan hệ nhân quả.
          </p>
        </div>
        <Badge>{fmt(customers.length)} khách trong mẫu</Badge>
      </header>
      <div className="rounded-control bg-surface-2 p-3 text-small text-text-2">
        <strong className="text-text">Định nghĩa funnel:</strong> Hợp lệ = không có lý do “Số sai” hoặc “Phá campaign”;
        Liên lạc được = có cuộc gọi kết quả Nói chuyện được; Đạt = qualified_at; các mốc sau = lịch sử/bậc hiện tại. Mỗi
        ô là tử/mẫu cùng kỳ dữ liệu đã lưu.
      </div>
      <div role="tablist" aria-label="Phân tích theo chiều" className="flex flex-wrap gap-2">
        {(['source', 'campaign', 'form'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={dimension === key}
            className={`min-h-10 rounded-control border px-3 text-small ${dimension === key ? 'border-accent bg-accent-soft text-text' : 'border-border bg-surface text-text-2'}`}
            onClick={() => setDimension(key)}
          >
            {tabLabel[key]}
          </button>
        ))}
      </div>
      {!selected.length ? (
        <EmptyState
          title="Chưa có dữ liệu marketing"
          hint="Các nhóm xuất hiện khi khách có nguồn, campaign hoặc form được ghi nhận."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {selected.map((group) => (
            <article key={group.key} className="rounded-control border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-body-strong">{group.label}</h3>
                <span className="text-small text-text-2">Lead: {fmt(group.leadCount)} khách</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {group.funnel.map((stage, index) => (
                  <div key={stage.key} className="min-w-0 rounded-control bg-surface-2 p-2">
                    <p className="truncate text-xs text-text-2">{stage.label}</p>
                    <p className="font-data text-mono-data">{ratio(stage.numerator, stage.denominator)}</p>
                    <p className="text-xs text-text-3">
                      {percent(stage.numerator, stage.denominator)}
                      {index ? ` · / lead` : ' · toàn nhóm'}
                    </p>
                  </div>
                ))}
              </div>
              {group.reasons.length > 0 && (
                <div className="mt-3 border-t border-border pt-2">
                  <p className="text-label">
                    Lý do loại · mẫu số {fmt(group.reasons[0]?.denominator || 0)} khách bị loại
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-small text-text-2">
                    {group.reasons.map((item) => (
                      <li key={item.reason}>
                        {item.reason}: {ratio(item.numerator, item.denominator)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <section aria-labelledby="marketing-cohort-title" className="border-t border-border pt-3">
        <h3 id="marketing-cohort-title" className="text-body-strong">
          Cohort đăng ký theo tháng
        </h3>
        <p className="text-small text-text-2">
          Booking và ký HĐMB tính trên cohort đã theo dõi đủ 30 ngày. Cohort chưa đủ thời gian có thể xem cỡ mẫu nhưng
          chưa có tỉ lệ.
        </p>
        {cohorts.length ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-small">
              <thead>
                <tr className="border-b border-border text-text-2">
                  <th className="py-2 pr-3">Tháng</th>
                  <th className="py-2 pr-3">Lead / trưởng thành</th>
                  <th className="py-2 pr-3">Booking / trưởng thành</th>
                  <th className="py-2">Ký HĐMB / trưởng thành</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((cohort) => (
                  <tr key={cohort.period} className="border-b border-border">
                    <th scope="row" className="py-2 pr-3">
                      {cohort.period}
                    </th>
                    <td className="py-2 pr-3">
                      {fmt(cohort.leadCount)} / {fmt(cohort.matureCount)}
                      {cohort.ready ? '' : ' · đang theo dõi'}
                    </td>
                    <td className="py-2 pr-3">
                      {ratio(cohort.booking.numerator, cohort.booking.denominator)} ·{' '}
                      {cohort.booking.percent == null ? 'Chưa đủ dữ liệu' : `${cohort.booking.percent}%`}
                    </td>
                    <td className="py-2">
                      {ratio(cohort.signed.numerator, cohort.signed.denominator)} ·{' '}
                      {cohort.signed.percent == null ? 'Chưa đủ dữ liệu' : `${cohort.signed.percent}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-small text-text-3">Chưa có ngày đăng ký hợp lệ.</p>
        )}
      </section>
      <aside aria-label="Tình trạng nhận lead Facebook" className="border-t border-border pt-3">
        <h3 className="text-body-strong">Đường thu lead Facebook</h3>
        {logState.loading ? (
          <p className="text-small text-text-2">Đang kiểm tra nhật ký…</p>
        ) : logState.available ? (
          <p className="text-small text-text-2">
            Lần nhận cuối: {latestLabel} · lỗi trong 5.000 bản ghi gần nhất: {fmt(logState.errors)}.
          </p>
        ) : (
          <p className="text-small text-text-2">
            Không đọc được nhật ký (có thể cần quyền admin) hoặc đang ngoại tuyến; chưa thể kết luận connector hoạt động
            hay có lỗi.
          </p>
        )}
      </aside>
    </section>
  );
}
