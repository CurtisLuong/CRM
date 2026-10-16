import type { Customer } from '@/domain/customer';

/** Checklist state belongs to booking_steps; it must never move the stage SLA clock. */
export function bookingStepPatch(customer: Customer, key: string, checked: boolean, at: string) {
  const steps = { ...(customer.booking_steps || {}) };
  if (checked) steps[key] = at;
  else delete steps[key];
  return { booking_steps: steps };
}

/** Contact preference updates are field patches and retain extension keys in the JSON object. */
export function contactPrefsPatch(customer: Customer, key: 'channel' | 'slot', value: string) {
  return { contact_prefs: { ...(customer.contact_prefs || {}), [key]: value } };
}
