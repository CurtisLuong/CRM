import type { Customer } from './types';

type GuessedGender = 'nam' | 'nữ';

const SURNAMES = new Set([
  'nguyen',
  'tran',
  'le',
  'pham',
  'hoang',
  'huynh',
  'phan',
  'vu',
  'vo',
  'dang',
  'bui',
  'do',
  'ho',
  'ngo',
  'duong',
  'ly',
]);

// Giữ dấu khi tra tên: Dũng khác Dung, Hòa khác Hoa, Lân khác Lan.
const FEMALE_NAMES = new Set([
  'hương',
  'hường',
  'huyền',
  'trâm',
  'tuyết',
  'thảo',
  'diễm',
  'quỳnh',
  'yến',
  'quyên',
  'hằng',
  'thủy',
  'thùy',
  'hạnh',
  'liên',
  'oanh',
  'duyên',
  'hiền',
  'uyên',
  'nhàn',
  'thư',
  'mỹ',
  'ngân',
]);
const MALE_NAMES = new Set([
  'tuấn',
  'tuân',
  'hùng',
  'hưng',
  'dũng',
  'đức',
  'cường',
  'công',
  'đạt',
  'khải',
  'kiên',
  'kiệt',
  'mạnh',
  'nghĩa',
  'phúc',
  'phước',
  'quốc',
  'thắng',
  'thuận',
  'thịnh',
  'trọng',
  'trường',
  'tùng',
  'việt',
  'lân',
  // Lead 05/11: thêm tên nam phổ biến.
  'sơn',
  'hải',
  'hiếu',
  'quân',
  'toàn',
  'thành',
  'lâm',
  'thái',
]);

// Danh sách riêng, không tạo bằng cách bỏ dấu từ danh sách trên.
// Cố ý bỏ Dung, Hoa, Lan, Huong (có thể là Dũng, Hòa, Lân, Hướng).
const UNACCENTED_FEMALE_NAMES = new Set([
  'nhung',
  'quynh',
  'trang',
  'tuyet',
  'mai',
  'nga',
  'loan',
  'vy',
  'nhi',
  'oanh',
  'thuy',
]);
const UNACCENTED_MALE_NAMES = new Set([
  'tuan',
  'hung',
  'cuong',
  'duc',
  'dat',
  'kien',
  'kiet',
  'manh',
  'nghia',
  'phuc',
  'phuoc',
  'quoc',
  'thang',
  'thinh',
  'trong',
  'trung',
  'truong',
  'tung',
  'viet',
  'nam',
  'long',
  'quang',
  'huy',
  'phong',
  'khoa',
  'vinh',
  'son',
  'hai',
  'hieu',
  'quan',
  'toan',
  'thai',
]);
const AMBIGUOUS_NAMES = new Set([
  'anh',
  'minh',
  'hoài',
  'hoai',
  'ngọc',
  'ngoc',
  'bình',
  'binh',
  'giang',
  'hà',
  'ha',
  'khánh',
  'khanh',
  'phương',
  'phuong',
  'xuân',
  'xuan',
  'an',
  'vân',
  'van',
  'dung',
  'hoa',
  'hòa',
]);

function withoutAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
}

/** Chỉ đoán để hiển thị/xưng hô; không sửa tên hay bản ghi khách. */
export function guessGenderFromName(fullName: string | null | undefined): GuessedGender | null {
  const clean = fullName?.normalize('NFC').trim().toLocaleLowerCase('vi');
  if (!clean) return null;
  const words = clean.split(/\s+/);
  const first = words[0] ?? '';
  const last = words[words.length - 1] ?? '';
  const reversed = SURNAMES.has(withoutAccents(last)) && !SURNAMES.has(withoutAccents(first));
  const given = reversed ? first : last;
  const middle = words.slice(1, -1);
  const hasThi = middle.some((word) => word === 'thị' || word === 'thi');
  // "Van" chưa đủ chắc là "Văn" (cũng có thể là "Vân"). Chỉ dùng Văn đúng vị trí đệm.
  const hasVan = middle.includes('văn');
  if (hasThi && hasVan) return null;
  if (hasThi) return 'nữ';
  if (hasVan) return 'nam';

  if (given === withoutAccents(given)) {
    if (UNACCENTED_FEMALE_NAMES.has(given)) return 'nữ';
    if (UNACCENTED_MALE_NAMES.has(given)) return 'nam';
  } else {
    if (FEMALE_NAMES.has(given)) return 'nữ';
    if (MALE_NAMES.has(given)) return 'nam';
  }

  // Chỉ dùng đệm Thu/Thùy sát tên mơ hồ, không lấn át tên gọi rõ nam hay tên lạ.
  // Với thứ tự đảo, đệm đứng ngay sau tên gọi.
  const adjacent = reversed ? middle[0] : middle[middle.length - 1];
  if (AMBIGUOUS_NAMES.has(given) && (adjacent === 'thu' || adjacent === 'thùy')) return 'nữ';
  if (given === 'lan' && adjacent === 'ngọc') return 'nữ';
  return null;
}

/** Giá trị đã lưu (kể cả Khác/giá trị cũ) luôn thắng gợi ý; chỉ tính, không ghi. */
export function effectiveGender(customer: Pick<Customer, 'full_name' | 'gender'>): string | null {
  return customer.gender || guessGenderFromName(customer.full_name);
}
