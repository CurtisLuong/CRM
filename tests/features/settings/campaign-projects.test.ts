import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import {
  activeCampaignProject,
  campaignFillCandidates,
  campaignProjectRows,
  hasNoProjects,
} from '@/features/settings/model';

const customer = (overrides: Partial<Customer> & { id: string }): Customer =>
  ({
    phone: '0900000000',
    full_name: overrides.id,
    owner_id: 'u1',
    source: ['facebook_ads'],
    ...overrides,
  }) as Customer;

describe('dự án theo chiến dịch quảng cáo', () => {
  it('luật 1: gom chiến dịch facebook_ads của mình + quy tắc chưa lưu trữ, đếm đúng khách', () => {
    const customers = [
      customer({ id: 'c1', campaign: 'Chiến dịch A' }),
      customer({ id: 'c2', campaign: 'Chiến dịch A' }),
      // Cùng tên chiến dịch nhưng không phải kênh quảng cáo → không sinh dòng, không đếm.
      customer({ id: 'c3', campaign: 'Chiến dịch A', source: ['website'] }),
      customer({ id: 'c4', campaign: 'Chiến dịch B' }),
      customer({ id: 'c5', campaign: '   ' }),
      // Khách đã lưu trữ không còn trong danh sách cần chăm.
      customer({ id: 'c6', campaign: 'Chiến dịch C', archived_at: '2026-10-01T00:00:00.000Z' }),
    ];
    const rules = [
      { campaign: 'Chiến dịch B', project: 'Marquee Homes' },
      { campaign: 'Chiến dịch D', project: 'Vin Tràng Cát' },
      { campaign: 'Chiến dịch A', project: 'Dự án cũ', archived_at: '2026-10-02T00:00:00.000Z' },
    ];

    const rows = campaignProjectRows(customers, rules);
    expect(rows.map((row) => row.campaign).sort()).toEqual(['Chiến dịch A', 'Chiến dịch B', 'Chiến dịch D']);
    expect(rows.find((row) => row.campaign === 'Chiến dịch A')).toEqual({
      campaign: 'Chiến dịch A',
      customerCount: 2,
      project: null,
    });
    expect(rows.find((row) => row.campaign === 'Chiến dịch B')).toEqual({
      campaign: 'Chiến dịch B',
      customerCount: 1,
      project: 'Marquee Homes',
    });
    // Chiến dịch chỉ còn quy tắc (không còn khách) vẫn hiện, 0 khách.
    expect(rows.find((row) => row.campaign === 'Chiến dịch D')).toEqual({
      campaign: 'Chiến dịch D',
      customerCount: 0,
      project: 'Vin Tràng Cát',
    });
    expect(activeCampaignProject(rules, 'Chiến dịch A')).toBeNull();
    // Không có chiến dịch nào và không có quy tắc → màn hiện câu "Chưa có lead…".
    expect(campaignProjectRows([], [])).toEqual([]);
  });

  it('luật 3: chiến dịch có 3 khách, 1 đã có dự án → chỉ chọn 2 khách đang trống', () => {
    const customers = [
      customer({ id: 'c1', campaign: 'Chiến dịch A', projects: [] }),
      customer({ id: 'c2', campaign: 'Chiến dịch A' }),
      customer({ id: 'c3', campaign: 'Chiến dịch A', projects: ['Vin Tràng Cát'] }),
      customer({ id: 'c4', campaign: 'Chiến dịch B', projects: [] }),
      customer({ id: 'c5', campaign: 'Chiến dịch A', archived_at: '2026-10-01T00:00:00.000Z' }),
    ];

    const targets = campaignFillCandidates(customers, 'Chiến dịch A');
    expect(targets.map((row) => row.id)).toEqual(['c1', 'c2']);
    expect(targets.some((row) => row.projects?.includes('Vin Tràng Cát'))).toBe(false);
    expect(campaignFillCandidates(customers, '  ')).toEqual([]);
  });

  it('projects rỗng thật sự: không có mảng, mảng rỗng hoặc toàn chuỗi trắng', () => {
    expect(hasNoProjects(customer({ id: 'a' }))).toBe(true);
    expect(hasNoProjects(customer({ id: 'b', projects: [] }))).toBe(true);
    expect(hasNoProjects(customer({ id: 'c', projects: ['', '  '] }))).toBe(true);
    expect(hasNoProjects(customer({ id: 'd', projects: ['Vin Tràng Cát'] }))).toBe(false);
  });
});
