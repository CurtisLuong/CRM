import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/crm/charts';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ComputeResult } from '@/domain/loan';
import { money } from './model';

export default function LoanPaymentChart({ result }: { result: ComputeResult }) {
  const [yearly, setYearly] = useState(false);
  const schedule = result.schedule;
  if (!schedule) return null;
  // Dùng nguyên số tiền từng tháng / trung bình tháng của engine, không tính lại.
  const rows = yearly
    ? schedule.years.map((year) => ({ label: `Năm ${year.year}`, payment: year.avgPayment }))
    : schedule.rows.map((month) => ({ label: `Tháng ${month.k}`, payment: month.payment }));
  return (
    <ChartCard
      title="Biểu đồ trả nợ"
      headline={`Trả cao nhất ${money(result.maxPayment)} đ/tháng`}
      definition="Theo tháng: số tiền trả từng tháng. Theo năm: trung bình tiền trả mỗi tháng trong từng năm vay."
    >
      <fieldset aria-label="Biểu đồ trả nợ" className="mb-3 flex gap-2">
        <Button variant={yearly ? 'secondary' : 'primary'} aria-pressed={!yearly} onClick={() => setYearly(false)}>
          Theo tháng
        </Button>
        <Button variant={yearly ? 'primary' : 'secondary'} aria-pressed={yearly} onClick={() => setYearly(true)}>
          Theo năm
        </Button>
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
          <YAxis width={44} tickFormatter={(value: number) => `${(value / 1_000_000).toLocaleString('vi-VN')}tr`} />
          <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${money(Number(value))} đ`} />} />
          <Bar dataKey="payment" fill="var(--color-payment)" isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
