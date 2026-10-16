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
