/**
 * Điền biến mẫu tin Zalo — port 1-1 `fillGreeting` / `upgradeTplText` (legacy/js/app.js).
 * {ten} tên gọi · {hoten} họ tên · {sale} tên người gửi · {du_an} dự án · {anhchi} + "anh/chị" đổi theo giới tính.
 */
import { ZALO_SENDER_NAME, ZALO_TEMPLATES_DEFAULT, ZALO_TEMPLATES_PREVIOUS } from '@/config/followup';
import type { Customer } from '@/domain/customer';

export type GreetingOptions = {
  /** Họ tên hiển thị của mình trong nhóm (v1: team.find(m => m.is_me).full_name); trống → ZALO_SENDER_NAME. */
  myName?: string | null;
};

export function fillGreeting(
  tpl: string | null | undefined,
  c: Pick<Customer, 'full_name' | 'gender' | 'projects'> | null | undefined,
  opts: GreetingOptions = {},
): string {
  const full = (c?.full_name || '').trim();
  const given = full ? (full.split(/\s+/).pop() ?? '') : '';
  // Xưng hô theo giới tính: Nam→"anh", Nữ→"chị", khác/chưa rõ→giữ "anh/chị".
  const g = (c?.gender || '').toLowerCase();
  const sal = g === 'nam' ? 'anh' : g === 'nữ' ? 'chị' : 'anh/chị';
  const salCap = sal.charAt(0).toUpperCase() + sal.slice(1);
  // Dự án theo thuộc tính "Dự án" của khách; chưa có → "dự án {du_an}" thành "nhà ở xã hội".
  const proj = Array.isArray(c?.projects) && c.projects.length ? c.projects.join(', ') : '';
  const myName = (opts.myName || '').trim();
  const sale = myName.split(/\s+/).pop() || ZALO_SENDER_NAME || 'em';
  let out = String(tpl || '')
    .replace(/\{ten\}/gi, given || full)
    .replace(/\{hoten\}/gi, full)
    .replace(/\{sale\}/gi, sale);
  out = proj
    ? out.replace(/\{du_an\}/gi, proj)
    : out.replace(/dự án \{du_an\}/gi, 'nhà ở xã hội').replace(/\{du_an\}/gi, 'bên em');
  return out
    .replace(/\{anhchi\}/gi, sal)
    .replace(/Anh\/[Cc]hị/g, salCap) // "Anh/chị" (đầu câu) → "Anh"/"Chị"
    .replace(/anh\/chị/g, sal); // "anh/chị" → "anh"/"chị"
}

/** Mẫu còn Y NGUYÊN nội dung mặc định cũ (sale chưa sửa) → dùng nội dung mặc định mới. */
export function upgradeTplText(id: string, text: string): string {
  const prev = ZALO_TEMPLATES_PREVIOUS[id];
  if (!prev || text !== prev) return text;
  return ZALO_TEMPLATES_DEFAULT.find((t) => t.id === id)?.text ?? text;
}
