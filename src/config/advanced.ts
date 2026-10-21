/**
 * NGUỒN DUY NHẤT — D-012 (key JSONB đã lưu không đổi). Hồ sơ "Nâng cao" (cột JSONB customers.advanced):
 * dùng chung cho dựng form, lưu và hiển thị. Port nguyên giá trị từ legacy/js/app.js (ADVANCED_GROUPS).
 * type: 'textarea' | 'text' | 'number' (number = VNĐ).
 */

export type AdvancedField = { key: string; label: string; type: 'textarea' | 'text' | 'number'; ph: string };
export type AdvancedGroup = { title: string; fields: readonly AdvancedField[] };

export const ADVANCED_GROUPS: readonly AdvancedGroup[] = [
  {
    title: 'Bối cảnh sống',
    fields: [
      {
        key: 'life_stage',
        label: 'Giai đoạn cuộc sống',
        type: 'textarea',
        ph: 'Độc thân, mới cưới, gia đình có con nhỏ, chăm cha mẹ, chuẩn bị về hưu...',
      },
      { key: 'household', label: 'Hộ gia đình', type: 'textarea', ph: 'Số người ở cùng, số con/người phụ thuộc...' },
      {
        key: 'housing_status',
        label: 'Tình trạng nhà ở',
        type: 'textarea',
        ph: 'Chưa có nhà, nhà thuê, nhà chật, thiếu chỗ đậu xe...',
      },
      {
        key: 'pain_points',
        label: 'Nỗi đau hiện tại',
        type: 'textarea',
        ph: 'Tiền thuê tăng, nhà chật, đi làm xa, tiền rảnh muốn đầu tư...',
      },
      {
        key: 'mobility',
        label: 'Thói quen di chuyển',
        type: 'textarea',
        ph: 'Ô tô, thời gian đi lại chấp nhận được...',
      },
      {
        key: 'decision_influencers',
        label: 'Người ảnh hưởng quyết định',
        type: 'textarea',
        ph: 'Vợ/chồng, cha mẹ, anh chị em, người đồng sở hữu...',
      },
      {
        key: 'timeline_events',
        label: 'Mốc thời gian',
        type: 'textarea',
        ph: 'Sinh nhật, hết hợp đồng thuê, chuyển việc, con vào năm học mới...',
      },
    ],
  },
  {
    title: 'Sở thích bất động sản',
    fields: [
      {
        key: 'pref_area',
        label: 'Khu vực quan tâm',
        type: 'text',
        ph: 'Trung tâm, Thuỷ Nguyên, gần khu công nghiệp...',
      },
      { key: 'pref_product', label: 'Loại sản phẩm', type: 'text', ph: 'Shophouse, liền kề, căn hộ cao tầng...' },
      {
        key: 'must_have',
        label: 'Tiêu chí bắt buộc',
        type: 'text',
        ph: 'Gần nơi làm, trường học, bệnh viện, pháp lý rõ, có thang máy...',
      },
      {
        key: 'deal_breakers',
        label: 'Điều không chấp nhận',
        type: 'text',
        ph: 'Xa hơn X phút, giá vượt ngưỡng, tầng quá cao/thấp, gần KCN...',
      },
    ],
  },
  {
    title: 'Năng lực tài chính',
    fields: [
      { key: 'asset_value', label: 'Giá trị tài sản', type: 'number', ph: 'VNĐ' },
      { key: 'capital', label: 'Vốn', type: 'number', ph: 'VNĐ' },
      { key: 'loan_need', label: 'Nhu cầu vay', type: 'number', ph: 'VNĐ' },
      { key: 'monthly_payment', label: 'Khoản trả hàng tháng chấp nhận', type: 'number', ph: 'VNĐ' },
      {
        key: 'financial_barriers',
        label: 'Rào cản tài chính',
        type: 'text',
        ph: 'Nợ xấu, thiếu thanh khoản, thiếu vốn đối ứng, lo lãi suất, thu nhập khó chứng minh...',
      },
    ],
  },
];

export const ADVANCED_FIELDS: readonly AdvancedField[] = ADVANCED_GROUPS.flatMap((g) => g.fields);

