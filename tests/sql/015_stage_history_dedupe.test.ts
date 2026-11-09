import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'SQL/v2/015_stage_history_dedupe.sql'), 'utf8');
// Phần chạy thật (bỏ dòng chú thích): mục 2–5 để dạng chú thích, người chạy tự bỏ dấu "--".
const live = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('015 dọn mốc bậc cùng bậc (ST-01)', () => {
  it('chỉ khách đang chăm sóc, có sao lưu, không mở quyền cho app', () => {
    expect(live).toMatch(/archived_at is null/);
    expect(live).toMatch(/disqualified_at is null/);
    expect(live).toMatch(/coalesce\(care_stage, ''\) <> 'Loại'/);
    expect(live).toMatch(/insert into public\.customer_stage_history_backup_015/);
    expect(live).toMatch(
      /revoke all on table public\.customer_stage_history_backup_015 from public, anon, authenticated/,
    );
    expect(live).toMatch(
      /revoke all on function public\.st015_stage_dedupe\(boolean\) from public, anon, authenticated/,
    );
    expect(live).toMatch(/enable row level security/);
  });

  it('chỉ thêm bảng/hàm khi chạy file: không drop, không tự áp dụng', () => {
    expect(live).not.toMatch(/\bdrop\s+(table|column)/i);
    expect(live).not.toMatch(/alter\s+table\s+public\.customers/i);
    expect(live).not.toMatch(/st015_stage_dedupe\(true\)/);
    // Bậc cũ đọc như normStage (src/config/stages.ts CARE_STAGE_LEGACY).
    expect(live).toContain("when 'Booking' then 'Booking & Làm hồ sơ'");
    expect(live).toContain("when 'Hỗ trợ hồ sơ' then 'Booking & Làm hồ sơ'");
  });
});
