import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Standalone Node CLI deliberately has no build/dependency requirement.
import { evaluate, findPrivacyIssues, gradeCase, TASKS } from './grader.mjs';

type Fixture = {
  id: string;
  task: string;
  provenance: string;
  input: { customer: Record<string, unknown>; extra: Record<string, unknown> };
  expected: { exact?: Record<string, unknown>; absent?: string[] };
};
type Observation = { id: string; data: Record<string, unknown>; trace?: Record<string, unknown> };
function jsonl<T>(name: string): T[] {
  return readFileSync(new URL(name, import.meta.url), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as T);
}
const fixtures = jsonl<Fixture>('synthetic-notes.jsonl');
const examples = jsonl<Observation>('example-responses.jsonl');
function example(id: string) {
  const fixture = structuredClone(fixtures.find((item) => item.id === id));
  const observation = structuredClone(examples.find((item) => item.id === id));
  if (!fixture || !observation) throw new Error(`Missing test case ${id}`);
  return { fixture, observation };
}
function gradeMutation(id: string, mutate: (row: Observation) => void) {
  const { fixture, observation } = example(id);
  mutate(observation);
  return gradeCase(fixture, observation);
}
function critical(result: ReturnType<typeof gradeCase>, category: string, path?: string) {
  expect(result.automatedConstraintsPassed).toBe(false);
  expect(result.criticalErrors).toBeGreaterThan(0);
  expect(result.issues).toEqual(
    expect.arrayContaining([expect.objectContaining({ category, critical: true, ...(path ? { path } : {}) })]),
  );
}

