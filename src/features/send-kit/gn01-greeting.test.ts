import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { type SendKitItem, sendKitText } from './model';

describe('GN-01 — xưng hô tài liệu gửi khách', () => {
  it.each([
    ['Phạm Thu Trang', null, 'Chào chị Trang'],
    ['Trần Văn Hùng', null, 'Chào anh Hùng'],
    ['Hoai Nguyen', null, 'Chào anh/chị Nguyen'],
    ['Phạm Thu Trang', 'nam', 'Chào anh Trang'],
    ['Phạm Thu Trang', 'khác', 'Chào anh/chị Trang'],
    ['Trần Văn Hùng', 'nữ', 'Chào chị Hùng'],
    ['Phạm Thu Trang', undefined, 'Chào chị Trang'],
  ])('%s / %s → %s, không sửa khách hoặc mẫu', (full_name, gender, expected) => {
    const customer = Object.freeze({ full_name, gender, projects: [] }) as unknown as Customer;
    const before = { ...customer };
    const item: SendKitItem = {
      id: 'gn01',
      title: 'Tài liệu',
      text: 'Chào {anhchi} {ten}',
      project: null,
      order: 0,
      files: [],
      updatedAt: 0,
    };
    expect(sendKitText([item], new Set([item.id]), customer)).toBe(expected);
    expect(customer).toEqual(before);
    expect(item.text).toBe('Chào {anhchi} {ten}');
  });
});
