// @vitest-environment node
// Âm lịch / mệnh / cung / cầm tinh: phát lại golden `lunar` + so với legacy/js/lunar.js trên mọi ngày 1900–2100.
import { describe, expect, it } from 'vitest';
import * as L from '@/domain/lunar';
import { canon, golden, tryRun, V1Lunar } from '../search/legacy';

const DOBS = [
  '1990-12-03',
  '--05-12',
  '--02-29',
  '1985-02-29',
  '2000-01-01',
  '1975-02-10',
  '1975-02-11',
  '1984-02-02',
  '1984-02-01',
  '1999-12-31',
  '2024-02-10',
  '1990-13-01',
  '12/05/1990',
  '',
  null,
  'abc',
];

it('golden lunar', () => {
  const perDob = Object.fromEntries(
    DOBS.map((d) => [
      String(d),
      {
        parseDob: tryRun(() => L.parseDob(d)),
        menh: tryRun(() => L.calcMenhFromSolarDOB(d)),
        cung: tryRun(() => L.calcCungFromDOB(d)),
        camTinh: tryRun(() => L.calcCamTinhFromDOB(d)),
      },
    ]),
  );
  const solar: [number, number, number][] = [
    [1, 1, 2000],
    [10, 2, 2024],
    [9, 2, 2024],
    [29, 1, 2025],
    [21, 6, 2026],
    [17, 2, 2026],
    [16, 2, 2026],
    [31, 12, 1999],
  ];
  const lunar = Object.fromEntries(
    solar.map(([d, m, y]) => [`${d}/${m}/${y}`, tryRun(() => L.convertSolar2Lunar(d, m, y, 7))]),
  );
  const canChi = Object.fromEntries([1975, 1984, 1990, 2000, 2024, 2026].map((y) => [y, tryRun(() => L.getCanChi(y))]));
  expect(canon({ perDob, lunar, canChi })).toStrictEqual(golden('lunar'));
});

describe('parity TS ↔ v1', () => {
  it('convertSolar2Lunar + mệnh/cung/cầm tinh cho mọi ngày 1900-01-01 → 2100-12-31', () => {
    const DAY = 86400000;
    let n = 0;
    for (let t = Date.UTC(1900, 0, 1); t <= Date.UTC(2100, 11, 31); t += DAY) {
      const d = new Date(t);
      const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
      const ts = L.convertSolar2Lunar(day, m, y);
      const v1 = V1Lunar.convertSolar2Lunar(day, m, y);
      if (ts.day !== v1.day || ts.month !== v1.month || ts.year !== v1.year || ts.leap !== v1.leap)
        expect(ts, `${day}/${m}/${y}`).toStrictEqual(v1);
      if (day === 1 || day === 15 || day === 28) {
        const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        expect(L.calcMenhFromSolarDOB(iso)).toBe(V1Lunar.calcMenhFromSolarDOB(iso));
        expect(L.calcCamTinhFromDOB(iso)).toBe(V1Lunar.calcCamTinhFromDOB(iso));
        expect(L.calcCungFromDOB(iso)).toBe(V1Lunar.calcCungFromDOB(iso));
      }
      n++;
    }
    expect(n).toBe(73414);
  }, 60_000); // ~73 nghìn ngày × 2 engine

  it('can chi, mệnh theo năm, cung theo ngày/tháng, parseDob ca lạ', () => {
    for (let y = 1800; y <= 2200; y++) {
      expect(L.getCanChi(y)).toStrictEqual(V1Lunar.getCanChi(y));
      expect(L.getMenh(y)).toStrictEqual(V1Lunar.getMenh(y));
    }
    for (let m = -1; m <= 14; m++)
      for (let d = -1; d <= 33; d++) expect(L.calcCungFromDayMonth(d, m)).toBe(V1Lunar.calcCungFromDayMonth(d, m));
    for (const v of ['3', 'x', '7'] as const)
      expect(L.calcCungFromDayMonth(v, '2')).toBe(V1Lunar.calcCungFromDayMonth(v, '2'));
    for (const s of [...DOBS, '--1-1', '--13-01', '0-05-12', '1990-5-7', '1990-05', '1990-05-07-01', 12, undefined, {}])
      expect(tryRun(() => L.parseDob(s))).toStrictEqual(tryRun(() => V1Lunar.parseDob(s)));
  });
});
