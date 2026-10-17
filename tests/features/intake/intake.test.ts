import { describe, expect, it } from 'vitest';
import { SOURCE_DEFAULT } from '@/config/sources';
import { CARE_STAGE_DEFAULT } from '@/config/stages';
import type { Customer } from '@/domain/customer';
import {
  addOcrNote,
  canonicalAptType,
  defaultIntakeValues,
  findPhoneMatches,
  lastUsedSource,
  mergeOcrValues,
  normalizedPhone,
  toCustomerPayload,
} from '@/features/intake/model';
import { IntakeSchema } from '@/features/intake/schema';

const customer = (overrides: Partial<Customer>): Customer =>
  ({
    id: 'customer-1',
    owner_id: 'owner-1',
    phone: '0912345678',
    full_name: 'Nguyễn Thị Mai',
    created_at: '2026-10-01T00:00:00.000Z',
    source: ['referral'],
    advanced: { life_stage: 'Gia đình trẻ', legacy_extension: { keep: true } },
    notes_manual: [{ at: '2026-10-01', text: 'Đã hỏi dự án', extra: 1 }],
    ...overrides,
  }) as Customer;

describe('intake form parity and data preservation', () => {
  it('defaults to the most recently updated known source and full v1 form defaults', () => {
    const rows = [
      customer({ id: 'older', updated_at: '2026-10-01', source: ['facebook_ads'] }),
      customer({ id: 'newer', updated_at: '2026-10-02', source: ['referral'] }),
    ];
    expect(lastUsedSource(rows)).toBe('referral');
    expect(defaultIntakeValues().care_stage).toBe(CARE_STAGE_DEFAULT);
    expect(defaultIntakeValues().source_channel).toBe(SOURCE_DEFAULT);
  });

  it('normalizes phone for duplicate checks, excluding the record being edited', () => {
    const rows = [
      customer({ id: 'same', phone: '+84 912 345 678' }),
      customer({ id: 'other', owner_id: 'owner-2', phone: '0912345678' }),
    ];
    expect(normalizedPhone('0912.345.678')).toBe('0912345678');
    expect(findPhoneMatches(rows, '0912 345 678', 'same').map((row) => row.id)).toEqual(['other']);
  });

  it('normalizes common Vietnamese apartment type aliases like v1', () => {
    expect(canonicalAptType('2 ngủ+')).toBe('2N+, 2WC');
    expect(canonicalAptType('2PN góc')).toBe('2N-2WC-G');
    expect(canonicalAptType('3N-3WC')).toBe('3N-3WC');
  });

  it('preserves unknown advanced and notes_manual keys while building an editable-field patch', () => {
    const parsed = IntakeSchema.parse({
      ...defaultIntakeValues(),
      full_name: '  Nguyễn Minh  ',
      phone: '+84 912 345 678',
      dob: '',
      advanced: { life_stage: 'Có con nhỏ', unknown_key: 17 },
    });
    const payload = toCustomerPayload(parsed, customer({}));
    expect(payload).toMatchObject({
      full_name: 'Nguyễn Minh',
      phone: '0912345678',
      advanced: { life_stage: 'Có con nhỏ', legacy_extension: { keep: true }, unknown_key: 17 },
    });
    expect(payload).not.toHaveProperty('notes_manual');
    expect(payload).not.toHaveProperty('care_stage_history');
  });

  it('accepts the v1 full-field shape and validates required and numeric fields', () => {
    const values = {
      ...defaultIntakeValues(),
      full_name: 'Nguyễn Thị Mai',
      phone: '0912345678',
      apt_area: '68.5',
      apt_floor: '12',
      projects: ['Dự án A'],
      advanced: { housing_status: 'Đang thuê' },
    };
    expect(IntakeSchema.parse(values)).toMatchObject({
      full_name: 'Nguyễn Thị Mai',
      apt_area: 68.5,
      apt_floor: 12,
      projects: ['Dự án A'],
    });
    expect(IntakeSchema.safeParse({ ...values, full_name: '', apt_area: '-1' }).success).toBe(false);
  });

  it('creates the v1 lead defaults and records the accepted-call event when qualified at intake', () => {
    const lead = IntakeSchema.parse({ ...defaultIntakeValues(), full_name: 'Nguyễn An', phone: '0912345678' });
    expect(toCustomerPayload(lead)).toMatchObject({
      care_stage: CARE_STAGE_DEFAULT,
      interest_level: 20,
      intake_method: 'manual',
    });
    const qualified = IntakeSchema.parse({
      ...defaultIntakeValues(),
      full_name: 'Nguyễn An',
      phone: '0912345678',
      qualify_now: true,
    });
    expect(toCustomerPayload(qualified)).toMatchObject({
      care_stage: 'Đang chăm sóc',
      interest_level: 60,
      call_attempts: [{ result: 'talked', note: 'Xác nhận quan tâm lúc nhập khách' }],
    });
  });

  it('only fills explicitly extracted fields and keeps operator-entered values otherwise', () => {
    const values = { ...defaultIntakeValues(), full_name: 'Tên đã nhập', interest_level: 55 };
    expect(
      mergeOcrValues(values, { full_name: null, phone: '0912345678', apt_area: null, note: 'Khách hỏi căn 2 ngủ' }),
    ).toMatchObject({
      full_name: 'Tên đã nhập',
      phone: '0912345678',
      apt_area: '',
      interest_level: 55,
      notes: '',
    });
    expect(addOcrNote([{ at: 'old', text: 'Ghi chú cũ', legacy_key: 1 }], ' Khách hỏi căn 2 ngủ ', 'now')).toEqual([
      { at: 'now', text: 'Khách hỏi căn 2 ngủ' },
      { at: 'old', text: 'Ghi chú cũ', legacy_key: 1 },
    ]);
  });
});
