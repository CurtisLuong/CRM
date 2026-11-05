import { describe, expect, it } from 'vitest';
import { effectiveGender, guessGenderFromName } from '@/domain/customer/genderFromName';

describe('GN-01 — ví dụ bắt buộc', () => {
  it.each([
    ['Nguyễn Thị Lan', 'nữ'],
    ['Trần Văn Hùng', 'nam'],
    ['Lê Minh Tuấn', 'nam'],
    ['Phạm Thu Trang', 'nữ'],
    ['Nguyễn Thùy Dung', 'nữ'],
    ['Nguyen Thi Huong', 'nữ'],
    ['Tuan Pham', 'nam'],
    ['Hoai Nguyen', null],
    ['Dung', null],
    ['Minh', null],
    ['Nguyễn Anh', null],
    ['', null],
    [null, null],
    [undefined, null],
  ])('%s → %s', (name, gender) => {
    expect(guessGenderFromName(name)).toBe(gender);
  });
});

describe('GN-01 — thêm tên phổ biến có dấu, không dấu và thứ tự đảo', () => {
  it.each([
    ['Nguyễn Đức', 'nam'],
    ['Trần Mạnh', 'nam'],
    ['Lê Quốc', 'nam'],
    ['Phạm Cường', 'nam'],
    ['Hoàng Dũng', 'nam'],
    ['Huỳnh Thắng', 'nam'],
    ['Phan Kiên', 'nam'],
    ['Vũ Phúc', 'nam'],
    ['Võ Tùng', 'nam'],
    ['Đặng Việt', 'nam'],
    ['Bùi Trọng', 'nam'],
    ['Đỗ Nghĩa', 'nam'],
    ['Hồ Kiệt', 'nam'],
    ['Ngô Trường', 'nam'],
    ['Dương Hưng', 'nam'],
    ['Lý Thuận', 'nam'],
    ['Nguyễn Hương', 'nữ'],
    ['Trần Huyền', 'nữ'],
    ['Lê Trâm', 'nữ'],
    ['Phạm Tuyết', 'nữ'],
    ['Hoàng Thảo', 'nữ'],
    ['Huỳnh Diễm', 'nữ'],
    ['Phan Quỳnh', 'nữ'],
    ['Vũ Yến', 'nữ'],
    ['Võ Quyên', 'nữ'],
    ['Đặng Hường', 'nữ'],
    ['Nguyễn Thu Hà', 'nữ'],
    ['Trần Thùy Anh', 'nữ'],
    ['Lê Ngọc Lan', 'nữ'],
    ['Nguyen Tuan', 'nam'],
    ['Tran Hung', 'nam'],
    ['Le Quoc', 'nam'],
    ['Pham Trang', 'nữ'],
    ['Hoang Nhung', 'nữ'],
    ['Huynh Quynh', 'nữ'],
    ['Phan Tuyet', 'nữ'],
    ['Duc Nguyen', 'nam'],
    ['Cuong Tran', 'nam'],
    ['Phuc Le', 'nam'],
    ['Tuyet Pham', 'nữ'],
    ['Trang Hoang', 'nữ'],
    ['Quỳnh Huỳnh', 'nữ'],
    ['Hà Thu Nguyễn', 'nữ'],
    ['Dung Thùy Trần', 'nữ'],
    ['Nguyễn Hoài', null],
    ['Trần Ngọc', null],
    ['Lê Bình', null],
    ['Phạm Giang', null],
    ['Hoàng Hà', null],
    ['Huỳnh Khánh', null],
    ['Phan Phương', null],
    ['Vũ Xuân', null],
    ['Võ An', null],
    ['Đặng Vân', null],
    ['Nguyen Dung', null],
    ['Tran Hoa', null],
    ['Van Le', null],
    ['Nguyen Lan', null],
    ['Huong Nguyen', null],
  ])('%s → %s', (name, gender) => {
    expect(guessGenderFromName(name)).toBe(gender);
  });
});

describe('GN-01 — ranh giới an toàn', () => {
  it.each([
    'Nguyễn',
    'Nguyễn Trần',
    'Thị Nguyễn',
    'Văn Nguyễn',
    'Nguyễn Thị',
    'Nguyễn Vân Anh',
    'Nguyen Van Anh',
    'Nguyễn Thị Văn Hùng',
    'Tên Chưa Biết',
    'Nguyễn Thu Khôngrõ',
    'Hoài',
    'Ngọc',
    'Bình',
    'Giang',
    'Hà',
    'Khánh',
    'Phương',
    'Xuân',
    'An',
    'Vân',
    'Van',
    'Anh',
    '   ',
  ])('%s không đủ tín hiệu', (name) => {
    expect(guessGenderFromName(name)).toBeNull();
  });

  it.each([
    'Nguyễn',
    'Trần',
    'Lê',
    'Phạm',
    'Hoàng',
    'Huỳnh',
    'Phan',
    'Vũ',
    'Võ',
    'Đặng',
    'Bùi',
    'Đỗ',
    'Hồ',
    'Ngô',
    'Dương',
    'Lý',
    'Nguyen',
    'Tran',
    'Le',
    'Pham',
    'Hoang',
    'Huynh',
    'Phan',
    'Vu',
    'Vo',
    'Dang',
    'Bui',
    'Do',
    'Ho',
    'Ngo',
    'Duong',
    'Ly',
  ])('nhận thứ tự đảo với họ %s', (surname) => {
    expect(guessGenderFromName(`Tuan ${surname}`)).toBe('nam');
    expect(guessGenderFromName(`Hoai ${surname}`)).toBeNull();
  });

  it('chuẩn hóa Unicode, hoa thường và khoảng trắng nhưng giữ dấu khi tra tên', () => {
    expect(guessGenderFromName('  NGUYỄN\t THỊ \n LAN  '.normalize('NFD'))).toBe('nữ');
    expect(guessGenderFromName('  TUAN   PHAM ')).toBe('nam');
    expect(guessGenderFromName('Dũng')).toBe('nam');
    expect(guessGenderFromName('Dung')).toBeNull();
    expect(guessGenderFromName('Nguyễn Hoa')).toBeNull();
    expect(guessGenderFromName('Nguyễn Hòa')).toBeNull();
  });

  it('chỉ dùng Thị/Văn ở tên đệm; tên đệm phụ không lấn át tên gọi rõ giới', () => {
    expect(guessGenderFromName('Nguyễn Thị Minh')).toBe('nữ');
    expect(guessGenderFromName('Nguyễn Văn Anh')).toBe('nam');
    expect(guessGenderFromName('Nguyễn Thu Tuấn')).toBe('nam');
  });
});

describe('GN-01 — giới tính hiệu lực', () => {
  it.each(['nam', 'nữ', 'khác', 'Nữ'])('ưu tiên giá trị đã lưu %s', (gender) => {
    expect(effectiveGender({ full_name: 'Phạm Thu Trang', gender })).toBe(gender);
  });

  it('chỉ trả giá trị suy ra; không sửa khách hay thuộc tính lạ', () => {
    const customer = Object.freeze({ full_name: 'Phạm Thu Trang', gender: null, x_keep: { keep: true } });
    expect(effectiveGender(customer)).toBe('nữ');
    expect(customer).toEqual({ full_name: 'Phạm Thu Trang', gender: null, x_keep: { keep: true } });
    expect(effectiveGender({ full_name: 'Hoai Nguyen' })).toBeNull();
  });
});
