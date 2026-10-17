/**
 * NHỊP FOLLOW-UP (D-005): gợi ý lần gọi tiếp theo + mẫu tin Zalo theo tình huống.
 * Port 1-1 từ legacy/js/followup.js. Cấu hình (khung giờ, nhịp, mẫu): src/config/followup.ts.
 * Hàm thuần: nhận `now` (ms), không đọc Date.now(), không ghi dữ liệu. Giờ địa phương của máy (như v1).
 */
import { FOLLOWUP_CONFIG as C, type CallSlotKey } from '@/config/followup';
import { type CallAttempt, type Customer, isQualified, parseDob } from '@/domain/customer';

export { fillGreeting, upgradeTplText } from './greeting';

const MIN = 60000;
const H = 3600000;
const DAY = 86400000;
// Kết quả gọi coi là "KHÔNG LIÊN LẠC ĐƯỢC" (đếm vào nhịp gọi lại). 'busy' = khách bắt máy, hẹn giờ.
const MISS: readonly string[] = ['no_answer', 'unreachable', 'line_busy', 'hung_up'];
const WD = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'] as const;
const SLOT_KEYS = Object.keys(C.callSlots) as CallSlotKey[];
const STAGES: Readonly<Record<string, { days: number; reason: string } | undefined>> = C.stages;
const STAGE_TEMPLATE: Readonly<Record<string, string | undefined>> = C.stageTemplate;
const OCC_SLOTS: Readonly<Record<string, { main: CallSlotKey; alt: CallSlotKey } | undefined>> = C.occupationSlots;
const LEAD_PRIORITY: readonly CallSlotKey[] = C.leadPriority;

type Range = [number, number, number, number];
export type SlotWhich = 'main' | 'alt';
export type ScheduleSuggestion = {
  kind: 'schedule';
  start: Date;
  end: Date;
  reason: string;
  label: string;
  slot?: CallSlotKey;
};
export type AskSuggestion = { kind: 'ask'; reason: string };
export type DropSuggestion = {
  kind: 'drop';
  code: string;
  text: string;
  fallback: ScheduleSuggestion | null;
  auto?: true;
};
export type FollowupSuggestion = ScheduleSuggestion | AskSuggestion | DropSuggestion;
export type TemplateSuggestion = { id: string; why: string };
export type CallSlotInfo = { key: CallSlotKey; name: string; range: Range; text: string };
type Attempt = Pick<CallAttempt, 'at' | 'result' | 'duration'>;
type DatedAttempt = Attempt & { at: string };
type Occurrence = { k: CallSlotKey; start: Date; end: Date };

export type AfterCallOptions = {
  /** Danh sách khách của mình — để tính khung "phản hồi tốt nhất" cho lần gọi thứ 5 (v1: statsSource). */
  statsCustomers?: readonly Pick<Customer, 'call_attempts'>[];
};

const p2 = (n: number) => String(n).padStart(2, '0');

/** "GG:PP-GG:PP" → [sh, sm, eh, em]; sai định dạng → 9–11h. */
export function parseRange(s: unknown): Range {
  const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  return m ? [+(m[1] ?? 0), +(m[2] ?? 0), +(m[3] ?? 0), +(m[4] ?? 0)] : [9, 0, 11, 0];
}
function slotRange(k: CallSlotKey): Range {
  return parseRange(C.callSlots[k].range);
}
function slotOf(c: Pick<Customer, 'occupation'> | null | undefined, which: SlotWhich): Range {
  const s = OCC_SLOTS[c?.occupation || ''] || OCC_SLOTS[''];
  const k = s?.[which] ?? s?.main ?? SLOT_KEYS[0] ?? 'A';
  return slotRange(k);
}

/** Danh sách khung giờ gọi dùng chung (cho nút preset): [{key, name, range, text:'09:00–10:00'}]. */
export function callSlots(): CallSlotInfo[] {
  return SLOT_KEYS.map((key) => {
    const r = slotRange(key);
    return { key, name: C.callSlots[key].name, range: r, text: `${p2(r[0])}:${p2(r[1])}–${p2(r[2])}:${p2(r[3])}` };
  });
}

