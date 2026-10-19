// Ngân sách gọi mạng cho MỘT lượt chạy (1 request hoặc 1 lượt cron).
// Gói Cloudflare miễn phí cho tối đa 50 lượt `fetch`/lần; giữ trần 45 để còn dư.
export const MAX_FETCHES_PER_RUN = 45;

export function createBudget(max = MAX_FETCHES_PER_RUN) {
  let used = 0;
  return {
    max,
    get used() {
      return used;
    },
    left() {
      return max - used;
    },
    canSpend(count = 1) {
      return used + count <= max;
    },
    take(count = 1) {
      used += count;
    },
  };
}

export function budgetError() {
  const error = new Error('Đã dùng hết lượt gọi mạng cho phép của lượt chạy');
  error.code = 'budget';
  return error;
}

/** `fetch` có đếm — chặn trước khi vượt trần thay vì để Cloudflare cắt giữa chừng. */
export function countedFetch(budget, input, init) {
  if (budget && !budget.canSpend(1)) throw budgetError();
  if (budget) budget.take();
  return fetch(input, init);
}
