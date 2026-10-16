import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'SQL/v2/006_catalog_archives.sql'), 'utf8');
const baseline = readFileSync(resolve(process.cwd(), 'SQL/schema.sql'), 'utf8');
const code = (sql: string) =>
  sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

describe('T3.8 catalog archive migration', () => {
  const sql = code(migration);

  it('adds nullable archive timestamps to catalog rows only', () => {
    for (const table of ['projects', 'buildings', 'units', 'project_apt_types', 'building_apt_types']) {
      expect(sql).toMatch(
        new RegExp(`alter table public\\.${table} add column if not exists archived_at timestamptz`, 'i'),
      );
    }
    expect(sql).not.toMatch(/\b(drop|delete from|truncate|rename|update\s+public\.)\b/i);
    expect(sql).not.toMatch(/\b(?:create|drop)\s+policy\b|\bgrant\b|\brevoke\b/i);
  });

  it('is registered in the install-from-scratch schema guide', () => {
    expect(baseline).toMatch(/SQL\/v2\/006_catalog_archives\.sql\s+→ catalog: archived_at/);
  });
});
