export type ProcedureGroup = {
  code: `K${number}`;
  name: string;
};

export type IncomeRequirement = {
  status: string;
  generalMonthlyMillions: number;
  marriedTotal?: boolean;
};

export const proceduresContent = {
  mainConditionsBeforeIncome: [
    'Chưa sở hữu bất động sản tại Hải Phòng, hoặc có nhưng diện tích bình quân < 15 m²/người.',
  ],
  mainConditionsAfterIncome: ['Chưa từng mua, thuê mua nhà ở xã hội.'],
  groups: [
    { code: 'K1', name: 'Người có công với cách mạng, thân nhân liệt sĩ' },
    { code: 'K2', name: 'Hộ nghèo, cận nghèo tại nông thôn' },
    {
      code: 'K3',
      name: 'Hộ nghèo, cận nghèo ở nông thôn thuộc vùng thường xuyên chịu ảnh hưởng thiên tai, biến đổi khí hậu',
    },
    { code: 'K4', name: 'Hộ nghèo, cận nghèo tại đô thị' },
    { code: 'K5', name: 'Người thu nhập thấp tại đô thị' },
    { code: 'K6', name: 'Công nhân, người lao động tại doanh nghiệp, hợp tác xã, liên hiệp hợp tác xã' },
    { code: 'K7', name: 'Sĩ quan, quân nhân chuyên nghiệp và các đối tượng thuộc lực lượng vũ trang theo quy định' },
    { code: 'K8', name: 'Cán bộ, công chức, viên chức' },
    { code: 'K9', name: 'Người đã trả lại nhà ở công vụ, trừ trường hợp bị thu hồi do vi phạm' },
    { code: 'K10', name: 'Người bị thu hồi đất, phải giải toả nhà ở mà chưa được bồi thường bằng nhà hoặc đất ở' },
  ] satisfies ProcedureGroup[],
  groupSixDocuments: [
    'Mẫu số 01 – Đơn đăng kí mua: 03 bản gốc',
    'Mẫu số 01a – Chứng minh đối tượng, thu nhập: 01 gốc, 02 công chứng',
    'Bảng lương 12 tháng gần nhất: 01 gốc, 02 công chứng',
    'Mẫu số 02 – Xác nhận điều kiện nhà ở: 01 gốc, 02 công chứng',
    'CCCD: 03 công chứng',
    'Mẫu CT07 – Xác nhận cư trú: 01 gốc, 02 công chứng',
    'Giấy đăng kí kết hôn: 03 công chứng / hoặc giấy xác nhận độc thân: 01 gốc, 02 công chứng',
    'Phiếu tiếp nhận hồ sơ: 03 bản gốc',
    'Phiếu đăng kí nguyện vọng: 03 bản gốc',
    'Văn bản thoả thuận: 03 bản gốc',
    'Bản cam kết: 03 bản gốc',
  ],
  groupSixNote: 'Kí bằng bút mực màu xanh, chữ kí giống chữ kí trong giấy đăng kí kết hôn (nếu đã kết hôn).',
  housingConditions: [
    {
      status: 'Chưa có nhà',
      condition: 'Người đăng kí và vợ/chồng (nếu có) không có nhà ở thuộc sở hữu tại tỉnh/thành phố nơi có dự án NOXH',
    },
    { status: 'Đã có nhà', condition: 'Diện tích nhà ở bình quân dưới 15 m² sàn/người' },
  ],
  incomeMultiplier: 1.16,
  incomeRequirements: [
    { status: 'Độc thân', generalMonthlyMillions: 25 },
    { status: 'Độc thân nuôi con chưa thành niên', generalMonthlyMillions: 35 },
    { status: 'Đã kết hôn', generalMonthlyMillions: 50, marriedTotal: true },
  ] satisfies readonly [IncomeRequirement, IncomeRequirement, IncomeRequirement],
} as const;
