import { C, DAY, make } from '../shared';
import type { SignalRule } from '../types';

export default {
  id: 'S13',
  evaluate(c, { now }) {
    const after = Date.parse(c.retarget_hint?.after || '');
    if (!Number.isFinite(after) || after > now + C.retargetReminderDays * DAY || c.contact_prefs?.do_not_contact)
      return [];
    const reason = c.close_reason || c.close_note || c.retarget_hint?.note || 'điều kiện đã lưu';
    return [
      make(
        'S13',
        c,
        undefined,
        `Đến hạn retarget · ${reason}`,
        'P1',
        ['call', 'zalo', 'open_profile'],
        {
          after: c.retarget_hint?.after,
          max_price: c.retarget_hint?.max_price,
          apt_types: c.retarget_hint?.apt_types,
          projects: c.retarget_hint?.projects,
          reason,
        },
        after,
        [Math.floor((now - after) / DAY)],
      ),
    ];
  },
} satisfies SignalRule;
