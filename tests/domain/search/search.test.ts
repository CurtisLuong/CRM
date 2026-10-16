// @vitest-environment node
// Port phần tìm kiếm của tests/search.test.js (v1) sang Vitest, chạy trên bản TS.
import { describe, expect, it } from 'vitest';
import { apartmentGroup, compile, highlight, match, prepare, range, type SearchScope } from '@/domain/search';

const doc = prepare([
  ['Tên', 'Nguyễn Thị Hương'],
  ['SĐT', '0901234567'],
  ['Dự án', 'Marquee Homes'],
  ['Loại căn', '2N-2WC'],
  ['Mã căn', '1208'],
  ['Ngày sinh', '12/05/1990'],
  ['Diện tích', '53,6 m²'],
  ['Giá căn', '1,2 tỷ'],
  ['Việc tiếp theo', 'Chuẩn bị hồ sơ vay'],
  ['Cuộc gọi', 'Muốn ban công hướng Nam'],
]);
const hit = (q: string, scope: SearchScope = 'all') => match(doc, compile(q, scope)).match;

describe('khớp truy vấn', () => {
  it.each([
    'huong',
    'nguyen huong',
    'huong marquee',
    'marquee  homes',
    '+84 901 234 567',
    '84901234567',
    '+84 901',
    '0084901234567',
    '0901234567',
    '123',
    '1208',
    '1990',
    '53,6',
    '53.6',
    '1,2 tỷ',
    '2 phòng ngủ',
    '2PN',
    'chuẩn bị hồ sơ vay',
    '"marquee homes"',
    'huogn',
  ])('khớp: %s', (q) => expect(hit(q)).toBe(true));

  it.each(['23', '"nguyen huong"', '1208 sai', 'huognn', '"huogn"'])('không khớp: %s', (q) =>
    expect(hit(q)).toBe(false),
  );

  it('theo phạm vi', () => {
    expect(hit('1208', 'unit')).toBe(true);
    expect(hit('1208', 'phone')).toBe(false);
    expect(hit('marquee', 'name')).toBe(false);
    expect(hit('huogn', 'name')).toBe(true);
  });

  it('gần đúng 1 lỗi tên được đánh dấu fuzzy', () => {
    expect(match(doc, compile('huogn')).fuzzy).toBe(true);
  });

  it('khớp tên xếp trên khớp ghi chú', () => {
    const noteOnly = prepare([
      ['Tên', 'Trần An'],
      ['Cuộc gọi', 'hướng Nam'],
    ]);
    expect(match(doc, compile('huong')).score).toBeGreaterThan(match(noteOnly, compile('huong')).score);
  });
});

describe('highlight', () => {
  it('giữ chữ gốc, escape HTML, gộp khoảng trắng, số thập phân', () => {
    expect(highlight('Hương'.normalize('NFD'), ['hu'])).toBe('<mark>Hư</mark>ơng');
    expect(highlight('<img src=x onerror=x>', ['img'])).toBe('&lt;<mark>img</mark> src=x onerror=x&gt;');
    expect(highlight('Marquee  Homes', ['marquee homes'])).toBe('<mark>Marquee  Homes</mark>');
    expect(highlight('1,2 tỷ', ['1.2'])).toBe('<mark>1,2</mark> tỷ');
  });
});

it('range', () => {
  expect(range(null, 10, null)).toBe(false);
  expect(range(null, null, null)).toBe(true);
  expect(range(50, 50, 60)).toBe(true);
});

it.each([
  ['2N-2WC', '2N'],
  ['2N+, 2WC', '2N'],
  ['2N-2WC-G', '2N'],
  ['2PN', '2N'],
  ['1 phòng ngủ', '1N'],
  ['3BR', '3N'],
  ['4N-3WC', '4N'],
  ['Studio', 'Studio'],
  [null, ''],
  ['Loft', 'other'],
])('apartmentGroup(%s) = %s', (input, group) => expect(apartmentGroup(input)).toBe(group));
