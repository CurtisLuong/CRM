/**
 * Kiểm tra tĩnh migration v2 002–005 (T2.A5, D-012): đọc file SQL, không cần database.
 * Chạy thật trên staging: tests/sql/002_005_v2.test.sql.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FILES = [
  '002_customer_memory.sql',
  '003_campaign_costs.sql',
  '004_user_settings_ui_state.sql',
  '005_units_verified_at.sql',
] as const;

// Vitest chạy ở gốc repo (jsdom làm import.meta.url không dùng được).
const read = (name: string) => readFileSync(resolve(process.cwd(), 'SQL/v2', name), 'utf8');

/** Bỏ chú thích `-- …` để chỉ kiểm lệnh thật. */
const code = (sql: string) =>
  sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

const FORBIDDEN: [string, RegExp][] = [
  ['drop table/column/schema', /\bdrop\s+(table|column|schema)\b/i],
  ['rename', /\brename\b/i],
  ['đổi kiểu cột', /\balter\s+column\b/i],
  ['truncate', /\btruncate\b/i],
  ['delete dữ liệu', /\bdelete\s+from\b/i],
  ['update dữ liệu', /\bupdate\s+(public\.)?\w+\s+set\b/i],
  ['insert dữ liệu', /\binsert\s+into\b/i],
  ['set not null', /\bset\s+not\s+null\b/i],
  ['service_role key', /service_role_key|eyJhbGci/i],
];

describe.each(FILES)('SQL/v2/%s', (name) => {
  const sql = code(read(name));

  it('không có lệnh phá/sửa dữ liệu', () => {
    for (const [label, re] of FORBIDDEN) expect(re.test(sql), label).toBe(false);
  });

  it('mọi add column / create table / create index đều IF NOT EXISTS', () => {
    for (const m of sql.matchAll(/\badd\s+column\b(?!\s+if\s+not\s+exists)/gi))
      throw new Error(`add column thiếu IF NOT EXISTS: ${m[0]}`);
    for (const m of sql.matchAll(/\bcreate\s+table\b(?!\s+if\s+not\s+exists)/gi))
      throw new Error(`create table thiếu IF NOT EXISTS: ${m[0]}`);
    for (const m of sql.matchAll(/\bcreate\s+(unique\s+)?index\b(?!\s+if\s+not\s+exists)/gi))
      throw new Error(`create index thiếu IF NOT EXISTS: ${m[0]}`);
  });

  it('policy / trigger tạo lại được (drop … if exists trước create)', () => {
    for (const m of sql.matchAll(/\bcreate\s+(policy|trigger)\s+(\w+)/gi)) {
      expect(sql, `${m[1]} ${m[2]}`).toMatch(new RegExp(`drop\\s+${m[1]}\\s+if\\s+exists\\s+${m[2]}\\b`, 'i'));
    }
  });

  it('cột mới không NOT NULL (v1 không gửi cột này)', () => {
    for (const m of sql.matchAll(/add\s+column\s+if\s+not\s+exists\s+[^;]*/gi)) expect(m[0]).not.toMatch(/not\s+null/i);
  });
});

describe('002_customer_memory: đủ cột §3.4', () => {
  const sql = code(read('002_customer_memory.sql'));
  it.each([
    ['archived_at', 'timestamptz'],
    ['contact_prefs', 'jsonb'],
    ['interests', 'jsonb'],
    ['household', 'jsonb'],
    ['interactions', 'jsonb'],
    ['close_reason', 'text'],
    ['close_note', 'text'],
    ['retarget_hint', 'jsonb'],
    ['field_meta', 'jsonb'],
    ['referred_by', 'uuid'],
  ])('%s %s', (col, type) => {
    expect(sql).toMatch(
      new RegExp(`alter table public\\.customers add column if not exists ${col}\\s+${type}\\b`, 'i'),
    );
  });
});

describe('003_campaign_costs: bảng mới có RLS + policy + GRANT', () => {
  const sql = code(read('003_campaign_costs.sql'));

  it('bật RLS', () => {
    expect(sql).toMatch(/alter table public\.campaign_costs enable row level security/i);
  });

  it('policy select/insert/update cho authenticated theo auth.uid()', () => {
    for (const op of ['select', 'insert', 'update']) {
      expect(sql).toMatch(
        new RegExp(`create policy campaign_costs_${op} on public\\.campaign_costs\\s+for ${op} to authenticated`, 'i'),
      );
    }
    expect(sql).toMatch(/with check \(owner_id = auth\.uid\(\)\)/i);
  });

  it('chỉ người tạo ghi (admin chỉ đọc), không có policy delete', () => {
    const update = sql.match(/create policy campaign_costs_update[\s\S]*?;/i)?.[0] ?? '';
    expect(update).not.toMatch(/is_admin/i);
    expect(sql).not.toMatch(/for\s+(delete|all)\b/i);
  });

  it('GRANT tối thiểu: select/insert/update, không delete, thu quyền anon', () => {
    expect(sql).toMatch(/revoke all on public\.campaign_costs from public, anon, authenticated/i);
    expect(sql).toMatch(/grant select, insert, update on public\.campaign_costs to authenticated/i);
    expect(sql).not.toMatch(/grant[^;]*\bdelete\b[^;]*campaign_costs/i);
    expect(sql).not.toMatch(/grant[^;]*campaign_costs[^;]*\banon\b/i);
  });

  it('có xoá mềm + updated_at cho LWW', () => {
    expect(sql).toMatch(/archived_at\s+timestamptz/i);
    expect(sql).toMatch(/updated_at\s+timestamptz not null default now\(\)/i);
  });
});

describe('004/005 thêm đúng cột', () => {
  it('user_settings.ui_state jsonb', () => {
    expect(code(read('004_user_settings_ui_state.sql'))).toMatch(
      /alter table public\.user_settings add column if not exists ui_state jsonb/i,
    );
  });
  it('units.verified_at timestamptz', () => {
    expect(code(read('005_units_verified_at.sql'))).toMatch(
      /alter table public\.units add column if not exists verified_at timestamptz/i,
    );
  });
});
