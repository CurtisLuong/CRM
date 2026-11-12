const PI = Math.PI;
const rad = PI / 180;
const floor = Math.floor;

function julian(day: number, month: number, year: number) {
  const a = floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + floor((153 * m + 2) / 5) + 365 * y + floor(y / 4) - floor(y / 100) + floor(y / 400) - 32045;
}

/** Sóc thiên văn, hiệu chỉnh thời gian động lực; ngày lịch luôn ở UTC+7. */
function newMoon(k: number) {
  const t = k / 1236.85;
  const t2 = t * t;
  const t3 = t2 * t;
  const sin = (degrees: number) => Math.sin(degrees * rad);
  const m = 359.2242 + 29.10535608 * k - 0.0000333 * t2 - 0.00000347 * t3;
  const mp = 306.0253 + 385.81691806 * k + 0.0107306 * t2 + 0.00001236 * t3;
  const f = 21.2964 + 390.67050646 * k - 0.0016528 * t2 - 0.00000239 * t3;
  const correction =
    (0.1734 - 0.000393 * t) * sin(m) +
    0.0021 * sin(2 * m) -
    0.4068 * sin(mp) +
    0.0161 * sin(2 * mp) -
    0.0004 * sin(3 * mp) +
    0.0104 * sin(2 * f) -
    0.0051 * sin(m + mp) -
    0.0074 * sin(m - mp) +
    0.0004 * sin(2 * f + m) -
    0.0004 * sin(2 * f - m) -
    0.0006 * sin(2 * f + mp) +
    0.001 * sin(2 * f - mp) +
    0.0005 * sin(2 * mp + m);
  const delta =
    t < -11
      ? 0.001 + 0.000839 * t + 0.0002261 * t2 - 0.00000845 * t3 - 0.000000081 * t * t3
      : -0.000278 + 0.000265 * t + 0.000262 * t2;
  const jd =
    2415020.75933 +
    29.53058868 * k +
    0.0001178 * t2 -
    0.000000155 * t3 +
    0.00033 * sin(166.56 + 132.87 * t - 0.009173 * t2) +
    correction -
    delta;
  return floor(jd + 0.5 + 7 / 24);
}

function sunSector(day: number) {
  const t = (day - 2451545.5 - 7 / 24) / 36525;
  const m = (357.5291 + 35999.0503 * t - 0.0001559 * t * t - 0.00000048 * t * t * t) * rad;
  let longitude =
    (280.46645 +
      36000.76983 * t +
      0.0003032 * t * t +
      (1.9146 - 0.004817 * t - 0.000014 * t * t) * Math.sin(m) +
      (0.019993 - 0.000101 * t) * Math.sin(2 * m) +
      0.00029 * Math.sin(3 * m)) *
    rad;
  longitude -= PI * 2 * floor(longitude / (PI * 2));
  return floor((longitude / PI) * 6);
}

function month11(year: number) {
  const k = floor((julian(31, 12, year) - 2415021) / 29.530588853);
  const day = newMoon(k);
  return sunSector(day) >= 9 ? newMoon(k - 1) : day;
}

function leapOffset(a11: number) {
  const k = floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let i = 1;
  let arc = sunSector(newMoon(k + i));
  let last: number;
  do {
    last = arc;
    arc = sunSector(newMoon(k + ++i));
  } while (arc !== last && i < 14);
  return i - 1;
}

export function lunarDate(day: number, month: number, year: number) {
  const jd = julian(day, month, year);
  const k = floor((jd - 2415021.076998695) / 29.530588853);
  let start = newMoon(k + 1);
  if (start > jd) start = newMoon(k);
  let a11 = month11(year);
  let b11 = a11;
  let lunarYear: number;
  if (a11 >= start) {
    lunarYear = year;
    a11 = month11(year - 1);
  } else {
    lunarYear = year + 1;
    b11 = month11(year + 1);
  }
  const diff = floor((start - a11) / 29);
  let lunarMonth = diff + 11;
  let leap = false;
  if (b11 - a11 > 365) {
    const offset = leapOffset(a11);
    if (diff >= offset) {
      lunarMonth = diff + 10;
      leap = diff === offset;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear--;
  return { day: jd - start + 1, month: lunarMonth, year: lunarYear, leap };
}

export function greeting(now: number, name?: string | null) {
  const hour = new Date(now).getHours();
  const period =
    hour >= 5 && hour < 11 ? 'sáng' : hour >= 11 && hour < 14 ? 'trưa' : hour >= 14 && hour < 18 ? 'chiều' : 'tối';
  return `Chào buổi ${period}${name?.trim() ? `, ${name.trim()}` : ''}`;
}

export function todayDateLine(now: number) {
  const date = new Date(now);
  const lunar = lunarDate(date.getDate(), date.getMonth() + 1, date.getFullYear());
  const stems = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
  const branches = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
  const weekdays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const solar = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${weekdays[date.getDay()]}, ${solar} · ${lunar.day <= 10 ? 'Mùng ' : ''}${lunar.day} tháng ${lunar.month}${lunar.leap ? ' nhuận' : ''} ${stems[(lunar.year + 6) % 10]} ${branches[(lunar.year + 8) % 12]}`;
}
