/// <reference types="node" />
// T2.A1 — parse không biến đổi dữ liệu (round-trip 100% fixture) + getter khớp hành vi v1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  callAttemptsOf,
  inFunnel,
  isQualified,
  leadStatus,
  normStage,
  openTasksOf,
  parseCustomer,
  parseDob,
  safeParseCustomer,
  serializeCustomer,
  sourceListOf,
} from '@/domain/customer';
import { v1 } from '../../config/v1';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'fixtures',
  'legacy-customers.json',
);
const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as { customers: Record<string, unknown>[] };
const rows = fixture.customers;
const cases = rows.map((r, i) => [`#${i + 1} ${String(r._case ?? '')}`, r] as const);

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

describe('round-trip: serialize(parse(x)) deepEqual x', () => {
  it('fixture có dữ liệu', () => {
    expect(rows.length).toBeGreaterThan(10);
  });

  it.each(cases)('%s', (_name, row) => {
    const x = deepFreeze(structuredClone(row)); // parse không được sửa đầu vào
    const out = serializeCustomer(parseCustomer(x));
    expect(out).toStrictEqual(row);
    expect(JSON.stringify(Object.keys(out).sort())).toBe(JSON.stringify(Object.keys(row).sort()));
  });

  it('giữ thuộc tính lạ ở gốc và trong mọi mảng JSONB', () => {
    const dirty = rows.find((r) => 'x_future_field' in r);
    expect(dirty).toBeDefined();
    const c = parseCustomer(dirty);
    expect(c.x_future_field).toStrictEqual({ kept: true, list: [1, 2, 3] });
    expect(c.call_attempts?.[0]?.x_channel_meta).toStrictEqual({ sim: 2 });
    expect(c.call_attempts?.[2]).toBeNull();
    expect(c.next_tasks?.[0]?.x_side).toBe('customer');
    expect(c.notes_manual?.[0]?.x_by).toBe('ai');
    expect(c.care_stage_history?.[0]?.x_source).toBe('import');
    expect(c.advanced?.x_unknown_group).toStrictEqual({ a: 1 });
  });

  it('nhận trường v2 tuỳ chọn và giữ nguyên', () => {
    const base = rows[0] as Record<string, unknown>;
    const v2 = {
      ...base,
      archived_at: null,
      contact_prefs: { do_not_contact: true, dnc_reason: 'Khách xin', x_new: 1 },
      interests: [{ id: 'i1', project: 'Marquee Homes', status: 'open', budget_max: 1500000000 }],
      household: [{ id: 'h1', name: 'Vợ', role: 'đồng quyết định' }],
      interactions: [{ at: '2026-12-01T03:00:00.000Z', channel: 'zalo', kind: 'sent', template: 'chao' }],
      close_reason: null,
      retarget_hint: { after: '2027-03-01', apt_types: ['2N-2WC'] },
      field_meta: { finance: { at: '2026-12-01T03:00:00.000Z', by: 'sale', confirmed: true } },
      referred_by: null,
      next_tasks: [{ text: 'Gửi bảng giá', at: '2026-12-01T03:00:00.000Z', side: 'me', key: 'k1', source: 'ai' }],
    };
    expect(serializeCustomer(parseCustomer(v2))).toStrictEqual(v2);
  });

  it('thiếu trường bắt buộc (phone, full_name, owner_id, id) → không parse được', () => {
    const base = rows[0] as Record<string, unknown>;
    for (const k of ['id', 'phone', 'full_name', 'owner_id']) {
      const { [k]: _drop, ...rest } = base;
      expect(safeParseCustomer(rest).success, k).toBe(false);
    }
  });
});

describe('getter = hành vi v1 trên mọi fixture', () => {
  const js = (r: unknown) => JSON.stringify(r);

  it.each(cases)('%s', (_name, row) => {
    const c = parseCustomer(row);
    expect(normStage(c.care_stage) ?? null).toStrictEqual(v1(`normStage(${js(row.care_stage ?? null)})`));
    expect(sourceListOf(c.source)).toStrictEqual(v1(`sourceListOf(${js(row.source ?? null)})`));
    expect(isQualified(c)).toBe(v1(`isQualified(${js(row)})`));
    expect(inFunnel(c)).toBe(v1(`inFunnel(${js(row)})`));
    expect(leadStatus(c)).toBe(v1(`leadStatus(${js(row)})`));
    expect(callAttemptsOf(c)).toStrictEqual(v1(`callAttemptsOf(${js(row)})`));
    expect(openTasksOf(c)).toStrictEqual(v1(`openTasksOf(${js(row)})`));
    expect(parseDob(c.dob)).toStrictEqual(v1(`LunarUtil.parseDob(${js(row.dob ?? null)})`));
  });

  it('normStage + sourceListOf với giá trị lẻ', () => {
    for (const s of ['Hỗ trợ hồ sơ', 'Booking', 'Loại', '', null]) {
      expect(normStage(s) ?? null).toStrictEqual(v1(`normStage(${js(s)})`));
    }
    for (const s of ['landing', ['manual', 'ocr', 'facebook_ads'], [], '', null, ['website', 'landing']]) {
      expect(sourceListOf(s)).toStrictEqual(v1(`sourceListOf(${js(s)})`));
    }
  });

  it('parseDob với định dạng lạ', () => {
    for (const d of [
      '1990-12-03',
      '--05-12',
      '1985-02-29',
      '1990-13-01',
      '--00-10',
      '1990/12/03',
      '0000-05-06',
      '',
      null,
    ]) {
      expect(parseDob(d)).toStrictEqual(v1(`LunarUtil.parseDob(${js(d)})`));
    }
  });

  it('getter không sửa bản ghi', () => {
    for (const row of rows) {
      const c = deepFreeze(parseCustomer(structuredClone(row)));
      callAttemptsOf(c);
      openTasksOf(c);
      sourceListOf(c.source);
      expect(serializeCustomer(c)).toStrictEqual(row);
    }
  });
});
