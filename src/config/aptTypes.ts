/**
 * NGUỒN DUY NHẤT — loại căn (Giỏ hàng, form, nhập Excel). Port nguyên giá trị từ legacy/js/app.js.
 * Bảng alias khớp hàm SQL public.canonical_apt_type (SQL/normalize_apt_type_aliases.sql).
 */

export const APT_TYPES = ['Studio', '1N-1WC', '1N+, 1WC', '2N-2WC', '2N+, 2WC', '2N-2WC-G', '3N-2WC'] as const;

// Số phòng ngủ → loại chuẩn khi gõ tự do ("2 ngủ", "2PN", "2BR"…).
export const APT_ALIAS_BASE: Readonly<Record<number, string>> = { 1: '1N-1WC', 2: '2N-2WC', 3: '3N-2WC' }; // số WC mặc định
export const APT_ALIAS_PLUS: Readonly<Record<number, string>> = { 1: '1N+, 1WC', 2: '2N+, 2WC' }; // "2 ngủ+", "2PN+"
export const APT_ALIAS_CORNER: Readonly<Record<number, string>> = { 2: '2N-2WC-G' }; // "2PN Góc"
