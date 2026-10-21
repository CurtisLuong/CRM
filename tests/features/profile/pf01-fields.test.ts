import { describe, expect, it } from 'vitest';
import {
  ASSET_LEGACY,
  LIFE_CONTEXT_LEGACY,
  PREF_CONDITIONS_LEGACY,
  PROFILE_ASSET_FIELDS,
  PROFILE_PREF_FIELDS,
} from '@/config/advanced';
import { advancedPatch, legacyDraft, legacyValues, showLegacy } from '@/features/profile/fields';

describe('PF-01 — ghi cũ của ô gộp', () => {
  const advanced = { life_stage: 'Mới cưới', pain_points: 'Nhà thuê chật', x_old: 1 };

  it('số chuẩn luật 4: 2 dòng đúng thứ tự, bỏ khoá rỗng, giữ mọi khoá khi patch', () => {
    const rows = legacyValues(advanced, LIFE_CONTEXT_LEGACY);
    expect(rows).toEqual([
      { key: 'life_stage', label: 'Giai đoạn cuộc sống', value: 'Mới cưới' },
      { key: 'pain_points', label: 'Nỗi đau hiện tại', value: 'Nhà thuê chật' },
    ]);
    const draft = legacyDraft(rows);
    expect(draft).toBe('- Giai đoạn cuộc sống: Mới cưới\n- Nỗi đau hiện tại: Nhà thuê chật');
    expect(advancedPatch(advanced, 'life_context', draft)).toEqual({
      advanced: {
        life_stage: 'Mới cưới',
        pain_points: 'Nhà thuê chật',
        x_old: 1,
        life_context: '- Giai đoạn cuộc sống: Mới cưới\n- Nỗi đau hiện tại: Nhà thuê chật',
      },
    });
  });

  it('ô gộp có chữ → không còn khối ghi cũ; ô trống + có ghi cũ → hiện', () => {
    const rows = legacyValues(advanced, LIFE_CONTEXT_LEGACY);
    expect(showLegacy(rows, '')).toBe(true);
    expect(showLegacy(rows, '  \n ')).toBe(true);
    expect(showLegacy(rows, '- Mới cưới')).toBe(false);
    expect(showLegacy([], '')).toBe(false);
  });

  it('Điều kiện: chỉ đọc must_have/deal_breakers, giữ khoá lạ khi patch', () => {
    const a = { must_have: 'Gần trường học', deal_breakers: '', pref_area: 'Thuỷ Nguyên', x_keep: { a: 1 } };
    const draft = legacyDraft(legacyValues(a, PREF_CONDITIONS_LEGACY));
    expect(draft).toBe('- Tiêu chí bắt buộc: Gần trường học');
    expect(advancedPatch(a, 'pref_conditions', draft).advanced).toEqual({
      must_have: 'Gần trường học',
      deal_breakers: '',
      pref_area: 'Thuỷ Nguyên',
      x_keep: { a: 1 },
      pref_conditions: '- Tiêu chí bắt buộc: Gần trường học',
    });
  });

  it('Tài sản đúng 3 ô nhập, ghi cũ tài chính chỉ đọc', () => {
    expect(PROFILE_ASSET_FIELDS.map((field) => field.key)).toEqual(['asset_value', 'capital', 'loan_need']);
    expect(ASSET_LEGACY.map((row) => row.key)).toEqual(['monthly_payment', 'financial_barriers']);
    expect(legacyValues({ monthly_payment: 8_000_000 }, ASSET_LEGACY)).toEqual([
      { key: 'monthly_payment', label: 'Khoản trả hàng tháng chấp nhận', value: '8000000' },
    ]);
  });

  it('Sở thích BĐS đúng 3 ô, khoá mới pref_conditions', () => {
    expect(PROFILE_PREF_FIELDS.map((field) => field.key)).toEqual(['pref_area', 'pref_product', 'pref_conditions']);
  });

  it('cột advanced chưa có → patch chỉ chứa khoá vừa sửa', () => {
    expect(advancedPatch(undefined, 'pref_area', 'Trung tâm')).toEqual({ advanced: { pref_area: 'Trung tâm' } });
  });
});
