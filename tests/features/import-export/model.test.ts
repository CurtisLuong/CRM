import { describe, expect, it } from 'vitest';
import {
  formatExportCell,
  guessColumn,
  IO_FIELDS,
  makeImportRecord,
  parseImportValue,
  readImportTemplate,
} from '@/features/import-export/model';

describe('customer Excel fields v1 parity', () => {
  it('keeps the exact v1 IO_FIELDS keys and headers', () => {
    expect(IO_FIELDS.map(({ key, label }) => [key, label])).toEqual([
      ['full_name', 'Họ tên'],
      ['phone', 'Số điện thoại'],
      ['gender', 'Giới tính'],
      ['dob', 'Ngày sinh'],
      ['marital_status', 'Hôn nhân'],
      ['residence', 'Thường trú'],
      ['occupation', 'Công việc'],
      ['income', 'Thu nhập'],
      ['projects', 'Dự án'],
      ['apt_type', 'Loại căn'],
      ['registered_at', 'Thời gian đăng kí'],
      ['interest_level', 'Mức quan tâm'],
      ['care_stage', 'Tiến độ chăm sóc'],
      ['contact_status', 'Trạng thái liên lạc'],
    ]);
  });

  it('maps legacy headers, normalizes values, defaults new records, and leaves unknown columns as notes', () => {
    expect(guessColumn('Họ tên')).toBe('full_name');
    expect(guessColumn('\uFEFFHọ tên')).toBe('full_name');
    expect(guessColumn('Cột khác')).toBe('__note');
    const { payload, notes } = makeImportRecord(
      ['Lan', '+84901234567', 'A, B', 'ghi chú'],
      ['full_name', 'phone', 'projects', '__note'],
      ['Họ tên', 'Số điện thoại', 'Dự án', 'Kênh giới thiệu'],
    );
    expect(payload).toMatchObject({
      full_name: 'Lan',
      phone: '0901234567',
      projects: ['A', 'B'],
      interest_level: 20,
      intake_method: 'import',
    });
    expect(notes).toEqual(['Kênh giới thiệu: ghi chú']);
  });

  it('parses legacy date and interest formats and serializes projects for Excel', () => {
    expect(parseImportValue('dob', '4/3/1990')).toBe('1990-03-04');
    expect(parseImportValue('care_stage', 'Booking')).toBe('Booking & Làm hồ sơ');
    expect(parseImportValue('interest_level', '140%')).toBe(100);
    expect(formatExportCell({ projects: ['A', 'B'] } as never, 'projects')).toBe('A, B');
  });

  it('rejects incomplete rows and malformed templates', () => {
    expect(makeImportRecord(['Lan'], ['full_name']).payload).toBeNull();
    expect(readImportTemplate({ getItem: () => '{broken}' } as unknown as Storage, 't')).toBeNull();
  });
});
