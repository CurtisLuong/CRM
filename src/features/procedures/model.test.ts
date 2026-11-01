import { describe, expect, it } from 'vitest';
import { proceduresContent } from './content';
import { documentsForGroup, hanoiPortIncomeMillions, incomeCopyLines, mainConditionLines, sectionCopy } from './model';

describe('procedures content', () => {
  it('calculates Hải Phòng income limits from the general amounts', () => {
    expect(
      proceduresContent.incomeRequirements.map((item) => hanoiPortIncomeMillions(item.generalMonthlyMillions)),
    ).toEqual([29, 40.6, 58]);
    expect(incomeCopyLines().join('\n')).toContain('29 triệu');
    expect(incomeCopyLines().join('\n')).toContain('40,6 triệu');
    expect(incomeCopyLines().join('\n')).toContain('58 triệu');
  });

  it('provides the complete K6 document list and no invented list for other groups', () => {
    expect(documentsForGroup('K6')).toHaveLength(11);
    expect(proceduresContent.groupSixNote).toContain('bút mực màu xanh');
    expect(documentsForGroup('K8')).toEqual([]);
  });

  it('copies the main conditions as plain text with calculated income figures', () => {
    const copy = sectionCopy('A. Ba điều kiện chính mua NOXH Hải Phòng', mainConditionLines());
    expect(copy).toContain('29 triệu');
    expect(copy).toContain('40,6 triệu');
    expect(copy).toContain('58 triệu');
  });
});
