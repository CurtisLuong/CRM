// T1.2 — mọi hằng số trong src/config phải bằng đúng giá trị v1 (deep equal), nạp từ legacy/.
import * as Lucide from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { ADVANCED_FIELDS, ADVANCED_GROUPS } from '@/config/advanced';
import { APT_ALIAS_BASE, APT_ALIAS_CORNER, APT_ALIAS_PLUS, APT_TYPES } from '@/config/aptTypes';
import { CALL_RESULT_MISS, CALL_RESULT_SETS, CALL_RESULTS, SHORT_CALL_SEC } from '@/config/callResults';
import { DOC_KIND_LABELS } from '@/config/docKinds';
import { FOLLOWUP_CONFIG, ZALO_SENDER_NAME, ZALO_TEMPLATES_DEFAULT, ZALO_TEMPLATES_PREVIOUS } from '@/config/followup';
import { ICON_FALLBACK, ICONS, type IconName, STAGE_ICON, STAGE_ICON_FALLBACK } from '@/config/icons';
import { OCCUPATIONS } from '@/config/occupations';
import { CLOSE_REASONS, LEAD_DROP_REASONS, LEAD_DROP_TOP } from '@/config/reasons';
import { SOURCE_DEFAULT, SOURCE_LEGACY, SOURCES } from '@/config/sources';
import {
  CARE_DONE_STAGES,
  CARE_STAGE_BOOKING,
  CARE_STAGE_DEFAULT,
  CARE_STAGE_DISPLAY,
  CARE_STAGE_DROPPED,
  CARE_STAGE_LEGACY,
  CARE_STAGE_NURTURE,
  CARE_STAGE_OPTIONS,
  CARE_STAGE_WON,
  CARE_STAGES,
  CARE_STAGES_REPEATABLE,
  CONTACT_STATUSES,
  INTEREST_DEFAULT_NEW,
  INTEREST_TIERS,
  LEAD_ONLY_STAGES,
  QUALIFIED_STAGE,
  STAGE_INTEREST,
} from '@/config/stages';
import { TASK_KIND_PICK, TASK_KINDS } from '@/config/taskKinds';
import { DAY, HOUR, MIN, VELOCITY_CONFIG } from '@/config/velocity';
import { v1, v1Literal, v1raw } from './v1';

// [tên hằng số v2, giá trị v2, biểu thức v1]
const SAME: [string, unknown, string][] = [
  // followup.ts — D-005
  ['FOLLOWUP_CONFIG', FOLLOWUP_CONFIG, 'FOLLOWUP_CONFIG'],
  ['ZALO_SENDER_NAME', ZALO_SENDER_NAME, 'ZALO_SENDER_NAME'],
  ['ZALO_TEMPLATES_DEFAULT', ZALO_TEMPLATES_DEFAULT, 'ZALO_TEMPLATES_DEFAULT'],
  ['ZALO_TEMPLATES_PREVIOUS', ZALO_TEMPLATES_PREVIOUS, 'ZALO_TEMPLATES_PREVIOUS'],
  // velocity.ts — D-008
  ['VELOCITY_CONFIG', VELOCITY_CONFIG, 'VELOCITY.config'],
  ['DAY', DAY, 'VELOCITY.DAY'],
  ['HOUR', HOUR, 'VELOCITY.HOUR'],
  // stages.ts
  ['CARE_STAGES', CARE_STAGES, 'CARE_STAGES'],
  ['CARE_STAGE_DEFAULT', CARE_STAGE_DEFAULT, 'CARE_STAGE_DEFAULT'],
  ['CARE_STAGE_WON', CARE_STAGE_WON, 'CARE_STAGE_WON'],
  ['CARE_STAGE_NURTURE', CARE_STAGE_NURTURE, 'CARE_STAGE_NURTURE'],
  ['CARE_STAGE_DROPPED', CARE_STAGE_DROPPED, 'CARE_STAGE_DROPPED'],
  ['CARE_STAGE_BOOKING', CARE_STAGE_BOOKING, 'CARE_STAGE_BOOKING'],
  ['CARE_STAGE_LEGACY', CARE_STAGE_LEGACY, 'CARE_STAGE_LEGACY'],
  ['CARE_STAGE_OPTIONS', CARE_STAGE_OPTIONS, 'CARE_STAGE_OPTIONS'],
  ['CARE_DONE_STAGES', CARE_DONE_STAGES, 'CARE_DONE_STAGES'],
  ['CARE_STAGE_DISPLAY', CARE_STAGE_DISPLAY, 'CARE_STAGE_DISPLAY'],
  ['CARE_STAGES_REPEATABLE', CARE_STAGES_REPEATABLE, 'CARE_STAGES_REPEATABLE'],
  ['QUALIFIED_STAGE', QUALIFIED_STAGE, 'QUALIFIED_STAGE'],
  ['LEAD_ONLY_STAGES', LEAD_ONLY_STAGES, 'LEAD_ONLY_STAGES'],
  ['INTEREST_DEFAULT_NEW', INTEREST_DEFAULT_NEW, 'INTEREST_DEFAULT_NEW'],
  ['STAGE_INTEREST', STAGE_INTEREST, 'STAGE_INTEREST'],
  ['CONTACT_STATUSES', CONTACT_STATUSES, 'CONTACT_STATUSES'],
  ['INTEREST_TIERS', INTEREST_TIERS, 'INTEREST_TIERS'],
  // sources.ts
  ['SOURCES', SOURCES, 'SOURCES'],
  ['SOURCE_DEFAULT', SOURCE_DEFAULT, 'SOURCE_DEFAULT'],
  ['SOURCE_LEGACY', SOURCE_LEGACY, 'SOURCE_LEGACY'],
  // callResults.ts
  ['CALL_RESULTS', CALL_RESULTS, 'CALL_RESULTS'],
  ['CALL_RESULT_SETS', CALL_RESULT_SETS, 'CRMCalls.CALL_RESULT_SETS'],
  ['SHORT_CALL_SEC', SHORT_CALL_SEC, 'CRMCalls.SHORT_CALL_SEC'],
  // reasons.ts
  ['LEAD_DROP_REASONS', LEAD_DROP_REASONS, 'LEAD_DROP_REASONS'],
  ['LEAD_DROP_TOP', LEAD_DROP_TOP, 'LEAD_DROP_TOP'],
  // aptTypes.ts
  ['APT_TYPES', APT_TYPES, 'APT_TYPES'],
  ['APT_ALIAS_BASE', APT_ALIAS_BASE, 'APT_ALIAS_BASE'],
  ['APT_ALIAS_PLUS', APT_ALIAS_PLUS, 'APT_ALIAS_PLUS'],
  ['APT_ALIAS_CORNER', APT_ALIAS_CORNER, 'APT_ALIAS_CORNER'],
  // occupations.ts, advanced.ts, docKinds.ts
  ['OCCUPATIONS', OCCUPATIONS, 'OCCUPATIONS'],
  ['ADVANCED_GROUPS', ADVANCED_GROUPS, 'ADVANCED_GROUPS'],
  ['ADVANCED_FIELDS', ADVANCED_FIELDS, 'ADVANCED_FIELDS'],
  ['DOC_KIND_LABELS', DOC_KIND_LABELS, 'DOC_KIND_LABELS'],
  // icons.ts
  ['STAGE_ICON', STAGE_ICON, 'STAGE_ICON'],
];

