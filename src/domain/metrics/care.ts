import { VELOCITY_CONFIG } from '@/config/velocity';
import type { Customer, Task } from '@/domain/customer';
import { callAttemptsOf, inFunnel, isQualified, openTasksOf } from '@/domain/customer';
import { countdownTag } from '@/domain/deadlines';
import { callSlots, slotOfTime } from '@/domain/followup';
import { newLeadStart, status as slaStatus } from '@/domain/velocity/engine';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;
export const CARE_METRIC_CONFIG = {
  periodDays: 30,
  conversionDays: 90,
  lessonDays: 7,
  lessonSample: 5,
  slotSample: 10,
  touchDays: 7,
} as const;

export type CareHealth = { health: 'ok' | 'late' | 'risk' | 'unknown'; reason: string };
export type CareLesson = {
  key: string;
  title: string;
  evidence: string;
  action: string;
  numerator: number;
  denominator: number;
  customerIds: string[];
};

const parsed = (value?: string | null) => {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : Number.NaN;
};
const pct = (n: number, d: number) => (d ? Math.round((n * 100) / d) : null);
const within = (at: number, start: number, end: number) => Number.isFinite(at) && at >= start && at <= end;
const stageLabel = (customer: Customer) => customer.care_stage || 'Chưa rõ bậc';
function recordedTouchMs(customer: Customer): number | null {
  const dates = [
    ...callAttemptsOf(customer).map((call) => call.at),
    ...(customer.interactions || []).map((item) => item?.at),
    ...(customer.notes_manual || []).map((note) => note?.at),
  ]
    .map(parsed)
    .filter(Number.isFinite);
  return dates.length ? Math.max(...dates) : null;
}

/** Working-hour elapsed time for new-lead SLA, using the single approved 06:00–22:00 config. */
export function workingElapsedMs(startAt: number, endAt: number): number | null {
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt < startAt) return null;
  let cursor = newLeadStart(startAt);
  if (endAt < cursor) return null;
  let elapsed = 0;
  while (cursor < endAt) {
    const day = new Date(cursor);
    const open = new Date(day);
    open.setHours(VELOCITY_CONFIG.workHours.start, 0, 0, 0);
    const close = new Date(day);
    close.setHours(VELOCITY_CONFIG.workHours.end, 0, 0, 0);
    const segmentStart = Math.max(cursor, open.getTime());
    const segmentEnd = Math.min(endAt, close.getTime());
    if (segmentEnd > segmentStart) elapsed += segmentEnd - segmentStart;
    if (endAt <= close.getTime()) break;
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    next.setHours(VELOCITY_CONFIG.workHours.resumeAt, 0, 0, 0);
    cursor = next.getTime();
  }
  return elapsed;
}

function promiseRows(customer: Customer) {
  return (customer.next_tasks || []).filter(
    (task): task is Task => !!task && task.side === 'me' && !!(task.due_original || task.due),
  );
}

export function careHealth(customer: Customer, now: number): CareHealth {
  const lastTouch = recordedTouchMs(customer);
  if (!isQualified(customer) && callAttemptsOf(customer).length === 0 && lastTouch == null)
    return { health: 'unknown', reason: 'Chưa có lịch sử chăm sóc để đánh giá.' };
  const overduePromise = promiseRows(customer).some((task) => {
    const due = parsed(task.due_original || task.due);
    return !task.done_at && countdownTag(due, due, !!task.due_allday, now)?.state === 'missed';
  });
  if (overduePromise) return { health: 'risk', reason: 'Có lời hứa của mình đã quá hạn theo hạn gốc.' };
  const sla = slaStatus(customer, now);
  if (sla?.state === 'over') {
    const limit = sla.max < DAY ? `${sla.max / HOUR} giờ` : `${sla.max / DAY} ngày`;
    return { health: 'risk', reason: `Bậc ${stageLabel(customer)} đã quá hạn mức SLA ${limit}.` };
  }
  if (lastTouch != null && now - lastTouch > CARE_METRIC_CONFIG.touchDays * DAY)
    return { health: 'late', reason: `Đã hơn ${CARE_METRIC_CONFIG.touchDays} ngày chưa có lần chạm được ghi nhận.` };
  if (sla?.state === 'warn') return { health: 'late', reason: `Bậc ${stageLabel(customer)} đã vượt mục tiêu SLA.` };
  if (lastTouch == null) return { health: 'unknown', reason: 'Chưa có lần chạm được ghi nhận.' };
  return { health: 'ok', reason: 'Có lần chạm trong 7 ngày và chưa có cảnh báo SLA/lời hứa.' };
}

