import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Customer } from '@/domain/customer';
import { CARE_METRIC_CONFIG, careHealth, fullCareMetrics } from '@/domain/metrics/care';
import { Button, HealthDot, MetricTile } from '@/ui';

const fmt = (n: number) => n.toLocaleString('vi-VN');
const percent = (n: number | null) => (n == null ? null : `${n}%`);
const duration = (ms: number | null) => {
  if (ms == null) return null;
  const mins = Math.round(ms / 60_000);
  return mins < 60 ? `${mins} phút` : `${Math.floor(mins / 60)} giờ ${mins % 60} phút`;
};
const ratio = (n: number, d: number) => `${fmt(n)}/${fmt(d)}`;

export function CareSection({ customers, now }: { customers: readonly Customer[]; now: number }) {
  const navigate = useNavigate();
  const metrics = useMemo(() => fullCareMetrics(customers, now), [customers, now]);
  const [selected, setSelected] = useState<{ title: string; ids: string[] } | null>(null);
  const rowsById = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const pick = (title: string, ids: string[]) => setSelected({ title, ids: [...new Set(ids)] });
  const tile = (
    title: string,
    value: string | null,
    n: number,
    d: number,
    definition: string,
    ids: string[],
    period = '30 ngày gần nhất',
    unit = 'mẫu',
  ) => (
    <article key={title} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-e1">
      <MetricTile
        label={title}
        value={value}
        ratio={`${ratio(n, d)} ${unit}`}
        period={period}
        smallSample={d > 0 && d < 5 ? `Mẫu nhỏ: n=${d}` : undefined}
      />
      <p className="text-small text-text-2">{definition}</p>
      <Button className="self-start" variant="secondary" onClick={() => pick(title, ids)}>
        Xem {fmt(ids.length)} khách
      </Button>
    </article>
  );

  return (
    <section aria-labelledby="care-title" className="flex flex-col gap-4">
      <div>
        <h2 id="care-title" className="text-heading">
          Chăm sóc khách
        </h2>
        <p className="text-small text-text-2">
          Kỳ 30 ngày · lead đăng ký trong kỳ · nhịp chạm 7 ngày · chuyển đổi theo cohort đăng ký 90 ngày. Số liệu từ hồ
          sơ cục bộ, gồm dữ liệu chờ đồng bộ.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-e1">
          <MetricTile
            label="Tốc độ gọi lần đầu · trung vị"
            value={duration(metrics.firstCall.medianMs)}
            ratio={`${fmt(metrics.firstCall.called)}/${fmt(metrics.firstCall.eligible)} lead có cuộc gọi hợp lệ`}
            period="30 ngày · đăng ký → cuộc gọi đầu · giờ làm SLA"
            smallSample={
              metrics.firstCall.eligible > 0 && metrics.firstCall.eligible < CARE_METRIC_CONFIG.lessonSample
                ? `Mẫu nhỏ: n=${metrics.firstCall.eligible}`
                : undefined
            }
          />
          <p className="text-small text-text-2">Trung vị chỉ tính lead đã gọi; SLA tính trong giờ làm 06:00–22:00.</p>
          <Button
            className="self-start"
            variant="secondary"
            onClick={() => pick('Lead đăng ký trong kỳ', metrics.firstCall.fast.customerIds)}
          >
            Xem {fmt(metrics.firstCall.fast.customerIds.length)} khách
          </Button>
        </article>
        {tile(
          'Gọi dưới 30 phút',
          percent(metrics.firstCall.fast.percent),
          metrics.firstCall.fast.numerator,
          metrics.firstCall.fast.denominator,
          metrics.firstCall.fast.definition,
          metrics.firstCall.fast.customerIds,
          '30 ngày gần nhất',
          'lead',
        )}
        {tile(
          'Tỉ lệ liên lạc được',
          percent(metrics.contactRate.percent),
          metrics.contactRate.numerator,
          metrics.contactRate.denominator,
          metrics.contactRate.definition,
          metrics.contactRate.customerIds,
          '30 ngày gần nhất',
          'lead',
        )}
        <article className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-e1 sm:col-span-2 lg:col-span-3">
          <h3 className="text-body-strong">Nghe máy theo khung</h3>
          <p className="text-small text-text-2">
            Cuộc có kết quả Nói chuyện được / mọi cuộc có kết quả trong khung; cửa sổ 30 ngày. Cỡ mẫu nhỏ hơn{' '}
            {CARE_METRIC_CONFIG.slotSample} vẫn hiển thị nhưng không dùng làm bài học.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.slots.map((slot) => (
              <div key={slot.key} className="rounded-control border border-border p-3">
                <p className="text-label">{slot.name}</p>
                <p className="font-data text-heading">{slot.percent == null ? '—' : `${slot.percent}%`}</p>
                <p className="text-small text-text-2">{ratio(slot.numerator, slot.denominator)} cuộc có kết quả</p>
                <Button
                  className="mt-2"
                  variant="secondary"
                  onClick={() => pick(`Khung ${slot.name}`, slot.customerIds)}
                >
                  Xem khách
                </Button>
              </div>
            ))}
          </div>
        </article>
        {tile(
          'Phủ bước tiếp theo',
          percent(metrics.coverage.percent),
          metrics.coverage.numerator,
          metrics.coverage.denominator,
          metrics.coverage.definition,
          metrics.coverage.customerIds,
          'Tình trạng hiện tại',
          'khách',
        )}
        {tile(
          'Giữ lời hứa “Em hứa”',
          percent(metrics.promises.kept.percent),
          metrics.promises.kept.numerator,
          metrics.promises.kept.denominator,
          metrics.promises.kept.definition,
          metrics.promises.kept.customerIds,
          'Hạn gốc đến hạn trong 30 ngày',
          'lời hứa',
        )}
        {tile(
          'Lời hứa đang quá hạn',
          metrics.promises.overdue.denominator ? `${fmt(metrics.promises.overdue.numerator)} việc` : null,
          metrics.promises.overdue.numerator,
          metrics.promises.overdue.denominator,
          metrics.promises.overdue.definition,
          metrics.promises.overdue.customerIds,
          'Đang mở · hiện tại',
          'lời hứa',
        )}

        <article className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-e1 sm:col-span-2 lg:col-span-3">
          <h3 className="text-body-strong">Tuổi bậc so với SLA</h3>
          <p className="text-small text-text-2">
            Số khách trong từng bậc; trạng thái so với mục tiêu/hạn mức của bậc. Nhấn để xem khách ở bậc.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {metrics.stages.map((stage) => (
              <button
                key={stage.key}
                type="button"
                className="rounded-control border border-border p-3 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
                onClick={() => pick(stage.label, stage.customerIds)}
              >
                <span className="block text-label">{stage.label}</span>
                <span className="block font-data text-heading">{stage.total} khách</span>
                <span className="block text-small text-text-2">
                  {stage.targetExceeded} quá mục tiêu · {stage.limitExceeded} quá hạn mức
                </span>
                <span className="block text-xs text-text-3">{stage.definition}</span>
              </button>
            ))}
          </div>
        </article>
        {tile(
          'Nhịp chạm 7 ngày',
          percent(metrics.touchRhythm.percent),
          metrics.touchRhythm.numerator,
          metrics.touchRhythm.denominator,
          metrics.touchRhythm.definition,
          metrics.touchRhythm.customerIds,
          '7 ngày gần nhất',
          'khách',
        )}
        <article className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 shadow-e1 sm:col-span-2 lg:col-span-2">
          <h3 className="text-body-strong">Chuyển đổi theo số lần chạm</h3>
          <p className="text-small text-text-2">
            Cohort đăng ký 90 ngày; lần chạm là cuộc gọi hoặc tương tác Zalo/SMS/gặp/xem dự án trước khi đạt. Tử số là
            khách đã có `qualified_at`.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {metrics.conversion.map((bucket) => (
              <button
                key={bucket.key}
                type="button"
                className="rounded-control border border-border p-2 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
                onClick={() => pick(`${bucket.label} chạm`, bucket.customerIds)}
              >
                <span className="block text-label">{bucket.label}</span>
                <span className="block font-data text-body-strong">
                  {bucket.percent == null ? '—' : `${bucket.percent}%`}
                </span>
                <span className="block text-small text-text-2">
                  {ratio(bucket.numerator, bucket.denominator)} khách · 90 ngày
                </span>
              </button>
            ))}
          </div>
        </article>
      </div>

      <section
        aria-labelledby="care-lessons-title"
        className="rounded-card border border-border bg-surface p-4 shadow-e1"
      >
        <h3 id="care-lessons-title" className="text-body-strong">
          Bài học tuần
        </h3>
        <p className="text-small text-text-2">
          Rule cố định, tối đa 3 bài; chỉ hiện khi đạt ngưỡng mẫu (5 lead/khách, 10 cuộc theo khung).
        </p>
        {metrics.lessons.length ? (
          <ul className="mt-2 divide-y divide-border">
            {metrics.lessons.map((lesson) => (
              <li key={lesson.key} className="py-3 first:pt-0 last:pb-0">
                <p className="text-body-strong">{lesson.title}</p>
                <p className="text-small text-text-2">{lesson.evidence}</p>
                <p className="text-small">{lesson.action}</p>
                <Button className="mt-2" variant="secondary" onClick={() => pick(lesson.title, lesson.customerIds)}>
                  Xem {fmt(lesson.customerIds.length)} khách
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-small text-text-3">Chưa có bài học đạt ngưỡng mẫu trong tuần này.</p>
        )}
      </section>

      <section aria-labelledby="health-title" className="rounded-card border border-border bg-surface p-4 shadow-e1">
        <h3 id="health-title" className="text-body-strong">
          Sức khoẻ chăm sóc từng khách
        </h3>
        <p className="text-small text-text-2">
          Nguy cơ: lời hứa quá hạn hoặc SLA quá hạn mức · Đang trễ: chạm quá 7 ngày hoặc SLA quá mục tiêu · Đúng nhịp:
          có chạm trong 7 ngày, không có cảnh báo · Chưa đủ dữ liệu: chưa có lịch sử.
        </p>
        <Button
          className="mt-2"
          variant="secondary"
          onClick={() =>
            pick(
              'Sức khoẻ từng khách',
              metrics.health.map((item) => item.customerId),
            )
          }
        >
          Xem {fmt(metrics.health.length)} khách
        </Button>
      </section>

      {selected && (
        <section
          aria-labelledby="care-drilldown-title"
          className="rounded-card border border-border bg-surface p-4 shadow-e1"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="care-drilldown-title" className="text-body-strong">
                {selected.title}
              </h3>
              <p className="text-small text-text-2">{fmt(selected.ids.length)} khách · mở hồ sơ để xử lý</p>
            </div>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Đóng danh sách
            </Button>
          </div>
          {selected.ids.length ? (
            <ul className="mt-3 divide-y divide-border">
              {selected.ids.map((id) => {
                const customer = rowsById.get(id);
                if (!customer) return null;
                const status = careHealth(customer, now);
                return (
                  <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-body-strong">{customer.full_name}</p>
                      <p className="text-small text-text-2">
                        {customer.care_stage || 'Chưa rõ bậc'} · {status.reason}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span title={status.reason}>
                        <HealthDot health={status.health} showText />
                      </span>
                      <Button onClick={() => navigate(`/ho-so/${customer.id}`)}>Mở hồ sơ</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-small text-text-3">Chưa có khách trong nhóm này.</p>
          )}
        </section>
      )}
    </section>
  );
}
