import { describe, expect, it } from 'vitest';
import { appendInteractionPatch, createInteraction, interactionTitle } from '@/domain/customer/interactions';

describe('customer interactions', () => {
  it('records only explicit action types with stable channel metadata', () => {
    expect(createInteraction('sent', 'sale-1', '2026-10-17T03:00:00.000Z', 'template-1')).toEqual({
      at: '2026-10-17T03:00:00.000Z',
      channel: 'zalo',
      kind: 'sent',
      template: 'template-1',
      by: 'sale-1',
      origin: 'v2',
    });
    expect(createInteraction('meeting', 'sale-1').channel).toBe('meet');
    expect(createInteraction('project_view', 'sale-1').channel).toBe('visit');
    expect(interactionTitle(createInteraction('sent', 'sale-1'))).toBe('Đã gửi Zalo');
    expect(interactionTitle(createInteraction('meeting', 'sale-1'))).toBe('Đã gặp');
    expect(interactionTitle(createInteraction('project_view', 'sale-1'))).toBe('Đã xem dự án');
  });

  it('prepends the new item and preserves legacy and unknown properties', () => {
    const legacy = { at: '2026-10-16T03:00:00.000Z', channel: 'sms', kind: 'sent', old_extra: { keep: true } };
    const next = createInteraction('sent', 'sale-1', '2026-10-17T03:00:00.000Z');
    expect(appendInteractionPatch({ interactions: [legacy] }, next)).toEqual({ interactions: [next, legacy] });
    expect(appendInteractionPatch({ interactions: null }, next)).toEqual({ interactions: [next] });
  });
});