/** F-07 care metrics; all windows, samples and customer drill-down IDs are explicit. */
export function fullCareMetrics(customers: readonly Customer[], now: number) {
  const start30 = now - CARE_METRIC_CONFIG.periodDays * DAY;
  const start90 = now - CARE_METRIC_CONFIG.conversionDays * DAY;
  const start7 = now - CARE_METRIC_CONFIG.lessonDays * DAY;
  const callsByCustomer = new Map(customers.map((customer) => [customer.id, callAttemptsOf(customer)]));
  const firstCalls = customers.flatMap((customer) => {
    const registered = parsed(customer.registered_at || customer.created_at);
    if (!within(registered, start30, now) || customer.disqualified_at) return [];
    const first = callsByCustomer.get(customer.id)?.[0];
    if (!first) return [{ customer, duration: null as number | null }];
    const duration = workingElapsedMs(registered, parsed(first.at));
    return [{ customer, duration }];
  });
  const leadCallsInPeriod = (customer: Customer) =>
    (callsByCustomer.get(customer.id) || []).filter((call) => {
      const at = parsed(call.at);
      const qualifiedAt = parsed(customer.qualified_at);
      return (
        within(at, start30, now) && (!Number.isFinite(qualifiedAt) || at < qualifiedAt) && !customer.disqualified_at
      );
    });
  const calledLeadRows = customers.filter((customer) => leadCallsInPeriod(customer).length > 0);
  const contactedLeadRows = calledLeadRows.filter((customer) =>
    leadCallsInPeriod(customer).some((call) => call.result === 'talked'),
  );

  const slots = callSlots().map((slot) => {
    const calls = customers.flatMap((customer) =>
      (callsByCustomer.get(customer.id) || [])
        .filter(
          (call) => within(parsed(call.at), start30, now) && !!call.result && slotOfTime(parsed(call.at)) === slot.key,
        )
        .map((call) => ({ customer, call })),
    );
    const talked = calls.filter(({ call }) => call.result === 'talked');
    return {
      key: slot.key,
      name: slot.name,
      numerator: talked.length,
      denominator: calls.length,
      percent: pct(talked.length, calls.length),
      customerIds: [...new Set(calls.map(({ customer }) => customer.id))],
    };
  });

  const active = customers.filter((customer) => isQualified(customer) && inFunnel(customer));
  const covered = active.filter((customer) => !!customer.next_call_at || openTasksOf(customer).length > 0);
  const promises = customers.flatMap((customer) =>
    promiseRows(customer).map((task) => ({ customer, task, due: parsed(task.due_original || task.due) })),
  );
  const duePromises = promises.filter(({ due }) => within(due, start30, now));
  const keptPromises = duePromises.filter(({ task, due }) => {
    const done = parsed(task.done_at);
    return Number.isFinite(done) && countdownTag(due, due, !!task.due_allday, done)?.state !== 'missed';
  });
  const openPromises = promises.filter(({ task }) => !task.done_at);
  const openOverdue = openPromises.filter(
    ({ task, due }) =>
      !task.done_at && Number.isFinite(due) && countdownTag(due, due, !!task.due_allday, now)?.state === 'missed',
  );

  const stageGroups = VELOCITY_CONFIG.order.map((key) => {
    const phase = VELOCITY_CONFIG.phases[key];
    const rows = active.filter((customer) => slaStatus(customer, now)?.key === key);
    const warn = rows.filter((customer) => slaStatus(customer, now)?.state === 'warn');
    const over = rows.filter((customer) => slaStatus(customer, now)?.state === 'over');
    return {
      key,
      label: phase.label,
      total: rows.length,
      targetExceeded: warn.length,
      limitExceeded: over.length,
      customerIds: rows.map((customer) => customer.id),
      definition: `Tuổi bậc hiện tại theo D-008; mục tiêu ${phase.targetText}, hạn mức ${phase.maxText}.`,
    };
  });
  const activeTouched = active.map((customer) => ({ customer, at: recordedTouchMs(customer) }));
  const touchedRecent = activeTouched.filter(
    ({ at }) => at != null && at >= start30 && at <= now && now - at <= CARE_METRIC_CONFIG.touchDays * DAY,
  );

  const conversionRows = customers.filter((customer) => {
    const registered = parsed(customer.registered_at || customer.created_at);
    return within(registered, start90, now) && !customer.disqualified_at;
  });
  const touchBuckets = [
    { key: '0', label: '0 lần', min: 0, max: 0 },
    { key: '1', label: '1 lần', min: 1, max: 1 },
    { key: '2-3', label: '2–3 lần', min: 2, max: 3 },
    { key: '4+', label: '4+ lần', min: 4, max: Number.POSITIVE_INFINITY },
  ].map((bucket) => {
    const rows = conversionRows
      .map((customer) => {
        const qualifiedAt = parsed(customer.qualified_at);
        const touchEnd = Number.isFinite(qualifiedAt) ? qualifiedAt : now;
        const calls = (callsByCustomer.get(customer.id) || []).filter((call) =>
          within(parsed(call.at), start90, touchEnd),
        ).length;
        const messages = (customer.interactions || []).filter(
          (entry) =>
            entry &&
            ['zalo', 'sms', 'meet', 'visit'].includes(entry.channel || '') &&
            within(parsed(entry.at), start90, touchEnd),
        ).length;
        return { customer, count: calls + messages };
      })
      .filter(({ count }) => count >= bucket.min && count <= bucket.max);
    const qualified = rows.filter(({ customer }) => Number.isFinite(parsed(customer.qualified_at)));
    return {
      ...bucket,
      numerator: qualified.length,
      denominator: rows.length,
      percent: pct(qualified.length, rows.length),
      customerIds: rows.map(({ customer }) => customer.id),
    };
  });

  const health = customers
    .filter((customer) => !customer.disqualified_at && !customer.archived_at)
    .map((customer) => ({ customerId: customer.id, ...careHealth(customer, now) }));
  const lessons: CareLesson[] = [];
  const weeklyContactedLeads = calledLeadRows.filter((customer) =>
    leadCallsInPeriod(customer).some((call) => within(parsed(call.at), start7, now)),
  );
  const weeklyTalkedLeads = weeklyContactedLeads.filter((customer) =>
    leadCallsInPeriod(customer).some((call) => within(parsed(call.at), start7, now) && call.result === 'talked'),
  );
  if (
    weeklyContactedLeads.length >= CARE_METRIC_CONFIG.lessonSample &&
    weeklyTalkedLeads.length / weeklyContactedLeads.length < 0.5
  )
    lessons.push({
      key: 'contact-rate',
      title: 'Tỉ lệ liên lạc được đang thấp',
      evidence: `${weeklyTalkedLeads.length}/${weeklyContactedLeads.length} lead đã gọi có ít nhất một cuộc nói chuyện được trong 7 ngày.`,
      action: 'Xem danh sách lead đã gọi và thử khung khác.',
      numerator: weeklyTalkedLeads.length,
      denominator: weeklyContactedLeads.length,
      customerIds: weeklyContactedLeads.map((customer) => customer.id),
    });
  const weakestSlot = [...slots]
    .filter((slot) => slot.denominator >= CARE_METRIC_CONFIG.slotSample)
    .sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0))[0];
  if (weakestSlot && weakestSlot.percent !== null && weakestSlot.percent < 50)
    lessons.push({
      key: 'slot',
      title: `Khung ${weakestSlot.name} ít kết nối`,
      evidence: `${weakestSlot.numerator}/${weakestSlot.denominator} cuộc có kết quả là nói chuyện được (ngưỡng mẫu ${CARE_METRIC_CONFIG.slotSample}).`,
      action: 'Ưu tiên thử khung có tỉ lệ nghe máy cao hơn.',
      numerator: weakestSlot.numerator,
      denominator: weakestSlot.denominator,
      customerIds: weakestSlot.customerIds,
    });
  const overduePromisesWeek = openOverdue.filter(({ due }) => due >= start7 && due <= now);
  if (overduePromisesWeek.length >= CARE_METRIC_CONFIG.lessonSample)
    lessons.push({
      key: 'promises',
      title: 'Có nhiều lời hứa quá hạn',
      evidence: `${overduePromisesWeek.length} lời hứa của mình quá hạn trong 7 ngày gần đây.`,
      action: 'Mở danh sách lời hứa quá hạn và cập nhật khách.',
      numerator: overduePromisesWeek.length,
      denominator: openOverdue.length,
      customerIds: overduePromisesWeek.map(({ customer }) => customer.id),
    });
  if (active.length >= CARE_METRIC_CONFIG.lessonSample && touchedRecent.length / active.length < 0.6)
    lessons.push({
      key: 'touch-rhythm',
      title: 'Nhiều khách đang chăm chưa được chạm gần đây',
      evidence: `${touchedRecent.length}/${active.length} khách trong phễu có lần chạm được ghi nhận trong 7 ngày.`,
      action: 'Mở nhóm khách nguội để chọn bước tiếp theo.',
      numerator: touchedRecent.length,
      denominator: active.length,
      customerIds: activeTouched
        .filter(({ at }) => at == null || at < start30 || now - at > CARE_METRIC_CONFIG.touchDays * DAY)
        .map(({ customer }) => customer.id),
    });

  const firstValid = firstCalls
    .filter(({ duration }) => duration !== null)
    .map(({ duration }) => duration as number)
    .sort((a, b) => a - b);
  const middle = Math.floor(firstValid.length / 2);
  const lower = firstValid[middle - 1];
  const upper = firstValid[middle];
  const medianMs =
    firstValid.length === 0
      ? null
      : firstValid.length % 2
        ? (upper ?? null)
        : lower != null && upper != null
          ? (lower + upper) / 2
          : null;
  const fast = firstCalls.filter(({ duration }) => duration !== null && duration < 30 * MIN);
  const firstCallCustomerIds = firstCalls.map(({ customer }) => customer.id);
  return {
    period: { start: start30, end: now, days: CARE_METRIC_CONFIG.periodDays },
    firstCall: {
      medianMs,
      fast: {
        numerator: fast.length,
        denominator: firstCalls.length,
        percent: pct(fast.length, firstCalls.length),
        customerIds: firstCallCustomerIds,
        definition:
          'Khách đăng ký trong 30 ngày; thời gian tính theo giờ làm SLA D-008. Trung vị chỉ tính khách đã có cuộc gọi hợp lệ.',
      },
      eligible: firstCalls.length,
      called: firstValid.length,
    },
    contactRate: {
      numerator: contactedLeadRows.length,
      denominator: calledLeadRows.length,
      percent: pct(contactedLeadRows.length, calledLeadRows.length),
      customerIds: calledLeadRows.map((customer) => customer.id),
      definition: 'Lead chưa đạt/loại có ít nhất một cuộc gọi trong kỳ; tử số là lead có kết quả talked.',
    },
    slots,
    coverage: {
      numerator: covered.length,
      denominator: active.length,
      percent: pct(covered.length, active.length),
      customerIds: active.map((customer) => customer.id),
      definition: 'Khách đã đạt và còn trong phễu có lịch gọi hoặc việc mở / tổng khách đủ điều kiện trong phễu.',
    },
    promises: {
      kept: {
        numerator: keptPromises.length,
        denominator: duePromises.length,
        percent: pct(keptPromises.length, duePromises.length),
        customerIds: duePromises.map(({ customer }) => customer.id),
        definition: 'Lời hứa “Em hứa” có hạn gốc trong kỳ, hoàn tất không muộn hơn hạn gốc theo D-010.',
      },
      overdue: {
        numerator: openOverdue.length,
        denominator: openPromises.length,
        percent: pct(openOverdue.length, openPromises.length),
        customerIds: openOverdue.map(({ customer }) => customer.id),
        definition: 'Lời hứa “Em hứa” đang mở, quá hạn gốc theo countdownTag/D-010 / tổng lời hứa “Em hứa” đang mở.',
      },
    },
    stages: stageGroups,
    touchRhythm: {
      numerator: touchedRecent.length,
      denominator: active.length,
      percent: pct(touchedRecent.length, active.length),
      customerIds: active.map((customer) => customer.id),
      definition: `Khách trong phễu có lần chạm trong ${CARE_METRIC_CONFIG.touchDays} ngày gần nhất / tổng khách trong phễu.`,
    },
    conversion: touchBuckets,
    health,
    lessons: lessons.slice(0, 3),
  };
}
