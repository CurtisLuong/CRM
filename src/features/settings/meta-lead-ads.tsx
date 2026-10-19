import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { type IntegrationHealth, useIntegrationHealth } from '@/data/hooks';
import { Badge, Loading, Skeleton } from '@/ui';
import { integrationHealthSummary, META_LEAD_ADS_ANCHOR, META_LEAD_ADS_ID } from './model';

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
      className="scroll-mt-4 rounded-card border border-border bg-surface p-4"
    >
      <h2 id="meta-lead-ads-title" className="text-section">
        Kết nối Facebook Lead Ads
      </h2>
      {health.state === 'loading' && (
        <Loading label="Đang tải tình trạng kết nối Facebook">
          <span className="mt-3 block text-small text-text-2">Đang tải tình trạng kết nối…</span>
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </Loading>
      )}
      {health.state === 'error' && (
        <p role="status" className="mt-2 text-small text-text-2">
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
        <Badge variant="status" tone={summary.level.tone}>
          {summary.level.label}
        </Badge>
        <span className="text-small text-text-2">{summary.checkedText}</span>
      </div>
      {summary.message && <p className="mt-3 whitespace-pre-wrap text-body">{summary.message}</p>}
      {summary.staleText && (
        <p role="status" className="mt-3 rounded-control bg-warning-bg px-3 py-2 text-small text-warning">
          {summary.staleText}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-1 text-small text-text-2">
        <p>{summary.lastLeadText}</p>
        <p>{summary.pendingText}</p>
        {summary.stuckText && <p className="text-danger">{summary.stuckText}</p>}
        <p>{summary.tokenText}</p>
      </div>
    </>
  );
}
