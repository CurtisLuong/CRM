import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'SQL/v2/008_fb_leads_service_grant.sql'), 'utf8')
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .trim();

describe('008 quyền ghi fb_leads cho Worker', () => {
  it('chỉ một câu GRANT cho service_role, không cấp cho app, không đụng dữ liệu', () => {
    expect(sql).toBe('grant select, insert, update on public.fb_leads to service_role;');
  });
});
