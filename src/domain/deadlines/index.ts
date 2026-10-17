/**
 * NGUỒN DUY NHẤT — D-010. Đến hạn / quá hạn / đếm ngược cho việc, hẹn gọi, checklist.
 * Port 1-1 từ legacy/js/app.js (countdownTag, taskDueInfo, callReminder, taskDueMs, nhãn ngày).
 * Hàm thuần: mọi hàm phụ thuộc giờ nhận `now` (ms) — không đọc Date.now() bên trong.
 * Giờ địa phương của máy (như v1; app chạy ở múi giờ Việt Nam).
 *
 * Luật D-010:
 *   - việc có giờ: đến hạn từ mốc đến mốc + 30 phút, sau đó quá hạn;
 *   - hẹn gọi (khung giờ): đến hạn suốt khung + 30 phút sau khi hết khung;
 *   - việc cả ngày: đến hạn suốt ngày đó, quá hạn từ ngày hôm sau.
 */
import type { Customer, Task } from '@/domain/customer';

const MIN = 60000;
const DAY = 86400000;

/** Sau mốc kết thúc bao lâu thì "đến hạn" thành "quá hạn" (D-010). */
export const DUE_GRACE_MS = 30 * MIN;

/** getDay() 0=CN..6=T7 */
export const VI_WD_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

export type CountdownState = 'far' | 'soon' | 'due' | 'missed';
export type Countdown = { state: CountdownState; text: string };
export type TaskDueState = 'overdue' | 'due' | 'today' | '';
export type TaskDueInfo = { ms: number; state: TaskDueState; label: string };
export type CallReminder = { state: 'soon' | 'due' | 'missed'; text: string; sort: number };

const p2 = (n: number) => String(n).padStart(2, '0');

/** 0h00 (giờ địa phương) của ngày chứa ms. */
export function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Số ngày lịch từ hôm nay (theo `now`) tới ngày chứa ms. */
function dayDiff(ms: number, now: number): number {
  return Math.round((startOfDayMs(ms) - startOfDayMs(now)) / DAY);
}

