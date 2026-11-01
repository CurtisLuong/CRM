import { describe, expect, it } from 'vitest';
import { customerNeed } from '../src/lib/crm/customer-need';

describe('customerNeed', () => {
  it.each([
    [{ apt_type: '2N-2WC', projects: ['Happy Home'] }, '2N-2WC', 'Happy Home'],
    [{ apt_type: null, projects: ['Happy Home', 'Vinhomes Marina'] }, 'Chưa rõ loại căn', 'Happy Home +1'],
    [{}, 'Chưa rõ loại căn', 'Chưa rõ dự án'],
    [{ interests: [{ apt_type: '3N-2WC', project: 'Hoàng Huy', status: 'open' }] }, '3N-2WC', 'Hoàng Huy'],
    [
      { projects: ['Happy Home'], interests: [{ project: 'Happy Home', status: 'open' }] },
      'Chưa rõ loại căn',
      'Happy Home',
    ],
    [
      { interests: [{ apt_type: '3N-2WC', project: 'Hoàng Huy', status: 'closed' }] },
      'Chưa rõ loại căn',
      'Chưa rõ dự án',
    ],
  ])('formats %j', (source, aptType, project) => {
    expect(customerNeed(source)).toEqual({ aptType, project });
  });
});
