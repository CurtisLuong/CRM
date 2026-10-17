/** Ước lượng thời gian hiển thị ở Hôm nay; không thay đổi lịch hay hạn của khách. */
export const CAPACITY_CONFIG = {
  minutes: { call: 5, zalo: 3, complete: 2, schedule: 2, classify: 3, open_profile: 2, record_call: 4 },
  maxRows: 7,
  minRows: 3,
} as const;
