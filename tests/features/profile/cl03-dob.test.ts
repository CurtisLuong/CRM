import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { dobSavePatch, dobView, parseDobInput } from '@/features/profile/dob';

// Giờ cố định 22/10/2026 như bảng số chuẩn CL-03 L3.
const NOW = Date.parse('2026-10-22T09:00:00+07:00');
const customer = { id: 'c1', owner_id: 'u1', full_name: 'Lan', phone: '0901234567' } as Customer;

describe('CL-03 ngày sinh — nhập và lưu', () => {
  it('đủ 5 dòng số chuẩn trong L3 (tuổi, mệnh ngắn + nạp âm, cung)', () => {
    const rows = [
      {
        input: '15/08/1985',
        dob: '1985-08-15',
        age: 41,
        menhShort: 'Mệnh Kim',
        napAm: 'Hải Trung Kim',
        menhFull: 'Mệnh Kim — Hải Trung Kim (Ất Sửu, 1985 AL)',
        cung: 'Sư Tử',
      },
      {
        input: '20/01/1990',
        dob: '1990-01-20',
        age: 36,
        menhShort: 'Mệnh Mộc',
        napAm: 'Đại Lâm Mộc',
        menhFull: 'Mệnh Mộc — Đại Lâm Mộc (Kỷ Tỵ, 1989 AL)',
        cung: 'Bảo Bình',
      },
      {
        input: '10/02/1990',
        dob: '1990-02-10',
        age: 36,
        menhShort: 'Mệnh Thổ',
        napAm: 'Lộ Bàng Thổ',
        menhFull: 'Mệnh Thổ — Lộ Bàng Thổ (Canh Ngọ, 1990 AL)',
        cung: 'Bảo Bình',
      },
      {
        input: '22/12/2001',
        dob: '2001-12-22',
        age: 24,
        menhShort: 'Mệnh Kim',
        napAm: 'Bạch Lạp Kim',
        menhFull: 'Mệnh Kim — Bạch Lạp Kim (Tân Tỵ, 2001 AL)',
        cung: 'Ma Kết',
      },
      {
        input: '15/08',
        dob: '--08-15',
        age: null,
        menhShort: null,
        napAm: null,
        menhFull: '',
        cung: 'Sư Tử',
      },
    ];
    for (const row of rows) {
      const parsed = parseDobInput(row.input, 2026);
      expect(parsed, row.input).toEqual({ dob: row.dob, error: null });
      const view = dobView(parsed.dob, NOW);
      expect(view.known, row.input).toBe(true);
      expect(view.input, row.input).not.toContain('-');
      expect({ age: view.age, menhShort: view.menhShort, napAm: view.menhNapAm, cung: view.cung }, row.input).toEqual({
        age: row.age,
        menhShort: row.menhShort,
        napAm: row.napAm,
        cung: row.cung,
      });
      expect(view.menhFull, row.input).toBe(row.menhFull);
    }
  });

  it('ngày không tồn tại báo lỗi, không trả dob; 29/02 đúng năm nhuận mới hợp lệ', () => {
    expect(parseDobInput('31/02/1990', 2026).dob).toBeNull();
    expect(parseDobInput('31/02/1990', 2026).error).toBe('Ngày sinh không hợp lệ.');
    expect(parseDobInput('29/02/2025', 2026)).toEqual({ dob: null, error: 'Ngày sinh không hợp lệ.' });
    expect(parseDobInput('31/04', 2026).dob).toBeNull();
    expect(parseDobInput('32/01/1990', 2026).dob).toBeNull();
    expect(parseDobInput('29/02/2024', 2026)).toEqual({ dob: '2024-02-29', error: null });
    expect(parseDobInput('abc', 2026).dob).toBeNull();
  });

  it('xoá trắng → dob null; ghi đè kèm menh/cung/field_meta và giữ trường lạ', () => {
    expect(parseDobInput('   ', 2026)).toEqual({ dob: null, error: null });
    const withMeta = {
      ...customer,
      field_meta: { income: { by: 'sale', at: '2026-10-01T00:00:00.000Z', confirmed: true }, x_keep: { a: 1 } },
    } as Customer;
    const saved = dobSavePatch(withMeta, '1985-08-15', '2026-10-22T02:00:00.000Z');
    expect(saved).toMatchObject({
      dob: '1985-08-15',
      menh: 'Mệnh Kim — Hải Trung Kim (Ất Sửu, 1985 AL)',
      cung: 'Sư Tử',
      field_meta: {
        x_keep: { a: 1 },
        income: { by: 'sale', at: '2026-10-01T00:00:00.000Z', confirmed: true },
        dob: { by: 'sale', confirmed: true, at: '2026-10-22T02:00:00.000Z' },
      },
    });
    expect(dobSavePatch(withMeta, null)).toMatchObject({ dob: null, menh: null, cung: null });
  });

  it('dob cũ dạng lạ hiện nguyên chữ, không tuổi/mệnh/cung, không lỗi', () => {
    const legacy = dobView('12/05/1990', NOW);
    expect(legacy).toMatchObject({ known: false, raw: '12/05/1990', input: '', age: null, cung: null });
    expect(dobView('', NOW)).toMatchObject({ known: false, raw: '', input: '', age: null, cung: null });
    expect(dobView('1985-13-01', NOW)).toMatchObject({ known: false, raw: '1985-13-01' });
  });
});
