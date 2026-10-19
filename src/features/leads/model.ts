import { QUALIFIED_STAGE, STAGE_INTEREST } from '@/config/stages';
import type { IntegrationHealthState } from '@/data/hooks';
import type { CustomerRepository, Data } from '@/data/repositories/customers';
import { type Customer, callAttemptsOf, isQualified } from '@/domain/customer';
import { HEALTH_STALE_TEXT, integrationHealthLevel, isIntegrationHealthStale } from '@/features/settings/model';

export const LEAD_DROP_REASONS = {
  gia_cao: 'Chê giá cao',
  pha_campaign: 'Phá campaign',
  khong_du_dieu_kien: 'Không đủ điều kiện',
  khong_lien_lac_duoc: 'Không liên lạc được',
  so_sai: 'Số sai',
  no_xau: 'Nợ xấu',
  do_gia: 'Dò giá',
  to_mo: 'Tò mò',
  khac: 'Khác',
} as const;
export type LeadDropReason = keyof typeof LEAD_DROP_REASONS;
export type LeadFilter = 'open' | 'new' | 'retry' | 'dropped' | 'all';

export function isLead(c: Customer) {
  return !isQualified(c);
}

export type MetaLeadAdsAlert = { text: string; tone: 'warning' | 'danger' };

/**
 * Dòng cảnh báo đầu màn Khách mới. Chỉ có khi đọc được dòng (ready) và kết nối đang
 * warning/error — hoặc dữ liệu cũ (Worker ngừng chạy cũng là mất lead).
 * none/offline/loading/error đều im lặng: không biết ≠ không có vấn đề.
 */
export function metaLeadAdsAlert(state: IntegrationHealthState, now: number): MetaLeadAdsAlert | null {
  if (state.state !== 'ready') return null;
  const row = state.row;
  const stale = isIntegrationHealthStale(row.checked_at, now);
  if (row.status === 'ok' && !stale) return null;
  const message = typeof row.message === 'string' ? row.message.trim() : '';
  const parts =
    row.status === 'ok' && stale ? [HEALTH_STALE_TEXT] : [message || integrationHealthLevel(row.status).label];
  if (stale && !parts.includes(HEALTH_STALE_TEXT)) parts.push(HEALTH_STALE_TEXT);
  return {
    text: `Kết nối Facebook: ${parts.join(' · ')}`,
    tone: row.status === 'error' ? 'danger' : 'warning',
  };
}

export function hasTalked(c: Customer) {
  return callAttemptsOf(c).some((a) => a.result === 'talked');
}

export function filterLeads(customers: Customer[], filter: LeadFilter) {
  const leads = customers.filter(isLead);
  if (filter === 'all') return leads;
  if (filter === 'dropped') return leads.filter((c) => !!c.disqualified_at);
  if (filter === 'open') return leads.filter((c) => !c.disqualified_at);
  if (filter === 'new') return leads.filter((c) => !c.disqualified_at && callAttemptsOf(c).length === 0);
  return leads.filter((c) => !c.disqualified_at && callAttemptsOf(c).length > 0);
}

export async function qualifyLead(repo: CustomerRepository, id: string, now = new Date()) {
  const c = await repo.get(id);
  if (!c || c.archived_at || c.owner_id !== repo.sync.local.userId)
    throw new Error('Khách không còn thuộc quyền chỉnh sửa.');
  if (!isLead(c)) throw new Error('Khách đã thuộc lớp Tiềm năng.');
  if (c.disqualified_at) throw new Error('Mở lại khách trước khi chuyển Đạt.');
  if (!hasTalked(c)) throw new Error('Cần có ít nhất một cuộc gọi “Nói chuyện được” trước khi Đạt.');
  const patch: Data = {
    qualified_at: now.toISOString(),
    care_stage: QUALIFIED_STAGE,
    interest_level: Math.max(Number(c.interest_level) || 0, STAGE_INTEREST[QUALIFIED_STAGE] ?? 60),
    disqualified_at: null,
    disqualify_reason: null,
    disqualify_note: null,
  };
  return repo.update(id, patch, { careStageNote: `Đạt — xác nhận quan tâm sau ${callAttemptsOf(c).length} lần gọi` });
}

export async function disqualifyLead(
  repo: CustomerRepository,
  id: string,
  reason: LeadDropReason,
  note: string,
  now = new Date(),
) {
  const c = await repo.get(id);
  if (!c || c.archived_at || c.owner_id !== repo.sync.local.userId)
    throw new Error('Khách không còn thuộc quyền chỉnh sửa.');
  if (!isLead(c) || c.disqualified_at) throw new Error('Khách không còn ở trạng thái có thể loại.');
  const cleanNote = note.trim();
  if (reason === 'khac' && !cleanNote) throw new Error('Lý do “Khác” cần mô tả thêm.');
  return repo.update(id, {
    disqualified_at: now.toISOString(),
    disqualify_reason: reason,
    disqualify_note: cleanNote || null,
    next_call_at: null,
    next_call_end: null,
    next_call_reason: null,
  });
}

export async function reopenLead(repo: CustomerRepository, id: string, now = new Date()) {
  const c = await repo.get(id);
  if (!c || c.archived_at || c.owner_id !== repo.sync.local.userId)
    throw new Error('Khách không còn thuộc quyền chỉnh sửa.');
  if (!isLead(c) || !c.disqualified_at) throw new Error('Khách không ở trạng thái đã loại.');
  return repo.update(id, {
    disqualified_at: null,
    disqualify_reason: null,
    disqualify_note: null,
    sla_anchor_at: now.toISOString(),
  });
}
