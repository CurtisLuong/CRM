import { CARE_STAGE_DROPPED, CARE_STAGE_NURTURE, CARE_STAGE_WON } from '@/config/stages';
import { active, C, DAY, futureCall, idleDays, lastInteractionAt, lastTouchMs, make } from '../shared';
import type { SignalRule } from '../types';
export default {
  id: 'S08',
  evaluate(c, { now }) {
    const interest = Number(c.interest_level) || 0;
    if (
      !c.qualified_at ||
      interest < C.hotInterestMin ||
      [CARE_STAGE_NURTURE, CARE_STAGE_WON, CARE_STAGE_DROPPED].some((s) => s === c.care_stage)
    )
      return [];
    // Cuộc gọi không còn ghi mốc bậc cùng bậc (Curtis 09/11) → tính cả cuộc gọi như lastTouchMs.
    const last = lastTouchMs(c),
      idle = idleDays(c, now);
    const dashboard = active(c) && !futureCall(c, now) && idle >= C.idleHotDays;
    const notification = last != null && Number.isFinite(last) && Math.floor((now - last) / DAY) >= C.idleHotDays;
    if (!dashboard && !notification) return [];
    const s = make(
      'S08',
      c,
      dashboard ? 'hot' : undefined,
      `Khách nóng · ${dashboard ? idle : Math.floor((now - (last ?? now)) / DAY)} ngày chưa liên hệ`,
      'P1',
      ['call', 'zalo'],
      { interest_level: interest, lastTouch: last, lastInteraction: lastInteractionAt(c) },
      undefined,
      [-interest, -idle],
    );
    if (notification) s.notification = { ruleKey: 'hot_idle', level: 'warn', sortAt: last ?? now };
    return [s];
  },
} satisfies SignalRule;
