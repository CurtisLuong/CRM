import { Link } from 'react-router';
import { useIntegrationHealth } from '@/data/hooks';
import { META_LEAD_ADS_ANCHOR, META_LEAD_ADS_ID } from '@/features/settings/model';
import { Button } from '@/ui';
import { metaLeadAdsAlert } from './model';

const TONE = {
  warning: 'border-l-warning bg-warning-bg',
  danger: 'border-l-danger bg-danger-bg',
} as const;
const FRAME = 'border-y border-r border-border border-l-4';

/**
 * Một dòng cảnh báo trước danh sách Khách mới; không chặn danh sách hay nút Gọi.
 * Có sẵn đường tới đúng thẻ "Kết nối Facebook Lead Ads" trong Cài đặt.
 */
export function MetaLeadAdsBanner() {
  const health = useIntegrationHealth(META_LEAD_ADS_ID);
  const alert = metaLeadAdsAlert(health, Date.now());
  if (!alert) return null;
  return (
    <section
      aria-label="Cảnh báo kết nối Facebook"
      className={`flex flex-col items-start gap-2 rounded-card p-3 ${FRAME} ${TONE[alert.tone]}`}
    >
      <p className="text-small text-text">{alert.text}</p>
      <Button asChild variant="secondary">
        <Link to={`/cai-dat#${META_LEAD_ADS_ANCHOR}`}>Mở Cài đặt</Link>
      </Button>
    </section>
  );
}
