import { CALL_RESULTS } from '@/config/callResults';
import { interactionTitle } from './interactions';
import type { Customer } from './types';

const callTitle = (result: unknown) => {
  if (result == null || result === '') return 'Cuộc gọi chưa ghi kết quả';
  return (CALL_RESULTS as Record<string, string>)[String(result)] ?? 'Kết quả khác';
};

export type CustomerTimelineEntry = {
  id: string;
  at: string;
  kind: 'call' | 'note' | 'interaction' | 'stage' | 'task' | 'approved';
  title: string;
  detail?: string;
  automatic?: boolean;
  /** Loại tương tác đã lưu (sent | meeting | project_view | lead_form …) — chỉ mục tương tác mang trường này, dùng để chọn icon (PF-02). */
  interactionKind?: string;
};

/** Merge the existing aggregate histories without mutating or normalizing the stored customer. */
export function customerTimeline(customer: Customer): CustomerTimelineEntry[] {
  const entries: CustomerTimelineEntry[] = [];
  for (const [index, call] of (customer.call_attempts ?? []).entries()) {
    if (!call?.at) continue;
    entries.push({
      id: `call:${call.at}:${index}`,
      at: call.at,
      kind: 'call',
      title: callTitle(call.result),
      detail: call.note || undefined,
    });
  }
  for (const [index, note] of (customer.notes_manual ?? []).entries()) {
    if (!note?.at || !note.text) continue;
    entries.push({ id: `note:${note.at}:${index}`, at: note.at, kind: 'note', title: 'Ghi chú', detail: note.text });
  }
  for (const [index, item] of (customer.interactions ?? []).entries()) {
    if (!item?.at) continue;
    entries.push({
      id: `interaction:${item.at}:${index}`,
      at: item.at,
      kind: 'interaction',
      title: interactionTitle(item),
      detail: item.note || (item.template ? `Mẫu: ${item.template}` : undefined),
      ...(item.kind ? { interactionKind: item.kind } : {}),
    });
  }
  for (const [index, stage] of (customer.care_stage_history ?? []).entries()) {
    if (!stage?.at) continue;
    entries.push({
      id: `stage:${stage.at}:${index}`,
      at: stage.at,
      kind: 'stage',
      title: `Bậc: ${stage.stage || 'Chưa rõ'}`,
      detail: stage.note || undefined,
      automatic: !!stage.auto,
    });
  }
  for (const [index, task] of (customer.next_tasks ?? []).entries()) {
    if (!task?.done_at) continue;
    entries.push({
      id: `task:${task.done_at}:${index}`,
      at: task.done_at,
      kind: 'task',
      title: `Xong việc: ${task.text || 'Việc không tên'}`,
      detail: task.due ? `Hạn ${new Date(task.due).toLocaleString('vi-VN')}` : undefined,
    });
  }
  const meta = customer.field_meta && typeof customer.field_meta === 'object' ? customer.field_meta : {};
  for (const [key, value] of Object.entries(meta)) {
    if (value?.by !== 'ai' || !value.confirmed || !value.at) continue;
    entries.push({
      id: `approved:${value.at}:${key}`,
      at: value.at,
      kind: 'approved',
      title: 'Đã duyệt gợi ý AI',
      detail: key,
    });
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}
