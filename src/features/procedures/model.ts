import { type ProcedureGroup, proceduresContent } from './content';

export function hanoiPortIncomeMillions(generalMonthlyMillions: number): number {
  return Math.round(generalMonthlyMillions * proceduresContent.incomeMultiplier * 10) / 10;
}

export function formatMillions(value: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
}

export function documentsForGroup(code: ProcedureGroup['code']): readonly string[] {
  return code === 'K6' ? proceduresContent.groupSixDocuments : [];
}

export function sectionCopy(title: string, lines: readonly string[]): string {
  return [title, ...lines.map((line) => `• ${line}`)].join('\n');
}

export function incomeCopyLines(): string[] {
  return proceduresContent.incomeRequirements.map((item) => {
    const total = 'marriedTotal' in item && item.marriedTotal ? ' (tổng hai vợ chồng)' : '';
    return `${item.status} · ${formatMillions(item.generalMonthlyMillions)} triệu đồng/tháng · ${formatMillions(hanoiPortIncomeMillions(item.generalMonthlyMillions))} triệu${total}`;
  });
}

export function mainConditionLines(): string[] {
  const [single, singleWithChild, married] = proceduresContent.incomeRequirements;
  return [
    ...proceduresContent.mainConditionsBeforeIncome,
    `Thu nhập: độc thân < ${formatMillions(hanoiPortIncomeMillions(single.generalMonthlyMillions))} triệu; độc thân nuôi con chưa thành niên < ${formatMillions(hanoiPortIncomeMillions(singleWithChild.generalMonthlyMillions))} triệu; vợ chồng < ${formatMillions(hanoiPortIncomeMillions(married.generalMonthlyMillions))} triệu (tổng hai người).`,
    ...proceduresContent.mainConditionsAfterIncome,
  ];
}
