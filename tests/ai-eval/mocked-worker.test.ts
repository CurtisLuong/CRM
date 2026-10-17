import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Worker is intentionally JavaScript.
import { handleAi } from '../../worker/ai-assist.js';
// @ts-expect-error Offline grader is an independent Node CLI.
import { gradeCase } from './grader.mjs';

type Fixture = {
  id: string;
  task: string;
  input: { customer: Record<string, unknown>; extra: Record<string, unknown> };
};
const readRows = (name: string) =>
  readFileSync(new URL(name, import.meta.url), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
const fixtures: Fixture[] = readRows('synthetic-notes.jsonl');
const examples = new Map<string, Record<string, unknown>>(
  readRows('example-responses.jsonl').map((row) => [row.id, row.data]),
);

// Handwritten RAW response codes, independent of Worker resolveDay. Never model outputs.
const rawDays: Record<string, Array<string | null>> = {
  'parse-two-sided-promises': ['mai', 'kia'],
  'parse-call-time-not-task-time': [null],
  'parse-next-month-clamp': ['thang_sau'],
};

describe('synthetic handwritten output → mocked Worker → independent grader', () => {
  it.each(fixtures)('$id checks cleanup transport only, never real model quality', async (fixture) => {
    const raw = structuredClone(examples.get(fixture.id));
    if (!raw) throw new Error(`Missing handwritten output ${fixture.id}`);
    if (fixture.task === 'parse_note') {
      raw.viec = (raw.viec as Array<Record<string, unknown>>).map(({ date: _date, key: _key, ...task }, index) => ({
        ...task,
        ngay: rawDays[fixture.id]?.[index] ?? null,
      }));
      if (raw.hen_goi) {
        const { date: _date, ...call } = raw.hen_goi as Record<string, unknown>;
        raw.hen_goi = { ...call, ngay: 'mai' };
      }
    }
    const run = vi.fn().mockResolvedValue({ response: JSON.stringify(raw) });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('No network allowed in mocked evaluation'));
    try {
      const response = await handleAi(
        new Request('https://synthetic.invalid/ai', {
          method: 'POST',
          body: JSON.stringify({ task: fixture.task, ...fixture.input }),
        }),
        { AI: { run } },
        (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(run).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      const result = gradeCase(fixture, { id: fixture.id, data: body.data });
      expect(result.issues).toEqual([]);
      expect(result.automatedConstraintsPassed).toBe(true);
      expect(result.humanReviewRequired).toBe(true);
      expect(result.sideEffectEvidence).toBe('not_supplied');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('semantically wrong but structurally valid mocked model outputs', () => {
  it.each(['money_one_dong_wrong', 'date_from_unrelated_appointment'])(
    '%s survives deterministic cleanup but is rejected by independent labels',
    async (failure) => {
      const id = failure === 'money_one_dong_wrong' ? 'parse-corrected-money' : 'parse-call-time-not-task-time';
      const fixture = fixtures.find((item) => item.id === id);
      const raw = structuredClone(examples.get(id));
      if (!fixture || !raw) throw new Error('Missing synthetic fixture');
      if (failure === 'money_one_dong_wrong') {
        (raw.cap_nhat as Record<string, unknown>).finance = 450000001;
      } else {
        raw.viec = [{ text: 'Gửi bảng tính', ben: 'em', kind: 'message', ngay: 'mai', time: '19:30' }];
        raw.hen_goi = { ngay: 'mai', slot: 'D', time: '19:30', reason: 'Xem bảng tính' };
      }
      const run = vi.fn().mockResolvedValue({ response: JSON.stringify(raw) });
      const response = await handleAi(
        new Request('https://synthetic.invalid/ai', {
          method: 'POST',
          body: JSON.stringify({ task: fixture.task, ...fixture.input }),
        }),
        { AI: { run } },
        (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      const result = gradeCase(fixture, { id, data: body.data });
      expect(result.automatedConstraintsPassed).toBe(false);
      expect(result.criticalErrors).toBeGreaterThan(0);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: failure === 'money_one_dong_wrong' ? 'cap_nhat.finance' : 'viec.0.date',
            category: 'wrong',
            critical: true,
          }),
        ]),
      );
    },
  );
});
