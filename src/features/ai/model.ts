import { z } from 'zod';
import { FOLLOWUP_CONFIG } from '@/config/followup';
import { TASK_KIND_PICK } from '@/config/taskKinds';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { promiseTaskKey } from '@/domain/deadlines/promises';
import { AI_DEFAULT_STYLE, AI_MODELS, localSettingsKey, normalizeAiSettings } from '@/features/settings/model';
import { redactAiText, sanitizeAiPayload } from './privacy';

export type AiTask = 'brief' | 'zalo' | 'parse_note' | 'retarget_msg' | 'coach' | 'close_reason';
export type AiResponse<T> = { data: T; model?: string };
export type AiBriefResult = {
  tom_tat: string;
  can_hoi: string[];
  luu_y: string;
  loi_hua_mo?: string[];
  nguon?: string;
};
export type AiZalo = { tin_nhan: string; chi_tiet_dung?: string };
export type AiRetarget = { tin_nhan: string; diem_khop_da_dung: string[] };
export type AiCoachResult = { diem_tot: string; can_cai_thien: string; hanh_dong: string[]; luu_y_du_lieu: string };
export type AiCloseReasonResult = { goi_y: Array<{ ma: string; bang_chung: string }>; dieu_kien_retarget: string };
export type AiParseNote = {
  cap_nhat?: Record<string, unknown>;
  thay_doi?: string[];
  nguoi_quyet_dinh?: Array<{ ten: string; vai_tro: string; ghi_chu: string }>;
  phan_doi?: string[];
  viec?: Array<{
    text: string;
    ben?: 'em' | 'khach';
    key?: string;
    kind?: string;
    date?: string | null;
    time?: string | null;
  }>;
  hen_goi?: { date: string; slot?: string | null; time?: string | null; reason?: string } | null;
  chua_chac?: string[];
};
const strings = z.array(z.string());
const narrative = z.string().refine((value) => !!value.trim());
const schemas = {
  brief: z.object({
    tom_tat: narrative,
    can_hoi: strings.max(2),
    loi_hua_mo: strings.optional(),
    luu_y: z.string().optional(),
    nguon: z.string().optional(),
  }),
  zalo: z.object({ tin_nhan: narrative, chi_tiet_dung: z.string().optional() }),
  parse_note: z.object({
    cap_nhat: z.record(z.string(), z.unknown()),
    thay_doi: strings.optional(),
    phan_doi: strings.optional(),
    chua_chac: strings.optional(),
    nguoi_quyet_dinh: z
      .array(
        z.object({
          ten: z.string(),
          vai_tro: z.enum(['vợ', 'chồng', 'bố', 'mẹ', 'đồng sở hữu', 'khác']),
          ghi_chu: z.string(),
        }),
      )
      .optional(),
    viec: z.array(
      z.object({
        text: narrative,
        ben: z.enum(['em', 'khach']).optional(),
        key: z.string().optional(),
        kind: z.string().optional(),
        date: z.string().nullable().optional(),
        time: z.string().nullable().optional(),
      }),
    ),
    hen_goi: z
      .object({
        date: z.string(),
        slot: z.string().nullable().optional(),
        time: z.string().nullable().optional(),
        reason: z.string().optional(),
      })
      .nullable(),
  }),
  retarget_msg: z.object({ tin_nhan: narrative, diem_khop_da_dung: strings }),
  coach: z.object({
    diem_tot: narrative,
    can_cai_thien: narrative,
    hanh_dong: strings.max(2),
    luu_y_du_lieu: z.string(),
  }),
  close_reason: z.object({
    goi_y: z.array(z.object({ ma: narrative, bang_chung: narrative })).max(2),
    dieu_kien_retarget: z.string(),
  }),
};
export function validateAiResult(task: AiTask, data: unknown) {
  const result = schemas[task].safeParse(data);
  if (!result.success) throw new Error('Worker trả dữ liệu không hợp lệ.');
  return result.data;
}
export function vietnamDay(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(value);
}
export function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
}
function validTime(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour !== undefined && minute !== undefined && hour < 24 && minute < 60 ? value.padStart(5, '0') : null;
}
export function exactVnd(value: unknown): number | null {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^[1-9]\d*$/.test(value))) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 1_000_000 ? amount : null;
}
const normalize = (text: string) => text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
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
      const amount = exactVnd(value);
      if (amount === null) continue;
      patch[key] = amount;
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
    if (item.date && !validDay(item.date)) continue;
    if (item.time && !validTime(item.time)) continue;
    const date = item.date || null;
    const time = validTime(item.time);
    const side = item.ben === 'khach' ? 'customer' : 'me';
    const due = date ? new Date(`${date}T${time || '09:00'}:00+07:00`).toISOString() : undefined;
    const key = promiseTaskKey(customer.id, side, text, due);
    const duplicate = tasks.some(
      (task) =>
        task &&
        !task.done_at &&
        (task.side || 'me') === side &&
        (task.key === key ||
          (!!item.key && task.ai_key === item.key) ||
          (normalize(task.text || '') === normalize(text) &&
            (task.due && Number.isFinite(Date.parse(task.due)) ? vietnamDay(new Date(task.due)) : '') ===
              (date || ''))),
    );
    if (duplicate) continue;
    let at = new Date(now).getTime();
    if (!Number.isFinite(at)) continue;
    const used = new Set(tasks.map((task) => task?.at));
    while (used.has(new Date(at).toISOString())) at++;
    const task: Record<string, unknown> = {
      text,
      at: new Date(at).toISOString(),
      kind: TASK_KIND_PICK.includes(item.kind as (typeof TASK_KIND_PICK)[number]) ? item.kind : 'other',
      side,
      source: 'ai',
      key,
      ...(item.key ? { ai_key: item.key } : {}),
    };
    if (due) {
      task.due = due;
      if (!time) task.due_allday = true;
    }
    tasks.push(task);
  }
  if (tasks.length !== (customer.next_tasks || []).length) patch.next_tasks = tasks;

  const household = (customer.household || []).slice();
  for (const [index, person] of (result.nguoi_quyet_dinh || []).entries()) {
    if (!chosen.has(`person:${index}`)) continue;
    if (
      household.some(
        (existing) =>
          existing && normalize(existing.name || '') === normalize(person.ten) && existing.role === person.vai_tro,
      )
    )
      continue;
    household.push({
      id: crypto.randomUUID(),
      name: person.ten,
      role: person.vai_tro,
      note: person.ghi_chu,
      at: now,
      source: 'ai',
    });
  }
  if (household.length !== (customer.household || []).length) {
    patch.household = household;
    patch.field_meta = { ...metadata, household: { ...metadata.household, at: now, by: 'ai', confirmed: true } };
  }
  const callWindow = chosen.has('call') && result.hen_goi ? aiCallWindow(result.hen_goi) : null;
  if (callWindow && callWindow.start.getTime() > Date.parse(now)) {
    patch.next_call_at = callWindow.start.toISOString();
    patch.next_call_end = callWindow.end.toISOString();
    patch.next_call_reason = result.hen_goi?.reason || 'Đề xuất từ ghi chú';
  }
  return patch;
}
// The one place that turns a proposed call into the time window that will be saved, so the
// review box shows exactly what approval writes (date-only → default 09:00, 1 hour).
export function aiCallWindow(call: NonNullable<AiParseNote['hen_goi']>) {
  if (!validDay(call.date) || (call.time && !validTime(call.time))) return null;
  const slot =
    call.slot && Object.hasOwn(FOLLOWUP_CONFIG.callSlots, call.slot)
      ? FOLLOWUP_CONFIG.callSlots[call.slot as keyof typeof FOLLOWUP_CONFIG.callSlots]
      : null;
  if (call.slot && !slot) return null;
  const [slotStart, slotEnd] = slot?.range.split('-') || [];
  const time = validTime(call.time);
  const start = new Date(`${call.date}T${time || slotStart || '09:00'}:00+07:00`);
  const end = time || !slotEnd ? new Date(start.getTime() + 3600000) : new Date(`${call.date}T${slotEnd}:00+07:00`);
  return { start, end, defaultTime: !time && !slot };
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
  if (typeof extra.note === 'string' && (extra.note.length > 1500 || redactAiText(extra.note).length > 1500))
    throw new Error('Ghi chú vượt 1.500 ký tự. Hãy tự rút gọn phần gửi AI; ghi chú gốc vẫn được giữ.');
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
      customer: sanitizeAiPayload(customer),
      extra: sanitizeAiPayload({
        ...Object.fromEntries(
          Object.entries(extra).filter(([key]) =>
            [
              'goal',
              'note',
              'today',
              'now',
              'signal',
              'template',
              'slots',
              'options',
              'known',
              'product',
              'match',
              'history',
              'metrics',
              'findings',
              'reasons',
            ].includes(key),
          ),
        ),
        model: AI_MODELS.some((option) => option.key === settings.model) ? settings.model : AI_MODELS[0].key,
        ...(['brief', 'zalo', 'retarget_msg', 'coach'].includes(task)
          ? { style: redactAiText(settings.style || AI_DEFAULT_STYLE, 2000) }
          : {}),
      }),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error)
    throw new Error(
      body.code === 'note_too_long'
        ? 'Ghi chú vượt 1.500 ký tự. Hãy rút gọn phần gửi AI; ghi chú gốc vẫn được giữ.'
        : `Chưa xử lý được AI (mã ${response.status}). Hãy thử lại.`,
    );
  return { data: validateAiResult(task, body.data) as T, model: body.model };
}
