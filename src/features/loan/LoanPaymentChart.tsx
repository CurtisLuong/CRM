import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';
import { TextField } from '@/components/crm';
import { ChartCard } from '@/components/crm/charts';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ComputeResult } from '@/domain/loan';
import { chartPaymentAt, money } from './model';

export default function LoanPaymentChart({ result }: { result: ComputeResult }) {
  const [yearly, setYearly] = useState(false);
  const [period, setPeriod] = useState('');
  const schedule = result.schedule;
  if (!schedule) return null;
  // Dùng nguyên số tiền từng tháng / trung bình tháng của engine, không tính lại.
  const rows = yearly
    ? schedule.years.map((year) => ({ label: `Năm ${year.year}`, payment: year.avgPayment }))
    : schedule.rows.map((month) => ({ label: `Tháng ${month.k}`, payment: month.payment }));
  const selected = period === '' ? null : Number(period);
  const payment = chartPaymentAt(result, yearly, selected);
  const selectedLabel = payment == null ? undefined : `${yearly ? 'Năm' : 'Tháng'} ${selected}`;
  const changeMode = (next: boolean) => {
    if (next !== yearly) setPeriod('');
    setYearly(next);
  };
  const headline =
    payment == null
      ? `Trả cao nhất ${money(result.maxPayment)} đ/tháng`
      : yearly
        ? `Trung bình trả ${money(payment)} đ/tháng năm thứ ${selected}`
        : `Trả ${money(payment)} đ/tháng vào tháng thứ ${selected}`;
  return (
    <ChartCard
      title="Biểu đồ trả nợ"
      headline={headline}
      definition="Theo tháng: số tiền trả từng tháng. Theo năm: trung bình tiền trả mỗi tháng trong từng năm vay."
    >
      <fieldset aria-label="Biểu đồ trả nợ" className="mb-3 flex flex-wrap items-end gap-2">
        <Button variant={yearly ? 'secondary' : 'primary'} aria-pressed={!yearly} onClick={() => changeMode(false)}>
          Theo tháng
        </Button>
        <Button variant={yearly ? 'primary' : 'secondary'} aria-pressed={yearly} onClick={() => changeMode(true)}>
          Theo năm
        </Button>
        <TextField
          className="w-24 min-w-0"
          label={yearly ? 'Năm thứ' : 'Tháng thứ'}
          type="number"
          inputMode="numeric"
          min={1}
          max={rows.length}
          step={1}
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
          onBlur={() => {
            if (period !== '') setPeriod(String(Math.min(rows.length, Math.max(1, Math.round(Number(period))))));
          }}
        />
      </fieldset>
      <p className="mb-2 text-hint">
        {yearly ? 'Trung bình tháng của từng năm' : 'Số tiền trả mỗi tháng'} · đơn vị đồng
      </p>
      <ChartContainer
        role="img"
        aria-label={yearly ? 'Trả nợ trung bình tháng theo năm' : 'Trả nợ mỗi tháng'}
        config={{ payment: { label: 'Tiền trả / tháng', color: 'var(--chart-1)' } }}
      >
        <BarChart data={rows} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" minTickGap={24} />
          <YAxis width={100} tickFormatter={(value: number) => money(value)} />
          <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${money(Number(value))} đ`} />} />
          {selectedLabel && <ReferenceLine x={selectedLabel} stroke="var(--ion)" />}
          <Bar dataKey="payment" fill="var(--color-payment)" isAnimationActive={false}>
            {rows.map((row) => (
              <Cell
                key={row.label}
                fill={row.label === selectedLabel ? 'var(--ion)' : 'var(--color-payment)'}
                stroke={row.label === selectedLabel ? 'var(--ink)' : 'none'}
                strokeWidth={row.label === selectedLabel ? 2 : 0}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
