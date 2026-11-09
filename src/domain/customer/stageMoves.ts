import { CARE_STAGE_BRANCH, CARE_STAGE_DROPPED, CARE_STAGE_NURTURE, CARE_STAGE_PICKER_ORDER } from '@/config/stages';
import { normStage } from './normalize';

/**
 * Đổi bậc tay: chỉ đi tới hoặc đứng yên; Nuôi dài hạn là nhánh của Đang chăm sóc nên cùng hạng và luôn vào được.
 * Tên bậc cũ ("Booking", "Hỗ trợ hồ sơ") đọc qua normStage trước khi so.
 */
export function canMoveStage(current: unknown, destination: unknown): boolean {
  const from = normStage(typeof current === 'string' ? current : null) || '';
  const to = normStage(typeof destination === 'string' ? destination : null) || '';
  const order: readonly string[] = CARE_STAGE_PICKER_ORDER;
  if (!to || to === CARE_STAGE_DROPPED || to === from || !order.includes(to)) return false;
  if (to === CARE_STAGE_NURTURE) return true;
  const rank = (stage: string) => order.indexOf(CARE_STAGE_BRANCH[stage]?.of || stage);
  return rank(to) >= rank(from);
}
