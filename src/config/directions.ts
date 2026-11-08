/** Nhãn cũng là giá trị lưu; chỉ chuẩn hoá để hiển thị, không tự ghi lại dữ liệu cũ. */
export const DIRECTIONS = ['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Bắc', 'Đông Nam', 'Tây Bắc', 'Tây Nam'] as const;

const directionKey = (value: string) => value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('vi');

export function directionValue(value: string | null | undefined): string {
  if (!value) return '';
  return DIRECTIONS.find((direction) => directionKey(direction) === directionKey(value)) ?? value;
}

/** Ghi tự do trước đây vẫn có lựa chọn riêng cho tới khi người dùng đổi hướng. */
export function directionOptions(value: string | null | undefined): string[] {
  const selected = directionValue(value);
  return selected && !DIRECTIONS.some((direction) => direction === selected)
    ? [...DIRECTIONS, selected]
    : [...DIRECTIONS];
}
