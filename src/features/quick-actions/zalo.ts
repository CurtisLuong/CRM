import { ZALO_TEMPLATES_DEFAULT, type ZaloTemplate } from '@/config/followup';
import type { Customer } from '@/domain/customer';
import { normalizePhone, phoneDigits } from '@/domain/customer/phone';
import { fillGreeting, suggestTemplate, upgradeTplText } from '@/domain/followup';

export function contactPhones(c: Customer) {
  // Keep supplied numbers unchanged in storage; normalize only the outbound link/matching key.
  const values = [c.phone, ...(Array.isArray(c.household) ? c.household.map((p) => p?.phone) : [])];
  return values
    .filter((p): p is string => typeof p === 'string' && !!normalizePhone(p))
    .filter((p, i, all) => all.findIndex((x) => phoneDigits(x) === phoneDigits(p)) === i);
}
export function defaultTemplates(c: Customer, now: number, custom?: readonly ZaloTemplate[]) {
  const list = (custom ?? ZALO_TEMPLATES_DEFAULT)
    .filter((t) => t.text.trim())
    .map((t) => ({ ...t, text: fillGreeting(upgradeTplText(t.id, t.text), c) }));
  const preferred = suggestTemplate(c, now);
  return list.sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
}
export function zaloHref(number: string, ua = navigator.userAgent, touch = navigator.maxTouchPoints) {
  const clean = normalizePhone(number).replace(/^\+?84/, '0');
  return /Macintosh|Mac OS X/.test(ua) && !/iPhone|iPad|iPod/.test(ua) && !touch
    ? `zalo://conversation?phone=${clean}`
    : `https://zalo.me/${clean}`;
}
export async function copyAndOpenZalo(text: string, number: string) {
  const cap = (
    window as Window & {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        nativePromise?: (plugin: string, method: string, args: Record<string, unknown>) => Promise<unknown>;
      };
    }
  ).Capacitor;
  // Clipboard denial keeps the draft open; never report copied/sent on failure.
  await navigator.clipboard.writeText(text);
  const href = zaloHref(number);
  if (href.startsWith('http') && /Android/i.test(navigator.userAgent) && !cap?.isNativePlatform?.()) {
    window.location.href = `intent://${href.replace(/^https:\/\//, '')}#Intent;scheme=https;package=com.zing.zalo;S.browser_fallback_url=${encodeURIComponent(href)};end`;
  } else if (!href.startsWith('http')) window.location.href = href;
  else window.open(href, '_blank', 'noopener');
}
