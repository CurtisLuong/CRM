// Bản JS của `normalizePhoneVN` trong `src/domain/customer/phone.ts` (Worker deploy riêng bằng
// wrangler nên không import TS). Test `tests/worker` so khớp từng số với bản TS — sửa bên này
// thì phải sửa bên kia.
export function normalizePhoneVN(raw) {
  let p = String(raw || '').replace(/[^\d+]/g, ''); // giữ chữ số và dấu +
  if (p.startsWith('+84')) p = `0${p.slice(3)}`;
  p = p.replace(/\D/g, ''); // bỏ nốt dấu + còn sót
  // SĐT VN dạng mã quốc gia thiếu dấu "+": "84" + 9 số = 11 chữ số → đổi "84" thành "0".
  if (p.startsWith('84') && p.length === 11) p = `0${p.slice(2)}`;
  // Thiếu số 0 đầu (vd "912345678") → thêm vào. Số nước ngoài/khác không khớp → giữ nguyên.
  if (!p.startsWith('0') && p.length < 10) p = `0${p}`;
  return p;
}
