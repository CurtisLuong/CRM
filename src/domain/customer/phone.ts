/**
 * Chuẩn hoá số điện thoại — port 1:1 từ legacy/js/app.js (normalizePhone, phoneDigits, normalizePhoneVN).
 * Tìm kiếm dùng `phone` riêng trong `@/domain/search` (giống CRMSearch.phone của v1).
 */

/** Cho link `tel:` — chỉ giữ chữ số và dấu +. */
export function normalizePhone(p: string | null | undefined): string {
  return (p || '').replace(/[^\d+]/g, '');
}

/**
 * Chỉ chữ số; đưa 84… (11+ chữ số) về 0… để khớp thói quen gõ số bắt đầu bằng 0
 * ("+84901234567" và "84901234567" → "0901234567"). Không đụng số nội địa.
 */
export function phoneDigits(p: string | null | undefined): string {
  let d = (p || '').replace(/\D/g, '');
  if (d.startsWith('84') && d.length >= 11) d = `0${d.slice(2)}`;
  return d;
}

/**
 * Chuẩn hoá SĐT (master key) — dùng CHUNG cho OCR lẫn mọi lần lưu khách:
 *  - Bỏ dấu cách/chấm/gạch ("0123 456 789" → "0123456789").
 *  - "+84..." hoặc "84..."(11 số) → "0...".  - Thiếu "0" đầu → thêm.
 *  - Giá trị cuối KHÔNG có dấu cách. Số nước ngoài/khác không khớp → giữ nguyên.
 */
export function normalizePhoneVN(raw: unknown): string {
  let p = String(raw || '').replace(/[^\d+]/g, ''); // giữ chữ số và dấu +
  if (p.startsWith('+84')) p = `0${p.slice(3)}`;
  p = p.replace(/\D/g, ''); // bỏ nốt dấu + còn sót
  // SĐT VN dạng mã quốc gia thiếu dấu "+": "84" + 9 số = 11 chữ số → đổi "84" thành "0".
  if (p.startsWith('84') && p.length === 11) p = `0${p.slice(2)}`;
  // Thiếu số 0 đầu (vd "912345678") → thêm vào. Số nước ngoài/khác không khớp → giữ nguyên.
  if (!p.startsWith('0') && p.length < 10) p = `0${p}`;
  return p;
}
