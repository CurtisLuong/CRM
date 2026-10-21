import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'SQL/v2/009_lead_campaign_projects.sql'), 'utf8')
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('009 quy tắc chiến dịch → dự án', () => {
  it('chỉ thêm bảng, xoá mềm, RLS theo người tạo, không cho xoá cứng', () => {
    expect(sql).toMatch(/create table if not exists public\.lead_campaign_projects/i);
    expect(sql).toMatch(/archived_at\s+timestamptz/i);
    expect(sql).toMatch(/unique \(owner_id, campaign\)/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/grant select, insert, update on public\.lead_campaign_projects to authenticated/i);
    expect(sql).not.toMatch(/grant[^;]*delete[^;]*lead_campaign_projects/i);
    expect(sql).not.toMatch(/\b(drop\s+(table|column)|delete\s+from|truncate|alter\s+column|update\s+public\.)/i);
  });
});
