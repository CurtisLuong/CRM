import type { Customer } from './types';

const PHONE = /(?<!\d)(?:\+?84|0084|0)[\s().-]*(?:[35789](?:[\s().-]*\d){8}|2(?:[\s().-]*\d){9})(?!\d)/g;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CCCD_LIKE = /(?<!\d)\d{12}(?!\d)/g;
export const redactAiText = (value: unknown, limit = 1500) =>
  typeof value === 'string'
    ? value
        .replace(EMAIL, '[đã ẩn email]')
        .replace(CCCD_LIKE, '[đã ẩn mã định danh]')
        .replace(PHONE, '[đã ẩn số điện thoại]')
        .trim()
        .slice(0, limit)
    : '';
const cleanText = (value: unknown, limit = 500) => redactAiText(value, limit);

/** Build the narrow, allowlisted client payload for the existing Worker POST /ai contract. */
export function buildAiContext(customer: Customer) {
  const fields = [
    'apt_type',
    'projects',
    'purpose',
    'marital_status',
    'occupation',
    'finance',
    'apt_price',
    'income',
    'residence',
  ] as const;
  const nhu_cau: Record<string, unknown> = {};
  const fieldMeta: Record<string, { at: string | null; by: string | null; confirmed: boolean | null }> = {};
  for (const key of fields) {
    const value = customer[key];
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
    nhu_cau[key] = Array.isArray(value)
      ? value.map((item) => cleanText(item, 120))
      : typeof value === 'number' && Number.isFinite(value)
        ? value
        : cleanText(value, 300);
    const meta = customer.field_meta?.[key];
    if (meta)
      fieldMeta[key] = {
        at: meta.at || null,
        by: cleanText(meta.by, 120) || null,
        confirmed: meta.confirmed ?? null,
      };
  }

  const notes = [
    ...(Array.isArray(customer.notes_manual)
      ? (customer.notes_manual as Array<{ at?: string | null; text?: string | null } | null>)
      : []),
    ...(customer.notes ? [{ at: customer.registered_at || customer.created_at || '', text: customer.notes }] : []),
  ]
    .filter((note): note is { at?: string | null; text?: string | null } => !!note && typeof note.text === 'string')
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    .slice(0, 12)
    .map((note) => ({ at: cleanText(note.at, 80) || null, text: cleanText(note.text, 600) }));

  const calls = (
    Array.isArray(customer.call_attempts)
      ? (customer.call_attempts as Array<{
          at?: string | null;
          result?: string | null;
          note?: string | null;
          duration?: number | null;
        } | null>)
      : []
  )
    .filter(
      (call): call is { at: string; result?: string | null; note?: string | null; duration?: number | null } =>
        !!call?.at,
    )
    .slice()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 8)
    .map((call) => ({
      at: cleanText(call.at, 80),
      result: cleanText(call.result, 80),
      note: cleanText(call.note, 400),
      duration: call.duration ?? null,
    }));

  const openTasks = (
    Array.isArray(customer.next_tasks)
      ? (customer.next_tasks as Array<{
          at?: string | null;
          text?: string | null;
          kind?: string | null;
          side?: string | null;
          due?: string | null;
          due_allday?: boolean | null;
          done_at?: string | null;
        } | null>)
      : []
  )
    .filter(
      (
        task,
      ): task is {
        at?: string | null;
        text?: string | null;
        kind?: string | null;
        side?: string | null;
        due?: string | null;
        due_allday?: boolean | null;
        done_at?: string | null;
      } => !!task && !task.done_at,
    )
    .slice(-12)
    .map((task) => ({
      text: cleanText(task.text, 200),
      kind: cleanText(task.kind, 40),
      side: task.side || null,
      due: cleanText(task.due, 80) || null,
      due_allday: task.due_allday ?? null,
    }));

  const interests = (
    Array.isArray(customer.interests)
      ? (customer.interests as Array<{
          project?: string | null;
          apt_type?: string | null;
          budget_max?: number | string | null;
          purpose?: string | null;
          timeline?: string | null;
          status?: string | null;
          reason?: string | null;
          at?: string | null;
        } | null>)
      : []
  )
    .filter((item): item is NonNullable<typeof item> => !!item)
    .slice(0, 12)
    .map((item) => ({
      project: cleanText(item.project, 120),
      apt_type: cleanText(item.apt_type, 100),
      budget_max: typeof item.budget_max === 'number' ? item.budget_max : cleanText(item.budget_max, 120) || null,
      purpose: cleanText(item.purpose, 120),
      timeline: cleanText(item.timeline, 120),
      status: cleanText(item.status, 40),
      reason: cleanText(item.reason, 200),
      at: item.at || null,
    }));

  const memoryKeys = [
    'life_stage',
    'pain_points',
    'housing_status',
    'mobility',
    'decision_influencers',
    'timeline_events',
    'pref_area',
    'pref_product',
    'must_have',
    'deal_breakers',
    'asset_value',
    'capital',
    'loan_need',
    'monthly_payment',
    'financial_barriers',
  ] as const;
  const memory_facts: Array<{ fact: string | number; source: string | null; at: string | null }> = [];
  for (const key of memoryKeys) {
    const value = customer.advanced?.[key];
    if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim()) continue;
    const meta = customer.field_meta?.[key];
    memory_facts.push({
      fact: typeof value === 'number' ? value : cleanText(value, 400),
      source: cleanText(meta?.by, 120) || null,
      at: meta?.at || null,
    });
  }

  return {
    full_name: cleanText(customer.full_name, 120),
    gender: cleanText(customer.gender, 20),
    care_stage: cleanText(customer.care_stage, 80),
    contact_status: cleanText(customer.contact_status, 60),
    interest_level: customer.interest_level ?? null,
    nhu_cau,
    field_meta: fieldMeta,
    memory_facts,
    ghi_chu: notes,
    cuoc_goi: calls,
    hen_goi: customer.next_call_at
      ? {
          at: customer.next_call_at,
          end: customer.next_call_end || null,
          reason: cleanText(customer.next_call_reason, 200),
        }
      : null,
    viec_dang_mo: openTasks,
    dot_quan_tam: interests,
  };
}
