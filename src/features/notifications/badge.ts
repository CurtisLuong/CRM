/**
 * Số trên chuông Thông báo (PF-06 luật 2–3): 0 → không hiện số; > 99 → "99+".
 * aria-label đọc đủ số mục (không cắt), phần hiển thị mới cắt.
 */
export function bellBadge(count: number): { label: string; text: string } {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (!total) return { label: 'Thông báo', text: '' };
  return { label: `Thông báo, ${total} mục`, text: total > 99 ? '99+' : String(total) };
}
