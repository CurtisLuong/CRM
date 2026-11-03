// Danh sách Page nhận lead. Page chính: FB_PAGE_ID + FB_PAGE_ACCESS_TOKEN (giữ nguyên như cũ).
// Page thêm: FB_PAGE_ID_2 + FB_PAGE_ACCESS_TOKEN_2 … đến _5 — mỗi Page cần token riêng vì
// Page token chỉ đọc được lead của chính Page đó (Page ở Business portfolio khác cũng vậy).
export const MAX_PAGES = 5;

function suffix(index) {
  return index === 1 ? '' : `_${index}`;
}

/** Tên secret token của mọi Page (để che trong log). */
export const PAGE_TOKEN_KEYS = Array.from({ length: MAX_PAGES }, (_, i) => `FB_PAGE_ACCESS_TOKEN${suffix(i + 1)}`);

/** Page đã cấu hình (có mã Page), theo thứ tự 1 → 5; token có thể thiếu → báo thiếu secret. */
export function configuredPages(env) {
  const pages = [];
  for (let index = 1; index <= MAX_PAGES; index += 1) {
    const id = String(env[`FB_PAGE_ID${suffix(index)}`] || '').trim();
    if (!id) continue;
    pages.push({ index, id, token: env[`FB_PAGE_ACCESS_TOKEN${suffix(index)}`] || '' });
  }
  return pages;
}

/** Page thêm có mã nhưng thiếu token → tên secret còn thiếu. */
export function missingPageSecrets(env) {
  return configuredPages(env)
    .filter((page) => page.index > 1 && !page.token)
    .map((page) => `FB_PAGE_ACCESS_TOKEN${suffix(page.index)}`);
}

/** Page của 1 lead; không rõ Page (Make, dữ liệu cũ) → Page chính. */
export function pageFor(env, pageId) {
  const pages = configuredPages(env);
  const wanted = pageId == null ? '' : String(pageId);
  return pages.find((page) => page.id === wanted) || pages.find((page) => page.index === 1) || null;
}

/** env nhìn từ 1 Page: FB_PAGE_ID/FB_PAGE_ACCESS_TOKEN thay bằng của Page đó. */
export function envForPage(env, page) {
  if (!page || page.index === 1) return env;
  return { ...env, FB_PAGE_ID: page.id, FB_PAGE_ACCESS_TOKEN: page.token };
}
