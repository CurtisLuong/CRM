const pad = (n: number) => String(n).padStart(2, "0");
const WDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** 0.75 → "45m", 5.3 → "5h 18m", 102 → "4n 06h" (n = ngày). */
export function fmtDur(hours: number): string {
  const m = Math.max(0, Math.round(hours * 60));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
  return `${Math.floor(m / 1440)}n ${pad(Math.floor((m % 1440) / 60))}h`;
}

/** SLA limits: 0.25 → "15m", 2 → "2h", 168 → "7n". */
export function fmtLimit(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}n`;
}

/** "Hôm nay 09:12", "Hôm qua 20:15", "T5 22/10 09:39". */
export function fmtWhen(value: Date | string | number, now: Date | string | number = new Date()): string {
  const d = new Date(value);
  const n = new Date(now);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === n.toDateString()) return `Hôm nay ${hm}`;
  const y = new Date(n);
  y.setDate(n.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Hôm qua ${hm}`;
  const year = d.getFullYear() !== n.getFullYear() ? `/${d.getFullYear()}` : "";
  return `${WDAY[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}${year} ${hm}`;
}

/** dd/mm/yyyy */
export function fmtDate(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function parseDateVN(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}

/** Money in Vietnamese units: 1850000000 → "1,85 tỷ", 650000000 → "650 triệu". */
export function fmtVND(v: number): string {
  if (Math.abs(v) >= 1e9) return `${trim(v / 1e9, 2)} tỷ`;
  if (Math.abs(v) >= 1e6) return `${trim(v / 1e6, 1)} triệu`;
  return v.toLocaleString("vi-VN") + " đ";
}

/** "0912345678" → "0912 345 678" */
export function fmtPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : p;
}

/** 23.456 → "23%", (23.456, 1) → "23,5%" */
export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${trim(v, digits)}%`;
}

function trim(v: number, digits: number): string {
  return (Math.round(v * 10 ** digits) / 10 ** digits).toString().replace(".", ",");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  return ((parts.length > 1 ? parts[0][0] : "") + parts[parts.length - 1][0]).toUpperCase();
}