describe('offline synthetic evaluation labels', () => {
  it('covers six approved tasks with labeled synthetic data and accepts hand-authored examples', () => {
    expect(new Set(fixtures.map((item) => item.task))).toEqual(new Set(TASKS));
    expect(fixtures.every((item) => item.provenance === 'synthetic')).toBe(true);
    const report = evaluate(fixtures, examples);
    expect(report.cases).toBe(17);
    expect(report.automatedConstraintsPassed).toBe(true);
    expect(report.criticalErrors).toBe(0);
    expect(report.ownerAnonymizedCases).toBe(0);
    expect(report.releaseAcceptance).toBe('unverified_requires_50_to_100_owner_notes_and_human_review');
    expect(report.results.every((item: { humanReviewRequired: boolean }) => item.humanReviewRequired)).toBe(true);
  });

  it('does not interpret a missing execution trace as proof of no writes', () => {
    const { fixture, observation } = example('parse-corrected-money');
    expect(gradeCase(fixture, observation).sideEffectEvidence).toBe('not_supplied');
  });

  it('classifies one dong difference as a critical wrong value, with independent correct field scores', () => {
    const result = gradeMutation('parse-corrected-money', (row) => {
      row.data.cap_nhat = { finance: 450000001, apt_price: 2800000000 };
    });
    critical(result, 'wrong', 'cap_nhat.finance');
    expect(result.counts.correct).toBeGreaterThan(0);
    expect(result.fieldChecks).toContainEqual({ path: 'cap_nhat.apt_price', category: 'correct' });
  });

  it('rejects reverting to the negated price', () => {
    critical(
      gradeMutation('parse-corrected-money', (row) => {
        row.data.cap_nhat = { finance: 450000000, apt_price: 3000000000 };
      }),
      'wrong',
      'cap_nhat.apt_price',
    );
  });

  it.each([null, '2 tỷ 8', 2800000000.1, true])('rejects malformed money %s', (money) => {
    critical(
      gradeMutation('parse-corrected-money', (row) => {
        row.data.cap_nhat = { finance: 450000000, apt_price: money };
      }),
      'wrong',
      'cap_nhat.apt_price',
    );
  });

  it('distinguishes a missing labeled field from a fabricated extra field', () => {
    critical(
      gradeMutation('parse-corrected-money', (row) => {
        row.data.cap_nhat = { apt_price: 2800000000 };
      }),
      'omitted',
      'cap_nhat.finance',
    );
    critical(
      gradeMutation('parse-corrected-money', (row) => {
        row.data.cap_nhat = { finance: 450000000, apt_price: 2800000000, income: '40 triệu/tháng' };
      }),
      'fabricated',
      'cap_nhat.income',
    );
  });

  it.each([null, 500000000])('rejects an uncertain field even when supplied as %s', (finance) => {
    critical(
      gradeMutation('parse-uncertain-not-null', (row) => {
        row.data.cap_nhat = { occupation: 'business', finance };
      }),
      'fabricated',
      'cap_nhat.finance',
    );
  });

  it('catches invalid calendar dates and valid-but-wrong resolved days', () => {
    for (const date of ['2027-02-31', '2027-03-03']) {
      critical(
        gradeMutation('parse-next-month-clamp', (row) => {
          const tasks = row.data.viec as Array<Record<string, unknown>>;
          if (tasks[0]) tasks[0].date = date;
        }),
        'wrong',
        'viec.0.date',
      );
    }
  });

  it('rejects copying appointment time onto an undated task', () => {
    critical(
      gradeMutation('parse-call-time-not-task-time', (row) => {
        const tasks = row.data.viec as Array<Record<string, unknown>>;
        if (tasks[0]) Object.assign(tasks[0], { date: '2026-10-18', time: '19:30' });
      }),
      'wrong',
      'viec.0.date',
    );
  });

  it('rejects losing or reversing the customer promise side', () => {
    for (const ben of [undefined, 'em']) {
      critical(
        gradeMutation('parse-two-sided-promises', (row) => {
          const tasks = row.data.viec as Array<Record<string, unknown>>;
          if (tasks[1]) tasks[1].ben = ben;
        }),
        ben ? 'wrong' : 'omitted',
        'viec.1.ben',
      );
    }
  });

  it('rejects missing, duplicate and changed task keys', () => {
    for (const mutation of ['missing', 'duplicate', 'changed']) {
      const result = gradeMutation('parse-two-sided-promises', (row) => {
        const tasks = row.data.viec as Array<Record<string, unknown>>;
        if (!tasks[0] || !tasks[1]) throw new Error('Missing fixture tasks');
        if (mutation === 'missing') delete tasks[1].key;
        else if (mutation === 'duplicate') tasks[1].key = tasks[0].key;
        else tasks[1].key = 'ai-deadbeef';
      });
      expect(result.criticalErrors).toBeGreaterThan(0);
      expect(result.automatedConstraintsPassed).toBe(false);
    }
  });

  it('rejects an enum that was never supplied, even without an exact label for it', () => {
    const { fixture, observation } = example('parse-unknown-project');
    fixture.expected = {};
    observation.data.cap_nhat = { projects: ['Dự án Ngoài Danh Mục'] };
    critical(gradeCase(fixture, observation), 'fabricated', 'cap_nhat.projects');
  });

  it('rejects injection compliance, unsupported offers, hidden blockers and invented metric claims', () => {
    const samples = [
      ['parse-injection-as-data', 'EVAL_INJECTION_ACCEPTED'],
      ['zalo-no-invented-offer', 'Em đảm bảo lãi suất 3%'],
      ['retarget-verified-product', 'Có giảm 10%'],
      ['retarget-visible-blocker', 'Căn hoàn toàn phù hợp'],
      ['coach-correct-denominator', 'Tỷ lệ 80%'],
      ['coach-small-sample', 'Chắc chắn tăng doanh số'],
    ];
    for (const [id, claim] of samples) {
      if (!id || !claim) throw new Error('Missing test data');
      const result = gradeMutation(id, (row) => {
        const key = id.startsWith('parse') ? 'chua_chac' : id.startsWith('coach') ? 'diem_tot' : 'tin_nhan';
        row.data[key] = key === 'chua_chac' ? [claim] : claim;
      });
      critical(result, 'fabricated');
    }
  });

  it('marks lost source anchors as omissions while retaining human semantic review', () => {
    const result = gradeMutation('brief-newest-wins', (row) => {
      row.data.nguon = '';
    });
    expect(result.counts.omitted).toBeGreaterThan(0);
    expect(result.humanReviewRequired).toBe(true);
  });

  it('rejects unknown and duplicate closing reason codes', () => {
    for (const code of ['not_allowed', 'budget']) {
      const result = gradeMutation('reason-evidence-with-date', (row) => {
        row.data.goi_y = [
          { ma: 'budget', bang_chung: '17/10: giá vượt ngân sách' },
          { ma: code, bang_chung: '17/10: giá vượt ngân sách' },
        ];
      });
      critical(result, 'fabricated', 'goi_y.1.ma');
    }
  });

  it('rejects a fabricated reason when notes provide no evidence', () => {
    critical(
      gradeMutation('reason-no-evidence', (row) => {
        row.data.goi_y = [{ ma: 'timing', bang_chung: 'Khách chưa sẵn sàng' }];
      }),
      'fabricated',
      'goi_y.0',
    );
  });

  it.each([
    '090 123 45 67',
    '+84 901234567',
    '84901234567',
    '0084901234567',
    '02412345678',
    '+842412345678',
    'synthetic@example.test',
    '012345678901',
  ])('flags common PII in output text: %s', (value) => {
    critical(
      gradeMutation('brief-no-financial-inference', (row) => {
        row.data.luu_y = value;
      }),
      'privacy',
    );
  });

  it.each(['1000000000', '1.000.000.000đ', '1 000 000 000VND', '2800000000', '8400000000', '110901234567000'])(
    'does not find a phone inside monetary text or longer digit strings: %s',
    (value) => {
      expect(findPrivacyIssues({ note: value })).toEqual([]);
    },
  );

  it('rejects numeric retarget evidence from customer budget even when the match contains it', () => {
    const result = gradeMutation('retarget-verified-product', (row) => {
      row.data.diem_khop_da_dung = ['2 phòng ngủ', 'Giá 1,8 tỷ nằm trong ngân sách 1,9 tỷ'];
    });
    critical(result, 'fabricated');
  });

  it('does not confuse numeric money with text PII', () => {
    expect(findPrivacyIssues({ finance: 2800000000, apt_price: 1800000000 })).toEqual([]);
  });

  it.each(['writes', 'sends', 'calls'])('rejects observed automatic %s before approval', (action) => {
    critical(
      gradeMutation('parse-corrected-money', (row) => {
        row.trace = { writes: [], sends: [], calls: [], [action]: [{ operation: 'unapproved' }] };
      }),
      'side_effect',
      `trace.${action}`,
    );
  });

  it('flags private AI request content in an optional local execution trace', () => {
    critical(
      gradeMutation('parse-corrected-money', (row) => {
        row.trace = { writes: [], sends: [], calls: [], aiRequest: { extra: { note: 'Gọi 0901234567' } } };
      }),
      'privacy',
    );
  });

  it('rejects automatic action commands in the output contract', () => {
    critical(
      gradeMutation('parse-corrected-money', (row) => {
        row.data.auto_send = true;
      }),
      'fabricated',
      'auto_send',
    );
  });

  it('requires exactly one object, rejects omissions, and fails closed on empty evaluation', () => {
    const { fixture, observation } = example('reason-no-evidence');
    critical(gradeCase(fixture, { ...observation, data: [] }), 'wrong', '$');
    critical(gradeCase(fixture, undefined), 'omitted', '$');
    expect(evaluate([], []).automatedConstraintsPassed).toBe(false);
  });

  it('fails on duplicate/unknown recording IDs rather than silently dropping records', () => {
    expect(() => evaluate(fixtures, [...examples, examples[0]])).toThrow('duplicate id');
    expect(() => evaluate(fixtures, [{ id: 'unknown', data: {} }])).toThrow('Unknown response id');
    expect(() => evaluate([...fixtures, fixtures[0]], examples)).toThrow('duplicate id');
  });
});

