import { redactAiText as redactContextText } from '@/domain/customer/aiContext';

export function redactAiText(value: unknown, limit = Number.POSITIVE_INFINITY) {
  return redactContextText(value, limit);
}
export function sanitizeAiPayload(value: unknown): unknown {
  if (typeof value === 'string') return redactAiText(value);
  if (Array.isArray(value)) return value.map(sanitizeAiPayload);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/phone|email|dob|identity|cccd|address|document|owner_id|customer_?ids|full_name/i.test(key) &&
            redactAiText(key) === key,
        )
        .map(([key, item]) => [key, sanitizeAiPayload(item)]),
    );
  return value;
}
