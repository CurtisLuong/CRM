/**
 * Tự xử lý quá hạn mức SLA (D-008) — port runSlaAutomation + Hoàn tác (legacy/js/app.js).
 *  • Khách mới "Đang tiếp cận" quá hạn mức, chưa nói chuyện được → Loại "Không liên lạc được".
 *  • "Đang chăm sóc" quá hạn mức → "Nuôi dài hạn" + hẹn gọi lại; mốc lịch sử gắn {auto:'sla'} →
 *    hồ sơ hiện Hoàn tác trong autoUndoDays ngày.
 * Chỉ giai đoạn có `auto` trong src/config/velocity.ts; chỉ khách MÌNH phụ trách.
 *
 * Tách 2 bước: planSlaAutomation (thuần, KHÔNG ghi) → applySlaPlan (ghi qua writer truyền vào —
 * repository T2.A4 sẽ cung cấp; ghi patch theo trường, writer tự thêm mốc care_stage_history
 * {stage, note: careStageNote, at, ...historyMeta} khi care_stage đổi, như CRM.update v1).
 */
import { CARE_STAGE_NURTURE, QUALIFIED_STAGE } from '@/config/stages';
import { VELOCITY_CONFIG as C } from '@/config/velocity';
import type { Customer } from '@/domain/customer';
import { normStage } from '@/domain/customer';
import { type AutoAction, autoAction } from './engine';

/** Patch theo trường (chỉ các trường cần đổi). */
export type CustomerPatch = Partial<Customer>;

/** Tuỳ chọn ghi — cùng nghĩa CRM.update v1: ghi chú cho mốc lịch sử + trường gắn thêm vào mốc. */
export type UpdateOpts = { careStageNote?: string | null; historyMeta?: Record<string, unknown> };

/** Lớp ghi (repository) — applySlaPlan chỉ dùng hàm này. */
export interface CustomerWriter {
  update(id: string, patch: CustomerPatch, opts?: UpdateOpts): Promise<unknown>;
}

/** Gợi ý lịch gọi khi đổi bậc (FOLLOWUP.forStage — T2.B1). null = không gợi ý. */
export type StageFollowup = (c: Customer, stage: string) => { start: Date; end: Date; reason: string } | null;

export type SlaChange = {
  id: string;
  type: AutoAction['type'];
  phase: AutoAction['phase'];
  patch: CustomerPatch;
  opts: UpdateOpts | null;
};

export type SlaPlan = { changes: SlaChange[]; counts: { drop: number; nurture: number } };

/** Khách mình phụ trách (như isMine v1: khách cũ chưa có owner_id coi là của mình). */
export function isMineFor(c: Customer, me: string): boolean {
  return !c.owner_id || c.owner_id === me;
}

/**
 * Lập danh sách thay đổi tự chuyển SLA tại `now` cho người dùng `me`. KHÔNG ghi gì.
 * forStage: gợi ý lịch gọi lại khi vào Nuôi dài hạn (bỏ qua nếu khách đã có lịch gọi trong tương lai).
 */
export function planSlaAutomation(
  customers: readonly Customer[],
  now: number,
  me: string,
  forStage: StageFollowup,
): SlaPlan {
  const changes: SlaChange[] = [];
  const counts = { drop: 0, nurture: 0 };
  for (const c of customers) {
    if (!isMineFor(c, me)) continue;
    const a = autoAction(c, now);
    if (!a) continue;
    const cfg = C.phases[a.phase];
    if (a.type === 'drop') {
      changes.push({
        id: c.id,
        ...a,
        patch: {
          disqualified_at: new Date(now).toISOString(),
          disqualify_reason: C.dropReason,
          disqualify_note: `Tự động: quá ${cfg.maxText} ở "${cfg.label}" chưa liên lạc được (SLA)`,
          next_call_at: null,
          next_call_end: null,
          next_call_reason: null,
        },
        opts: null,
      });
      counts.drop++;
    } else {
      const patch: CustomerPatch = { care_stage: CARE_STAGE_NURTURE };
      const sug = forStage(c, CARE_STAGE_NURTURE);
      if (sug && !(c.next_call_at && Date.parse(c.next_call_at) > now)) {
        patch.next_call_at = sug.start.toISOString();
        patch.next_call_end = sug.end.toISOString();
        patch.next_call_reason = sug.reason;
      }
      changes.push({
        id: c.id,
        ...a,
        patch,
        opts: {
          careStageNote: `Tự động: quá ${cfg.maxText} ở "${cfg.label}" (SLA) → Nuôi dài hạn`,
          historyMeta: { auto: 'sla' },
        },
      });
      counts.nurture++;
    }
  }
  return { changes, counts };
}

/** Câu thông báo sau khi tự chuyển; null khi kế hoạch rỗng. */
export function slaPlanMessage(plan: SlaPlan): string | null {
  const { drop, nurture } = plan.counts;
  if (!drop && !nurture) return null;
  const parts: string[] = [];
  if (drop) parts.push(`${drop} khách mới → Loại (quá hạn tiếp cận)`);
  if (nurture) parts.push(`${nurture} khách → Nuôi dài hạn (quá hạn chăm sóc)`);
  return `Tự chuyển theo SLA: ${parts.join(' · ')}`;
}

/** Ghi kế hoạch qua writer, từng khách một; lỗi 1 khách không chặn khách khác. Trả các thay đổi đã ghi / lỗi. */
export async function applySlaPlan(
  plan: SlaPlan,
  writer: CustomerWriter,
): Promise<{ applied: SlaChange[]; failed: { change: SlaChange; error: unknown }[] }> {
  const applied: SlaChange[] = [];
  const failed: { change: SlaChange; error: unknown }[] = [];
  for (const change of plan.changes) {
    try {
      if (change.opts) await writer.update(change.id, change.patch, change.opts);
      else await writer.update(change.id, change.patch);
      applied.push(change);
    } catch (error) {
      failed.push({ change, error });
    }
  }
  return { applied, failed };
}

/** Mốc lịch sử do app TỰ chuyển vì quá SLA ({auto:'sla'}) còn trong hạn hoàn tác → mốc đó, không thì null. */
export function slaAutoEntry(c: Customer, now: number) {
  const h = Array.isArray(c.care_stage_history) ? c.care_stage_history : [];
  const last = h[h.length - 1];
  if (last?.auto !== 'sla' || last.stage !== c.care_stage) return null;
  const days = (now - Date.parse(last.at ?? '')) / 86400000;
  return days <= C.autoUndoDays ? last : null;
}

/**
 * Hoàn tác tự chuyển SLA → thay đổi quay lại bậc trước mốc tự động (không có → "Đang chăm sóc"),
 * null khi hết hạn hoàn tác / không phải khách mình. KHÔNG ghi — gọi writer.update(id, patch, opts).
 */
export function planSlaUndo(
  c: Customer,
  now: number,
  me: string,
): { id: string; patch: CustomerPatch; opts: UpdateOpts } | null {
  if (!isMineFor(c, me) || !slaAutoEntry(c, now)) return null;
  const h = Array.isArray(c.care_stage_history) ? c.care_stage_history : [];
  const prev = [...h].reverse().find((x, i) => i > 0 && x?.stage && x.stage !== c.care_stage);
  const back = (prev && normStage(prev.stage)) || QUALIFIED_STAGE;
  return {
    id: c.id,
    patch: { care_stage: back },
    opts: { careStageNote: 'Hoàn tác tự chuyển SLA — đồng hồ giai đoạn tính lại từ hôm nay' },
  };
}