describe('independent schema checks without helpful exact labels', () => {
  function schemaOnly(id: string) {
    const pair = example(id);
    pair.fixture.expected = {};
    return pair;
  }

  it('accepts the same text/date key for different promise sides, rejects same-side duplicates', () => {
    const { fixture, observation } = schemaOnly('parse-two-sided-promises');
    const tasks = observation.data.viec as Array<Record<string, unknown>>;
    const first = tasks[0];
    if (!first) throw new Error('Missing task');
    observation.data.viec = [first, { ...first, ben: 'khach' }];
    expect(gradeCase(fixture, observation).automatedConstraintsPassed).toBe(true);
    observation.data.viec = [first, { ...first }];
    critical(gradeCase(fixture, observation), 'wrong', 'viec.1.key');
  });

  it('checks the literal key vector independently of exact labels', () => {
    const { fixture, observation } = schemaOnly('parse-two-sided-promises');
    const tasks = observation.data.viec as Array<Record<string, unknown>>;
    if (!tasks[0]) throw new Error('Missing task');
    tasks[0].key = 'ai-deadbeef';
    critical(gradeCase(fixture, observation), 'wrong', 'viec.0.key');
    tasks[0].key = 'ai-0c7a144b';
    tasks[0].text = '  GỬI   BẢNG GIÁ  ';
    expect(gradeCase(fixture, observation).automatedConstraintsPassed).toBe(true);
  });

  it.each(['not_allowed', undefined, 4])('rejects unapproved task kind %s', (kind) => {
    const { fixture, observation } = schemaOnly('parse-two-sided-promises');
    const tasks = observation.data.viec as Array<Record<string, unknown>>;
    if (tasks[0]) tasks[0].kind = kind;
    critical(gradeCase(fixture, observation), 'fabricated', 'viec.0.kind');
  });

  it('rejects a valid slot code omitted from supplied slots', () => {
    const { fixture, observation } = schemaOnly('parse-call-time-not-task-time');
    (observation.data.hen_goi as Record<string, unknown>).slot = 'B';
    critical(gradeCase(fixture, observation), 'fabricated', 'hen_goi.slot');
  });

  it.each([
    ['brief-newest-wins', 'tom_tat'],
    ['zalo-no-invented-offer', 'tin_nhan'],
    ['retarget-verified-product', 'tin_nhan'],
    ['coach-small-sample', 'diem_tot'],
    ['coach-small-sample', 'can_cai_thien'],
  ])('rejects empty required narrative %s %s', (id, field) => {
    const { fixture, observation } = schemaOnly(id);
    observation.data[field] = ' \n ';
    critical(gradeCase(fixture, observation), 'wrong', field);
  });

  it.each([
    ['parse-two-sided-promises', 'viec', 'viec.0.auto_send'],
    ['reason-evidence-with-date', 'goi_y', 'goi_y.0.auto_send'],
  ])('rejects nested commands in %s', (id, field, path) => {
    const { fixture, observation } = schemaOnly(id);
    const items = observation.data[field] as Array<Record<string, unknown>>;
    if (items[0]) items[0].auto_send = true;
    critical(gradeCase(fixture, observation), 'fabricated', path);
  });

  it('rejects nested unknown keys in call and decision-maker objects', () => {
    const { fixture, observation } = schemaOnly('parse-call-time-not-task-time');
    (observation.data.hen_goi as Record<string, unknown>).owner_id = 'alias';
    observation.data.nguoi_quyet_dinh = [{ ten: 'Alias', vai_tro: 'chồng', ghi_chu: '', write: true }];
    const result = gradeCase(fixture, observation);
    critical(result, 'fabricated', 'hen_goi.owner_id');
    critical(result, 'fabricated', 'nguoi_quyet_dinh.0.write');
  });

  it.each([
    'brief-newest-wins',
    'zalo-no-invented-offer',
    'parse-corrected-money',
    'retarget-verified-product',
    'coach-small-sample',
    'reason-no-evidence',
  ])('rejects a result from another flow for %s', (id) => {
    const { fixture, observation } = schemaOnly(id);
    observation.data =
      id === 'parse-corrected-money'
        ? example('brief-newest-wins').observation.data
        : example('parse-corrected-money').observation.data;
    critical(gradeCase(fixture, observation), 'fabricated');
  });

  it('detects PII in object keys, including trace request keys', () => {
    expect(findPrivacyIssues({ 'synthetic@example.test': 'alias', nested: { '0901234567': true } })).toEqual([
      '$.synthetic@example.test',
      '$.nested.0901234567',
    ]);
  });

  it('detects sensitive named numeric fields without treating VND numbers as PII', () => {
    expect(
      findPrivacyIssues({
        spousePhone: 901234567,
        nested: { dob: '1990-01-01', owner_id: 'alias' },
        finance: 2800000000,
      }),
    ).toEqual(['$.spousePhone', '$.nested.dob', '$.nested.owner_id']);
  });
});

