import { C, DAY, lastTouchMs, make } from '../shared';
import type { SignalRule } from '../types';

export default {
  id: 'S14',
  evaluate(c, { now }) {
    if (c.contact_prefs?.do_not_contact) return [];
    const views = (Array.isArray(c.interactions) ? c.interactions : [])
      .filter(
        (item): item is NonNullable<typeof item> =>
          !!item && item.kind === 'project_view' && Number.isFinite(Date.parse(item.at || '')),
      )
      .map((item) => ({ item, at: Date.parse(item.at || '') }))
      .filter((view) => view.at <= now)
      .sort((a, b) => b.at - a.at);
    const view = views[0];
    if (!view || now - view.at < C.projectViewFeedbackDays * DAY) return [];
    // A later recorded touch is the available conservative proxy for feedback having been requested.
    const lastTouch = lastTouchMs(c);
    if (lastTouch != null && lastTouch > view.at) return [];
    return [
      make(
        'S14',
        c,
        undefined,
        `Đã xem dự án ${Math.floor((now - view.at) / DAY)} ngày, chưa ghi nhận trao đổi sau đó`,
        'P1',
        ['call', 'zalo'],
        {
          project_view_at: view.item.at,
          project_view: view.item.note || view.item.template || null,
          last_touch_at: lastTouch,
        },
        view.at + C.projectViewFeedbackDays * DAY,
        [view.at],
      ),
    ];
  },
} satisfies SignalRule;
