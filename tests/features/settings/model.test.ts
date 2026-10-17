import { describe, expect, it } from 'vitest';
import {
  AI_DEFAULT_STYLE,
  aiEnabled,
  defaultTemplates,
  localSettingsKey,
  normalizeAiSettings,
  validTemplates,
} from '@/features/settings/model';

describe('settings model', () => {
  it('hides AI when worker is absent or offline', () => {
    expect(aiEnabled('', true)).toBe(false);
    expect(aiEnabled('https://worker.example', false)).toBe(false);
    expect(aiEnabled(' https://worker.example ', true)).toBe(true);
  });

  it('uses v1 Zalo defaults and preserves unknown template properties', () => {
    expect(defaultTemplates().map((item) => item.id)).toContain('chao');
    expect(validTemplates([{ id: 'x', name: 'X', text: 'Xin chào', custom: 4 }])).toEqual([
      { id: 'x', name: 'X', text: 'Xin chào', custom: 4 },
    ]);
    expect(validTemplates(null)).toHaveLength(defaultTemplates().length);
  });

  it('normalizes only known AI values and keeps unknown keys', () => {
    expect(normalizeAiSettings({ model: 'invalid', style: 2, future: true })).toEqual({
      model: 'qwen',
      style: null,
      future: true,
    });
    expect(AI_DEFAULT_STYLE).toContain('Đi thẳng vào việc');
    expect(localSettingsKey('ai', 'u1')).toBe('crm_ai_settings:u1');
  });
});
