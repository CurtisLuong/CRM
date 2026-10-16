import { z } from 'zod';

const optionalText = z.string().trim().optional().default('');
const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : Number.NaN;
  });

/** Form fields mirror the v1 customer payload; `advanced` keeps unknown JSONB keys (D-012). */
export const IntakeSchema = z
  .object({
    full_name: z.string().trim().min(1, 'Cần nhập họ tên.'),
    phone: z.string().trim().min(1, 'Cần nhập số điện thoại.'),
    gender: optionalText,
    dob: optionalText,
    marital_status: optionalText,
    occupation: optionalText,
    income: optionalText,
    residence: optionalText,
    registered_at: optionalText,
    source_channel: z.string().trim().min(1, 'Chọn kênh khách đến.'),
    campaign: optionalText,
    apt_type: optionalText,
    projects: z.array(z.string()).default([]),
    apt_code: optionalText,
    building_code: optionalText,
    apt_area: optionalNumber,
    apt_direction: optionalText,
    apt_floor: optionalNumber,
    apt_price: optionalNumber,
    finance: optionalNumber,
    purpose: optionalText,
    interest_level: z.union([z.string(), z.number()]).transform(Number),
    care_stage: optionalText,
    care_stage_note: optionalText,
    contact_status: optionalText,
    qualify_now: z.boolean().default(false),
    notes: optionalText,
    advanced: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((value, ctx) => {
    const normalized = value.phone.replace(/[^\d+]/g, '');
    if (normalized.length < 8) ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Số điện thoại chưa hợp lệ.' });
    for (const key of ['apt_area', 'apt_floor', 'apt_price', 'finance'] as const) {
      const number = value[key];
      if (Number.isNaN(number)) ctx.addIssue({ code: 'custom', path: [key], message: 'Giá trị phải là số.' });
    }
    if (value.apt_area !== null && !Number.isNaN(value.apt_area) && value.apt_area <= 0) {
      ctx.addIssue({ code: 'custom', path: ['apt_area'], message: 'Diện tích phải lớn hơn 0.' });
    }
    if (value.apt_floor !== null && !Number.isNaN(value.apt_floor) && !Number.isInteger(value.apt_floor)) {
      ctx.addIssue({ code: 'custom', path: ['apt_floor'], message: 'Tầng phải là số nguyên.' });
    }
  });

export type IntakeValues = {
  full_name: string;
  phone: string;
  gender: string;
  dob: string;
  marital_status: string;
  occupation: string;
  income: string;
  residence: string;
  registered_at: string;
  source_channel: string;
  campaign: string;
  apt_type: string;
  projects: string[];
  apt_code: string;
  building_code: string;
  apt_area: string | number;
  apt_direction: string;
  apt_floor: string | number;
  apt_price: string | number;
  finance: string | number;
  purpose: string;
  interest_level: string | number;
  care_stage: string;
  contact_status: string;
  care_stage_note: string;
  qualify_now: boolean;
  notes: string;
  advanced: Record<string, unknown>;
};
export type ParsedIntake = z.output<typeof IntakeSchema>;
