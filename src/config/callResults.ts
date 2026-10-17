/**
 * NGUỒN DUY NHẤT — D-005. Kết quả 1 lần gọi (mã lưu DB → nhãn) + gợi ý theo thời lượng / lớp khách.
 * Port nguyên giá trị từ legacy/js/app.js (CALL_RESULTS), legacy/js/calls.js (CALL_RESULT_SETS,
 * SHORT_CALL_SEC), legacy/js/followup.js (MISS). Mã đã dùng KHÔNG đổi nghĩa; thêm mã = thêm dòng.
 * Phần tử call_attempts: {at, result, note, duration?, origin?, device_id?, direction?}; result null = chưa ghi chú.
 */

export const CALL_RESULTS = {
  no_answer: 'Không nghe máy',
  unreachable: 'Thuê bao / tắt máy',
  line_busy: 'Máy bận',
  hung_up: 'Cúp máy',
  wrong_number: 'Sai số',
  busy: 'Bận, hẹn gọi lại',
  talked: 'Nói chuyện được',
} as const;

export type CallResult = keyof typeof CALL_RESULTS;

// Kết quả coi là "KHÔNG LIÊN LẠC ĐƯỢC" (đếm vào nhịp gọi lại). 'busy' = khách bắt máy, hẹn giờ.
export const CALL_RESULT_MISS = [
  'no_answer',
  'unreachable',
  'line_busy',
  'hung_up',
] as const satisfies readonly CallResult[];

// < N giây = cuộc ngắn; ≥ N giây = có trao đổi.
export const SHORT_CALL_SEC = 30;

// Gợi ý kết quả theo THỜI LƯỢNG (zero / short / long) + LỚP KHÁCH (chốt 2026-10-07).
export const CALL_RESULT_SETS = {
  lead: {
    zero: ['no_answer', 'unreachable', 'line_busy', 'hung_up', 'wrong_number'],
    short: ['hung_up', 'busy'],
    long: ['talked'],
  },
  qualified: {
    zero: ['no_answer', 'hung_up', 'line_busy', 'unreachable'],
    short: ['busy'],
    long: ['talked'],
  },
} as const satisfies Record<'lead' | 'qualified', Record<'zero' | 'short' | 'long', readonly CallResult[]>>;
