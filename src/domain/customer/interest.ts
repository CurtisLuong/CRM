import { INTEREST_DEFAULT_NEW, INTEREST_TIERS, type InterestTier } from '@/config/stages';

/** Bậc quan tâm của một mức 0–100 (thiếu/không phải số = Nguội). */
export function interestTierOf(level: unknown): InterestTier {
  const value = Number(level) || 0;
  return INTEREST_TIERS.find((tier) => value >= tier.min) ?? (INTEREST_TIERS.at(-1) as InterestTier);
}

/**
 * Sale chọn nhanh một bậc (Curtis 10/11, B1) → mức lưu vào `interest_level`.
 * Đã ở đúng bậc → giữ nguyên số cũ (không làm mất số chi tiết). Khác bậc → mốc dưới của bậc;
 * riêng Nguội = mức mặc định khách mới (20), vì 0 là mức của khách đã loại.
 */
export function interestLevelForTier(current: unknown, tierKey: string): number | null {
  const tier = INTEREST_TIERS.find((t) => t.key === tierKey);
  if (!tier) return null;
  if (current != null && current !== '' && interestTierOf(current).key === tier.key) return Number(current);
  return tier.min === 0 ? INTEREST_DEFAULT_NEW : tier.min;
}
