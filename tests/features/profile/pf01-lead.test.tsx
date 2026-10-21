import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { buildAiContext } from '@/domain/customer/aiContext';
import { ProfileTextField } from '@/features/profile/advanced';

// Lead vá sau review PF-01.
describe('PF-01 Lead', () => {
  it('ô số vẫn cho thấy ghi cũ dạng chữ thay vì hiện trống', () => {
    render(<ProfileTextField label="Vốn hiện có" type="number" value="2 tỷ" disabled={false} onSave={() => {}} />);
    expect(screen.getByText('Đang lưu: 2 tỷ')).toBeTruthy();
  });

  it('ô số có giá trị số thì không hiện dòng ghi cũ', () => {
    render(<ProfileTextField label="Vốn hiện có" type="number" value={500000000} disabled={false} onSave={() => {}} />);
    expect(screen.queryByText(/Đang lưu:/)).toBeNull();
  });

  it('AI đọc được 2 ô gộp mới', () => {
    const context = buildAiContext({
      id: 'c1',
      owner_id: 'u1',
      full_name: 'Lan',
      phone: '0901234567',
      advanced: { life_context: '- Mới cưới, ở nhà thuê', pref_conditions: 'Không chấp nhận tầng thấp' },
    } as Customer);
    expect(context.memory_facts.map((fact) => fact.fact)).toEqual([
      '- Mới cưới, ở nhà thuê',
      'Không chấp nhận tầng thấp',
    ]);
  });
});
