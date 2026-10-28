import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { META_LEAD_ADS_ANCHOR, META_LEAD_ADS_ID } from '@/config/integrations';
import { useIntegrationHealth } from '@/data/hooks';
import { metaLeadAdsAlert } from './model';

const TONE = {
  warning: 'border-l-alert bg-alert-tint',
  danger: 'border-l-alert bg-alert-tint',
} as const;
const FRAME = 'border-y border-r border-line border-l-4';

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
      className={`flex flex-col items-start gap-2 rounded-md p-3 ${FRAME} ${TONE[alert.tone]}`}
    >
      <p className="text-caption text-ink">{alert.text}</p>
      <Button asChild variant="secondary">
        <Link to={`/cai-dat#${META_LEAD_ADS_ANCHOR}`}>Mở Cài đặt</Link>
      </Button>
    </section>
  );
}
