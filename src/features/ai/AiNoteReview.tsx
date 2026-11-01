import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { APT_TYPES } from '@/config/aptTypes';
import { FOLLOWUP_CONFIG } from '@/config/followup';
import { OCCUPATIONS } from '@/config/occupations';
import { TASK_KIND_PICK } from '@/config/taskKinds';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { buildAiContext } from '@/domain/customer/aiContext';
import { type AiParseNote, aiAvailable, aiCallWindow, buildAiApprovalPatch, getAiSettings, requestAi } from './model';
import { useAiScope } from './useAiScope';

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
const clock = (value: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
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
  const identity = JSON.stringify([customer.id, customer.updated_at, note]);
  const requestCurrent = useAiScope(identity, account);
  const latest = useRef({ identity, account });
  latest.current = { identity, account };
  const reviewed = useRef('');
  useEffect(() => {
    if (latest.current.identity !== identity || latest.current.account !== account) return;
    reviewed.current = '';
    setResult(null);
    setSelected([]);
    setSaved(false);
    setError('');
    setBusy(false);
  }, [identity, account]);
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
        new Set([
          ...(account.catalog?.projects().map((item) => String(item.name || '')) || []),
          ...(customer.projects || []),
          ...(customer.interests || []).map((item) => item?.project || ''),
        ]),
      ).filter(Boolean),
      purpose: ['Ở', 'Đầu tư', 'Cho tặng'],
      marital: ['đã kết hôn', 'chưa kết hôn'],
      occupation: OCCUPATIONS,
      task_kinds: TASK_KIND_PICK,
    }),
    [customer, account],
  );
  if (!aiAvailable(workerUrl, online && account.sync.isOnline())) return null;
  const generate = async () => {
    if (!note.trim() || busy) return;
    if (note.length > 1500) {
      setError('Ghi chú vượt 1.500 ký tự. Hãy tự rút gọn phần gửi AI; ghi chú gốc vẫn được giữ.');
      return;
    }
    const current = requestCurrent;
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
        note,
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
      if (current()) {
        reviewed.current = identity;
        setResult(response.data);
        setSelected([]);
      }
    } catch (e) {
      if (current()) setError(e instanceof Error ? e.message : 'Chưa phân tích được ghi chú.');
    } finally {
      if (current()) setBusy(false);
    }
  };
  const toggle = (key: string, checked: boolean) =>
    setSelected((current) => (checked ? [...new Set([...current, key])] : current.filter((item) => item !== key)));
  const apply = async () => {
    if (!result || !selected.length || saving || reviewed.current !== identity || !requestCurrent()) return;
    if (customer.owner_id !== account.sync.local.userId || customer.archived_at) {
      setError('Bạn chỉ có quyền xem hồ sơ này.');
      return;
    }
    const current = account.customers.getSnapshot().find((item) => item.id === customer.id);
    if (current && (current.owner_id !== account.sync.local.userId || current.archived_at)) {
      setError('Bạn chỉ có quyền xem hồ sơ này.');
      return;
    }
    if (!current) {
      setError('Không còn tìm thấy hồ sơ mới nhất trên thiết bị.');
      return;
    }
    if (current.updated_at !== customer.updated_at) {
      setError('Hồ sơ đã thay đổi. Hãy phân tích lại trước khi duyệt.');
      setResult(null);
      setSelected([]);
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
  const callWindow = result?.hen_goi ? aiCallWindow(result.hen_goi) : null;
  return (
    <section className="rounded-sm border border-line bg-ion-tint p-3" aria-label="Gợi ý cập nhật từ AI">
      <Button disabled={busy || !note.trim() || note.length > 1500} variant="primary" onClick={() => void generate()}>
        Lưu + AI · xem đề xuất
      </Button>
      <p className="mt-1 text-label text-ink-muted">
        AI chỉ tạo đề xuất. Chọn từng mục và bấm duyệt để cập nhật hồ sơ.
      </p>
      <p className="mt-1 text-label text-ink-muted">
        {note.length}/1.500 ký tự gửi AI. Ghi chú gốc không bị cắt hoặc sửa.
      </p>
      {note.length > 1500 && (
        <p role="alert" className="text-label text-soon-text">
          Ghi chú quá dài cho AI. Bạn vẫn có thể lưu ghi chú gốc bằng nút Lưu của màn hình.
        </p>
      )}
      {result && (
        <div className="mt-3 space-y-3" data-testid="ai-note-review">
          {!!result.thay_doi?.length && (
            <p className="text-label">Thay đổi so với dữ liệu cũ: {result.thay_doi.join(' · ')}</p>
          )}
          {!!result.phan_doi?.length && (
            <p className="text-label">
              Băn khoăn được nêu (chỉ xem, chưa ghi vào trường khác): {result.phan_doi.join(' · ')}
            </p>
          )}
          {!!result.nguoi_quyet_dinh?.length && (
            <fieldset>
              <legend className="font-semibold">Người cùng quyết định · thêm mới, giữ nguyên người đã có</legend>
              {result.nguoi_quyet_dinh.map((person, index) => (
                <label
                  key={`${person.ten}:${person.vai_tro}:${person.ghi_chu}`}
                  className="flex min-h-11 items-start gap-2 py-2 text-label"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(`person:${index}`)}
                    onChange={(event) => toggle(`person:${index}`, event.target.checked)}
                  />
                  <span>
                    {person.ten || 'Chưa rõ tên'} · {person.vai_tro} · {person.ghi_chu}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {!!fields.length && (
            <fieldset className="space-y-2">
              <legend className="font-semibold">Thông tin đề xuất</legend>
              {fields.map(([key, value]) => (
                <label key={key} className="flex min-h-11 items-start gap-2 border-b border-line py-2 text-label">
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
              <legend className="font-semibold">Việc đề xuất</legend>
              {tasks.map((task, index) => (
                <label
                  key={`${task.ben}:${task.key || task.text}:${task.date || ''}:${task.time || ''}`}
                  className="flex min-h-11 items-start gap-2 border-b border-line py-2 text-label"
                >
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={selected.includes(`task:${index}`)}
                    onChange={(event) => toggle(`task:${index}`, event.target.checked)}
                  />
                  <span>
                    {task.ben === 'khach' ? 'Khách hẹn: ' : 'Em hứa: '}
                    {task.text}
                    {task.date ? ` · ${task.date}` : ''}
                    {task.time ? ` ${task.time}` : ''}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {result.hen_goi?.date && (
            <label className="flex min-h-11 items-start gap-2 border-b border-line py-2 text-label">
              <input
                className="mt-1"
                type="checkbox"
                checked={selected.includes('call')}
                onChange={(event) => toggle('call', event.target.checked)}
              />
              <span>
                <b>Hẹn gọi:</b> {result.hen_goi.date}
                {callWindow ? ` ${clock(callWindow.start)}–${clock(callWindow.end)}` : ''}
                {result.hen_goi.slot ? ` · khung ${result.hen_goi.slot}` : ''}
                {callWindow?.defaultTime ? ' (giờ mặc định, ghi chú không nói giờ)' : ''}
                {result.hen_goi.reason ? ` · ${result.hen_goi.reason}` : ''}
              </span>
            </label>
          )}
          {!!result.chua_chac?.length && (
            <p className="text-label text-soon-text">Chưa chắc, cần xác nhận: {result.chua_chac.join(' · ')}</p>
          )}
          <Button variant="primary" disabled={saving || !selected.length} onClick={() => void apply()}>
            Duyệt và lưu các mục đã chọn
          </Button>
          {saved && (
            <p role="status" className="text-label text-ok-text">
              Đã lưu các mục bạn duyệt trên thiết bị.
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-label text-alert-text">
          {error}
        </p>
      )}
    </section>
  );
}
