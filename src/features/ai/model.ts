import { FOLLOWUP_CONFIG } from '@/config/followup';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { redactAiText } from '@/domain/customer/aiContext';
import { AI_DEFAULT_STYLE, AI_MODELS, localSettingsKey, normalizeAiSettings } from '@/features/settings/model';

export type AiTask = 'brief' | 'zalo' | 'parse_note';
export type AiResponse<T> = { data: T; model?: string };
export type AiBriefResult = { tom_tat: string; can_hoi: string[]; luu_y: string };
export type AiZalo = { tin_nhan: string };
export type AiParseNote = {
  cap_nhat?: Record<string, unknown>;
  thay_doi?: string[];
  viec?: Array<{ text: string; kind?: string; date?: string | null; time?: string | null }>;
  hen_goi?: { date: string; slot?: string | null; time?: string | null; reason?: string } | null;
  chua_chac?: string[];
};

const AI_FIELDS = [
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
export function buildAiApprovalPatch(
  customer: Customer,
  result: AiParseNote,
  selected: string[],
  now = new Date().toISOString(),
) {
  const chosen = new Set(selected);
  const patch: Record<string, unknown> = {};
  const metadata = { ...(customer.field_meta || {}) };
  for (const key of AI_FIELDS) {
    if (!chosen.has(`field:${key}`)) continue;
    const value = result.cap_nhat?.[key];
    if (value == null || value === '') continue;
    if (key === 'projects') {
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) continue;
      patch.projects = value.slice(0, 5);
    } else if (key === 'finance' || key === 'apt_price') {
      const amount = Number(typeof value === 'string' ? value.replace(/[^\d.]/g, '') : value);
      if (!Number.isFinite(amount) || amount < 1_000_000) continue;
      patch[key] = Math.round(amount);
    } else if (typeof value === 'string') patch[key] = value.slice(0, 300);
    else continue;
    metadata[key] = { ...(metadata[key] || {}), at: now, by: 'ai', confirmed: true };
  }
  if (Object.keys(metadata).length && AI_FIELDS.some((key) => chosen.has(`field:${key}`) && key in patch))
    patch.field_meta = metadata;

  const tasks = Array.isArray(customer.next_tasks) ? customer.next_tasks.slice() : [];
  for (let index = 0; index < (result.viec || []).length; index++) {
    if (!chosen.has(`task:${index}`)) continue;
    const item = result.viec?.[index];
    if (!item) continue;
    const text = item.text?.trim().slice(0, 200);
    if (!text) continue;
    const date = item.date || null;
    const time = item.time && /^\d{1,2}:\d{2}$/.test(item.time) ? item.time.padStart(5, '0') : null;
    const key = `${text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()}|${date || ''}`;
    const duplicate = tasks.some(
      (task) =>
        task &&
        !task.done_at &&
        (task.key === key ||
          ((task.text || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim() === key.split('|')[0] &&
            (String(task.due || '').slice(0, 10) || '') === (date || ''))),
    );
    if (duplicate) continue;
    const task: Record<string, unknown> = { text, at: now, kind: item.kind || 'other', source: 'ai', key };
    if (date) {
      task.due = new Date(`${date}T${time || '09:00'}:00`).toISOString();
      if (!time) task.due_allday = true;
    }
    tasks.push(task);
  }
  if (tasks.length !== (customer.next_tasks || []).length) patch.next_tasks = tasks;

  const call = result.hen_goi;
  if (chosen.has('call') && call?.date) {
    const slotRange =
      call.slot && call.slot in FOLLOWUP_CONFIG.callSlots
        ? FOLLOWUP_CONFIG.callSlots[call.slot as keyof typeof FOLLOWUP_CONFIG.callSlots].range
        : null;
    const [slotStart, slotEnd] = slotRange?.split('-') || [];
    const startTime =
      call.time && /^\d{1,2}:\d{2}$/.test(call.time) ? call.time.padStart(5, '0') : slotStart || '09:00';
    const start = new Date(`${call.date}T${startTime}:00`);
    if (!Number.isNaN(start.getTime()) && start.getTime() > Date.now()) {
      const end =
        call.time || !slotEnd ? new Date(start.getTime() + 60 * 60 * 1000) : new Date(`${call.date}T${slotEnd}:00`);
      patch.next_call_at = start.toISOString();
      patch.next_call_end = end.toISOString();
      patch.next_call_reason = call.reason || 'Đề xuất từ ghi chú';
    }
  }
  return patch;
}

export function aiAvailable(workerUrl: string | undefined, online: boolean) {
  return !!workerUrl?.trim() && online;
}

export async function getAiSettings(account: RepositoryAccount, userId: string) {
  let local: unknown = null;
  try {
    const raw = localStorage.getItem(localSettingsKey('ai', userId));
    if (raw) local = JSON.parse(raw);
    const owner = localStorage.getItem('crm_ai_settings_user');
    if (!local && owner === userId) {
      const legacy = localStorage.getItem('crm_ai_settings');
      if (legacy) local = JSON.parse(legacy);
    }
  } catch {
    local = null;
  }
  try {
    const remote = await account.remote.getAiSettingsRemote();
    if (remote && typeof remote === 'object') {
      localStorage.setItem(localSettingsKey('ai', userId), JSON.stringify(remote));
      localStorage.setItem('crm_ai_settings', JSON.stringify(remote));
      localStorage.setItem('crm_ai_settings_user', userId);
      return normalizeAiSettings(remote);
    }
  } catch {
    // On-device settings remain available if the settings read fails.
  }
  return normalizeAiSettings(local);
}

export async function requestAi<T>(
  account: RepositoryAccount,
  task: AiTask,
  customer: unknown,
  extra: Record<string, unknown>,
  settings: ReturnType<typeof normalizeAiSettings>,
): Promise<AiResponse<T>> {
  const workerUrl = (import.meta.env.VITE_WORKER_URL || '').replace(/\/+$/, '');
  if (!aiAvailable(workerUrl, account.sync.isOnline() && navigator.onLine)) {
    throw new Error(workerUrl ? 'AI chỉ dùng khi có mạng.' : 'Chưa cấu hình VITE_WORKER_URL.');
  }
  const session = await account.sync.client.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error('Cần đăng nhập lại để dùng AI.');
  const response = await fetch(`${workerUrl}/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      task,
      customer,
      extra: {
        ...extra,
        ...(typeof extra.goal === 'string' ? { goal: redactAiText(extra.goal, 300) } : {}),
        ...(typeof extra.note === 'string' ? { note: redactAiText(extra.note, 1500) } : {}),
        model: AI_MODELS.some((option) => option.key === settings.model) ? settings.model : AI_MODELS[0].key,
        ...(task === 'brief' || task === 'zalo'
          ? { style: redactAiText(settings.style || AI_DEFAULT_STYLE, 2000) }
          : {}),
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error)
    throw new Error(typeof body.error === 'string' ? body.error : `Worker trả lỗi ${response.status}.`);
  if (!body.data || typeof body.data !== 'object') throw new Error('Worker trả dữ liệu không hợp lệ.');
  return body as AiResponse<T>;
}
