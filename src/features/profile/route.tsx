import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { ADVANCED_GROUPS } from '@/config/advanced';
import { CARE_STAGE_BOOKING, CARE_STAGE_DISPLAY, CARE_STAGE_OPTIONS } from '@/config/stages';
import { VELOCITY_CONFIG } from '@/config/velocity';
import { useCustomer, useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { customerBrief } from '@/domain/customer/brief';
import { callAttemptsOf, normStage, openTasksOf, sourceListOf } from '@/domain/customer/normalize';
import { customerTimeline } from '@/domain/customer/timeline';
import { forStage } from '@/domain/followup';
import { planSlaUndo } from '@/domain/velocity/automation';
import { bookingSteps, status as slaStatus } from '@/domain/velocity/engine';
import { customerUnit, loanPath } from '@/features/loan/model';
import { openQuickAction } from '@/features/quick-actions/store';
import { ActionBar, Avatar, Badge, Button, DeadlineTag, HealthDot, SlaRing, StageChip, Tabs, useToast } from '@/ui';

const FIELD =
  'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60';
type DocumentRow = { id: string; label?: string | null; kind?: string; storage_path: string; mime?: string };
const fmtValue = (value: unknown) => (value == null || value === '' ? 'Chưa biết' : String(value));

function Profile() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const customer = useCustomer(id);
  const account = useRepositoryAccount();
  const toast = useToast();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [docError, setDocError] = useState('');
  const writable = !!customer && !!account && customer.owner_id === account.sync.local.userId && !customer.archived_at;
  const readOnly = !!customer && !writable;
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
  const save = async (patch: Record<string, unknown>, message = 'Đã lưu trên thiết bị') => {
    if (!writable || !account || busy) return;
    if ('phone' in patch && !String(patch.phone || '').trim()) {
      toast({ title: 'Số điện thoại là thông tin bắt buộc', tone: 'error' });
      return;
    }
    if ('full_name' in patch && !String(patch.full_name || '').trim()) {
      toast({ title: 'Họ tên là thông tin bắt buộc', tone: 'error' });
      return;
    }
    setBusy(true);
    try {
      await account.customers.update(c.id, patch);
      toast({ title: message, description: account.sync.isOnline() ? 'Đang đồng bộ.' : 'Ngoại tuyến · chờ đồng bộ.' });
    } catch (error) {
      toast({
        title: 'Chưa lưu được',
        description: error instanceof Error ? error.message : 'Thử lại.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };
  const setField = (key: keyof Customer, value: unknown) => void save({ [key]: value });
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
    const steps = { ...(c.booking_steps || {}) };
    if (checked) steps[key] = new Date().toISOString();
    else delete steps[key];
    const history = Array.isArray(c.care_stage_history) ? c.care_stage_history.slice() : [];
    const config = VELOCITY_CONFIG.bookingSteps.find((item) => item.key === key);
    history.push({
      stage: c.care_stage,
      note: `${checked ? '✓' : 'Bỏ'} hồ sơ: ${config?.label || key}`,
      at: new Date().toISOString(),
    });
    await save(
      { booking_steps: steps, care_stage_history: history, care_stage_updated_at: new Date().toISOString() },
      'Đã cập nhật checklist hồ sơ',
    );
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
    <div className="space-y-3">
      {timeline.length ? (
        timeline.map((entry) => (
          <article key={entry.id} className="border-l-2 border-border pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-strong">{entry.title}</span>
              {entry.automatic && <Badge>Tự động · SLA</Badge>}
            </div>
            {entry.detail && <p className="mt-1 whitespace-pre-wrap text-body text-text-2">{entry.detail}</p>}
            <time className="mt-1 block font-data text-small text-text-3">
              {new Date(entry.at).toLocaleString('vi-VN')}
            </time>
          </article>
        ))
      ) : (
        <p className="text-body text-text-2">Chưa có hoạt động để hiển thị.</p>
      )}
    </div>
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
        <Field label="Giới tính" value={c.gender} disabled={!writable} onSave={(value) => setField('gender', value)} />
        <Field
          label="Tình trạng hôn nhân"
          value={c.marital_status}
          disabled={!writable}
          onSave={(value) => setField('marital_status', value)}
        />
        <Field
          label="Nghề nghiệp"
          value={c.occupation}
          disabled={!writable}
          onSave={(value) => setField('occupation', value)}
        />
        <Field label="Thu nhập" value={c.income} disabled={!writable} onSave={(value) => setField('income', value)} />
        <Field
          label="Nơi ở"
          value={c.residence}
          disabled={!writable}
          onSave={(value) => setField('residence', value)}
        />
        <Field
          label="Kênh / khung giờ liên hệ"
          value={`${c.contact_prefs?.channel || ''}${c.contact_prefs?.slot ? ` · ${c.contact_prefs.slot}` : ''}`}
          disabled={!writable}
          onSave={(value) => setField('contact_prefs', { ...(c.contact_prefs || {}), channel: value })}
        />
        <label className="flex min-h-11 items-center gap-2 text-body">
          <input
            type="checkbox"
            checked={!!c.contact_prefs?.do_not_contact}
            disabled={!writable}
            onChange={(e) =>
              setField('contact_prefs', {
                ...(c.contact_prefs || {}),
                do_not_contact: e.target.checked,
                dnc_at: e.target.checked ? new Date().toISOString() : null,
              })
            }
          />
          Không liên hệ
        </label>
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
    </div>
  );
  const needsContent = (
    <div className="space-y-4">
      <section className="space-y-3">
        <h2 className="text-section">Nhu cầu hiện tại</h2>
        <Field
          label="Mục đích mua"
          value={c.purpose}
          disabled={!writable}
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
      {Array.isArray(c.interests) && c.interests.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-section">Nhu cầu theo đợt</h2>
          {c.interests.filter(Boolean).map((item, index) => (
            <div key={item?.id || index} className="border-b border-border py-2">
              <p className="text-body-strong">
                {item?.project || 'Chưa rõ dự án'} · {item?.apt_type || 'Chưa rõ loại căn'}
              </p>
              <p className="text-small text-text-2">
                Ngân sách {fmtValue(item?.budget_max)} · {item?.status || 'chưa rõ trạng thái'}
              </p>
            </div>
          ))}
        </section>
      )}
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

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 p-4 pb-4 lg:p-6" data-testid="customer-profile">
      <div className="flex items-center justify-between">
        <Button onClick={() => navigate(-1)}>← Quay lại</Button>
        {readOnly && <Badge>Chỉ xem</Badge>}
      </div>
      <header className="relative overflow-hidden rounded-card border border-border bg-surface">
        {c.cover_path && account?.remote.coverUrl(c.cover_path) && (
          <img src={account.remote.coverUrl(c.cover_path) || ''} alt="" className="h-24 w-full object-cover" />
        )}
        <div className="flex flex-wrap items-center gap-3 p-4">
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
            <h1 className="truncate text-title">{c.full_name}</h1>
            <p className="font-data text-mono-data text-text-2">{c.phone}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StageChip
                stage={stage || 'idle'}
                label={CARE_STAGE_DISPLAY[stage] || stage || 'Chưa có bậc'}
                sla={
                  sla
                    ? {
                        value: sla.elapsed / sla.max,
                        target: sla.target / sla.max,
                        label: `${sla.text} ở ${sla.label}`,
                      }
                    : undefined
                }
              />
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
              <Badge>{sourceListOf(c.source).join(' · ') || 'Chưa rõ nguồn'}</Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
          <label className="text-small text-text-2">
            Bậc
            <select
              aria-label="Đổi bậc khách"
              value={stage}
              disabled={!writable || busy}
              onChange={(e) => void onStage(e.target.value)}
              className={`${FIELD} mt-1 min-w-52`}
            >
              <option value="">Chưa có bậc</option>
              {CARE_STAGE_OPTIONS.filter((option) => option !== VELOCITY_CONFIG.stageWon && option !== 'Loại').map(
                (option) => (
                  <option key={option} value={option}>
                    {CARE_STAGE_DISPLAY[option] || option}
                  </option>
                ),
              )}
            </select>
          </label>
          {sla && (
            <div className="flex items-center gap-2 text-small text-text-2">
              <SlaRing value={sla.elapsed / sla.max} target={sla.target / sla.max} size={28} label={sla.text} />
              {sla.label} · {sla.text}
            </div>
          )}
          {readOnly && <p className="text-small text-text-2">Người phụ trách khác · hồ sơ chỉ xem.</p>}
        </div>
      </header>
      {(() => {
        const undoPlan = account ? planSlaUndo(c, now, account.sync.local.userId) : null;
        return undoPlan ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface-2 p-3">
            <p className="text-body">Ứng dụng đã tự chuyển khách theo SLA.</p>
            <Button disabled={!writable || busy} onClick={() => void undo()}>
              Hoàn tác
            </Button>
          </div>
        ) : null;
      })()}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-section">Bước tiếp theo / lời hứa</h2>
          <Button disabled={!writable} onClick={() => void addPromise()}>
            Thêm việc
          </Button>
        </div>
        {tasks.length ? (
          tasks.map((task) => (
            <div key={task.at} className="flex items-center gap-3 border-b border-border py-2">
              <input
                aria-label={`Hoàn thành ${task.text}`}
                type="checkbox"
                disabled={!writable}
                onChange={() => void completeTask(task.at || '')}
              />
              <div className="min-w-0 flex-1">
                <p className="text-body-strong">{task.text}</p>
                <p className="text-small text-text-2">
                  {task.side === 'customer' ? 'Khách hẹn' : 'Em hứa'}
                  {task.due ? ` · ${new Date(task.due).toLocaleString('vi-VN')}` : ''}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-body text-text-2">
            Chưa có bước tiếp theo. Ghi lại việc cần làm hoặc lời hứa để không bỏ quên khách.
          </p>
        )}
      </section>
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="mb-3 text-section">Brief · 20 giây</h2>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {brief.map((item) => (
            <div key={item.key}>
              <p className="text-label text-text-3">{item.label}</p>
              <p className={item.value === 'Chưa biết' ? 'text-body text-text-3' : 'text-body'}>{item.value}</p>
              {item.value === 'Chưa biết' && <p className="text-small text-text-2">Có thể hỏi: {item.question}</p>}
            </div>
          ))}
        </div>
      </section>
      <Tabs items={tabs} label="Nội dung hồ sơ khách" sticky />
      <section className="space-y-2">
        <h2 className="text-section">Thông tin thêm</h2>
        <dl className="grid grid-cols-2 gap-2 text-small sm:grid-cols-3">
          <Fact label="Trạng thái liên hệ" value={c.contact_status} />
          <Fact label="Số lần gọi" value={calls.length} />
          <Fact
            label="Lần gọi cuối"
            value={calls.at(-1)?.at ? new Date(calls.at(-1)?.at || '').toLocaleString('vi-VN') : null}
          />
          <Fact label="Chiến dịch" value={c.campaign} />
          <Fact label="Nguồn" value={sourceListOf(c.source).join(' · ')} />
          <Fact label="Cách nhập" value={c.intake_method} />
          <Fact label="Mức quan tâm" value={c.interest_level} />
          <Fact label="Lý do loại" value={c.disqualify_reason} />
          <Fact label="Ghi chú kết thúc" value={c.disqualify_note || c.close_note} />
          <Fact label="Điều kiện retarget" value={c.retarget_hint?.note} />
          <Fact
            label="Không liên hệ"
            value={c.contact_prefs?.do_not_contact ? c.contact_prefs.dnc_reason || 'Đã yêu cầu' : 'Không'}
          />
          <Fact label="Ngày tạo" value={c.created_at} />
          <Fact label="Ghi chú đăng ký" value={c.notes} />
          <Fact label="Ngày đăng ký" value={c.registered_at || c.created_at} />
        </dl>
      </section>
      {actionBar}
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
  const [draft, setDraft] = useState(fmtValue(value) === 'Chưa biết' ? '' : String(value));
  useEffect(() => setDraft(fmtValue(value) === 'Chưa biết' ? '' : String(value)), [value]);
  const save = () => {
    if (draft !== String(value ?? '')) onSave(draft);
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
function Fact({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt className="text-text-3">{label}</dt>
      <dd className="whitespace-pre-wrap text-text">{fmtValue(value)}</dd>
    </div>
  );
}

export const route: FeatureRoute = { path: '/ho-so/:id', element: <Profile />, handle: { title: 'Hồ sơ khách' } };
