/**
 * Kiểu TypeScript của bản ghi khách — suy ra từ schema Zod (schema.ts) để 2 nơi không lệch nhau.
 * Mọi object có index signature (passthrough): thuộc tính lạ vẫn nằm trong bản ghi.
 */
import type { z } from 'zod';
import type {
  AdvancedSchema,
  BookingStepsSchema,
  CallAttemptSchema,
  ContactPrefsSchema,
  CustomerSchema,
  FieldMetaSchema,
  HouseholdMemberSchema,
  InteractionSchema,
  InterestSchema,
  NoteSchema,
  RetargetHintSchema,
  StageHistorySchema,
  TaskSchema,
} from './schema';

export type Customer = z.infer<typeof CustomerSchema>;
export type CallAttempt = z.infer<typeof CallAttemptSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Note = z.infer<typeof NoteSchema>;
export type StageHistoryEntry = z.infer<typeof StageHistorySchema>;
export type BookingSteps = z.infer<typeof BookingStepsSchema>;
export type Advanced = z.infer<typeof AdvancedSchema>;
export type ContactPrefs = z.infer<typeof ContactPrefsSchema>;
export type Interest = z.infer<typeof InterestSchema>;
export type HouseholdMember = z.infer<typeof HouseholdMemberSchema>;
export type Interaction = z.infer<typeof InteractionSchema>;
export type RetargetHint = z.infer<typeof RetargetHintSchema>;
export type FieldMeta = z.infer<typeof FieldMetaSchema>;

/** Phần tử call_attempts đã lọc (có `at`) — kết quả của callAttemptsOf. */
export type DatedCallAttempt = CallAttempt & { at: string };

/** Trạng thái khách mới: 'new' chưa gọi · 'calling' đang gọi · 'dropped' đã loại. */
export type LeadStatus = 'new' | 'calling' | 'dropped';

/** Ngày sinh đã tách: year null khi lưu dạng '--MM-DD'. */
export type Dob = { day: number; month: number; year: number | null };
