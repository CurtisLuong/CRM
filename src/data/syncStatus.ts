import type { SyncError } from './queue';

export type DataError = { message: string; code: string | null; at: string };
export type SyncSnapshot = {
  syncing: boolean;
  pending: number;
  lastSyncedAt: string | null;
  error: DataError | null;
  assignError: string | null;
  /** Op server từ chối vĩnh viễn, đang chờ người dùng bỏ (T5.9). */
  rejected: SyncError[];
  liveStatus: string;
};

/** One store per account session; compatible with useSyncExternalStore. */
export function createSyncStatus() {
  let state: SyncSnapshot = {
    syncing: false,
    pending: 0,
    lastSyncedAt: null,
    error: null,
    assignError: null,
    rejected: [],
    liveStatus: 'off',
  };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(patch: Partial<SyncSnapshot>) {
      state = { ...state, ...patch };
      for (const listener of listeners) listener();
    },
  };
}
export type SyncStatusStore = ReturnType<typeof createSyncStatus>;
export function dataError(raw: unknown): DataError {
  const e = raw as { message?: string; code?: string } | null;
  return { message: e?.message || String(raw), code: e?.code || null, at: new Date().toISOString() };
}

/** Tên cột → nhãn tiếng Việt cho thông báo lỗi đồng bộ. */
const FIELD_LABELS: Record<string, string> = {
  full_name: 'họ tên',
  phone: 'số điện thoại',
  care_stage: 'bậc chăm sóc',
  call_attempts: 'cuộc gọi',
  next_tasks: 'công việc',
  notes_manual: 'ghi chú',
  care_stage_history: 'lịch sử bậc',
  interactions: 'tương tác',
  interests: 'nhu cầu',
  household: 'người cùng quyết định',
  owner_id: 'người phụ trách',
  dob: 'ngày sinh',
  source: 'nguồn',
};
export const fieldLabel = (key: string) => FIELD_LABELS[key] || key;

/** Lý do dễ hiểu cho op bị server từ chối (mã SQLSTATE/PostgREST) — chủ dự án không đọc được mã lỗi thô. */
export function rejectionReason(error: { code: string | null; message: string }): string {
  const code = error.code || '';
  const name = /constraint "([^"]+)"/.exec(error.message)?.[1];
  const column = /column "?([a-z_]+)"?/i.exec(error.message)?.[1];
  if (code === '23514') return `Dữ liệu không hợp lệ theo quy tắc của máy chủ${name ? ` (${name})` : ''}.`;
  if (code === '23502') return `Thiếu thông tin bắt buộc${column ? ` (${fieldLabel(column)})` : ''}.`;
  if (code === '23505') return 'Trùng với một khách đã có trên máy chủ (thường là trùng số điện thoại).';
  if (code === '23503') return 'Dữ liệu tham chiếu tới thứ không còn trên máy chủ.';
  if (code.startsWith('22')) return 'Có giá trị sai định dạng (ngày, số…) nên máy chủ không nhận.';
  if (code === '42501') return 'Tài khoản này không có quyền sửa khách này.';
  if (code === '42703' || code === 'PGRST204')
    return `Máy chủ chưa có trường${column ? ` "${fieldLabel(column)}"` : ''} — có thể cần chạy cập nhật CSDL. Đừng bỏ nếu chưa chắc.`;
  return 'Máy chủ từ chối thao tác này.';
}
