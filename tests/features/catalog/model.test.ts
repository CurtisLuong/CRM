import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { CATALOG_HEADERS, parseCatalogCsv, parseCatalogMatrix, parsePrice } from '@/features/catalog/model';

describe('catalog import parsing', () => {
  it('recognizes Vietnamese CSV headers, fills merged project/building cells and preserves column presence', () => {
    const result = parseCatalogCsv(
      [
        'Dự án;Mã toà;Giá toà (tr/m²);Mã căn;Loại căn;Tầng;Diện tích (m²);Trạng thái',
        'Vin Tràng Cát;Rise 3;19,9;R301;2N-2WC;3;53,6;Còn',
        ';;;R302;2N-2WC;;54,2;Giữ chỗ',
      ].join('\n'),
    );
    expect(result.cols).toMatchObject({
      project: true,
      building: true,
      buildingPrice: true,
      code: true,
      area_m2: true,
      status: true,
    });
    expect(
      result.rows.map((row) => [row.project, row.building, row.code, row.buildingPrice, row.area_m2, row.status]),
    ).toEqual([
      ['Vin Tràng Cát', 'Rise 3', 'R301', 19_900_000, 53.6, 'available'],
      ['Vin Tràng Cát', 'Rise 3', 'R302', null, 54.2, 'holding'],
    ]);
  });

  it('parses native XLSX worksheet values and price formats', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        CATALOG_HEADERS,
        ['Vin Tràng Cát', 'Rise 3', 19.91153, 'R301', '2N', 4, 'Đông', 53.6, 21_000_000, 'Còn'],
      ]),
      'Giỏ hàng',
    );
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const loaded = XLSX.read(bytes, { type: 'array' });
    const sheetName = loaded.SheetNames[0];
    const sheet = sheetName ? loaded.Sheets[sheetName] : undefined;
    if (!sheet) throw new Error('XLSX round-trip fixture is missing its sheet');
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][];
    const result = parseCatalogMatrix(matrix);
    expect(result.rows[0]).toMatchObject({
      project: 'Vin Tràng Cát',
      building: 'Rise 3',
      buildingPrice: 19_911_530,
      code: 'R301',
      area_m2: 53.6,
      price_per_m2_override: 21_000_000,
    });
  });

  it('accepts a grouped đồng price, triệu price and comma decimal price', () => {
    expect(parsePrice('19.911.530')).toBe(19_911_530);
    expect(parsePrice('19,91153')).toBe(19_911_530);
    expect(parsePrice(19.91153)).toBe(19_911_530);
  });
});