/** Khung giờ sau `days` ngày (tính từ hôm nay theo `now`), theo nghề nghiệp. Khung hôm nay đã qua → hôm sau. */
export function windowAfter(
  c: Pick<Customer, 'occupation'> | null | undefined,
  days: number,
  which: SlotWhich,
  now: number,
): { start: Date; end: Date } {
  const [sh, sm, eh, em] = slotOf(c, which);
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Math.max(0, days));
  if (C.skipSunday && d.getDay() === 0) d.setDate(d.getDate() + 1);
  const start = new Date(d);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(d);
  end.setHours(eh, em, 0, 0);
  if (end.getTime() <= now) {
    start.setDate(start.getDate() + 1);
    end.setDate(end.getDate() + 1);
  }
  return { start, end };
}

/** "Thứ Sáu 10/10, 09:00–11:00" */
export function scheduleLabel(start: Date, end?: Date | null): string {
  const t = (d: Date) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  return `${WD[start.getDay()]} ${start.getDate()}/${start.getMonth() + 1}, ${t(start)}${end && +end !== +start ? `–${t(end)}` : ''}`;
}

function schedule(
  c: Pick<Customer, 'occupation'> | null | undefined,
  days: number,
  which: SlotWhich,
  reason: string,
  now: number,
): ScheduleSuggestion {
  const w = windowAfter(c, days, which, now);
  return { kind: 'schedule', start: w.start, end: w.end, reason, label: scheduleLabel(w.start, w.end) };
}

/**
 * Số cuộc gọi hỏng LIÊN TIẾP tính từ cuộc mới nhất (dừng khi gặp cuộc có liên lạc).
 * Cuộc "chưa ghi chú" (nhật ký máy Android): 0 giây = hỏng; > 0 giây = có bắt máy; không rõ → bỏ qua.
 */
export function trailingMisses(attempts: readonly (Attempt | null | undefined)[]): number {
  let n = 0;
  for (let i = attempts.length - 1; i >= 0; i--) {
    const a = attempts[i];
    if (!a) continue;
    if (!a.result) {
      if (a.duration === 0) {
        n++;
        continue;
      }
      if (a.duration != null && a.duration > 0) break;
      continue;
    }
    if (!MISS.includes(a.result)) break;
    n++;
  }
  return n;
}
// n cuộc hỏng liên tiếp cuối (cũ → mới) — cùng cách đếm với trailingMisses (bỏ cuộc chưa rõ).
function missedTail<T extends Attempt>(attempts: readonly (T | null | undefined)[], n: number): T[] {
  const out: T[] = [];
  for (let i = attempts.length - 1; i >= 0 && out.length < n; i--) {
    const a = attempts[i];
    if (!a) continue;
    if (!a.result && a.duration !== 0) continue;
    out.unshift(a);
  }
  return out;
}

// ───────── NHỊP KHÁCH MỚI: 4 khung A/B/C/D ─────────

