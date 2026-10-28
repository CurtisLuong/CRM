export const DEMO_MODE_KEY = 'crm_demo_mode';

/** Cờ riêng của chế độ mẫu; không dùng crm_last_user nên không đổi tài khoản thật đã nhớ. */
export function isDemo(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_MODE_KEY) === 'active';
  } catch {
    return false;
  }
}
