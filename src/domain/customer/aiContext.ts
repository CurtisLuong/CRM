import type { Customer } from './types';

const PHONE = /(?:\+?84|0)(?:[\s().-]*\d){8,10}/g;
const cleanText = (value: unknown, limit = 500) =>
  typeof value === 'string' ? value.replace(PHONE, '[đã ẩn số điện thoại]').trim().slice(0, limit) : '';

/** Build the narrow, allowlisted client payload for the existing Worker POST /ai contract. */
export function buildAiContext(customer: Customer) {
  const fields = [
    'apt_type', 'projects', 'purpose', 'marital_status', 'occupation', 'finance', 'apt_price', 'income', 'residence',
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
    if (meta) fieldMeta[key] = { at: meta.at || null, by: meta.by || null, confirmed: meta.confirmed ?? null };
  }

  const notes = [
    ...(Array.isArray(customer.notes_manual) ? customer.notes_manual : []),
    ...(customer.notes ? [{ at: customer.registered_at || customer.created_at || '', text: customer.notes }] : []),
  ]
    .filter((note) => !!note && typeof note.text === 'string')
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    .slice(0, 12)
    .map((note) => ({ at: note.at || null, text: cleanText(note.text, 600) }));

  const calls = (Array.isArray(customer.call_attempts) ? customer.call_attempts : [])
    .filter((call) => !!call?.at)
    .slice()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 8)
    .map((call) => ({
      at: call.at,
      result: cleanText(call.result, 80),
      note: cleanText(call.note, 400),
      duration: call.duration ?? null,
    }));

  const openTasks = (Array.isArray(customer.next_tasks) ? customer.next_tasks : [])
    .filter((task) => !!task && !task.done_at)
    .slice(-12)
    .map((task) => ({
      text: cleanText(task.text, 200), kind: cleanText(task.kind, 40), side: task.side || null,
      due: task.due || null, due_allday: task.due_allday ?? null,
    }));

  const interests = (Array.isArray(customer.interests) ? customer.interests : []).slice(0, 12).map((item) => ({
    project: cleanText(item.project, 120), apt_type: cleanText(item.apt_type, 100),
    budget_max: item.budget_max ?? null, purpose: cleanText(item.purpose, 120),
    timeline: cleanText(item.timeline, 120), status: cleanText(item.status, 40),
    reason: cleanText(item.reason, 200), at: item.at || null,
  }));

  return {
    full_name: cleanText(customer.full_name, 120),
    gender: cleanText(customer.gender, 20),
    care_stage: cleanText(customer.care_stage, 80),
    contact_status: cleanText(customer.contact_status, 60),
    interest_level: customer.interest_level ?? null,
    nhu_cau,
    field_meta: fieldMeta,
    ghi_chu: notes,
    cuoc_goi: calls,
    hen_goi: customer.next_call_at
      ? { at: customer.next_call_at, end: customer.next_call_end || null, reason: cleanText(customer.next_call_reason, 200) }
      : null,
    viec_dang_mo: openTasks,
    dot_quan_tam: interests,
  };
}
