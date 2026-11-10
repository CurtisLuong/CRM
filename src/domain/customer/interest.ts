import { CARE_STAGE_DROPPED, INTEREST_TIERS, type InterestTier, STAGE_INTEREST } from '@/config/stages';
import type { Customer } from './types';

const tierByKey = (key: string) => INTEREST_TIERS.find((t) => t.key === key) as InterestTier;
const LANH = tierByKey('lanh');
const NGUOI = tierByKey('nguoi');

/** Bậc của một mức 0–100 (D-033): 0 Nguội · 1–34 Lạnh · 35–59 Ấm · ≥ 60 Nóng. Thiếu/không phải số = Lạnh (khách mới). */
export function interestTierOf(level: unknown): InterestTier {
  if (level == null || level === '' || !Number.isFinite(Number(level))) return LANH;
  const value = Number(level);
  if (value <= 0) return NGUOI;
  return (
    [...INTEREST_TIERS]
      .filter((t) => t.key !== NGUOI.key)
      .sort((a, b) => b.min - a.min)
      .find((t) => value >= t.min) ?? LANH
  );
}

/** Khách đang Loại hoặc lưu trữ luôn là Nguội (dữ liệu cũ chưa ghi 0 vẫn hiện đúng, không update hàng loạt). */
export function customerInterestTier(customer: Customer): InterestTier {
  if (customer.disqualified_at || customer.archived_at || customer.care_stage === CARE_STAGE_DROPPED) return NGUOI;
  return interestTierOf(customer.interest_level);
}

/**
 * Sale chọn một bậc → mức lưu vào `interest_level`. Đã ở đúng bậc → giữ số cũ; khác bậc → `level` của bậc
 * (Lạnh 20 · Ấm 35 · Nóng 60 · Nguội 0). Mã bậc lạ → null.
 */
export function interestLevelForTier(current: unknown, tierKey: string): number | null {
  const tier = INTEREST_TIERS.find((t) => t.key === tierKey);
  if (!tier) return null;
  if (current != null && current !== '' && interestTierOf(current).key === tier.key) return Number(current);
  return tier.level;
}

type Patch = Record<string, unknown>;
const set = (v: unknown) => v != null && v !== '';

/**
 * Mức quan tâm tự đổi theo trạng thái (D-033) — thêm vào patch sắp ghi, KHÔNG ghi.
 * Loại (disqualified_at có giá trị / bậc Loại) hoặc lưu trữ → Nguội (0) · bậc Nuôi dài hạn → Lạnh (20) ·
 * bỏ Loại / bỏ lưu trữ (trường đang có giá trị bị xoá, hoặc rời bậc Loại) → Lạnh (20). Patch đã có `interest_level` → giữ ý người dùng.
 * Trả patch mới (chỉ thêm `interest_level` khi bậc thật sự đổi); không có quy tắc nào khớp → trả patch cũ.
 */
export function withInterestRule<P extends Patch>(customer: Customer, patch: P): P {
  if ('interest_level' in patch) return patch;
  let next: number | undefined;
  const drops = (('disqualified_at' in patch && set(patch.disqualified_at) && !set(customer.disqualified_at)) ||
    ('archived_at' in patch && set(patch.archived_at) && !set(customer.archived_at))) as boolean;
  const restores =
    ('disqualified_at' in patch && !set(patch.disqualified_at) && set(customer.disqualified_at)) ||
    ('archived_at' in patch && !set(patch.archived_at) && set(customer.archived_at)) ||
    (customer.care_stage === CARE_STAGE_DROPPED &&
      typeof patch.care_stage === 'string' &&
      patch.care_stage !== CARE_STAGE_DROPPED);
  const stage =
    typeof patch.care_stage === 'string' && patch.care_stage !== customer.care_stage ? patch.care_stage : '';
  if (drops) next = NGUOI.level;
  else if (stage && stage in STAGE_INTEREST) next = STAGE_INTEREST[stage];
  else if (restores) next = LANH.level;
  // So theo bậc, không theo số: đã đúng bậc thì không ghi (giữ số chi tiết, khách thiếu số vẫn là Lạnh).
  if (next == null || interestTierOf(customer.interest_level).key === interestTierOf(next).key) return patch;
  return { ...patch, interest_level: next };
}
