import type { Customer, Interaction } from './types';

export type InteractionKind = 'sent' | 'meeting' | 'project_view';

/** Khách tự gửi form quảng cáo (Worker Meta Lead Ads ghi, origin 'meta_lead_ads') — không phải sale liên hệ. */
export const LEAD_FORM_KIND = 'lead_form';

/** Mốc "lần cuối sale chạm khách" chỉ tính tương tác do sale làm; khách tự đăng ký lại không làm mất tín hiệu chăm sóc. */
export function isSaleTouch(interaction: Pick<Interaction, 'kind'> | null | undefined): boolean {
  return !!interaction && interaction.kind !== LEAD_FORM_KIND;
}

/** Build an explicit, user-confirmed interaction record. Opening Zalo alone never creates one. */
export function createInteraction(
  kind: InteractionKind,
  by: string,
  at = new Date().toISOString(),
  template = '',
): Interaction {
  const channel = kind === 'sent' ? 'zalo' : kind === 'meeting' ? 'meet' : 'visit';
  return { at, channel, kind, template, by, origin: 'v2' };
}

export function interactionTitle(interaction: Interaction): string {
  if (interaction.kind === 'sent' && interaction.channel === 'zalo') return 'Đã gửi Zalo';
  if (interaction.kind === 'meeting') return 'Đã gặp';
  if (interaction.kind === 'project_view') return 'Đã xem dự án';
  if (interaction.kind === LEAD_FORM_KIND) return 'Đăng ký qua form quảng cáo';
  return interaction.kind || interaction.channel || 'Tương tác';
}

/** Append without mutating or projecting existing interaction objects (D-012). */
export function appendInteractionPatch(
  customer: Pick<Customer, 'interactions'>,
  interaction: Interaction,
): Pick<Customer, 'interactions'> {
  const existing = Array.isArray(customer.interactions) ? customer.interactions : [];
  return { interactions: [interaction, ...existing] };
}