/** "HH:MM" giờ địa phương. */
export function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** "d/m" */
export function ddmm(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** Thời lượng còn lại: "30p" (<1h) hoặc "2:00" (≥1h). */
export function fmtRemainMs(ms: number): string {
  const min = Math.max(0, Math.round(ms / MIN));
  if (min < 60) return `${min}p`;
  return `${Math.floor(min / 60)}:${p2(min % 60)}`;
}

/** "còn X": <24h → fmtRemainMs · xa hơn → "N ngày" (đếm theo ngày lịch). */
export function fmtCountdown(startMs: number, now: number): string {
  const ms = startMs - now;
  if (ms < DAY) return fmtRemainMs(ms);
  return `${dayDiff(startMs, now)} ngày`;
}

/** Mốc hạn (ms) của 1 việc; NaN nếu không hạn / hạn hỏng. */
export function taskDueMs(t: Pick<Task, 'due'> | null | undefined): number {
  return t?.due ? Date.parse(t.due) : Number.NaN;
}

/** Nhãn ngày việc: Hôm nay / Ngày mai / Hôm qua / "T5 15/10". */
export function taskDayLabel(d: Date, now: number): string {
  const diff = dayDiff(d.getTime(), now);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Ngày mai';
  if (diff === -1) return 'Hôm qua';
  return `${VI_WD_SHORT[d.getDay()]} ${ddmm(d)}`;
}

/** Nhãn ngày lịch hẹn gọi: Hôm nay / Ngày mai / Hôm qua / "15/10". */
export function relDayLabel(d: Date, now: number): string {
  const diff = dayDiff(d.getTime(), now);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Ngày mai';
  if (diff === -1) return 'Hôm qua';
  return ddmm(d);
}

/** Nhãn lịch hẹn gọi của khách: "Hôm nay 09:00–10:00"; chưa hẹn → ''. */
export function callScheduleLabel(c: Pick<Customer, 'next_call_at' | 'next_call_end'>, now: number): string {
  if (!c.next_call_at) return '';
  const s = new Date(c.next_call_at);
  const e = c.next_call_end ? new Date(c.next_call_end) : s;
  const tt = fmtClock(s.getTime()) + (e.getTime() !== s.getTime() ? `–${fmtClock(e.getTime())}` : '');
  return `${relDayLabel(s, now)} ${tt}`;
}

/** Bảng Hôm nay: "Hôm nay 14:00" / "Hôm qua 09:30" / "Mai 10:00" / "T6 10/10 10:00". */
export function dashWhen(ms: number, now: number): string {
  const diff = dayDiff(ms, now);
  const day =
    diff === 0
      ? 'Hôm nay'
      : diff === -1
        ? 'Hôm qua'
        : diff === 1
          ? 'Mai'
          : `${VI_WD_SHORT[new Date(ms).getDay()]} ${ddmm(new Date(ms))}`;
  return `${day} ${fmtClock(ms)}`;
}

/**
 * Đếm ngược CHUNG (D-010): trước mốc → 'soon' (xa >24h → 'far') · từ mốc đến hết khung + 30 phút
 * → 'due' · sau đó → 'missed'. Cả ngày: 'due' suốt ngày đó, 'missed' từ hôm sau; trước đó đếm ngày lịch.
 * startMs NaN → null.
 */
export function countdownTag(startMs: number, endMs: number, allDay: boolean, now: number): Countdown | null {
  if (Number.isNaN(startMs)) return null;
  if (allDay) {
    const d = dayDiff(startMs, now);
    if (d > 0) return { state: d > 1 ? 'far' : 'soon', text: `còn ${d} ngày` };
    return d === 0 ? { state: 'due', text: 'đến hạn' } : { state: 'missed', text: 'quá hạn' };
  }
  if (now < startMs) {
    return { state: startMs - now > DAY ? 'far' : 'soon', text: `còn ${fmtCountdown(startMs, now)}` };
  }
  if (now <= (Number.isNaN(endMs) ? startMs : endMs) + DUE_GRACE_MS) return { state: 'due', text: 'đến hạn' };
  return { state: 'missed', text: 'quá hạn' };
}

/** Nhãn hạn + trạng thái của 1 việc. Không hạn / hạn hỏng → null. */
export function taskDueInfo(t: Pick<Task, 'due' | 'due_allday'>, now: number): TaskDueInfo | null {
  const ms = taskDueMs(t);
  if (Number.isNaN(ms)) return null;
  const cd = countdownTag(ms, ms, !!t.due_allday, now);
  const state: TaskDueState =
    cd?.state === 'missed'
      ? 'overdue'
      : cd?.state === 'due'
        ? 'due'
        : startOfDayMs(ms) === startOfDayMs(now)
          ? 'today'
          : '';
  return { ms, state, label: taskDayLabel(new Date(ms), now) + (t.due_allday ? '' : ` · ${fmtClock(ms)}`) };
}

/** Tag nhắc gọi của 1 khách (khung giờ hẹn). null = không hiện (chưa hẹn, hẹn hỏng, còn xa >24h). */
export function callReminder(c: Pick<Customer, 'next_call_at' | 'next_call_end'>, now: number): CallReminder | null {
  if (!c.next_call_at) return null;
  const start = Date.parse(c.next_call_at);
  const end = c.next_call_end ? Date.parse(c.next_call_end) : start;
  const cd = countdownTag(start, end, false, now);
  if (!cd || cd.state === 'far') return null;
  if (cd.state === 'soon') return { state: 'soon', text: `${fmtRemainMs(start - now)} nữa gọi`, sort: start };
  return { state: cd.state, text: cd.state === 'due' ? 'đến giờ gọi' : `quên gọi ${fmtClock(start)}`, sort: start };
}
