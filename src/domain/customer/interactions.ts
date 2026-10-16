import type { Customer, Interaction } from './types';

export type InteractionKind = 'sent' | 'meeting' | 'project_view';

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
