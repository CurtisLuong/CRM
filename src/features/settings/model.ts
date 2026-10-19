import { ZALO_TEMPLATES_DEFAULT, type ZaloTemplate } from '@/config/followup';
import { HEALTH_STALE_TEXT, type IntegrationLevel } from '@/config/integrations';
import type { IntegrationHealth } from '@/data/hooks';
import { integrationHealthLevel, isIntegrationHealthStale } from '@/domain/integrations';
import { displayDate, displayDateTime } from '@/ui/display';

export const AI_MODELS = [
  { key: 'qwen', label: 'Qwen3', name: 'Qwen3 30B' },
  { key: 'glm', label: 'GLM', name: 'GLM 4.7 Flash' },
] as const;

export const AI_DEFAULT_STYLE = [
  'Giọng: chuyên nghiệp, lịch sự, thân thiện — như một sale có kinh nghiệm nói chuyện với khách quen.',
  '- Đi thẳng vào việc. Câu ngắn, mỗi câu phải có thông tin hoặc mục đích rõ.',
  '- Không rào đón, không khen xã giao, không câu sáo.',
  '- Không lặp lại điều khách đã biết; không giải thích dài.',
  '- Xưng “em”, gọi khách “anh/chị” + tên.',
  '- Tin Zalo: 2–3 câu, tối đa 1 emoji; kết bằng 1 câu hỏi cụ thể, dễ trả lời.',
  '- Tóm tắt: ghi chú nhanh cho sale, không cần câu hoàn chỉnh trang trọng.',
].join('\n');

export type SettingsTemplate = ZaloTemplate & Record<string, unknown>;
export function defaultTemplates(): SettingsTemplate[] {
  return ZALO_TEMPLATES_DEFAULT.map((template) => ({ ...template }));
}

export function validTemplates(value: unknown): SettingsTemplate[] {
  if (!Array.isArray(value)) return defaultTemplates();
  return value
    .filter(
      (item): item is SettingsTemplate =>
        !!item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.text === 'string',
    )
    .map((item) => ({ ...item }));
}

export function aiEnabled(workerUrl: string | undefined, online: boolean): boolean {
  return !!workerUrl?.trim() && online;
}

export function localSettingsKey(kind: 'zalo' | 'ai', userId: string) {
  return `crm_${kind === 'zalo' ? 'zalo_templates' : 'ai_settings'}:${userId}`;
}

export function normalizeAiSettings(value: unknown) {
  const settings =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    ...settings,
    model: AI_MODELS.some((option) => option.key === settings.model) ? settings.model : AI_MODELS[0].key,
    style: typeof settings.style === 'string' ? settings.style : null,
  };
}

// Mã dòng, mốc "dữ liệu cũ", nhãn mức: nguồn duy nhất ở config/domain (màn Khách mới dùng chung).
export {
  HEALTH_STALE_MS,
  HEALTH_STALE_TEXT,
  type HealthTone,
  type IntegrationLevel,
  META_LEAD_ADS_ANCHOR,
  META_LEAD_ADS_ID,
} from '@/config/integrations';
export { integrationHealthLevel, isIntegrationHealthStale } from '@/domain/integrations';

const countLeads = (value: unknown) => Math.max(0, Math.trunc(Number(value)) || 0);

export type IntegrationHealthSummary = {
  level: IntegrationLevel;
  message: string;
  lastLeadText: string;
  pendingText: string;
  stuckText: string | null;
  tokenText: string;
  checkedText: string;
  stale: boolean;
  staleText: string | null;
};

/** Toàn bộ chữ của thẻ Cài đặt; màn chỉ việc hiển thị, không tự ghép chuỗi. */
export function integrationHealthSummary(row: IntegrationHealth, now: number): IntegrationHealthSummary {
  const stale = isIntegrationHealthStale(row.checked_at, now);
  const lastLead = displayDateTime(row.last_lead_at);
  const tokenExpiry = displayDate(row.token_expires_at);
  const pending = countLeads(row.pending_count);
  const stuck = countLeads(row.stuck_count);
  return {
    level: integrationHealthLevel(row.status),
    message: typeof row.message === 'string' ? row.message : '',
    lastLeadText: `Lead gần nhất: ${lastLead || 'Chưa có'}`,
    pendingText: `Đang chờ tự thử lại: ${pending} lead`,
    stuckText: stuck > 0 ? `Cần xử lý tay: ${stuck} lead` : null,
    tokenText: `Token Facebook: ${tokenExpiry ? `hết hạn ${tokenExpiry}` : 'không hết hạn'}`,
    checkedText: `Kiểm tra lúc: ${displayDateTime(row.checked_at) || 'Chưa rõ'}`,
    stale,
    staleText: stale ? HEALTH_STALE_TEXT : null,
  };
}
