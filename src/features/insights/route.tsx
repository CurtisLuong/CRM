import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { FeatureRoute } from '@/app/routes';
import { EmptyState } from '@/components/crm';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import { CareSection } from './care';
import { DetailBlock } from './detail';
import { MarketingSection } from './marketing';
import {
  funnelChartData,
  funnelChartTitle,
  headlineDelta,
  headlineTiles,
  insightReport,
  sourceChartData,
  sourceChartTitle,
  splitInsights,
  weeklyChartData,
  weeklyChartTitle,
} from './model';

const MetricView = lazy(() => import('./charts-view').then((module) => ({ default: module.MetricView })));
const FunnelView = lazy(() => import('./charts-view').then((module) => ({ default: module.FunnelView })));
const WeeklyView = lazy(() => import('./charts-view').then((module) => ({ default: module.WeeklyView })));
const SourceView = lazy(() => import('./charts-view').then((module) => ({ default: module.SourceView })));

const pct = (value: number | null) => (value == null ? '—' : `${value}%`);
const periodLabel = (start: number, end: number) =>
  `${new Date(start).toLocaleDateString('vi-VN')}–${new Date(end).toLocaleDateString('vi-VN')}`;

export function InsightsPage() {
  const account = useRepositoryAccount();
  const customers = useCustomers((c) => !!account && c.owner_id === account.sync.local.userId);
  const [now, setNow] = useState(() => Date.now());
  // Phễu & tuần mở sẵn để liếc là thấy biểu đồ; hai khối còn lại thu gọn (Curtis chọn 2026-10-27).
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({ 'funnel-detail': true });
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
  const funnelData = useMemo(() => funnelChartData(report.funnel), [report.funnel]);
  const weekData = useMemo(() => weeklyChartData(report.week), [report.week]);
  const sourcesData = useMemo(() => sourceChartData(report.sources), [report.sources]);
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
        <EmptyState title="Chưa có dữ liệu tài khoản" text="Đăng nhập để xem hiệu quả chăm sóc, phễu và nguồn khách." />
      </main>
    );
  if (!customers.length)
    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 pb-10">
        <EmptyState
          title="Chưa có dữ liệu phân tích"
          text="Các chỉ số chăm sóc sẽ xuất hiện khi có khách và lịch sử."
        />
        <MarketingSection customers={customers} account={account} />
      </main>
    );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 p-4 pb-10">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            data-tile
            type="button"
            onClick={() => openDetail(tile.target)}
            className="min-h-28 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-ion"
          >
            <Suspense fallback={<Skeleton className="h-28 w-full" />}>
              <MetricView
                label={tile.label}
                value={tile.value}
                unit={tile.unit}
                fraction={tile.sub}
                delta={headlineDelta(tile.trend)}
              />
            </Suspense>
          </button>
        ))}
      </div>

      <DetailBlock
        id="funnel-detail"
        title="Phễu & tuần"
        open={!!openBlocks['funnel-detail']}
        onToggle={() => toggle('funnel-detail')}
      >
        <section aria-label="Phễu và tốc độ" className="rounded-lg border border-line bg-surface-100 p-4">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <div data-testid="insights-chart-funnel">
              <FunnelView
                data={funnelData}
                headline={funnelChartTitle(funnelData)}
                total={funnelDenominator}
                outside={[
                  { label: 'Nuôi dài hạn', count: report.outside.nurture },
                  { label: 'Loại/không chốt', count: report.outside.dropped },
                  { label: 'Đã ký', count: report.outside.won },
                  { label: 'Booking đang có', count: report.outside.booking },
                ]}
              />
            </div>
          </Suspense>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {report.funnel.map((stage, i) => (
              <div
                key={stage.key}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2"
              >
                <span className="text-body font-semibold">{stage.label}</span>
                <span className="text-caption text-ink-muted">
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
          <p className="mt-2 text-caption text-ink-muted">
            Ngoài phễu: {report.outside.nurture} Nuôi dài hạn · {report.outside.dropped} Loại/không chốt ·{' '}
            {report.outside.won} Đã ký · {report.outside.booking} Booking đang có.
          </p>
        </section>

        <section aria-label="Hiệu suất tuần" className="rounded-lg border border-line bg-surface-100 p-4">
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <div data-testid="insights-chart-weekly">
              <WeeklyView
                data={weekData}
                headline={weeklyChartTitle(weekData)}
                period={periodLabel(report.week.start, report.week.end)}
              />
            </div>
          </Suspense>
        </section>
      </DetailBlock>

      <section aria-labelledby="improve-title" className="rounded-lg border border-line bg-surface-100 p-4 ">
        <h2 id="improve-title" className="text-title">
          Cần cải thiện
        </h2>
        <p className="mb-3 text-caption text-ink-muted">
          Quan sát theo quy tắc khi đủ mẫu; không suy ra quan hệ nhân quả.
        </p>
        {observations.top.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {observations.top.map((item) => (
              <li key={item.key} className="py-3 first:pt-0 last:pb-0">
                <p className="text-body font-semibold">{item.title}</p>
                <p className="text-caption text-ink-muted">{item.evidence}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-ink-muted">Chưa có quan sát đạt ngưỡng.</p>
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
          <section aria-labelledby="care-observations-title" className="border-t border-line pt-4">
            <h3 id="care-observations-title" className="text-body font-semibold">
              Quan sát khác
            </h3>
            {observations.rest.length > 0 && (
              <ul className="mt-2 flex flex-col divide-y divide-line">
                {observations.rest.map((item) => (
                  <li key={item.key} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-body font-semibold">{item.title}</p>
                    <p className="text-caption text-ink-muted">{item.evidence}</p>
                  </li>
                ))}
              </ul>
            )}
            {report.insights.pending.length > 0 && (
              <p className="mt-3 text-caption text-ink-muted">
                Cần thêm dữ liệu: {report.insights.pending.join(' · ')}.
              </p>
            )}
          </section>
        )}
      </DetailBlock>

      <DetailBlock
        id="source-detail"
        title="Nguồn & Marketing"
        open={!!openBlocks['source-detail']}
        onToggle={() => toggle('source-detail')}
      >
        <section aria-label="Nguồn khách" className="rounded-lg border border-line bg-surface-100 p-4">
          {sourcesData.length > 0 ? (
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <SourceView data={sourcesData} headline={sourceChartTitle(sourcesData)} />
            </Suspense>
          ) : (
            <p className="text-body text-ink-muted">Chưa rõ nguồn khách.</p>
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
