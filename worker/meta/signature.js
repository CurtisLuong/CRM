// Ký / kiểm chữ ký webhook Meta trên ĐÚNG chuỗi body gốc (không parse rồi stringify lại).
const encoder = new TextEncoder();

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signBody(raw, secret) {
  if (!secret) return '';
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(raw));
  return `sha256=${toHex(signature)}`;
}

function sameHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** So sánh thời gian cố định; sai/thiếu header hoặc thiếu secret → false. */
export async function validSignature(raw, header, secret) {
  if (!secret || !header || !header.startsWith('sha256=')) return false;
  const expected = await signBody(raw, secret);
  if (!expected) return false;
  return sameHex(expected.slice(7), header.slice(7));
}
