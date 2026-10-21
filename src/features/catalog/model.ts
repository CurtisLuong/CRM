import { compile, match, normalize, prepare } from '@/domain/search';

const HEADER_ALIASES: Record<string, string[]> = {
  buildingPrice: ['gia toa', 'gia dien hinh toa', 'gia duyet', 'gia trung binh', 'don gia toa'],
  price_per_m2_override: ['gia rieng', 'don gia can', 'gia can'],
  project: ['du an', 'project'],
  code: ['ma can', 'can ho', 'so can', 'can'],
  building: ['ma toa', 'toa', 'block', 'building'],
  area_m2: ['dien tich', 'dt'],
  floor: ['tang', 'floor'],
  direction: ['huong'],
  apt_type: ['loai can', 'loai'],
  status: ['trang thai', 'status'],
};

export const CATALOG_HEADERS = [
  'Dự án',
  'Mã toà',
  'Giá toà (tr/m²)',
  'Mã căn',
  'Loại căn',
  'Tầng',
  'Hướng',
  'Diện tích (m²)',
  'Giá riêng (tr/m²)',
  'Trạng thái',
];

export function parsePrice(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value >= 1000 ? Math.round(value) : Math.round(value * 1_000_000);
  const text = String(value).trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3}){2,}$/.test(text)) return Number(text.replaceAll('.', '')) || null;
  const n = Number(text.replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? (n >= 1000 ? Math.round(n) : Math.round(n * 1_000_000)) : null;
}

export function formatPricePerM2(value: number | string | null | undefined): string {
  if (value == null || value === '') return '';
  return (Number(value) / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 6 });
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim()));
}

function detectColumns(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [i, raw] of header.entries()) {
    const title = normalize(raw.replace(/\(.*?\)/g, '').trim());
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (
        !(field in map) &&
        aliases.some((alias) => title === normalize(alias) || title.startsWith(`${normalize(alias)} `))
      ) {
        map[field] = i;
        break;
      }
    }
  }
  return map;
}

function parseStatus(value: string): string {
  const text = normalize(value);
  if (text.includes('giu') || text === 'holding') return 'holding';
  if (text.includes('ban') || text === 'sold') return 'sold';
  return 'available';
}

export type CatalogImport = {
  rows: Record<string, unknown>[];
  cols: Record<string, boolean>;
  projects: number;
  buildings: number;
  units: number;
};

export function parseCatalogMatrix(matrix: unknown[][]): CatalogImport {
  const rows = matrix.map((row) => row.map((cell) => String(cell ?? '').trim())).filter((row) => row.some(Boolean));
  if (rows.length < 2) throw new Error('File cần có một dòng tiêu đề và ít nhất một dòng dữ liệu.');
  const indexes = detectColumns(rows[0] ?? []);
  if (!('project' in indexes) || !('building' in indexes)) throw new Error('Cần có cột “Dự án” và “Mã toà”.');
  const cols = Object.fromEntries(Object.keys(indexes).map((field) => [field, true]));
  let lastProject = '';
  let lastBuilding = '';
  const dataRows = rows
    .slice(1)
    .map((cells) => {
      const get = (key: string) => (indexes[key] == null ? '' : cells[indexes[key]]?.trim() || '');
      const project = get('project') || lastProject;
      const building = get('building') || lastBuilding;
      lastProject = project;
      lastBuilding = building;
      const rawFloor = get('floor');
      const floor = rawFloor === '' ? null : Number.parseInt(rawFloor, 10);
      return {
        project,
        building,
        buildingPrice: parsePrice(get('buildingPrice')),
        code: get('code'),
        apt_type: get('apt_type') || null,
        area_m2: get('area_m2')
          ? Number(
              get('area_m2')
                .replace(',', '.')
                .replace(/[^\d.-]/g, ''),
            ) || null
          : null,
        floor: Number.isFinite(floor) ? floor : null,
        direction: get('direction') || null,
        price_per_m2_override: parsePrice(get('price_per_m2_override')),
        status: parseStatus(get('status')),
      };
    })
    .filter((r) => r.project && r.building);
  if (!dataRows.length) throw new Error('Không có dòng nào có đủ Dự án và Mã toà.');
  return {
    rows: dataRows,
    cols,
    projects: new Set(dataRows.map((r) => normalize(String(r.project)))).size,
    buildings: new Set(dataRows.map((r) => `${normalize(String(r.project))}|${normalize(String(r.building))}`)).size,
    units: dataRows.filter((r) => r.code).length,
  };
}

export function parseCatalogCsv(text: string): CatalogImport {
  const clean = text.replace(/^\uFEFF/, '');
  const first = clean.split(/\r?\n/, 1)[0] || '';
  const delimiter = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0] ?? ',';
  return parseCatalogMatrix(parseDelimited(clean, delimiter));
}

export function catalogTemplateCsv(): string {
  const rows = [
    CATALOG_HEADERS,
    ['Vin Tràng Cát', 'THE RISE 3', '19,91153', 'R30413', '2N-2WC', '4', 'Đông Nam', '53,6', '', 'Còn'],
    ['', '', '', 'R30414', '2N-2WC-G', '4', 'Tây Bắc', '', '20,5', 'Giữ chỗ'],
    ['Vin Tràng Cát', 'THE RISE 5', '', '', '', '', '', '', '', ''],
  ];
  return `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n')}`;
}

export async function downloadCatalogTemplate(): Promise<void> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    CATALOG_HEADERS,
    ['Vin Tràng Cát', 'THE RISE 3', 19.91153, 'R30413', '2N-2WC', 4, 'Đông Nam', 53.6, '', 'Còn'],
    ['', '', '', 'R30414', '2N-2WC-G', 4, 'Tây Bắc', '', 20.5, 'Giữ chỗ'],
    ['Vin Tràng Cát', 'THE RISE 5', '', '', '', '', '', '', '', ''],
  ]);
  sheet['!cols'] = CATALOG_HEADERS.map((header) => ({ wch: Math.max(12, header.length + 2) }));
  XLSX.utils.book_append_sheet(workbook, sheet, 'Giỏ hàng');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const url = URL.createObjectURL(
    new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'mau-gio-hang.xlsx';
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Ô tìm Giỏ hàng dùng chung luật tìm của app (không dấu tìm rộng, có dấu thu hẹp — PF-05). */
export function unitMatchesQuery(fields: ReadonlyArray<readonly [string, unknown]>, query: string): boolean {
  const ctx = compile(query);
  return !ctx.active || match(prepare(fields.map(([label, value]) => [label, value ?? ''] as const)), ctx).match;
}
