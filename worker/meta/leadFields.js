// Tách câu trả lời form Meta thành đúng trường khách (ML-03, Curtis duyệt 2026-10-21):
// loại căn → `apt_type` bằng mã chuẩn dùng chung với màn nhập; câu hỏi khác → 1 gạch đầu dòng Ghi chú;
// họ tên/SĐT/link inbox đã có cột riêng nên bỏ, không chép lại thành khối ghi chú dài.
import { APT_TYPES } from '../../src/config/aptTypes';
import { canonicalAptType } from '../../src/domain/customer/aptType';

/** Tên trường → khoá so khớp: bỏ dấu, chữ thường, `_ - / ? . :` → khoảng trắng. */
export function fieldNameKey(name) {
  return String(name == null ? '' : name)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[_\-./?:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Họ tên và SĐT đã ở cột riêng của khách — chép lại chỉ làm ghi chú dài, không thêm thông tin.
const SKIP_KEYS = new Set([
  'full name',
  'ten day du',
  'ho va ten',
  'ho ten',
  'ten',
  'name',
  'ten cua ban',
  'ten anh chi',
  'first name',
  'last name',
  'phone number',
  'phone',
  'so dien thoai',
  'dien thoai',
  'sdt',
  'so dt',
  'mobile',
  'zalo',
]);

// Luật 1 — câu hỏi về loại căn.
const APT_HINTS = ['phong ngu', 'may ngu', 'loai can', 'can ho may', 'bedroom'];
// Luật 2 — câu hỏi về thời điểm dự kiến mua.
const TIMING_HINTS = ['khi nao', 'du kien', 'thoi gian', 'bao gio'];

function joinedValue(field) {
  return (Array.isArray(field.values) ? field.values : [])
    .map((item) => String(item == null ? '' : item).trim())
    .filter(Boolean)
    .join(', ');
}

/** Câu hỏi hiển thị: `_` `/` → khoảng trắng, bỏ `?` cuối câu; giữ nguyên chữ hoa của người tạo form. */
function questionLabel(name) {
  return String(name)
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\?+$/, '')
    .trim();
}

/** Câu trả lời hiển thị: form Meta trả `1_ngủ` / `2_tỷ` → `1 ngủ` / `2 tỷ`. */
function answerLabel(value) {
  return String(value).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * field_data của Meta → { aptType, bullets }.
 * bullets giữ thứ tự câu hỏi trong form; aptType = null khi chưa nhận ra loại căn chuẩn.
 */
export function formAnswers(fieldData) {
  const list = Array.isArray(fieldData) ? fieldData : [];
  const bullets = [];
  let aptType = null;

  for (const field of list) {
    if (!field || typeof field !== 'object') continue;
    const name = String(field.name == null ? '' : field.name);
    const value = joinedValue(field);
    if (!name.trim() || !value) continue;

    const key = fieldNameKey(name);
    if (SKIP_KEYS.has(key) || key.includes('inbox')) continue;

    if (APT_HINTS.some((hint) => key.includes(hint))) {
      const canonical = canonicalAptType(value);
      if (APT_TYPES.includes(canonical)) {
        // Form có nhiều câu loại căn: giữ câu đầu tiên đọc được mã chuẩn.
        if (!aptType) aptType = canonical;
        continue;
      }
      // Không ra mã chuẩn (vd "chưa xác định") → giữ nguyên câu trả lời, không bịa loại căn.
      bullets.push(`${questionLabel(name)}: ${answerLabel(value)}`);
      continue;
    }

    if (TIMING_HINTS.some((hint) => key.includes(hint))) {
      bullets.push(`Dự kiến mua: ${answerLabel(value)}`);
      continue;
    }

    bullets.push(`${questionLabel(name)}: ${answerLabel(value)}`);
  }

  return { aptType, bullets };
}