// ── PF-01 (2026-10-21): hồ sơ gọn. KHÔNG đổi ADVANCED_GROUPS/ADVANCED_FIELDS ở trên —
// form nhập khách và test config vẫn dùng nguyên. Các export dưới đây là nguồn duy nhất
// cho khoá + nhãn mới của khu "Nâng cao" và phần "Sở thích bất động sản".

/** Khoá cũ → nhãn cũ (giữ nguyên chữ) để hiện ghi cũ chỉ đọc. */
export type AdvancedLegacy = { key: string; label: string };

/** Ô gộp "Bối cảnh sống": một ô nhiều dòng, ghi đè bằng khoá mới life_context. */
export const PROFILE_LIFE_CONTEXT: AdvancedField = {
  key: 'life_context',
  label: 'Bối cảnh sống',
  type: 'textarea',
  ph: '- Mới cưới, ở nhà thuê…\n- Nhà chật, muốn gần trường học cho con',
};

/** Ô gộp "Điều kiện" của Sở thích BĐS: khoá mới pref_conditions. */
export const PROFILE_PREF_CONDITIONS: AdvancedField = {
  key: 'pref_conditions',
  label: 'Điều kiện',
  type: 'textarea',
  ph: 'Cần có… / Không chấp nhận…',
};

/** Tài sản trong "Nâng cao": đúng 3 ô nhập (VNĐ). */
export const PROFILE_ASSET_FIELDS: readonly AdvancedField[] = [
  { key: 'asset_value', label: 'Giá trị tài sản', type: 'number', ph: 'VNĐ' },
  { key: 'capital', label: 'Vốn hiện có', type: 'number', ph: 'VNĐ' },
  { key: 'loan_need', label: 'Nhu cầu vay', type: 'number', ph: 'VNĐ' },
];

/** "Sở thích bất động sản" (tab Nhu cầu & căn): đúng 3 ô. */
export const PROFILE_PREF_FIELDS: readonly AdvancedField[] = [
  { key: 'pref_area', label: 'Khu vực', type: 'text', ph: 'Trung tâm, Thuỷ Nguyên, gần khu công nghiệp…' },
  { key: 'pref_product', label: 'Loại sản phẩm', type: 'text', ph: 'Shophouse, liền kề, căn hộ cao tầng…' },
  PROFILE_PREF_CONDITIONS,
];

/** Ghi cũ được gộp vào "Bối cảnh sống" (D-012: vẫn nằm nguyên trong advanced). */
export const LIFE_CONTEXT_LEGACY: readonly AdvancedLegacy[] = [
  { key: 'life_stage', label: 'Giai đoạn cuộc sống' },
  { key: 'household', label: 'Hộ gia đình' },
  { key: 'housing_status', label: 'Tình trạng nhà ở' },
  { key: 'pain_points', label: 'Nỗi đau hiện tại' },
  { key: 'mobility', label: 'Thói quen di chuyển' },
  { key: 'decision_influencers', label: 'Người ảnh hưởng quyết định' },
  { key: 'timeline_events', label: 'Mốc thời gian' },
];

/** Ghi cũ được gộp vào "Điều kiện". */
export const PREF_CONDITIONS_LEGACY: readonly AdvancedLegacy[] = [
  { key: 'must_have', label: 'Tiêu chí bắt buộc' },
  { key: 'deal_breakers', label: 'Điều không chấp nhận' },
];

/** Tài sản: ghi cũ chỉ đọc, không còn ô nhập. */
export const ASSET_LEGACY: readonly AdvancedLegacy[] = [
  { key: 'monthly_payment', label: 'Khoản trả hàng tháng chấp nhận' },
  { key: 'financial_barriers', label: 'Rào cản tài chính' },
];

/** Mọi khoá advanced đã có cấu hình → phần "trường cũ khác" chỉ còn khoá lạ. */
export const PROFILE_ADVANCED_KEYS: readonly string[] = [
  ...ADVANCED_FIELDS.map((field) => field.key),
  PROFILE_LIFE_CONTEXT.key,
  PROFILE_PREF_CONDITIONS.key,
];
