import { useEffect, useMemo, useState } from 'react';
import { APT_TYPES } from '@/config/aptTypes';
import { FOLLOWUP_CONFIG } from '@/config/followup';
import { TASK_KINDS } from '@/config/taskKinds';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { buildAiContext, redactAiText } from '@/domain/customer/aiContext';
import { Button } from '@/ui';
import { type AiParseNote, aiAvailable, buildAiApprovalPatch, getAiSettings, requestAi } from './model';

const FIELD_LABELS: Record<string, string> = {
  apt_type: 'Loại căn',
  projects: 'Dự án',
  purpose: 'Mục đích mua',
  marital_status: 'Tình trạng hôn nhân',
  occupation: 'Nghề nghiệp',
  finance: 'Vốn sẵn có',
  apt_price: 'Giá căn nhắm',
  income: 'Thu nhập',
  residence: 'Nơi ở',
};
const money = (value: unknown) =>
  typeof value === 'number' ? `${new Intl.NumberFormat('vi-VN').format(value)} ₫` : String(value ?? '');

export function AiNoteReview({
  account,
  customer,
  note,
}: {
  account: RepositoryAccount;
  customer: Customer;
  note: string;
}) {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AiParseNote | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);
  const workerUrl = import.meta.env.VITE_WORKER_URL as string | undefined;
  const options = useMemo(
    () => ({
      apt_types: APT_TYPES,
      projects: Array.from(
        new Set([...(customer.projects || []), ...(customer.interests || []).map((item) => item?.project || '')]),
      ).filter(Boolean),
      purpose: customer.purpose ? [customer.purpose] : [],
      marital: customer.marital_status ? [customer.marital_status] : [],
      occupation: customer.occupation ? [customer.occupation] : [],
      task_kinds: Object.keys(TASK_KINDS),
    }),
    [customer],
  );
  if (!aiAvailable(workerUrl, online && account.sync.isOnline())) return null;
  const generate = async () => {
    if (!note.trim() || busy) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const settings = await getAiSettings(account, account.sync.local.userId);
      const slots = Object.entries(FOLLOWUP_CONFIG.callSlots).map(([key, slot]) => ({
        key,
        name: slot.name,
        text: slot.range,
      }));
      const extra = {
        note: redactAiText(note),
        now: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).replace(' ', 'T'),
        today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
        slots,
        options,
        known: {
          apt_type: customer.apt_type,
          projects: customer.projects,
          purpose: customer.purpose,
          finance: customer.finance,
          apt_price: customer.apt_price,
        },
      };
      const response = await requestAi<AiParseNote>(account, 'parse_note', buildAiContext(customer), extra, settings);
      setResult(response.data);
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa phân tích được ghi chú.');
    } finally {
      setBusy(false);
    }
  };
  const toggle = (key: string, checked: boolean) =>
    setSelected((current) => (checked ? [...new Set([...current, key])] : current.filter((item) => item !== key)));
  const apply = async () => {
    if (!result || !selected.length || saving) return;
    if (customer.owner_id !== account.sync.local.userId || customer.archived_at) {
      setError('Bạn chỉ có quyền xem hồ sơ này.');
      return;
    }
    const current = account.customers.getSnapshot().find((item) => item.id === customer.id);
    if (!current) {
      setError('Không còn tìm thấy hồ sơ mới nhất trên thiết bị.');
      return;
    }
    const patch = buildAiApprovalPatch(current, result, selected);
    if (!Object.keys(patch).length) {
      setError('Không có mục hợp lệ được chọn để lưu.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await account.customers.update(customer.id, patch);
      setSaved(true);
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa lưu được đề xuất.');
    } finally {
      setSaving(false);
    }
  };
  const fields = Object.entries(result?.cap_nhat || {}).filter(
    ([key, value]) => key in FIELD_LABELS && value != null && value !== '',
  );
  const tasks = result?.viec || [];
  return (
    <section className="rounded-control border border-border bg-surface-2 p-3" aria-label="Gợi ý cập nhật từ AI">
      <Button disabled={!note.trim()} loading={busy} variant="ai" onClick={() => void generate()}>
        Lưu + AI · xem đề xuất
      </Button>
      <p className="mt-1 text-small text-text-2">AI chỉ tạo đề xuất. Chọn từng mục và bấm duyệt để cập nhật hồ sơ.</p>
      {result && (
        <div className="mt-3 space-y-3" data-testid="ai-note-review">
          {!!fields.length && (
            <fieldset className="space-y-2">
              <legend className="text-body-strong">Thông tin đề xuất</legend>
              {fields.map(([key, value]) => (
                <label key={key} className="flex min-h-11 items-start gap-2 border-b border-border py-2 text-small">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={selected.includes(`field:${key}`)}
                    onChange={(event) => toggle(`field:${key}`, event.target.checked)}
                  />
                  <span>
                    <b>{FIELD_LABELS[key]}:</b>{' '}
                    {key === 'finance' || key === 'apt_price'
                      ? money(value)
                      : Array.isArray(value)
                        ? value.join(', ')
                        : String(value)}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {!!tasks.length && (
            <fieldset className="space-y-2">
              <legend className="text-body-strong">Việc đề xuất</legend>
              {tasks.map((task, index) => (
                <label
                  key={`${task.text}|${task.date || ''}|${task.time || ''}`}
                  className="flex min-h-11 items-start gap-2 border-b border-border py-2 text-small"
                >
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={selected.includes(`task:${index}`)}
                    onChange={(event) => toggle(`task:${index}`, event.target.checked)}
                  />
                  <span>
                    {task.text}
                    {task.date ? ` · ${task.date}` : ''}
                    {task.time ? ` ${task.time}` : ''}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {result.hen_goi?.date && (
            <label className="flex min-h-11 items-start gap-2 border-b border-border py-2 text-small">
              <input
                className="mt-1"
                type="checkbox"
                checked={selected.includes('call')}
                onChange={(event) => toggle('call', event.target.checked)}
              />
              <span>
                <b>Hẹn gọi:</b> {result.hen_goi.date}
                {result.hen_goi.time
                  ? ` ${result.hen_goi.time}`
                  : result.hen_goi.slot
                    ? ` · khung ${result.hen_goi.slot}`
                    : ''}
                {result.hen_goi.reason ? ` · ${result.hen_goi.reason}` : ''}
              </span>
            </label>
          )}
          {!!result.chua_chac?.length && (
            <p className="text-small text-warning">Chưa chắc, cần xác nhận: {result.chua_chac.join(' · ')}</p>
          )}
          <Button variant="primary" disabled={!selected.length} loading={saving} onClick={() => void apply()}>
            Duyệt và lưu các mục đã chọn
          </Button>
          {saved && (
            <p role="status" className="text-small text-success">
              Đã lưu các mục bạn duyệt trên thiết bị.
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-small text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
