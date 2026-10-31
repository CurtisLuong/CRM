import { describe, expect, it } from 'vitest';
import { customerNeed } from '../src/lib/crm/customer-need';

describe('customerNeed rút gọn chỉ trên thẻ', () => {
  it.each([
    [{ apt_type: '2 phòng ngủ', projects: ['Vin Tràng Cát'] }, '2N-2WC', 'Vin TC'],
    [{ apt_type: '2N-1WC', projects: ['Happy Home'] }, '2N-1WC', 'Happy Home'],
    [{ apt_type: '2N-2WC', projects: ['Marquee Homes', 'Vin Tràng Cát'] }, '2N-2WC', 'Marquee +1'],
    [{ apt_type: 'Studio', projects: ['Nhà ở xã hội Hải Phòng'] }, 'Studio', 'NOXH Hải Phòng'],
    [{ apt_type: '1N-1WC', projects: ['Happy Home'] }, '1N-1WC', 'Happy Home'],
    [{ apt_type: 'Căn hộ ba phòng ngủ rộng', projects: ['Happy Home'] }, 'Căn hộ ba phòng ngủ rộng', 'Happy Home'],
  ])('hiện đúng %j', (source, aptType, project) => {
    expect(customerNeed(source)).toMatchObject({ aptType, project });
  });

  it('bỏ trùng dự án sau khi rút gọn và giữ tên đầy đủ cho title', () => {
    const need = customerNeed({ apt_type: '2 phòng ngủ', projects: ['Nhà ở xã hội Hải Phòng', 'NOXH Hải Phòng'] });
    expect(need).toMatchObject({ aptType: '2N-2WC', project: 'NOXH Hải Phòng' });
    expect(need.title).toBe('2 phòng ngủ · Nhà ở xã hội Hải Phòng · NOXH Hải Phòng');
  });

  it('so tên dự án không phân biệt hoa thường, gộp khoảng trắng và rút gọn cụm NOXH', () => {
    const need = customerNeed({
      projects: ['  vIN   tràng Cát ', 'Vin Tràng Cát', 'NHÀ Ở XÃ HỘI Hải Phòng'],
    });
    expect(need.project).toBe('Vin TC +1');
    expect(need.title).toBe('Chưa rõ loại căn · vIN   tràng Cát · Vin Tràng Cát · NHÀ Ở XÃ HỘI Hải Phòng');
  });
});
