// @vitest-environment node
// Parity tìm kiếm: (1) phát lại golden `search` (tài liệu khách thật của fixture) bằng bản TS;
// (2) so bản TS với CRMSearch v1 (legacy/js/search.js) trên chuỗi ngẫu nhiên có seed.
import { describe, expect, it } from 'vitest';
import type { SearchScope } from '@/domain/search';
import * as S from '@/domain/search';
import { canon, golden, randomText, rng, V1Search } from './legacy';

const SCOPES: SearchScope[] = ['all', 'name', 'phone', 'unit', 'year', 'property', 'notes'];

describe('golden search', () => {
  it('cùng tập khách, điểm, fuzzy, highlight cho mọi truy vấn', () => {
    const g = golden('search');
    const docs = Object.entries(g.fields as Record<string, [string, string][]>).map(([id, f]) => ({
      id,
      doc: S.prepare(f),
    }));
    const results = (g.results as { q: string; scope: SearchScope }[]).map(({ q, scope }) => {
      const ctx = S.compile(q, scope);
      const hits = docs
        .map((x) => ({ id: x.id, m: S.match(x.doc, ctx) }))
        .filter((x) => x.m.match)
        .map((x) => ({ id: x.id, score: x.m.score, fuzzy: x.m.fuzzy, highlights: x.m.highlights }))
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      return { q, scope, phoneOnly: ctx.phoneOnly, numeric: ctx.numeric, terms: ctx.terms, hits };
    });
    expect(canon(results)).toStrictEqual(g.results);
  });
});

describe('parity TS ↔ v1 (ngẫu nhiên, seed cố định)', () => {
  it('normalize / aliases / apartmentGroup / phone / compile / range trên 3000 chuỗi', () => {
    const r = rng(1016);
    for (let i = 0; i < 3000; i++) {
      const t = randomText(r);
      const scope = SCOPES[i % SCOPES.length] as SearchScope;
      expect(S.normalize(t)).toBe(V1Search.normalize(t));
      expect(S.aliases(t)).toBe(V1Search.aliases(t));
      expect(S.apartmentGroup(t)).toBe(V1Search.apartmentGroup(t));
      expect(S.phone(t)).toBe(V1Search.phone(t));
      expect(S.compile(t, scope)).toStrictEqual(V1Search.compile(t, scope));
      const lo = r() < 0.5 ? null : Math.floor(r() * 100);
      const hi = r() < 0.5 ? null : Math.floor(r() * 100);
      expect(S.range(t, lo, hi)).toBe(V1Search.range(t, lo, hi));
    }
    for (const v of [null, undefined, 0, 12, '', ' ', 'x', NaN, '2N', 84901234567]) {
      expect(S.normalize(v)).toBe(V1Search.normalize(v));
      expect(S.phone(v)).toBe(V1Search.phone(v));
      expect(S.compile(v)).toStrictEqual(V1Search.compile(v));
      expect(S.range(v, 1, null)).toBe(V1Search.range(v, 1, null));
    }
  });

  it('oneEdit trên 5000 cặp từ', () => {
    const r = rng(7);
    const word = () => Array.from({ length: Math.floor(r() * 7) }, () => 'abcd'[Math.floor(r() * 4)]).join('');
    for (let i = 0; i < 5000; i++) {
      const a = word();
      const b = word();
      expect(S.oneEdit(a, b)).toBe(V1Search.oneEdit(a, b));
    }
  });

  it('prepare + match trên 300 tài liệu × 20 truy vấn', () => {
    const r = rng(2026);
    const LABELS = ['Tên', 'SĐT', 'Dự án', 'Loại căn', 'Mã căn', 'Ngày sinh', 'Ghi chú', 'Cuộc gọi', 'Kênh', 'Hướng'];
    const NAMES = ['Nguyễn Thị Hương', 'Trần Văn Mười', 'Lê Thu', 'Phạm Đức Anh', 'Đặng Thuỳ Linh'];
    const PHONES = ['0901234567', '+84 912 345 678', '84987654321', '0084933111222', '123'];
    for (let i = 0; i < 300; i++) {
      const fields: [string, string][] = [
        ['Tên', NAMES[i % NAMES.length] as string],
        ['SĐT', PHONES[i % PHONES.length] as string],
      ];
      const extra = Math.floor(r() * 6);
      for (let j = 0; j < extra; j++)
        fields.push([LABELS[Math.floor(r() * LABELS.length)] as string, randomText(r, 30)]);
      const tsDoc = S.prepare(fields);
      expect(tsDoc).toStrictEqual(V1Search.prepare(fields));
      for (let j = 0; j < 20; j++) {
        const pool = [
          randomText(r, 10),
          NAMES[j % NAMES.length],
          'huogn',
          'muoj',
          '0901',
          '345 678',
          '"thi huong"',
          '2pn',
        ];
        const q = pool[Math.floor(r() * pool.length)] as string;
        const scope = SCOPES[Math.floor(r() * SCOPES.length)] as SearchScope;
        expect(S.match(tsDoc, S.compile(q, scope))).toStrictEqual(V1Search.match(tsDoc, V1Search.compile(q, scope)));
      }
    }
  });

  it('highlight trên 2000 cặp văn bản × từ khoá (có cắt maxLen)', () => {
    const r = rng(99);
    for (let i = 0; i < 2000; i++) {
      const text = randomText(r, 60);
      const terms = Array.from({ length: Math.floor(r() * 3) }, () =>
        r() < 0.5 && text.length
          ? text.slice(Math.floor(r() * text.length), Math.floor(r() * text.length) + 3)
          : randomText(r, 4),
      );
      const maxLen = r() < 0.5 ? 0 : Math.floor(r() * 40);
      expect(S.highlight(text, terms, maxLen)).toBe(V1Search.highlight(text, terms, maxLen));
      expect(S.highlight(text, terms[0])).toBe(V1Search.highlight(text, terms[0]));
    }
    expect(S.highlight(null, ['a'])).toBe(V1Search.highlight(null, ['a']));
  });
});
