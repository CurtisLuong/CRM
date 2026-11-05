import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { defaultTemplates } from './zalo';

describe('GN-01 — xưng hô Zalo bằng giới tính hiệu lực', () => {
  it.each([
    ['Phạm Thu Trang', null, 'Chào chị Trang'],
    ['Trần Văn Hùng', null, 'Chào anh Hùng'],
    ['Hoai Nguyen', null, 'Chào anh/chị Nguyen'],
    ['Phạm Thu Trang', 'nam', 'Chào anh Trang'],
    ['Phạm Thu Trang', 'khác', 'Chào anh/chị Trang'],
    ['Trần Văn Hùng', 'nữ', 'Chào chị Hùng'],
    ['Phạm Thu Trang', undefined, 'Chào chị Trang'],
    ['Tuan Pham', null, 'Chào anh Pham'],
  ])('%s / %s → %s, không sửa khách', (full_name, gender, expected) => {
    const customer = Object.freeze({ full_name, gender, projects: [] }) as unknown as Customer;
    const before = { ...customer };
    const templates = [{ id: 'gn01', name: 'Chào khách', text: 'Chào {anhchi} {ten}' }];
    expect(defaultTemplates(customer, Date.parse('2026-11-05T03:00:00Z'), templates)[0]?.text).toBe(expected);
    expect(customer).toEqual(before);
    expect(templates[0]?.text).toBe('Chào {anhchi} {ten}');
  });

  it('áp dụng cho cả mẫu mặc định chứa anh/chị', () => {
    const customer = { full_name: 'Phạm Thu Trang', gender: null, projects: [] } as unknown as Customer;
    const templates = defaultTemplates(customer, Date.parse('2026-11-05T03:00:00Z'));
    expect(templates.some((template) => template.text.includes('chị Trang'))).toBe(true);
    expect(templates.every((template) => !/anh\/chị/i.test(template.text))).toBe(true);
  });
});