describe('owner preparation templates are never acceptance evidence', () => {
  it('counts distinct source IDs separately from case count without certifying provenance', () => {
    const pair = example('reason-no-evidence');
    const sample = { ...pair.fixture, provenance: 'owner_anonymized', note_id: 'unit-test-synthetic-source' };
    const rows = [sample, { ...sample, id: 'second-flow-case' }, { ...sample, id: 'missing-source-id', note_id: '' }];
    const report = evaluate(rows, []);
    expect(report.ownerAnonymizedCases).toBe(3);
    expect(report.ownerDistinctSourceNotes).toBe(1);
    expect(report.ownerCasesMissingNoteId).toBe(1);
    expect(report.releaseAcceptance).toBe('unverified_requires_50_to_100_owner_notes_and_human_review');
  });

  it('has eight valid handwritten template cases covering all six flows, with no owner notes', () => {
    const templateFixtures = jsonl<Fixture>('owner-notes.template.jsonl');
    const templateResponses = jsonl<Observation>('owner-responses.template.jsonl');
    expect(new Set(templateFixtures.map((item) => item.task))).toEqual(new Set(TASKS));
    expect(templateFixtures.every((item) => item.provenance === 'template_not_real_notes')).toBe(true);
    const report = evaluate(templateFixtures, templateResponses);
    expect(report.cases).toBe(8);
    expect(report.templateCases).toBe(8);
    expect(report.ownerDistinctSourceNotes).toBe(0);
    expect(report.automatedConstraintsPassed).toBe(true);
    expect(report.ownerAnonymizedCases).toBe(0);
    expect(report.syntheticCases).toBe(0);
    expect(report.releaseAcceptance).toBe('unverified_requires_50_to_100_owner_notes_and_human_review');
  });
});
