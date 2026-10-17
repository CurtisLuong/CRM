import { active, C, make } from '../shared';
import type { SignalRule } from '../types';

const hasValue = (value: unknown) => value != null && String(value).trim() !== '';

export default {
  id: 'S11',
  evaluate(c) {
    const nextCall = Date.parse(c.next_call_at || '');
    if (!active(c) || !Number.isFinite(nextCall) || c.contact_prefs?.do_not_contact) return [];
    const interests = Array.isArray(c.interests) ? c.interests.filter((item) => item?.status === 'open') : [];
    const advanced = c.advanced && typeof c.advanced === 'object' ? c.advanced : {};
    const values: Record<string, unknown> = {
      finance: c.finance ?? advanced.capital ?? advanced.loan_need,
      purpose:
        c.purpose ??
        [...interests]
          .reverse()
          .map((item) => item?.purpose)
          .find(hasValue),
      decision_maker:
        advanced.decision_influencers ??
        (Array.isArray(c.household)
          ? c.household.find((member) => hasValue(member?.role) || hasValue(member?.name))
          : null),
      purchase_timeline:
        [...interests]
          .reverse()
          .map((item) => item?.timeline)
          .find(hasValue) ?? advanced.timeline_events,
    };
    const missing = Object.keys(values).filter((key) => !hasValue(values[key]));
    if (missing.length < C.briefMissingFieldsMin) return [];
    return [
      make(
        'S11',
        c,
        undefined,
        `Brief còn thiếu ${missing.length} thông tin quan trọng`,
        'P2',
        ['call'],
        {
          missing,
          finance: values.finance,
          purpose: values.purpose,
          decision_maker: values.decision_maker,
          purchase_timeline: values.purchase_timeline,
        },
        nextCall,
        [missing.length, nextCall],
      ),
    ];
  },
} satisfies SignalRule;
