import { useState } from 'react';
import type { Customer } from '@/domain/customer';
import type { CustomerTimelineEntry } from '@/domain/customer/timeline';
import { Badge, Button, cn, displayDateTime, useToast } from '@/ui';
import {
  editedTimelineNotePatch,
  filterTimeline,
  TIMELINE_FILTERS,
  type TimelineFilter,
  timelineCounts,
} from './model';

const FIELD =
  'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60';

type Props = {
  customer: Customer;
  entries: readonly CustomerTimelineEntry[];
  writable: boolean;
  busy: boolean;
  /** Lưu patch theo trường qua route (kiểm quyền + toast); trả false khi chưa lưu được. */
  onSave: (patch: Record<string, unknown>, message?: string) => Promise<boolean>;
};

/** Tab "Dòng thời gian" của hồ sơ: lọc theo loại, sửa ghi chú tay / ghi chú bậc. */
export function ProfileTimeline({ customer, entries, writable, busy, onSave }: Props) {
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const counts = timelineCounts(entries);
  const visible = filterTimeline(entries, filter);

  const startEdit = (entryId: string, value: string) => {
    setDraft(value);
    setEditingId(entryId);
  };
  const saveEdit = async (entryId: string) => {
    if (!writable) return;
    if (draft.length === 0) {
      toast({ title: 'Ghi chú không được để trống', tone: 'error' });
      return;
    }
    const patch = editedTimelineNotePatch(customer, entryId, draft, new Date().toISOString());
    if (patch) {
      const message = entryId.startsWith('stage:') ? 'Đã cập nhật ghi chú lịch sử bậc' : 'Đã cập nhật ghi chú';
      if (!(await onSave(patch, message))) return;
    }
    setEditingId(null);
  };

  return (
    <div className="space-y-4">
      {/* Hồ sơ đã lưu trữ là bản ghi lịch sử: giữ dòng thời gian đầy đủ, không cần bộ lọc. */}
      {!customer.archived_at && (
        <div className="flex flex-wrap gap-1.5">
          {TIMELINE_FILTERS.map((item) => {
            const active = filter === item.key;
            const count = counts[item.key];
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(item.key)}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-small transition-colors',
                  active
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border bg-surface text-text-2 hover:bg-surface-2',
                )}
              >
                {item.label}
                {item.key !== 'all' && count > 0 && (
                  <span className="font-data text-mono-data text-text-3">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <div className="space-y-3">
        {visible.length ? (
          visible.map((entry) => (
            <article key={entry.id} className="border-l-2 border-border pl-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body-strong">{entry.title}</span>
                {entry.automatic && <Badge>Tự động · SLA</Badge>}
              </div>
              {entry.detail && (entry.kind === 'note' || entry.kind === 'stage') && editingId === entry.id ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    aria-label="Sửa ghi chú"
                    value={draft}
                    disabled={busy}
                    onChange={(event) => setDraft(event.target.value)}
                    className={`${FIELD} min-h-20 py-2`}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      disabled={busy || draft.length === 0}
                      onClick={() => void saveEdit(entry.id)}
                    >
                      Lưu ghi chú
                    </Button>
                    <Button disabled={busy} onClick={() => setEditingId(null)}>
                      Huỷ
                    </Button>
                  </div>
                </div>
              ) : entry.detail ? (
                <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 whitespace-pre-wrap text-body text-text-2">{entry.detail}</p>
                  {writable && (entry.kind === 'note' || entry.kind === 'stage') && (
                    <Button
                      aria-label={`Sửa ghi chú ${entry.kind === 'stage' ? 'lịch sử bậc' : 'hồ sơ'}`}
                      disabled={busy}
                      onClick={() => startEdit(entry.id, entry.detail || '')}
                    >
                      Sửa
                    </Button>
                  )}
                </div>
              ) : null}
              <time className="mt-1 block font-data text-small text-text-3">{displayDateTime(entry.at)}</time>
            </article>
          ))
        ) : (
          <p className="text-body text-text-2">Chưa có hoạt động để hiển thị.</p>
        )}
      </div>
    </div>
  );
}
