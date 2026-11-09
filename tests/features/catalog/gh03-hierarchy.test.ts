import { describe, expect, it } from 'vitest';
import { catalogBuildings, catalogScopeCounts, projectSelection } from '@/features/catalog/model';

const buildings = [
  { id: 'a1', project_id: 'a', code: 'A1' },
  { id: 'a2', project_id: 'a', code: 'A2' },
  { id: 'b1', project_id: 'b', code: 'B1' },
];
const units = [
  { project_id: 'a', building_id: 'a1' },
  { project_id: 'a', building_id: 'a1' },
  { project_id: 'a', building_id: 'a2' },
  { project_id: 'b', building_id: 'b1' },
];

describe('GH-03 phạm vi cha → con', () => {
  it('giữ mọi toà khi tất cả dự án, thu hẹp khi chọn cha, không sửa đầu vào', () => {
    expect(catalogBuildings(buildings, '')).toEqual(buildings);
    expect(catalogBuildings(buildings, 'b')).toEqual([buildings[2]]);
    expect(buildings).toHaveLength(3);
  });

  it('giữ toà cùng cha, xoá lựa chọn toà khác cha hoặc không còn tồn tại', () => {
    expect(projectSelection('a', 'a1', buildings)).toEqual({ projectId: 'a', buildingId: 'a1' });
    expect(projectSelection('b', 'a1', buildings)).toEqual({ projectId: 'b', buildingId: '' });
    expect(projectSelection('a', 'missing', buildings)).toEqual({ projectId: 'a', buildingId: '' });
    expect(projectSelection('', '', buildings)).toEqual({ projectId: '', buildingId: '' });
  });

  it('đếm dự án và toà độc lập với các bộ lọc căn', () => {
    expect(catalogScopeCounts(buildings, units, '')).toEqual({ buildings: 3, units: 4 });
    expect(catalogScopeCounts(buildings, units, 'a')).toEqual({ buildings: 2, units: 3 });
    expect(catalogScopeCounts(buildings, units, 'a', 'a1')).toEqual({ buildings: 2, units: 2 });
    expect(catalogScopeCounts([], [], '')).toEqual({ buildings: 0, units: 0 });
  });
});
