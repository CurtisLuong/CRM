/**
 * lunar.js — Chuyển dương lịch sang âm lịch (múi giờ VN, UTC+7)
 * và tra "Mệnh" (Ngũ Hành Nạp Âm) theo năm sinh âm lịch.
 *
 * Thuật toán chuyển đổi dựa trên phương pháp thiên văn chuẩn dùng phổ biến
 * cho lịch âm Việt Nam (múi giờ 7, kinh tuyến 105 Đông).
 */

const PI = Math.PI;

function INT(d) { return Math.floor(d); }

function jdFromDate(dd, mm, yy) {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) {
    jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  }
  return jd;
}

function jdToDate(jd) {
  let a, b, c;
  if (jd > 2299160) {
    a = jd + 32044;
    b = INT((4 * a + 3) / 146097);
    c = a - INT((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }
  const d = INT((4 * c + 3) / 1461);
  const e = c - INT((1461 * d) / 4);
  const m = INT((5 * e + 2) / 153);
  const day = e - INT((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * INT(m / 10);
  const year = b * 100 + d - 4800 + INT(m / 10);
  return [day, month, year];
}

function NewMoon(k) {
  const T = k / 1236.85;
  const T2 = T * T, T3 = T2 * T, dr = PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 -= 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 += 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 -= 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 -= 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 += 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  let deltat;
  if (T < -11) {
    deltat = 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3;
  } else {
    deltat = -0.000278 + 0.000265 * T + 0.000262 * T2;
  }
  return Jd1 + C1 - deltat;
}

function SunLongitude(jdn) {
  const T = (jdn - 2451545.0) / 36525;
  const T2 = T * T, dr = PI / 180;
  const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
  let L = L0 + DL;
  L = L * dr;
  L = L - PI * 2 * INT(L / (PI * 2));
  return L;
}

function getSunLongitude(dayNumber, timeZone) {
  return INT(SunLongitude(dayNumber - 0.5 - timeZone / 24) / PI * 6);
}

function getNewMoonDay(k, timeZone) {
  return INT(NewMoon(k) + 0.5 + timeZone / 24);
}

function getLunarMonth11(yy, timeZone) {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  let nm = getNewMoonDay(k, timeZone);
  const sunLong = getSunLongitude(nm, timeZone);
  if (sunLong >= 9) {
    nm = getNewMoonDay(k - 1, timeZone);
  }
  return nm;
}

function getLeapMonthOffset(a11, timeZone) {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0, i = 1, arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  do {
    last = arc;
    i++;
    arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  } while (arc !== last && i < 14);
  return i - 1;
}

/** Trả về [ngày, tháng, năm âm lịch, có nhuận hay không] */
function convertSolar2Lunar(dd, mm, yy, timeZone = 7) {
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = INT((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = getNewMoonDay(k + 1, timeZone);
  if (monthStart > dayNumber) monthStart = getNewMoonDay(k, timeZone);

  let a11 = getLunarMonth11(yy, timeZone);
  let b11 = a11;
  let lunarYear;
  if (a11 >= monthStart) {
    lunarYear = yy;
    a11 = getLunarMonth11(yy - 1, timeZone);
  } else {
    lunarYear = yy + 1;
    b11 = getLunarMonth11(yy + 1, timeZone);
  }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11) / 29);
  let lunarMonth = diff + 11;
  let lunarLeap = false;
  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11, timeZone);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthDiff) lunarLeap = true;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return { day: lunarDay, month: lunarMonth, year: lunarYear, leap: lunarLeap };
}

// ------------------ Can Chi + Ngũ Hành Nạp Âm ------------------

const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
const CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];

// Bảng Lục Thập Hoa Giáp — 30 Nạp Âm (mỗi Nạp Âm ứng 2 năm can chi liên tiếp)
// key = "canIndex,chiIndex" của năm đầu tiên trong cặp
const NAP_AM_TABLE = [
  { pair: ['Giáp Tý', 'Ất Sửu'], name: 'Hải Trung Kim', element: 'Kim' },
  { pair: ['Bính Dần', 'Đinh Mão'], name: 'Lư Trung Hỏa', element: 'Hỏa' },
  { pair: ['Mậu Thìn', 'Kỷ Tỵ'], name: 'Đại Lâm Mộc', element: 'Mộc' },
  { pair: ['Canh Ngọ', 'Tân Mùi'], name: 'Lộ Bàng Thổ', element: 'Thổ' },
  { pair: ['Nhâm Thân', 'Quý Dậu'], name: 'Kiếm Phong Kim', element: 'Kim' },
  { pair: ['Giáp Tuất', 'Ất Hợi'], name: 'Sơn Đầu Hỏa', element: 'Hỏa' },
  { pair: ['Bính Tý', 'Đinh Sửu'], name: 'Giản Hạ Thủy', element: 'Thủy' },
  { pair: ['Mậu Dần', 'Kỷ Mão'], name: 'Thành Đầu Thổ', element: 'Thổ' },
  { pair: ['Canh Thìn', 'Tân Tỵ'], name: 'Bạch Lạp Kim', element: 'Kim' },
  { pair: ['Nhâm Ngọ', 'Quý Mùi'], name: 'Dương Liễu Mộc', element: 'Mộc' },
  { pair: ['Giáp Thân', 'Ất Dậu'], name: 'Tuyền Trung Thủy', element: 'Thủy' },
  { pair: ['Bính Tuất', 'Đinh Hợi'], name: 'Ốc Thượng Thổ', element: 'Thổ' },
  { pair: ['Mậu Tý', 'Kỷ Sửu'], name: 'Tích Lịch Hỏa', element: 'Hỏa' },
  { pair: ['Canh Dần', 'Tân Mão'], name: 'Tùng Bách Mộc', element: 'Mộc' },
  { pair: ['Nhâm Thìn', 'Quý Tỵ'], name: 'Trường Lưu Thủy', element: 'Thủy' },
  { pair: ['Giáp Ngọ', 'Ất Mùi'], name: 'Sa Trung Kim', element: 'Kim' },
  { pair: ['Bính Thân', 'Đinh Dậu'], name: 'Sơn Hạ Hỏa', element: 'Hỏa' },
  { pair: ['Mậu Tuất', 'Kỷ Hợi'], name: 'Bình Địa Mộc', element: 'Mộc' },
  { pair: ['Canh Tý', 'Tân Sửu'], name: 'Bích Thượng Thổ', element: 'Thổ' },
  { pair: ['Nhâm Dần', 'Quý Mão'], name: 'Kim Bạc Kim', element: 'Kim' },
  { pair: ['Giáp Thìn', 'Ất Tỵ'], name: 'Phú Đăng Hỏa', element: 'Hỏa' },
  { pair: ['Bính Ngọ', 'Đinh Mùi'], name: 'Thiên Hà Thủy', element: 'Thủy' },
  { pair: ['Mậu Thân', 'Kỷ Dậu'], name: 'Đại Trạch Thổ', element: 'Thổ' },
  { pair: ['Canh Tuất', 'Tân Hợi'], name: 'Thoa Xuyến Kim', element: 'Kim' },
  { pair: ['Nhâm Tý', 'Quý Sửu'], name: 'Tang Đố Mộc', element: 'Mộc' },
  { pair: ['Giáp Dần', 'Ất Mão'], name: 'Đại Khê Thủy', element: 'Thủy' },
  { pair: ['Bính Thìn', 'Đinh Tỵ'], name: 'Sa Trung Thổ', element: 'Thổ' },
  { pair: ['Mậu Ngọ', 'Kỷ Mùi'], name: 'Thiên Thượng Hỏa', element: 'Hỏa' },
  { pair: ['Canh Thân', 'Tân Dậu'], name: 'Thạch Lựu Mộc', element: 'Mộc' },
  { pair: ['Nhâm Tuất', 'Quý Hợi'], name: 'Đại Hải Thủy', element: 'Thủy' },
];

function getCanChi(lunarYear) {
  const canIdx = ((lunarYear - 4) % 10 + 10) % 10;
  const chiIdx = ((lunarYear - 4) % 12 + 12) % 12;
  return { canIdx, chiIdx, text: `${CAN[canIdx]} ${CHI[chiIdx]}` };
}

function getMenh(lunarYear) {
  const { text } = getCanChi(lunarYear);
  const entry = NAP_AM_TABLE.find((e) => e.pair.includes(text));
  if (!entry) return null;
  return { canChi: text, name: entry.name, element: entry.element };
}

/**
 * Hàm chính: nhận ngày sinh dương lịch (yyyy-mm-dd), trả về chuỗi hiển thị
 * vd: "Mệnh Kim — Hải Trung Kim (Ất Sửu, 1985)"
 */
function calcMenhFromSolarDOB(isoDateStr) {
  if (!isoDateStr) return '';
  const [y, m, d] = isoDateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  const lunar = convertSolar2Lunar(d, m, y, 7);
  const menh = getMenh(lunar.year);
  if (!menh) return '';
  return `Mệnh ${menh.element} — ${menh.name} (${menh.canChi}, ${lunar.year} AL)`;
}

// export cho app.js dùng
window.LunarUtil = { convertSolar2Lunar, getCanChi, getMenh, calcMenhFromSolarDOB };
