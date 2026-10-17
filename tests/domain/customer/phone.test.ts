// @vitest-environment node
// SĐT: phát lại golden `phone` + so với normalizePhone / phoneDigits / normalizePhoneVN nguyên văn từ legacy/js/app.js.
import { describe, expect, it } from 'vitest';
import { normalizePhone, normalizePhoneVN, phoneDigits } from '@/domain/customer/phone';
import { phone as searchPhone } from '@/domain/search';
import { golden, randomText, rng, v1AppFunction } from '../search/legacy';

const V1 = {
  normalizePhone: v1AppFunction('normalizePhone'),
  phoneDigits: v1AppFunction('phoneDigits'),
  normalizePhoneVN: v1AppFunction('normalizePhoneVN'),
};

it('golden phone', () => {
  const g = golden('phone') as Record<string, unknown>;
  const inputs = [
    '0900000001',
    '0900 000 001',
    '090.000.0001',
    '+84 900 000 017',
    '+84900000017',
    '84900000017',
    '0084900000017',
    '900000001',
    '84 90 000 0017',
    '(+84) 90-000-0017',
    '02253 123 456',
    '+1 415 555 0100',
    '123',
    '',
    null,
    ' 0 9 0 0 0 0 0 0 0 1 ',
  ];
  const out = Object.fromEntries(
    inputs.map((p) => [
      String(p),
      {
        normalizePhone: normalizePhone(p),
        normalizePhoneVN: normalizePhoneVN(p),
        phoneDigits: phoneDigits(p),
        searchPhone: searchPhone(p),
      },
    ]),
  );
  expect(out).toStrictEqual(g);
});

describe('parity TS ↔ v1', () => {
  it('3000 chuỗi ngẫu nhiên + ca biên', () => {
    const r = rng(84);
    const inputs: (string | null | undefined)[] = [
      null,
      undefined,
      '',
      '+',
      '84',
      '+84',
      '0084',
      '8412345678',
      '84123456789',
    ];
    for (let i = 0; i < 3000; i++) inputs.push(randomText(r, 18));
    for (const p of inputs) {
      expect(normalizePhone(p)).toBe(V1.normalizePhone(p));
      expect(phoneDigits(p)).toBe(V1.phoneDigits(p));
      expect(normalizePhoneVN(p)).toBe(V1.normalizePhoneVN(p));
    }
  });
});
