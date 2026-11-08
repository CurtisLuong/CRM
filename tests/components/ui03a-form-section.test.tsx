import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { CollapsibleFormSection, FormSection, FormSubsection, LONG_FIELD, SHORT_FIELD } from '@/components/crm';
import { LONG_FIELD as PROFILE_LONG, SHORT_FIELD as PROFILE_SHORT } from '@/features/profile/fields';

function Example({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <CollapsibleFormSection title={name} open={open} onOpenChange={setOpen}>
      <FormSubsection title={`Mục con ${name}`}>
        <label className={SHORT_FIELD}>
          Kênh {name}
          <input />
        </label>
        <label className={LONG_FIELD}>
          Ghi chú {name}
          <textarea />
        </label>
      </FormSubsection>
    </CollapsibleFormSection>
  );
}

describe('UI-03a — khuôn form dùng chung', () => {
  it('giữ lớp ô ngắn/dài tương thích và đặt ô trong thẻ dưới tiêu đề khu', () => {
    expect(PROFILE_SHORT).toBe(SHORT_FIELD);
    expect(PROFILE_LONG).toBe(LONG_FIELD);
    render(
      <FormSection title="Thông tin">
        <label className={SHORT_FIELD}>
          Số điện thoại
          <input />
        </label>
      </FormSection>,
    );
    const heading = screen.getByRole('heading', { name: 'Thông tin' });
    const field = screen.getByLabelText('Số điện thoại');
    expect(field.closest('[data-form-card]')).not.toBeNull();
    expect(heading.parentElement?.contains(field)).toBe(true);
  });

  it('nhiều khu thu gọn có panel độc lập, đầu khu và mục con cùng một thẻ', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Example name="Nâng cao A" />
        <Example name="Nâng cao B" />
      </>,
    );
    const a = screen.getByRole('button', { name: 'Nâng cao A' });
    const b = screen.getByRole('button', { name: 'Nâng cao B' });
    expect(a.getAttribute('aria-controls')).not.toBe(b.getAttribute('aria-controls'));
    expect(screen.queryByRole('heading', { name: 'Mục con Nâng cao A' })).toBeNull();
    await user.click(a);
    expect(a.getAttribute('aria-expanded')).toBe('true');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    const card = a.closest('[data-form-card]') as HTMLElement;
    const sub = within(card).getByRole('heading', { name: 'Mục con Nâng cao A' }).parentElement as HTMLElement;
    expect(sub.closest('[data-form-card]')).toBe(card);
    expect(document.getElementById(a.getAttribute('aria-controls') || '')?.contains(sub)).toBe(true);
    await user.click(a);
    expect(screen.queryByLabelText('Kênh Nâng cao A')).toBeNull();
    expect(a.getAttribute('aria-expanded')).toBe('false');
  });
});
