import { HEALTH_STALE_MS, INTEGRATION_LEVELS, type IntegrationLevel } from '@/config/integrations';

/** Mã trạng thái của Worker → nhãn + sắc thái. Mã lạ coi như cần chú ý. */
export function integrationHealthLevel(status: string): IntegrationLevel {
  return INTEGRATION_LEVELS[status as keyof typeof INTEGRATION_LEVELS] ?? INTEGRATION_LEVELS.warning;
}

/**
 * Quá 30 phút không có lượt quét mới = dữ liệu cũ (Worker có thể đã ngừng chạy → mất lead).
 * Mốc không đọc được cũng coi là cũ: không chứng minh được kết nối còn sống.
 */
export function isIntegrationHealthStale(checkedAt: string | null | undefined, now: number): boolean {
  const at = typeof checkedAt === 'string' ? Date.parse(checkedAt) : Number.NaN;
  return Number.isNaN(at) ? true : now - at > HEALTH_STALE_MS;
}
