// Import tương đối (không dùng alias @/) để Worker Cloudflare (wrangler/esbuild) bundle được file này.
import { APT_ALIAS_BASE, APT_ALIAS_CORNER, APT_ALIAS_PLUS, APT_TYPES } from '../../config/aptTypes';

/** Chữ tự do ("2 ngủ", "2PN góc", "1_ngủ") → loại căn chuẩn APT_TYPES; không nhận ra → trả nguyên chữ. */
export function canonicalAptType(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  const norm = (input: string) => input.toLowerCase().replace(/[^a-z0-9+]/g, '');
  const exact = APT_TYPES.find((type) => norm(type) === norm(value));
  if (exact) return exact;
  const plain = value
    .replace(/_/g, ' ') // form Meta trả "1_ngủ"
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase();
  if (/studio/.test(plain)) return 'Studio';
  const match = plain.match(
    /(\d)\s*(?:p\.?\s*n|phong\s*ngu|ngu|n|br|bedrooms?|beds?)(?![a-z])\s*(\+|cong(?![a-z])|plus)?/,
  );
  if (!match) return value;
  const bedrooms = Number(match[1]);
  const plus = !!match[2];
  const corner = /goc/.test(plain) || /(^|[\s\-(])g\)?$/.test(plain.trim());
  const canonical = corner
    ? plus
      ? null
      : APT_ALIAS_CORNER[bedrooms]
    : plus
      ? APT_ALIAS_PLUS[bedrooms]
      : APT_ALIAS_BASE[bedrooms];
  if (!canonical) return value;
  const wc = plain.match(/(\d)\s*(?:wc|vs|ve\s*sinh|toilet)/);
  return wc && !canonical.includes(`${wc[1]}WC`) ? value : canonical;
}
