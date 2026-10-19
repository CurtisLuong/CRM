import { describe, expect, it } from 'vitest';
import type { IntegrationHealth } from '@/data/hooks';
import {
  HEALTH_STALE_TEXT,
  integrationHealthLevel,
  integrationHealthSummary,
  isIntegrationHealthStale,
} from '@/features/settings/model';

const NOW = new Date('2026-10-19T10:31:00+07:00').getTime();

function row(overrides: Partial<IntegrationHealth> = {}): IntegrationHealth {
  return {
    id: 'meta_lead_ads',
    owner_id: 'owner-1',
    status: 'ok',
    message: null,
    token_expires_at: null,
    last_lead_at: null,
    last_webhook_at: null,
    pending_count: 0,
    stuck_count: 0,
    details: {},
    checked_at: '2026-10-19T10:05:00+07:00',
    ...overrides,
  };
}

describe('Facebook Lead Ads health model', () => {
  it('maps the three worker statuses to Vietnamese labels and tones', () => {
    expect(integrationHealthLevel('ok')).toEqual({ label: 'Đang hoạt động', tone: 'success' });
    expect(integrationHealthLevel('warning')).toEqual({ label: 'Cần chú ý', tone: 'warning' });
    expect(integrationHealthLevel('error')).toEqual({ label: 'Đang lỗi', tone: 'danger' });
  });

  it('calls data stale only after more than 30 minutes', () => {
    // Số chuẩn luật 5: 10:31 so với 10:00 = 31 phút (cũ), 10:05 = 26 phút (không cũ).
    expect(isIntegrationHealthStale('2026-10-19T10:00:00+07:00', NOW)).toBe(true);
    expect(isIntegrationHealthStale('2026-10-19T10:05:00+07:00', NOW)).toBe(false);
    expect(isIntegrationHealthStale('2026-10-19T10:01:00+07:00', NOW)).toBe(false);
    // Mốc không đọc được thì không thể chứng minh kết nối còn sống.
    expect(isIntegrationHealthStale('not-a-date', NOW)).toBe(true);
    expect(isIntegrationHealthStale(null, NOW)).toBe(true);
  });

  it('builds the Settings card text without raw codes or ISO dates', () => {
    const summary = integrationHealthSummary(
      row({
        status: 'error',
        message: 'Token Facebook đã hết hạn.',
        last_lead_at: null,
        pending_count: 4,
        stuck_count: 2,
        token_expires_at: null,
        checked_at: '2026-10-19T10:05:00+07:00',
      }),
      NOW,
    );
    expect(summary.level).toEqual({ label: 'Đang lỗi', tone: 'danger' });
    expect(summary.message).toBe('Token Facebook đã hết hạn.');
    expect(summary.lastLeadText).toBe('Lead gần nhất: Chưa có');
    expect(summary.pendingText).toBe('Đang chờ tự thử lại: 4 lead');
    expect(summary.stuckText).toBe('Cần xử lý tay: 2 lead');
    expect(summary.tokenText).toBe('Token Facebook: không hết hạn');
    expect(summary.checkedText).toMatch(/^Kiểm tra lúc: \d{2}:\d{2} \d{2}\/\d{2}\/\d{4}$/);
    expect(summary.stale).toBe(false);
    expect(summary.staleText).toBeNull();
    expect(JSON.stringify(summary)).not.toContain('2026-10-19T');
    expect(JSON.stringify(summary)).not.toContain('meta_lead_ads');
  });

  it('hides the stuck line at zero and adds the stale sentence when the worker stopped', () => {
    const summary = integrationHealthSummary(
      row({
        status: 'ok',
        pending_count: 0,
        stuck_count: 0,
        token_expires_at: '2026-11-05T00:00:00+07:00',
        checked_at: '2026-10-19T10:00:00+07:00',
      }),
      NOW,
    );
    expect(summary.stuckText).toBeNull();
    expect(summary.stale).toBe(true);
    expect(summary.staleText).toBe(HEALTH_STALE_TEXT);
    expect(summary.tokenText).toMatch(/^Token Facebook: hết hạn \d{2}\/\d{2}\/\d{4}$/);
  });
});
