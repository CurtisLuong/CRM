import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { SignalBadge } from '@/components/crm';
import { Skeleton } from '@/components/ui/skeleton';
import { type IntegrationHealth, useIntegrationHealth } from '@/data/hooks';
import { integrationHealthSummary, META_LEAD_ADS_ANCHOR, META_LEAD_ADS_ID } from './model';

// Tình trạng kết nối là tín hiệu: hoạt động = ok, cần chú ý = soon, lỗi = alert (DESIGN §2).
const HEALTH_LEVEL = { success: 'ok', warning: 'soon', danger: 'alert' } as const;

/** Thẻ tình trạng kết nối Facebook Lead Ads: chỉ đọc, không có nút ghi/gọi Worker. */
export function MetaLeadAdsSection() {
  const health = useIntegrationHealth(META_LEAD_ADS_ID);
  const location = useLocation();
  const sectionRef = useRef<HTMLElement>(null);

  // Đi từ dòng cảnh báo ở Khách mới bằng /cai-dat#meta-lead-ads → cuộn đúng thẻ.
  useEffect(() => {
    if (location.hash === `#${META_LEAD_ADS_ANCHOR}`) {
      sectionRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [location.hash]);

  // 'none' (chưa thiết lập / không có quyền) và 'offline' không được biến thành cảnh báo.
  if (health.state === 'none' || health.state === 'offline') return null;

  return (
    <section
      ref={sectionRef}
      id={META_LEAD_ADS_ANCHOR}
      aria-labelledby="meta-lead-ads-title"
      className="scroll-mt-4 rounded-lg border border-line bg-surface-100 p-4"
    >
      <h2 id="meta-lead-ads-title" className="text-section">
        Kết nối Facebook Lead Ads
      </h2>
      {health.state === 'loading' && (
        <div role="status" aria-label="Đang tải tình trạng kết nối Facebook" className="mt-3">
          <span className="block text-caption text-ink-muted">Đang tải tình trạng kết nối…</span>
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </div>
      )}
      {health.state === 'error' && (
        <p role="status" className="mt-2 text-caption text-ink-muted">
          Chưa tải được tình trạng kết nối Facebook. Kiểm tra mạng rồi mở lại.
        </p>
      )}
      {health.state === 'ready' && <HealthDetails row={health.row} />}
    </section>
  );
}

function HealthDetails({ row }: { row: IntegrationHealth }) {
  const summary = integrationHealthSummary(row, Date.now());
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SignalBadge level={HEALTH_LEVEL[summary.level.tone]}>{summary.level.label}</SignalBadge>
        <span className="text-caption text-ink-muted">{summary.checkedText}</span>
      </div>
      {summary.message && <p className="mt-3 whitespace-pre-wrap text-body">{summary.message}</p>}
      {summary.staleText && (
        <p role="status" className="mt-3 rounded-md bg-warning-tint px-3 py-2 text-caption text-warning-text">
          {summary.staleText}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-1 text-caption text-ink-muted">
        <p>{summary.lastLeadText}</p>
        <p>{summary.pendingText}</p>
        {summary.stuckText && <p className="text-alert-text">{summary.stuckText}</p>}
        <p>{summary.tokenText}</p>
      </div>
    </>
  );
}
