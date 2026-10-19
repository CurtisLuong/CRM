import { useEffect, useMemo, useState } from 'react';
import type { FeatureRoute } from '@/app/routes';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import { EmptyState, MetricTile, MiniChart, StatTile } from '@/ui';
import { CareSection } from './care';
import { DetailBlock } from './detail';
import { MarketingSection } from './marketing';
import { headlineTiles, insightReport, splitInsights } from './model';

const pct = (value: number | null) => (value == null ? '—' : `${value}%`);
const nFmt = (n: number) => n.toLocaleString('vi-VN');
const periodLabel = (start: number, end: number) =>
  `${new Date(start).toLocaleDateString('vi-VN')}–${new Date(end).toLocaleDateString('vi-VN')}`;

export function InsightsPage() {
  const account = useRepositoryAccount();
  const customers = useCustomers((c) => !!account && c.owner_id === account.sync.local.userId);
  const [now, setNow] = useState(() => Date.now());
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({});
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!scrollTarget) return;
    document.getElementById(scrollTarget)?.scrollIntoView({ block: 'start' });
    setScrollTarget(null);
  }, [scrollTarget]);
  const report = useMemo(() => insightReport(customers, now), [customers, now]);
  const tiles = useMemo(() => headlineTiles(customers, now), [customers, now]);
  const observations = useMemo(() => splitInsights(report.insights.items), [report.insights.items]);
  const funnelDenominator = report.funnel[0]?.reached || 0;
  const openDetail = (id: string) => {
    setOpenBlocks((prev) => ({ ...prev, [id]: true }));
    setScrollTarget(id);
  };
  const toggle = (id: string) => setOpenBlocks((prev) => ({ ...prev, [id]: !prev[id] }));
  const hasMoreObservations = observations.rest.length > 0 || report.insights.pending.length > 0;

  if (!account)
    return (
      <main className="mx-auto max-w-5xl p-4">
        <EmptyState title="Chưa có dữ liệu tài khoản" hint="Đăng nhập để xem hiệu quả chăm sóc, phễu và nguồn khách." />
      </main>
    );
  if (!customers.length)
    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 pb-10">
        <EmptyState
          title="Chưa có dữ liệu phân tích"
          hint="Các chỉ số chăm sóc sẽ xuất hiện khi có khách và lịch sử."
        />
        <MarketingSection customers={customers} account={account} />
      </main>
    );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 pb-10">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <StatTile
            key={tile.key}
            label={tile.label}
            value={tile.value}
            unit={tile.unit}
            sub={tile.sub}
            trend={tile.trend}
            onClick={() => openDetail(tile.target)}
          />
        ))}
      </div>

      <section aria-labelledby="improve-title" className="rounded-card border border-border bg-surface p-4 shadow-e1">
        <h2 id="improve-title" className="text-heading">
          Cần cải thiện
        </h2>
        <p className="mb-3 text-small text-text-2">
          Quan sát theo quy tắc với ngưỡng mẫu của v1; không suy ra quan hệ nhân quả.
        </p>
        {observations.top.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {observations.top.map((item) => (
              <li key={item.key} className="py-3 first:pt-0 last:pb-0">
                <p className="text-body-strong">{item.title}</p>
                <p className="text-small text-text-2">{item.evidence}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-text-3">Chưa có quan sát đạt ngưỡng.</p>
        )}
      </section>

      <DetailBlock
        id="care-detail"
        title="Chăm sóc chi tiết"
        open={!!openBlocks['care-detail']}
        onToggle={() => toggle('care-detail')}
      >
        <CareSection customers={customers} now={now} />
        {hasMoreObservations && (
          <section aria-labelledby="care-observations-title" className="border-t border-border pt-4">
            <h3 id="care-observations-title" className="text-body-strong">
              Quan sát khác
            </h3>
            {observations.rest.length > 0 && (
              <ul className="mt-2 flex flex-col divide-y divide-border">
                {observations.rest.map((item) => (
                  <li key={item.key} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-body-strong">{item.title}</p>
                    <p className="text-small text-text-2">{item.evidence}</p>
                  </li>
                ))}
              </ul>
            )}
            {report.insights.pending.length > 0 && (
              <p className="mt-3 text-small text-text-2">Cần thêm dữ liệu: {report.insights.pending.join(' · ')}.</p>
            )}
          </section>
        )}
      </DetailBlock>

      <DetailBlock
        id="funnel-detail"
        title="Phễu & tuần"
        open={!!openBlocks['funnel-detail']}
        onToggle={() => toggle('funnel-detail')}
      >
        <section aria-labelledby="funnel-title" className="rounded-card border border-border bg-surface p-4 shadow-e1">
          <h2 id="funnel-title" className="text-heading">
            Phễu và tốc độ
          </h2>
          <p className="mb-3 text-small text-text-2">
            Số khách đã tới từng bậc trên tổng {nFmt(funnelDenominator)} khách vào phễu; thời gian ở bậc tính theo SLA
            của từng bậc. Nuôi dài hạn nằm ngoài phễu.
          </p>
          <MiniChart
            kind="funnel"
            title="Khách đã đạt tới bậc"
            data={report.funnel.map((x) => ({ label: x.label, value: x.reached }))}
          />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {report.funnel.map((stage, i) => (
              <div
                key={stage.key}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-2"
              >
                <span className="text-body-strong">{stage.label}</span>
                <span className="text-small text-text-2">
                  {stage.reached}/{funnelDenominator} khách
                  {i > 0
                    ? ` · chuyển tiếp ${stage.conversion?.numerator}/${stage.conversion?.denominator} (${pct(stage.conversion?.percent ?? null)})`
                    : ''}{' '}
                  · trung bình hiện tại{' '}
                  {stage.averageDurationMs === null ? 'chưa đủ dữ liệu' : formatDuration(stage.averageDurationMs)} ·{' '}
                  {stage.overdue} quá hạn SLA
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-small text-text-2">
            Ngoài phễu: {report.outside.nurture} Nuôi dài hạn · {report.outside.dropped} Loại/không chốt ·{' '}
            {report.outside.won} Đã ký · {report.outside.booking} Booking đang có.
          </p>
        </section>

        <section aria-labelledby="week-title" className="rounded-card border border-border bg-surface p-4 shadow-e1">
          <h2 id="week-title" className="text-heading">
            Hiệu suất tuần
          </h2>
          <p className="mb-3 text-small text-text-2">
            Tuần hiện tại so với tuần trước · {periodLabel(report.week.start, report.week.end)}. Số chuyển bậc là
            milestone được ghi trong lịch sử.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ['Khách mới', 'leads'],
                ['Cuộc gọi', 'calls'],
                ['Nói chuyện được', 'talked'],
                ['Chuyển Tiềm năng', 'qualified'],
                ['Booking / Kí', 'milestones'],
              ] as const
            ).map(([label, key]) => (
              <MetricTile
                key={key}
                label={label}
                value={nFmt(report.week.current[key])}
                ratio={`Mẫu: ${customers.length} khách phụ trách`}
                period={`Tuần trước: ${nFmt(report.week.previous[key])}`}
              />
            ))}
          </div>
          <MiniChart
            kind="bar"
            title="Khách mới, cuộc gọi và kết quả tuần này"
            data={[
              { label: 'Khách mới', value: report.week.current.leads },
              { label: 'Cuộc gọi', value: report.week.current.calls },
              { label: 'Nói chuyện', value: report.week.current.talked },
              { label: 'Đạt', value: report.week.current.qualified },
              { label: 'Booking/Kí', value: report.week.current.milestones },
            ]}
          />
        </section>
      </DetailBlock>

      <DetailBlock
        id="source-detail"
        title="Nguồn & Marketing"
        open={!!openBlocks['source-detail']}
        onToggle={() => toggle('source-detail')}
      >
        <section aria-labelledby="source-title" className="rounded-card border border-border bg-surface p-4 shadow-e1">
          <h2 id="source-title" className="text-heading">
            Nguồn khách
          </h2>
          <p className="mb-3 text-small text-text-2">
            Một khách có thể có nhiều nguồn đã lưu, nên tổng theo nguồn có thể lớn hơn số khách duy nhất.
          </p>
          {report.sources.length ? (
            <div className="flex flex-col gap-3">
              {report.sources.map((source) => (
                <div key={source.key} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3">
                  <span className="truncate text-small text-text-2">{source.label}</span>
                  <span className="h-3 rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{
                        width: `${Math.max(2, (100 * source.denominator) / Math.max(...report.sources.map((s) => s.denominator), 1))}%`,
                      }}
                    />
                  </span>
                  <span className="font-data text-mono-data">
                    {source.numerator}/{source.denominator} Đạt · {pct(source.percent)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-small text-text-3">Chưa rõ nguồn khách.</p>
          )}
        </section>
        <MarketingSection customers={customers} account={account} />
      </DetailBlock>
    </main>
  );
}

function formatDuration(ms: number) {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} phút`;
  if (mins < 1440) return `${Math.round(mins / 60)} giờ`;
  return `${Math.floor(mins / 1440)} ngày ${Math.floor((mins % 1440) / 60)} giờ`;
}

export const route: FeatureRoute = { path: '/hieu-qua', element: <InsightsPage />, handle: { title: 'Hiệu quả' } };