/** Khung chứa (hoặc gần nhất với) thời điểm ms. */
export function slotOfTime(ms: number): CallSlotKey | null {
  const d = new Date(ms);
  const m = d.getHours() * 60 + d.getMinutes();
  let best: CallSlotKey | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const k of SLOT_KEYS) {
    const [sh, sm, eh, em] = slotRange(k);
    const a = sh * 60 + sm;
    const b = eh * 60 + em;
    const dist = m < a ? a - m : m > b ? m - b : 0;
    if (dist < bestDist) {
      best = k;
      bestDist = dist;
    }
  }
  return best;
}
function slotOn(k: CallSlotKey, dayMs: number): Occurrence {
  const [sh, sm, eh, em] = slotRange(k);
  const start = new Date(dayMs);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(dayMs);
  end.setHours(eh, em, 0, 0);
  return { k, start, end };
}
function day0(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function skipDay(ms: number): boolean {
  return C.skipSunday && new Date(ms).getDay() === 0;
}
/** Các khung (thuộc allowed) bắt đầu từ fromMs trở đi, trong `days` ngày, theo thời gian. */
function occurrences(fromMs: number, allowed: readonly CallSlotKey[], days = 14): Occurrence[] {
  const out: Occurrence[] = [];
  for (let i = 0; i < days; i++) {
    const dms = day0(fromMs) + i * DAY + 2 * H; // +2h tránh lệch giờ mùa
    if (skipDay(dms)) continue;
    for (const k of allowed) {
      const o = slotOn(k, dms);
      if (o.start.getTime() >= fromMs) out.push(o);
    }
  }
  return out.sort((a, b) => +a.start - +b.start);
}
const rankIn = (priority: readonly CallSlotKey[]) => (k: CallSlotKey) => {
  const i = priority.indexOf(k);
  return i === -1 ? 99 : i;
};
/** Ngày ĐẦU TIÊN (từ earliest) có khung được phép → trong ngày đó chọn khung theo thứ tự ưu tiên. */
function pickFirstDay(
  earliestMs: number,
  allowed: readonly CallSlotKey[],
  priority: readonly CallSlotKey[],
): Occurrence | null {
  const occ = occurrences(earliestMs, allowed);
  const first = occ[0];
  if (!first) return null;
  const d = day0(first.start.getTime());
  const rank = rankIn(priority);
  return occ.filter((o) => day0(o.start.getTime()) === d).sort((a, b) => rank(a.k) - rank(b.k))[0] ?? null;
}
/** Xếp hạng khung theo tỉ lệ nói chuyện được (dữ liệu gọi của mình); thiếu dữ liệu → leadPriority. */
function slotsByResponse(list: readonly Pick<Customer, 'call_attempts'>[]): {
  ranked: CallSlotKey[];
  hasData: boolean;
} {
  const st = Object.fromEntries(SLOT_KEYS.map((k) => [k, { n: 0, ok: 0 }])) as Record<
    CallSlotKey,
    { n: number; ok: number }
  >;
  for (const c of list) {
    for (const a of Array.isArray(c?.call_attempts) ? c.call_attempts : []) {
      if (!a?.at || !a.result) continue;
      const k = slotOfTime(Date.parse(a.at));
      if (!k) continue;
      st[k].n++;
      if (a.result === 'talked') st[k].ok++;
    }
  }
  const known = SLOT_KEYS.filter((k) => st[k].n >= C.leadBestSlotMinCalls).sort(
    (a, b) => st[b].ok / st[b].n - st[a].ok / st[a].n,
  );
  return { ranked: [...known, ...LEAD_PRIORITY.filter((k) => !known.includes(k))], hasData: known.length > 0 };
}
function leadSchedule(o: Occurrence, n: number, why: string): ScheduleSuggestion {
  const s = C.callSlots[o.k];
  return {
    kind: 'schedule',
    start: o.start,
    end: o.end,
    slot: o.k,
    reason: `Gọi lần ${n} · khung ${s.name.toLowerCase()}${why ? ` · ${why}` : ''}`,
    label: scheduleLabel(o.start, o.end),
  };
}
function regMs(c: Pick<Customer, 'registered_at' | 'created_at'> | null | undefined, now: number): number {
  const t = Date.parse(c?.registered_at || c?.created_at || '');
  return Number.isNaN(t) ? now : t;
}

/** LẦN 1: khung hợp lệ gần nhất, sớm nhất leadFirstCallMinutes sau khi lead về (đã qua thì từ bây giờ). */
export function firstCall(
  c: Pick<Customer, 'registered_at' | 'created_at'> | null | undefined,
  now: number,
): ScheduleSuggestion | null {
  const from = Math.max(regMs(c, now), now) + C.leadFirstCallMinutes * MIN;
  for (let i = 0; i < 14; i++) {
    const dms = day0(from) + i * DAY + 2 * H;
    if (skipDay(dms)) continue;
    const o = SLOT_KEYS.map((k) => slotOn(k, dms))
      .filter((x) => x.end.getTime() - Math.max(x.start.getTime(), from) >= 15 * MIN) // còn ≥15 phút trong khung
      .sort((a, b) => +a.start - +b.start)[0];
    if (o) {
      if (o.start.getTime() < from) o.start = new Date(Math.ceil(from / (5 * MIN)) * 5 * MIN); // đang trong khung
      return leadSchedule(o, 1, 'khung gần nhất sau đăng ký');
    }
  }
  return null;
}

/** Lần gọi tiếp theo cho khách mới sau các cuộc hỏng liên tiếp `tried` (cũ → mới, ≥1 cuộc). */
function leadNext(
  c: Pick<Customer, 'registered_at' | 'created_at'>,
  tried: readonly DatedAttempt[],
  now: number,
  stats: readonly Pick<Customer, 'call_attempts'>[],
): ScheduleSuggestion | null {
  const n = tried.length; // số lần đã gọi hỏng → gợi ý lần n + 1
  const soon = now + 5 * MIN;
  const slots = tried.map((a) => slotOfTime(Date.parse(a.at)));
  const lastAt = Date.parse(tried[n - 1]?.at ?? '');
  const all = SLOT_KEYS;
  if (n === 1) {
    // LẦN 2: trong 24h từ đk, khác khung lần 1, ưu tiên D → C → B, gần mốc +12h
    const reg = regMs(c, now);
    const allowed = all.filter((k) => k !== slots[0]);
    const from = Math.max(soon, lastAt + 30 * MIN);
    const rank = rankIn(LEAD_PRIORITY);
    const target = reg + C.leadSecondTargetHours * H;
    const inWindow = occurrences(from, allowed, 3)
      .filter((o) => o.start.getTime() < reg + C.leadSecondWithinHours * H)
      .sort((a, b) => rank(a.k) - rank(b.k) || Math.abs(+a.start - target) - Math.abs(+b.start - target));
    const o = inWindow[0] || pickFirstDay(from, allowed, LEAD_PRIORITY);
    return o && leadSchedule(o, 2, inWindow[0] ? 'trong 24h sau đăng ký' : '');
  }
  const gap = (C.leadGapHours[n - 2] ?? Number.NaN) * H; // n=2 → lần 3, n=3 → lần 4, n=4 → lần 5
  const from = Math.max(soon, lastAt + gap);
  if (n === 2) {
    // LẦN 3: bỏ khung lần 1 + 2
    const allowed = all.filter((k) => !slots.includes(k));
    const o = pickFirstDay(from, allowed.length ? allowed : all, LEAD_PRIORITY);
    return o && leadSchedule(o, 3, '');
  }
  if (n === 3) {
    // LẦN 4: khung còn lại chưa gọi
    let allowed = all.filter((k) => !slots.includes(k));
    if (!allowed.length) allowed = all.filter((k) => k !== slots[n - 1]);
    const o = pickFirstDay(from, allowed, LEAD_PRIORITY);
    return o && leadSchedule(o, 4, allowed.length === 1 ? 'khung cuối chưa thử' : '');
  }
  // LẦN 5: khung phản hồi tốt nhất, trừ khung giờ đăng ký
  const regSlot = slotOfTime(regMs(c, now));
  const byResp = slotsByResponse(stats);
  const ranked = byResp.ranked.filter((k) => k !== regSlot);
  const o = pickFirstDay(from, ranked, ranked);
  return o && leadSchedule(o, 5, byResp.hasData ? 'khung phản hồi tốt nhất' : 'lần cuối');
}

/** Gợi ý khi đổi sang bậc `stage` (hoặc khách Đang chăm vừa nói chuyện được). null = không gợi ý. */
export function forStage(
  c: Pick<Customer, 'occupation'> | null | undefined,
  stage: string | null | undefined,
  now: number,
): ScheduleSuggestion | null {
  const s = stage ? STAGES[stage] : undefined;
  return s ? schedule(c, s.days, 'main', s.reason, now) : null;
}

/**
 * Gợi ý sau 1 cuộc gọi. attempts = nhật ký gọi (cũ → mới) ĐÃ gồm cuộc vừa ghi.
 * schedule = đề xuất lịch gọi lại · ask = khách tự hẹn giờ · drop = gợi ý loại · null = không gợi ý.
 */
export function afterCall(
  c: Customer,
  attempts: readonly DatedAttempt[],
  now: number,
  opts: AfterCallOptions = {},
): FollowupSuggestion | null {
  const r = attempts[attempts.length - 1]?.result;
  if (!r) return null;
  if (r === 'busy') return { kind: 'ask', reason: 'Khách hẹn gọi lại' };
  const q = isQualified(c);
  if (r === 'wrong_number') {
    return q ? null : { kind: 'drop', code: 'so_sai', text: 'Sai số → gợi ý loại khách (Số sai).', fallback: null };
  }
  if (r === 'talked') {
    if (!q) return schedule(c, C.leadTalkedDays, 'main', C.leadTalkedReason, now);
    return forStage(c, c.care_stage, now);
  }
  if (!MISS.includes(r)) return null;
  const n = trailingMisses(attempts);
  if (!q) {
    // KHÁCH MỚI: nhịp 5 lần xoay khung A/B/C/D
    if (n >= C.leadMaxAttempts) {
      return {
        kind: 'drop',
        code: 'khong_lien_lac_duoc',
        auto: true,
        text: `Hết ${n} lần gọi theo nhịp vẫn không liên lạc được → chuyển Loại "Không liên lạc được" và nhắn Zalo.`,
        fallback: null,
      };
    }
    return leadNext(c, missedTail(attempts, n), now, opts.statsCustomers ?? []);
  }
  // KHÁCH TIỀM NĂNG: giãn dần 1 → 2 → 4 → 7 ngày, rồi cứ qualifiedMissRepeatDays ngày
  const arr = C.missDelaysDays;
  const days = n <= arr.length ? (arr[n - 1] ?? 0) : C.qualifiedMissRepeatDays;
  let which: SlotWhich = n % 2 === 1 ? 'alt' : 'main'; // luân phiên khung giờ
  if (r === 'hung_up') which = which === 'main' ? 'alt' : 'main'; // cúp máy → đổi khung kia
  const sug = schedule(c, days, which, `Gọi lại (lần ${n + 1})`, now);
  if (n > arr.length) sug.reason += ' · khách khó liên lạc, thử nhắn Zalo';
  return sug;
}

/** Mẫu Zalo gợi ý → 1–2 phần tử { id, why }. Mặc định 1; thêm mẫu thứ 2 khi có thêm 1 lý do rõ ràng. */
export function suggestTemplates(c: Customer | null | undefined, now: number): TemplateSuggestion[] {
  if (!c) return [{ id: 'chao', why: '' }];
  const calls = (Array.isArray(c.call_attempts) ? c.call_attempts : [])
    .filter((a): a is CallAttempt & { at: string } => !!a?.at)
    .sort((a, b) => a.at.localeCompare(b.at));
  const misses = trailingMisses(calls);
  if (!isQualified(c)) {
    // KHÁCH MỚI — theo lịch sử gọi, luôn 1 mẫu
    if (calls.some((a) => a.result === 'talked')) return [{ id: 'thong_tin', why: 'Khách mới đã nói chuyện được' }];
    if (misses >= C.leadMissedTemplateAfter) return [{ id: 'goi_nho', why: `Đã gọi ${misses} lần chưa liên lạc được` }];
    return [
      {
        id: 'chao',
        why: calls.length ? `Khách mới, gọi ${calls.length} lần chưa nói chuyện được` : 'Khách mới chưa liên hệ',
      },
    ];
  }
  // KHÁCH TIỀM NĂNG — theo bậc; có thể thêm sinh nhật / gọi chưa được (tối đa 2)
  const stage = c.care_stage || 'Đang chăm sóc';
  const out: TemplateSuggestion[] = [
    { id: STAGE_TEMPLATE[stage] || 'thong_tin', why: `Đang ở bậc "${stage === 'Loại' ? 'Không chốt' : stage}"` },
  ];
  const p = c.dob ? parseDob(c.dob) : null;
  if (p?.month && p.day && stage !== 'Loại') {
    const t0 = new Date(now);
    t0.setHours(0, 0, 0, 0);
    let b = new Date(t0.getFullYear(), p.month - 1, p.day);
    if (b < t0) b = new Date(t0.getFullYear() + 1, p.month - 1, p.day);
    const d = Math.round((+b - +t0) / DAY);
    if (d <= C.birthdayTemplateDays)
      out.unshift({ id: 'sinh_nhat', why: d === 0 ? 'Hôm nay sinh nhật khách' : `Sinh nhật khách sau ${d} ngày` });
  }
  if (out.length < 2 && C.qualifiedMissedTemplateAfter && misses >= C.qualifiedMissedTemplateAfter) {
    out.push({ id: 'goi_nho', why: `Đã gọi ${misses} lần chưa liên lạc được` });
  }
  return out.filter((x, k) => out.findIndex((y) => y.id === x.id) === k).slice(0, 2);
}

/** Mã mẫu Zalo gợi ý đầu tiên. */
export function suggestTemplate(c: Customer | null | undefined, now: number): string {
  return suggestTemplates(c, now)[0]?.id ?? 'chao';
}
