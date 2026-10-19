import type { Customer } from '@/domain/customer';
import { isSaleTouch } from '@/domain/customer/interactions';
import { normalize } from '@/domain/search';
import { typeCompatible } from './property';

export type RetargetFilters = {
  aptType: string;
  project: string;
  purpose: string;
  region: string;
  occupation: string;
  timeline: string;
  closeReason: string;
  maxBudget: string;
  contactedBefore: string;
};

export const DEFAULT_RETARGET_FILTERS: RetargetFilters = {
  aptType: '',
  project: '',
  purpose: '',
  region: '',
  occupation: '',
  timeline: '',
  closeReason: '',
  maxBudget: '',
  contactedBefore: '',
};

export function isRetargetEligible(customer: Customer, ownerId: string, now = Date.now()): boolean {
  const after = customer.retarget_hint?.after ? Date.parse(customer.retarget_hint.after) : Number.NaN;
  return (
    !customer.archived_at &&
    customer.owner_id === ownerId &&
    customer.contact_prefs?.do_not_contact !== true &&
    (!Number.isFinite(after) || after <= now)
  );
}

function lastContactAt(customer: Customer): number | null {
  const timestamps = [
    ...(Array.isArray(customer.interactions) ? customer.interactions.filter(isSaleTouch).map((item) => item?.at) : []),
    ...(Array.isArray(customer.call_attempts) ? customer.call_attempts.map((item) => item?.at) : []),
  ]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : null;
}

function maxBudget(customer: Customer): number | null {
  const hinted = Number(customer.retarget_hint?.max_price);
  if (Number.isFinite(hinted) && hinted > 0) return hinted;
  const interests = Array.isArray(customer.interests) ? customer.interests : [];
  const active = interests.filter((item) => item?.status === 'open' || item?.status === 'paused');
  const values = active.map((item) => Number(item?.budget_max)).filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : null;
}

export function filterRetargetCustomers(
  customers: readonly Customer[],
  filters: RetargetFilters,
  ownerId: string,
  now = Date.now(),
): Customer[] {
  // Eligibility is a hard gate here so every caller (render/export/campaign) inherits DNC protection.
  return customers.filter((customer) => {
    if (!isRetargetEligible(customer, ownerId, now)) return false;
    if (filters.aptType && !typeCompatible(filters.aptType, customer.apt_type)) return false;
    if (
      filters.aptType &&
      (customer.retarget_hint?.apt_types || []).length &&
      !(customer.retarget_hint?.apt_types || []).some((type) => typeCompatible(filters.aptType, type))
    )
      return false;
    const projects = [
      ...(Array.isArray(customer.projects) ? customer.projects : []),
      ...(Array.isArray(customer.interests) ? customer.interests.map((item) => item?.project || '') : []),
      ...(customer.retarget_hint?.projects || []),
    ];
    if (filters.project && !projects.some((project) => normalize(project) === normalize(filters.project))) return false;
    if (filters.purpose && normalize(customer.purpose || '') !== normalize(filters.purpose)) return false;
    if (filters.region && !normalize(customer.residence || '').includes(normalize(filters.region))) return false;
    if (filters.occupation && !normalize(customer.occupation || '').includes(normalize(filters.occupation)))
      return false;
    if (
      filters.timeline &&
      !(customer.interests || []).some((item) => normalize(item?.timeline || '').includes(normalize(filters.timeline)))
    )
      return false;
    if (filters.closeReason && customer.close_reason !== filters.closeReason) return false;
    const budgetLimit = Number(filters.maxBudget);
    const budget = maxBudget(customer);
    if (filters.maxBudget && (!Number.isFinite(budgetLimit) || budget == null || budget > budgetLimit)) return false;
    if (filters.contactedBefore) {
      const cutoff = Date.parse(filters.contactedBefore);
      const last = lastContactAt(customer);
      if (!Number.isFinite(cutoff) || last == null || last >= cutoff || cutoff > now + 86_400_000) return false;
    }
    return true;
  });
}

export function customerSegmentReasons(customer: Customer, filters: RetargetFilters): string[] {
  const reasons: string[] = [];
  if (filters.aptType && typeCompatible(filters.aptType, customer.apt_type)) reasons.push('Đúng loại căn');
  const projects = [
    ...(Array.isArray(customer.projects) ? customer.projects : []),
    ...(Array.isArray(customer.interests) ? customer.interests.map((item) => item?.project || '') : []),
    ...(customer.retarget_hint?.projects || []),
  ];
  if (filters.project && projects.some((project) => normalize(project) === normalize(filters.project)))
    reasons.push('Đã quan tâm dự án');
  if (filters.purpose && normalize(customer.purpose || '') === normalize(filters.purpose))
    reasons.push('Đúng mục đích');
  if (
    filters.timeline &&
    (customer.interests || []).some((item) => normalize(item?.timeline || '').includes(normalize(filters.timeline)))
  )
    reasons.push('Đúng thời điểm dự kiến');
  if (filters.closeReason && customer.close_reason === filters.closeReason) reasons.push('Phù hợp lý do kết thúc');
  if (!reasons.length) reasons.push('Thuộc tệp theo điều kiện đã chọn');
  return reasons;
}
