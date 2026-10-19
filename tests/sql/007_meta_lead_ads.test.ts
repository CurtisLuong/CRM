import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'SQL/v2/007_meta_lead_ads.sql'), 'utf8');
const baseline = readFileSync(resolve(process.cwd(), 'SQL/schema.sql'), 'utf8');
const code = (sql: string) =>
  sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

describe('Meta Lead Ads migration (D-012 chỉ thêm)', () => {
  const sql = code(migration);

  it('chỉ thêm cột nullable cho fb_leads, không đụng dữ liệu hay cấu trúc cũ', () => {
    for (const col of [
      'owner_id',
      'phone',
      'campaign_id',
      'adset_id',
      'adset_name',
      'ad_name',
      'platform',
      'is_organic',
    ]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.fb_leads add column if not exists ${col}\\s`, 'i'));
    }
    expect(sql).not.toMatch(/add column[^;]*not null/i);
    expect(sql).not.toMatch(
      /\b(drop\s+(table|column)|delete\s+from|truncate|rename|alter\s+column|update\s+public\.(?!customers c))/i,
    );
  });

  it('bảng mới bật RLS, chỉ cho đọc (admin hoặc người nhận lead), chỉ service role ghi', () => {
    for (const table of ['fb_lead_queue', 'integration_health']) {
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${table}`, 'i'));
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${table} from anon, authenticated`, 'i'));
      expect(sql).toMatch(new RegExp(`grant select on public\\.${table} to authenticated`, 'i'));
      expect(sql).not.toMatch(
        new RegExp(`grant (insert|update|delete|all)[^;]*public\\.${table} to (anon|authenticated)`, 'i'),
      );
      expect(sql).toMatch(
        new RegExp(
          `on public\\.${table}\\s+for select using \\(public\\.is_admin\\(\\) or owner_id = auth\\.uid\\(\\)\\)`,
          'i',
        ),
      );
    }
  });

  it('hàm gắn lead chỉ service role gọi được, chỉ thêm vào interactions/source', () => {
    expect(sql).toMatch(
      /create or replace function public\.fb_attach_lead\(p_customer_id uuid, p_interaction jsonb\)/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.fb_attach_lead\(uuid, jsonb\) from public, anon, authenticated/i,
    );
    expect(sql).toMatch(/grant execute on function public\.fb_attach_lead\(uuid, jsonb\) to service_role/i);
    const body = sql.slice(sql.search(/create or replace function public\.fb_attach_lead/i));
    const setClause = body.slice(body.search(/\bset\s+interactions/i), body.search(/\bwhere c\.id/i));
    expect(setClause).toMatch(/interactions = jsonb_build_array\(p_interaction\) \|\| coalesce\(c\.interactions/i);
    expect(setClause.match(/^\s*(\w+)\s*=/gm)?.map((m) => m.trim().replace(/\s*=$/, ''))).toEqual(['source']);
  });

  it('được ghi vào hướng dẫn dựng schema', () => {
    expect(baseline).toMatch(/SQL\/v2\/007_meta_lead_ads\.sql\s+→ Meta Lead Ads/);
  });
});
