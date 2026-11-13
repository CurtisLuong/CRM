/**
 * NGUỒN DUY NHẤT — 10 ngân hàng hiện ở thẻ "Lãi vay mua nhà" (Curtis 12/11/2026, thứ tự Curtis đưa).
 * Mã (`code`) là khoá lưu ở bảng bank_rates (SQL/v2/016) và Worker (worker/bank-rates*.js): KHÔNG đổi mã đã lưu.
 * `big4`: tính lãi trung bình hiện ngoài thẻ.
 */
export const BANKS = [
  { code: 'bidv', name: 'BIDV', fullName: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam', big4: true },
  { code: 'vietinbank', name: 'VietinBank', fullName: 'Ngân hàng TMCP Công Thương Việt Nam', big4: true },
  {
    code: 'agribank',
    name: 'Agribank',
    fullName: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam',
    big4: true,
  },
  { code: 'vietcombank', name: 'Vietcombank', fullName: 'Ngân hàng TMCP Ngoại thương Việt Nam', big4: true },
  { code: 'mb', name: 'MB', fullName: 'Ngân hàng TMCP Quân đội', big4: false },
  { code: 'techcombank', name: 'Techcombank', fullName: 'Ngân hàng TMCP Kỹ Thương Việt Nam', big4: false },
  { code: 'vpbank', name: 'VPBank', fullName: 'Ngân hàng TMCP Việt Nam Thịnh Vượng', big4: false },
  { code: 'hdbank', name: 'HDBank', fullName: 'Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh', big4: false },
  { code: 'acb', name: 'ACB', fullName: 'Ngân hàng TMCP Á Châu', big4: false },
  { code: 'sacombank', name: 'Sacombank', fullName: 'Ngân hàng TMCP Sài Gòn Thương Tín', big4: false },
] as const;

export type BankCode = (typeof BANKS)[number]['code'];

/** Kiểm số hợp lý trước khi hiện (số ngoài khoảng coi như không có). Đơn vị %/năm. */
export const BANK_RATE_LIMITS = { min: 3, max: 20 } as const;

/** Lãi gửi tiết kiệm 12 tháng hợp lệ (%/năm); ngoài khoảng coi như không có. */
export const DEPOSIT_RATE_LIMITS = { min: 1, max: 12 } as const;
