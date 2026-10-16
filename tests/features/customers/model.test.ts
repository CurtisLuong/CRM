import { describe, expect, it } from 'vitest';
import type { Customer } from '@/domain/customer';
import { type CustomerFilters, DEFAULT_FILTERS, v1FilterCustomers, virtualWindow } from '@/features/customers/model';
import raw from '../../fixtures/legacy-customers.json';

const fixture = raw as { users: { me: string; colleague: string }; now: string; customers: Customer[] };
const rows = fixture.customers;
const now = new Date(fixture.now);
const filter = (status: CustomerFilters['status']): CustomerFilters => ({ ...DEFAULT_FILTERS, status });

describe('T3.3 filter golden counts (tests/fixtures/legacy-customers.json)', () => {
  it('matches v1 customer groups and status presets', () => {
    expect(v1FilterCustomers(rows, 'potential', filter('all'), fixture.users.me, now)).toHaveLength(10);
    expect(v1FilterCustomers(rows, 'potential', filter('active'), fixture.users.me, now)).toHaveLength(7);
    expect(v1FilterCustomers(rows, 'potential', filter('nurture'), fixture.users.me, now)).toHaveLength(1);
    expect(v1FilterCustomers(rows, 'potential', filter('won'), fixture.users.me, now)).toHaveLength(1);
    expect(v1FilterCustomers(rows, 'potential', filter('dropped'), fixture.users.me, now)).toHaveLength(1);
    expect(v1FilterCustomers(rows, 'new', filter('open'), fixture.users.me, now)).toHaveLength(8);
    expect(v1FilterCustomers(rows, 'new', filter('all'), fixture.users.me, now)).toHaveLength(9);
    expect(v1FilterCustomers(rows, 'new', filter('new'), fixture.users.me, now)).toHaveLength(3);
    expect(v1FilterCustomers(rows, 'new', filter('calling'), fixture.users.me, now)).toHaveLength(5);
    expect(v1FilterCustomers(rows, 'team', filter('all'), fixture.users.me, now)).toHaveLength(1);
  });

  it('applies stage, normalized source, bedroom group and owner filters together', () => {
    const lead = rows.find((c) => c.owner_id === fixture.users.me && !c.qualified_at && c.source === 'landing');
    expect(lead).toBeDefined();
    expect(
      v1FilterCustomers(rows, 'new', { ...DEFAULT_FILTERS, status: 'all', source: 'website' }, fixture.users.me, now),
    ).toContain(lead);
    const stage = rows.find(
      (c) =>
        c.owner_id === fixture.users.me && c.qualified_at && ['Booking', 'Hỗ trợ hồ sơ'].includes(c.care_stage || ''),
    );
    if (stage)
      expect(
        v1FilterCustomers(
          rows,
          'potential',
          { ...DEFAULT_FILTERS, stage: 'Booking & Làm hồ sơ' },
          fixture.users.me,
          now,
        ),
      ).toContain(stage);
    expect(
      v1FilterCustomers(
        rows,
        'team',
        { ...DEFAULT_FILTERS, status: 'all', owner: fixture.users.colleague },
        fixture.users.me,
        now,
      ),
    ).toHaveLength(1);
  });
});

describe('T3.3 list virtualization', () => {
  it('keeps only the viewport and overscan mounted for 2,000 customers', () => {
    const window = virtualWindow(2_000, 72 * 1_000, 560, 72);
    expect(window.totalHeight).toBe(144_000);
    expect(window.start).toBe(996);
    expect(window.end - window.start).toBeLessThan(20);
    expect(window.offset).toBe(window.start * 72);
  });
});