describe('src/config = giá trị v1 (deep equal)', () => {
  it.each(SAME)('%s', (_name, mine, expr) => {
    expect(mine).toStrictEqual(v1(expr));
  });

  it('MIN = 1 phút như velocity.js', () => {
    expect(MIN).toBe(60000);
    expect(HOUR).toBe(60 * MIN);
  });

  it('CALL_RESULT_MISS = MISS trong followup.js', () => {
    expect(CALL_RESULT_MISS).toStrictEqual(v1Literal('js/followup.js', 'MISS'));
  });

  it('FOLLOWUP.templatesDefault / senderName lộ ra window cũng khớp', () => {
    expect(ZALO_TEMPLATES_DEFAULT).toStrictEqual(v1('FOLLOWUP.templatesDefault'));
    expect(ZALO_SENDER_NAME).toBe(v1raw('FOLLOWUP.senderName'));
  });

  it('CLOSE_REASONS là khung rỗng (T6.1 điền)', () => {
    expect(CLOSE_REASONS).toStrictEqual({});
  });
});

describe('icons.ts (D-006)', () => {
  const concepts = Object.keys(ICONS) as IconName[];

  it('có đủ mọi khái niệm của ICON_PATHS v1', () => {
    expect(concepts).toEqual(expect.arrayContaining(v1<string[]>('Object.keys(ICON_PATHS)')));
  });

  it('mỗi khái niệm trỏ tới 1 glyph lucide-react có thật', () => {
    const glyphs = new Set(Object.keys(Lucide));
    for (const c of concepts) expect(glyphs.has(ICONS[c]), `${c} → ${ICONS[c]}`).toBe(true);
  });

  it('2 khái niệm khác nhau không dùng chung 1 glyph', () => {
    expect(new Set(Object.values(ICONS)).size).toBe(concepts.length);
  });

  it('khái niệm / bậc lạ rơi về đúng icon như v1', () => {
    expect(v1raw("icon('__la__')")).toBe(v1raw(`icon('${ICON_FALLBACK}')`));
    expect(v1raw("stageIcon('__la__')")).toBe(v1raw(`icon('${STAGE_ICON_FALLBACK}')`));
  });

  it('mọi bậc trong CARE_STAGE_OPTIONS + bậc cũ đều có icon', () => {
    for (const s of [...CARE_STAGE_OPTIONS, ...Object.keys(CARE_STAGE_LEGACY)]) expect(STAGE_ICON[s]).toBeDefined();
  });
});

describe('taskKinds.ts', () => {
  it('nhãn + icon từng loại việc khớp TASK_KINDS v1', () => {
    expect(Object.keys(TASK_KINDS)).toStrictEqual(v1('Object.keys(TASK_KINDS)'));
    for (const [k, t] of Object.entries(TASK_KINDS)) {
      expect(t.label).toBe(v1raw(`TASK_KINDS.${k}.label`));
      // v1 lưu sẵn chuỗi <svg> = icon('<khái niệm>') → khái niệm v2 phải là đúng khái niệm đó.
      expect(v1raw(`icon('${t.icon}')`)).toBe(v1raw(`TASK_KINDS.${k}.icon`));
    }
  });

  it('TASK_KIND_PICK khớp v1', () => {
    expect(TASK_KIND_PICK).toStrictEqual(v1('TASK_KIND_PICK'));
  });
});
