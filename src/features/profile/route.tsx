import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { ADVANCED_GROUPS } from '@/config/advanced';
import { OCCUPATIONS } from '@/config/occupations';
import { CARE_STAGE_BOOKING, CARE_STAGE_DISPLAY } from '@/config/stages';
import { VELOCITY_CONFIG } from '@/config/velocity';
import { useCustomer, useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { customerBrief } from '@/domain/customer/brief';
import { factPatch } from '@/domain/customer/facts';
import { callAttemptsOf, normStage, openTasksOf, sourceListOf } from '@/domain/customer/normalize';
import { customerTimeline } from '@/domain/customer/timeline';
import { taskDueInfo } from '@/domain/deadlines';
import { forStage } from '@/domain/followup';
import { planSlaUndo } from '@/domain/velocity/automation';
import { bookingSteps, status as slaStatus } from '@/domain/velocity/engine';
import { AiBrief } from '@/features/ai/AiBrief';
import { customerUnit, loanPath } from '@/features/loan/model';
import { openQuickAction } from '@/features/quick-actions/store';
import { slaBarOf } from '@/features/today/model';
import {
  ActionBar,
  Avatar,
  Badge,
  Button,
  DeadlineTag,
  displayText,
  HealthDot,
  Icon,
  Sheet,
  SlaBar,
  StageChip,
  sourceLabel,
  Tabs,
  useToast,
} from '@/ui';
import { ArchiveCustomerSection, ArchivedBanner } from './archive';
import { CustomerMemory } from './memory';
import { bookingStepPatch, dueTone, extraFacts, lastTouchOf, splitBrief, stageChoicesFor } from './model';
import { ProfileTimeline } from './timeline';

const FIELD =
  'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60';
const GENDER_OPTIONS = [
  { value: 'nam', label: 'Nam' },
  { value: 'nữ', label: 'Nữ' },
  { value: 'khác', label: 'Khác' },
];
const MARITAL_STATUS_OPTIONS = [
  { value: 'đã kết hôn', label: 'Đã kết hôn' },
  { value: 'chưa kết hôn', label: 'Chưa kết hôn' },
];
const PURPOSE_OPTIONS = ['Ở', 'Đầu tư', 'Cho tặng'].map((value) => ({ value, label: value }));
type DocumentRow = { id: string; label?: string | null; kind?: string; storage_path: string; mime?: string };
const fmtValue = (value: unknown) => displayText(value);

// Giữ export cũ (test + nơi khác import từ route).
export { editedTimelineNotePatch } from './model';

function Profile() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const customer = useCustomer(id);
  const account = useRepositoryAccount();
  const toast = useToast();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [missingKey, setMissingKey] = useState('');
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [docError, setDocError] = useState('');
  const writable = !!customer && !!account && customer.owner_id === account.sync.local.userId && !customer.archived_at;
  const readOnly = !!customer && !writable;
  const otherOwner = !!customer?.owner_id && !!account && customer.owner_id !== account.sync.local.userId;
  const stage = normStage(customer?.care_stage) || '';
  const sla = customer ? slaStatus(customer, now) : null;
  const timeline = useMemo(() => (customer ? customerTimeline(customer) : []), [customer]);
  const brief = useMemo(() => (customer ? customerBrief(customer) : []), [customer]);
  const tasks = customer ? openTasksOf(customer) : [];
  const calls = customer ? callAttemptsOf(customer) : [];
  const customerId = customer?.id;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let alive = true;
    if (!account || !customerId) return;
    setDocs([]);
    setDocError('');
    void account.remote
      .listDocuments(customerId)
      .then((rows: DocumentRow[]) => {
        if (alive) setDocs(Array.isArray(rows) ? rows : []);
      })
      .catch((error: unknown) => {
        if (alive) setDocError(error instanceof Error ? error.message : 'Chưa tải được tài liệu.');
      });
    return () => {
      alive = false;
    };
  }, [account, customerId]);

  if (!customer) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-title">Không tìm thấy hồ sơ khách</h1>
        <Button className="mt-4" onClick={() => navigate('/khach-hang')}>
          Về danh sách khách
        </Button>
      </main>
    );
  }
  const c: Customer = customer;
  const save = async (patch: Record<string, unknown>, message = 'Đã lưu trên thiết bị'): Promise<boolean> => {
    if (!writable || !account || busy) return false;
    if ('phone' in patch && !String(patch.phone || '').trim()) {
      toast({ title: 'Số điện thoại là thông tin bắt buộc', tone: 'error' });
      return false;
    }
    if ('full_name' in patch && !String(patch.full_name || '').trim()) {
      toast({ title: 'Họ tên là thông tin bắt buộc', tone: 'error' });
      return false;
    }
    setBusy(true);
    try {
      await account.customers.update(c.id, patch);
      toast({ title: message, description: account.sync.isOnline() ? 'Đang đồng bộ.' : 'Ngoại tuyến · chờ đồng bộ.' });
      return true;
    } catch (error) {
      toast({
        title: 'Chưa lưu được',
        description: error instanceof Error ? error.message : 'Thử lại.',
        tone: 'error',
      });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const setField = (key: keyof Customer, value: unknown) => void save(factPatch(c, String(key), value));
  const actionBar = (
    <ActionBar
      actions={[
        { icon: 'call', label: 'Gọi', disabled: !writable, onClick: () => openQuickAction(c.id, 'call') },
        { icon: 'message', label: 'Zalo', disabled: !writable, onClick: () => openQuickAction(c.id, 'zalo') },
        { icon: 'note', label: 'Ghi chú', disabled: !writable, onClick: () => openQuickAction(c.id, 'note') },
        { icon: 'call_sched', label: 'Hẹn', disabled: !writable, onClick: () => openQuickAction(c.id, 'schedule') },
      ]}
      className="-mx-4 lg:-mx-6"
    />
  );
  const onStage = async (next: string) => {
    if (!writable || !account || next === stage) return;
    const suggestion = forStage(c, next, Date.now());
    const patch: Record<string, unknown> = { care_stage: next };
    if (
      suggestion &&
      !window.confirm(
        `Đổi bậc sang “${CARE_STAGE_DISPLAY[next] || next}” và hẹn ${suggestion.label}? Chọn Hủy để chỉ đổi bậc.`,
      )
    ) {
      // A canceled schedule suggestion still permits the explicit stage change.
    } else if (suggestion) {
      patch.next_call_at = suggestion.start.toISOString();
      patch.next_call_end = suggestion.end.toISOString();
      patch.next_call_reason = suggestion.reason;
    }
    await save(patch, 'Đã cập nhật bậc');
  };
  const undo = async () => {
    if (!writable || !account) return;
    const plan = planSlaUndo(c, Date.now(), account.sync.local.userId);
    if (!plan) return;
    setBusy(true);
    try {
      await account.customers.update(plan.id, plan.patch, plan.opts);
      toast({ title: 'Đã hoàn tác tự chuyển SLA', description: 'Đồng hồ giai đoạn tính lại từ hôm nay.' });
    } catch (error) {
      toast({ title: 'Chưa hoàn tác được', description: String(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const toggleBooking = async (key: string, checked: boolean) => {
    await save(bookingStepPatch(c, key, checked, new Date().toISOString()), 'Đã cập nhật checklist hồ sơ');
  };
  const addPromise = async () => {
    const text = window.prompt('Việc tiếp theo / lời hứa');
    if (!text?.trim() || !account || !writable) return;
    let due: { due?: string; due_allday?: boolean } | null = null;
    const dueValue = window.prompt('Hạn (YYYY-MM-DD), để trống nếu chưa có hạn');
    if (dueValue?.trim()) {
      const parsed = new Date(`${dueValue}T09:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        toast({ title: 'Ngày hạn không hợp lệ', tone: 'error' });
        return;
      }
      due = { due: parsed.toISOString(), due_allday: true };
    }
    try {
      await account.customers.addTask(c.id, text.trim(), due, 'other');
      toast({ title: 'Đã lưu bước tiếp theo' });
    } catch (error) {
      toast({ title: 'Chưa lưu được', description: String(error), tone: 'error' });
    }
  };
  const completeTask = async (at: string) => {
    if (account && writable) await account.customers.completeTask(c.id, at);
  };
  const uploadDoc = async (file?: File) => {
    if (!file || !account || !writable) return;
    setBusy(true);
    try {
      const doc = await account.remote.uploadDocument(
        c.id,
        file,
        file.type.startsWith('image/') ? 'anh' : 'khac',
        file.name,
      );
      setDocs((prev) => [...prev, doc]);
      toast({ title: 'Đã tải tài liệu lên' });
    } catch (error) {
      toast({ title: 'Chưa tải được tài liệu', description: String(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const removeDoc = async (doc: DocumentRow) => {
    if (!account || !writable || !window.confirm(`Xoá tài liệu “${doc.label || doc.storage_path}”?`)) return;
    try {
      await account.remote.deleteDocument(doc);
      setDocs((prev) => prev.filter((item) => item.id !== doc.id));
      toast({ title: 'Đã xoá tài liệu' });
    } catch (error) {
      toast({ title: 'Chưa xoá được tài liệu', description: String(error), tone: 'error' });
    }
  };
  const changePhoto = async (kind: 'avatar' | 'cover', file?: File) => {
    if (!file || !account || !writable) return;
    setBusy(true);
    try {
      await (kind === 'avatar' ? account.remote.uploadAvatar(c.id, file) : account.remote.uploadCover(c.id, file));
      toast({ title: `Đã đổi ${kind === 'avatar' ? 'ảnh đại diện' : 'ảnh bìa'}` });
    } catch (error) {
      toast({ title: 'Chưa tải được ảnh', description: String(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const timelineContent = (
    <ProfileTimeline customer={c} entries={timeline} writable={writable} busy={busy} onSave={save} />
  );
  const memoryContent = (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-section">Định danh & liên hệ</h2>
        <Field
          label="Họ tên"
          value={c.full_name}
          disabled={!writable}
          onSave={(value) => setField('full_name', value)}
        />
        <Field
          label="Số điện thoại"
          value={c.phone}
          disabled={!writable}
          onSave={(value) => setField('phone', value)}
        />
        <Field label="Ngày sinh" value={c.dob} disabled={!writable} onSave={(value) => setField('dob', value)} />
        <ChoiceField
          label="Giới tính"
          value={c.gender}
          disabled={!writable || busy}
          options={GENDER_OPTIONS}
          onSave={(value) => setField('gender', value)}
        />
        <ChoiceField
          label="Tình trạng hôn nhân"
          value={c.marital_status}
          disabled={!writable || busy}
          options={MARITAL_STATUS_OPTIONS}
          onSave={(value) => setField('marital_status', value)}
        />
        <ChoiceField
          label="Nghề nghiệp"
          value={c.occupation}
          disabled={!writable || busy}
          options={OCCUPATIONS.map((value) => ({ value, label: value }))}
          onSave={(value) => setField('occupation', value)}
        />
        <Field label="Thu nhập" value={c.income} disabled={!writable} onSave={(value) => setField('income', value)} />
        <Field
          label="Nơi ở"
          value={c.residence}
          disabled={!writable}
          onSave={(value) => setField('residence', value)}
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-section">Hồ sơ nâng cao</h2>
        {ADVANCED_GROUPS.map((group) => (
          <fieldset key={group.title} className="space-y-2">
            <legend className="text-body-strong">{group.title}</legend>
            {group.fields.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                value={c.advanced?.[field.key]}
                disabled={!writable}
                multiline={field.type === 'textarea'}
                onSave={(value) => setField('advanced', { ...(c.advanced || {}), [field.key]: value })}
              />
            ))}
          </fieldset>
        ))}
        {Object.entries(c.advanced || {})
          .filter(([key]) => !ADVANCED_GROUPS.some((group) => group.fields.some((field) => field.key === key)))
          .map(([key, value]) => (
            <p key={key} className="text-small text-text-2">
              {key}: {fmtValue(value)} <span className="text-text-3">(trường cũ được giữ nguyên)</span>
            </p>
          ))}
      </section>
      <CustomerMemory
        customer={c}
        writable={writable}
        onSave={(patch, message) => void save(patch, message)}
        now={now}
      />
    </div>
  );
  const needsContent = (
    <div className="space-y-4">
      <section className="space-y-3">
        <h2 className="text-section">Nhu cầu hiện tại</h2>
        <ChoiceField
          label="Mục đích mua"
          value={c.purpose}
          disabled={!writable || busy}
          options={PURPOSE_OPTIONS}
          onSave={(value) => setField('purpose', value)}
        />
        <Field
          label="Dự án quan tâm"
          value={(c.projects || []).join(', ')}
          disabled={!writable}
          onSave={(value) =>
            setField(
              'projects',
              value
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean),
            )
          }
        />
        <Field
          label="Loại căn"
          value={c.apt_type}
          disabled={!writable}
          onSave={(value) => setField('apt_type', value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Diện tích (m²)"
            value={c.apt_area}
            disabled={!writable}
            onSave={(value) => setField('apt_area', value === '' ? null : Number(value))}
          />
          <Field
            label="Tài chính sẵn có (VNĐ)"
            value={c.finance}
            disabled={!writable}
            onSave={(value) => setField('finance', value === '' ? null : Number(value))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Mã toà"
            value={c.building_code}
            disabled={!writable}
            onSave={(value) => setField('building_code', value)}
          />
          <Field
            label="Mã căn"
            value={c.apt_code}
            disabled={!writable}
            onSave={(value) => setField('apt_code', value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Hướng"
            value={c.apt_direction}
            disabled={!writable}
            onSave={(value) => setField('apt_direction', value)}
          />
          <Field
            label="Tầng"
            value={c.apt_floor}
            disabled={!writable}
            onSave={(value) => setField('apt_floor', value === '' ? null : Number(value))}
          />
        </div>
        <Button variant="primary" onClick={() => navigate(loanPath({ customerId: c.id, ...customerUnit(c) }))}>
          Tính vay cho khách này
        </Button>
      </section>
      {stage === CARE_STAGE_BOOKING && (
        <section className="space-y-3">
          <h2 className="text-section">Checklist Booking & làm hồ sơ</h2>
          {bookingSteps(c, now).map((row) => (
            <label key={row.key} className="flex min-h-12 items-center gap-3 border-b border-border py-2">
              <input
                type="checkbox"
                checked={!!row.doneAt}
                disabled={!writable}
                onChange={(e) => void toggleBooking(row.key, e.target.checked)}
              />
              <span className="flex-1">
                <span className="block text-body-strong">{row.label}</span>
                <span className="text-small text-text-2">{row.text}</span>
              </span>
              {row.due && (
                <DeadlineTag
                  tag={{
                    state: row.state === 'over' ? 'missed' : row.state === 'warn' ? 'soon' : 'far',
                    text: new Date(row.due).toLocaleDateString('vi-VN'),
                  }}
                />
              )}
            </label>
          ))}
          <Button
            variant="primary"
            disabled={!writable}
            onClick={() => {
              if (window.confirm('Xác nhận khách đã ký HĐMB?'))
                void save({ care_stage: VELOCITY_CONFIG.stageWon }, 'Đã ghi nhận ký HĐMB');
            }}
          >
            Xác nhận đã ký HĐMB
          </Button>
        </section>
      )}
    </div>
  );
  const docsContent = (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-section">Tài liệu & ảnh</h2>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-border-strong px-3 text-body-strong">
          Tải tài liệu
          <input
            className="sr-only"
            type="file"
            disabled={!writable || busy}
            onChange={(e) => {
              void uploadDoc(e.currentTarget.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
        </label>
      </div>
      {docError && (
        <p role="alert" className="text-small text-danger">
          {docError}
        </p>
      )}
      {!docs.length && (
        <p className="text-body text-text-2">
          {account?.sync.isOnline() ? 'Chưa có tài liệu.' : 'Ngoại tuyến · tài liệu chỉ tải khi có mạng.'}
        </p>
      )}
      {docs.map((doc) => (
        <article key={doc.id} className="flex items-center justify-between gap-3 border-b border-border py-2">
          <div>
            <p className="text-body-strong">{doc.label || doc.kind || 'Tài liệu'}</p>
            <p className="break-all text-small text-text-3">{doc.storage_path}</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                void account?.remote
                  .signedDocUrl(doc.storage_path)
                  .then((url: string | null) => url && window.open(url, '_blank', 'noopener,noreferrer'))
              }
            >
              Mở
            </Button>
            {writable && <Button onClick={() => void removeDoc(doc)}>Xoá</Button>}
          </div>
        </article>
      ))}
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-2 text-small">
          Ảnh đại diện
          {c.avatar_path && account?.remote.avatarUrl(c.avatar_path) && (
            <img
              alt="Ảnh đại diện khách"
              src={account.remote.avatarUrl(c.avatar_path) || ''}
              className="size-20 rounded-full object-cover"
            />
          )}
          <input
            aria-label="Đổi ảnh đại diện"
            className={FIELD}
            type="file"
            accept="image/*"
            disabled={!writable || busy}
            onChange={(e) => void changePhoto('avatar', e.currentTarget.files?.[0])}
          />
        </label>
        <label className="space-y-2 text-small">
          Ảnh bìa
          {c.cover_path && account?.remote.coverUrl(c.cover_path) && (
            <img
              alt="Ảnh bìa khách"
              src={account.remote.coverUrl(c.cover_path) || ''}
              className="h-20 w-full rounded-control object-cover"
            />
          )}
          <input
            aria-label="Đổi ảnh bìa"
            className={FIELD}
            type="file"
            accept="image/*"
            disabled={!writable || busy}
            onChange={(e) => void changePhoto('cover', e.currentTarget.files?.[0])}
          />
        </label>
      </div>
      {readOnly && <p className="text-small text-text-2">Bạn chỉ có quyền xem; thao tác sửa và tải lên đã khoá.</p>}
    </section>
  );
  const tabs = [
    { value: 'timeline', label: 'Dòng thời gian', count: timeline.length, content: timelineContent },
    { value: 'memory', label: 'Trí nhớ', content: memoryContent },
    { value: 'needs', label: 'Nhu cầu & căn', content: needsContent },
    { value: 'docs', label: 'Tài liệu', count: docs.length, content: docsContent },
    {
      value: 'loan',
      label: 'Tính vay',
      content: (
        <section className="space-y-3">
          <p className="text-body text-text-2">
            Mở máy tính vay với khách và căn đang xem. Thao tác này không sửa hồ sơ.
          </p>
          <Button variant="primary" onClick={() => navigate(loanPath({ customerId: c.id, ...customerUnit(c) }))}>
            Mở máy tính vay
          </Button>
        </section>
      ),
    },
  ];

  const slas = slaBarOf(c, now);
  const briefParts = splitBrief(brief);
  const lastTouch = lastTouchOf(c, now);
  const extra = extraFacts(c, now);
  const stageLabel = CARE_STAGE_DISPLAY[stage] || stage || 'Chưa có bậc';
  const stageOptions = stageChoicesFor(stage);
  // Việc đến hạn/quá hạn đứng đầu hồ sơ, vạch đỏ để không bỏ quên (D-010).
  const tones = tasks.map((task) => dueTone(taskDueInfo(task, now)));
  const nextTone = tones.includes('over') ? 'over' : tones.includes('soon') ? 'soon' : undefined;
  const asked = briefParts.missing.find((item) => item.key === missingKey) ?? null;
  const undoPlan = account ? planSlaUndo(c, now, account.sync.local.userId) : null;
  const sourceText = sourceListOf(c.source).map(sourceLabel).filter(Boolean).join(' · ');

  return (
    <main
      className="mx-auto w-full max-w-5xl space-y-4 p-4 pb-[calc(92px+env(safe-area-inset-bottom))] lg:p-6 lg:pb-6"
      data-testid="customer-profile"
    >
      <ArchivedBanner customer={c} />
      <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6 lg:space-y-0">
        <header className="relative overflow-hidden rounded-card border border-border bg-surface lg:col-start-1 lg:row-start-1">
          {c.cover_path && account?.remote.coverUrl(c.cover_path) && (
            <img src={account.remote.coverUrl(c.cover_path) || ''} alt="" className="h-24 w-full object-cover" />
          )}
          <div className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              {c.avatar_path && account?.remote.avatarUrl(c.avatar_path) ? (
                <img
                  src={account.remote.avatarUrl(c.avatar_path) || ''}
                  alt={`Ảnh đại diện ${c.full_name}`}
                  className="size-14 shrink-0 rounded-full object-cover"
                />
              ) : (
                <Avatar name={c.full_name} size={56} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="min-w-0 truncate text-title">{c.full_name}</h1>
                  {readOnly && <Badge>Chỉ xem</Badge>}
                </div>
                <p className="font-data text-mono-data text-text-2">{c.phone}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={`Đổi bậc · ${stageLabel}`}
                disabled={!writable || busy}
                onClick={() => setStageOpen(true)}
                className="inline-flex min-h-9 items-center gap-1 rounded-full text-left disabled:opacity-60"
              >
                <StageChip stage={stage || 'idle'} label={stageLabel} />
                <Icon name="expand" size={16} className="text-text-3" />
              </button>
              <HealthDot
                health={
                  calls.length || c.next_call_at
                    ? sla?.state === 'over'
                      ? 'risk'
                      : sla?.state === 'warn'
                        ? 'late'
                        : 'ok'
                    : 'unknown'
                }
                showText
              />
              <Badge>{sourceText || 'Chưa rõ nguồn'}</Badge>
            </div>
            {slas && <SlaBar label="SLA bậc" state={slas.state} ratio={slas.ratio} text={slas.text} />}
            <div className="-mx-4 lg:mx-0">{actionBar}</div>
            {otherOwner && <p className="text-small text-text-2">Người phụ trách khác · hồ sơ chỉ xem.</p>}
            {undoPlan && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface-2 p-3">
                <p className="text-body">Ứng dụng đã tự chuyển khách theo SLA.</p>
                <Button disabled={!writable || busy} onClick={() => void undo()}>
                  Hoàn tác
                </Button>
              </div>
            )}
          </div>
        </header>

        <section
          aria-label="Việc tiếp theo"
          data-tone={nextTone}
          className="relative overflow-hidden rounded-card border border-border bg-surface p-4 lg:col-start-1 lg:row-start-2"
        >
          {nextTone === 'over' && (
            <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-[3px] bg-danger" />
          )}
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-label text-text-2">Việc tiếp theo</h2>
            <Button disabled={!writable} onClick={() => void addPromise()}>
              Thêm việc
            </Button>
          </div>
          {tasks.length ? (
            <ul className="mt-2 space-y-3">
              {tasks.map((task) => {
                const due = taskDueInfo(task, now);
                const tag = due
                  ? due.state === 'overdue'
                    ? { state: 'missed' as const, text: due.label }
                    : due.state === 'due'
                      ? { state: 'due' as const, text: due.label }
                      : due.state === 'today'
                        ? { state: 'soon' as const, text: due.label }
                        : { state: 'far' as const, text: due.label }
                  : null;
                return (
                  <li key={task.at} className="flex items-start gap-3">
                    <input
                      aria-label={`Hoàn thành ${task.text}`}
                      type="checkbox"
                      disabled={!writable}
                      onChange={() => void completeTask(task.at || '')}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-body-strong">{task.text}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-small text-text-2">
                        <span>{task.side === 'customer' ? 'Khách hẹn' : 'Em hứa'}</span>
                        <DeadlineTag tag={tag} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-body text-text-2">
              Chưa có bước tiếp theo. Ghi lại việc cần làm hoặc lời hứa để không bỏ quên khách.
            </p>
          )}
        </section>

        <section
          aria-label="Lần trước"
          className="rounded-card border border-border bg-surface p-4 lg:col-start-1 lg:row-start-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-label text-text-2">Lần trước{lastTouch?.when ? ` · ${lastTouch.when}` : ''}</h2>
            {lastTouch && <span className="text-small text-text-2">{lastTouch.meta}</span>}
          </div>
          {lastTouch ? (
            <p className="mt-2 text-body">
              {lastTouch.headline && <b className="font-semibold">{lastTouch.headline}. </b>}
              {lastTouch.text}
            </p>
          ) : (
            <p className="mt-2 text-body text-text-2">Chưa có liên hệ nào được ghi.</p>
          )}
        </section>

        <section
          aria-label="Đã biết"
          className="rounded-card border border-border bg-surface p-4 lg:col-start-2 lg:row-start-1"
        >
          <h2 className="text-label text-text-2">Đã biết</h2>
          {briefParts.known.length ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
              {briefParts.known.map((item) => (
                <div key={item.key} className="min-w-0">
                  <dt className="text-small text-text-3">{item.label}</dt>
                  <dd className="text-body [overflow-wrap:anywhere]">{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-2 text-body text-text-2">Chưa có thông tin nào được ghi.</p>
          )}
          {briefParts.missing.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-small text-text-2">Còn thiếu:</span>
              {briefParts.missing.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-expanded={missingKey === item.key}
                  onClick={() => setMissingKey(missingKey === item.key ? '' : item.key)}
                  className="inline-flex min-h-9 items-center rounded-full border border-dashed border-border-strong px-3 text-small text-text-2 hover:bg-surface-2"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          {asked && <p className="mt-2 text-small text-text-2">Có thể hỏi: {asked.question}</p>}
        </section>

        <div className="lg:col-start-1 lg:row-start-4">
          <Tabs
            items={tabs}
            label="Nội dung hồ sơ khách"
            sticky
            className="[&_[role=tab]]:scroll-mt-14 [&_[role=tablist]]:top-14"
          />
        </div>

        <section
          aria-label="Thông tin thêm"
          className="rounded-card border border-border bg-surface p-4 lg:col-start-2 lg:row-start-2"
        >
          <h2 className="text-section">Thông tin thêm</h2>
          {extra.length ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-small sm:grid-cols-3 lg:grid-cols-1">
              {extra.map((row) => (
                <div key={row.label} className="min-w-0">
                  <dt className="text-text-3">{row.label}</dt>
                  <dd className="whitespace-pre-wrap text-body [overflow-wrap:anywhere]">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-2 text-body text-text-2">Chưa có thông tin bổ sung.</p>
          )}
        </section>

        <div className="lg:col-start-2 lg:row-start-3">
          <AiBrief customer={c} />
        </div>

        <div className="lg:col-start-1 lg:row-start-5">
          <ArchiveCustomerSection customer={c} />
        </div>
      </div>

      <Sheet
        open={stageOpen}
        onOpenChange={setStageOpen}
        title="Đổi bậc khách"
        description="Chọn bậc chăm sóc mới. Lịch gợi ý và SLA sẽ theo bậc mới."
      >
        <fieldset className="space-y-1">
          <legend className="sr-only">Bậc chăm sóc</legend>
          {stageOptions.map((option) => (
            <label
              key={option}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-control px-2 hover:bg-surface-2"
            >
              <input
                type="radio"
                name="profile-care-stage"
                value={option}
                checked={option === stage}
                disabled={busy}
                onChange={() => {
                  setStageOpen(false);
                  void onStage(option);
                }}
              />
              <span className="text-body">{CARE_STAGE_DISPLAY[option] || option}</span>
            </label>
          ))}
        </fieldset>
      </Sheet>
    </main>
  );
}

function Field({
  label,
  value,
  disabled,
  multiline,
  onSave,
}: {
  label: string;
  value: unknown;
  disabled: boolean;
  multiline?: boolean;
  onSave: (value: string) => void;
}) {
  const id = `profile-field-${label.toLocaleLowerCase('vi').replace(/[^\p{L}\p{N}]+/gu, '-')}`;
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : displayText(value);
  const [draft, setDraft] = useState(raw);
  useEffect(() => setDraft(raw), [raw]);
  const save = () => {
    if (draft !== raw) onSave(draft);
  };
  return (
    <div className="block space-y-1 text-small text-text-2">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          className={`${FIELD} min-h-20 py-2`}
        />
      ) : (
        <input
          id={id}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          className={FIELD}
        />
      )}
    </div>
  );
}
function ChoiceField({
  label,
  value,
  disabled,
  options,
  onSave,
}: {
  label: string;
  value: unknown;
  disabled: boolean;
  options: readonly { value: string; label: string }[];
  onSave: (value: string | null) => void;
}) {
  const id = `profile-field-${label.toLocaleLowerCase('vi').replace(/[^\p{L}\p{N}]+/gu, '-')}`;
  const current = value == null ? '' : String(value);
  const preservesUnknown = current !== '' && !options.some((option) => option.value === current);
  return (
    <div className="block space-y-1 text-small text-text-2">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={current}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          if (next !== current) onSave(next || null);
        }}
        className={FIELD}
      >
        <option value="">— Chưa chọn —</option>
        {preservesUnknown && <option value={current}>{current} (giá trị hiện có)</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export const route: FeatureRoute = {
  path: '/ho-so/:id',
  element: <Profile />,
  handle: { title: 'Hồ sơ khách', hideNav: true },
};
