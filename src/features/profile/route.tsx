import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { ActionButton, Avatar, SlaMeter, StageChip } from '@/components/crm';
import { FormSubsection } from '@/components/crm/form-section';
import { Button } from '@/components/ui/button';
import { TabsContent, TabsList, Tabs as TabsPrimitive, TabsTrigger } from '@/components/ui/tabs';
import { PREF_CONDITIONS_LEGACY, PROFILE_PREF_CONDITIONS, PROFILE_PREF_FIELDS } from '@/config/advanced';
import { CARE_STAGE_BOOKING, CARE_STAGE_DISPLAY } from '@/config/stages';
import { type TaskActionKind, taskKindOf } from '@/config/taskKinds';
import { VELOCITY_CONFIG } from '@/config/velocity';
import { useCustomer, useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { customerBrief } from '@/domain/customer/brief';
import { factPatch } from '@/domain/customer/facts';
import { callAttemptsOf, normStage, openTasksOf } from '@/domain/customer/normalize';
import { canMoveStage } from '@/domain/customer/stageMoves';
import { canEditTeamInfo, canLogHistory, isTeamInfoPatch } from '@/domain/customer/teamEdit';
import { customerTimeline } from '@/domain/customer/timeline';
import { callScheduleLabel, countdownTag, dashWhen, taskDueInfo } from '@/domain/deadlines';
import type { ScheduleSuggestion } from '@/domain/followup';
import { planSlaUndo } from '@/domain/velocity/automation';
import { bookingSteps, status as slaStatus } from '@/domain/velocity/engine';
import { AiBrief } from '@/features/ai/AiBrief';
import { CUSTOMER_GROUP_LABEL, customerGroupOf } from '@/features/customers/model';
import { ClassifyLeadSheet, canClassify } from '@/features/leads/ClassifySheet';
import { hasTalked, qualifyLead } from '@/features/leads/model';
import { loanPath } from '@/features/loan/model';
import { callDraftOf, callDuration, pendingCallsOf } from '@/features/quick-actions/model';
import { openQuickAction } from '@/features/quick-actions/store';
import { AssignCustomerSheet, canAssignWithTeam, useTeamMembers } from '@/features/team/AssignSheet';
import { slaMeterFor } from '@/lib/crm';
import { Icon } from '@/ui/Icon';
import { AddTaskSheet } from './add-task';
import { ProfileTextField as Field, LegacyAssistField, ProfileAdvanced } from './advanced';
import { ArchiveCustomerSection, ArchivedBanner } from './archive';
import { dobSavePatch, dobView } from './dob';
import { DocumentsSection } from './documents';
import { advancedPatch, LONG_FIELD, legacyValues } from './fields';
import { infoHiddenCount, ProfileInfoFields } from './info';
import { CustomerMemory, CustomerNeedsAdvanced, contactPrefsMissingCount } from './memory';
import {
  bookingStepPatch,
  dueTone,
  estimatePrice,
  extraFacts,
  formatVndShort,
  lastTouchOf,
  type PriceCatalog,
  priceRates,
  profileLoan,
  splitBrief,
  type TaskDueValue,
  withTaskKinds,
} from './model';
import { hasNeedValue, NEEDS_FIELDS, needsHiddenFor, ProfileNeedsFields, type ProjectCatalog } from './needs';
import { ProfilePhotoFrame } from './photos';
import { StageChangeSheet } from './stage-change';
import { ProfileTimeline } from './timeline';

// Giữ export cũ (test + nơi khác import từ route).
export { editedTimelineNotePatch } from './model';

function Profile() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const customer = useCustomer(id);
  const account = useRepositoryAccount();
  const [notice, setNotice] = useState<{
    title: string;
    description?: string;
    tone?: 'default' | 'error';
    onUndo?: () => void;
  } | null>(null);
  const toast = (input: { title: string; description?: string; tone?: 'default' | 'error'; onUndo?: () => void }) => {
    setNotice(input);
  };
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  // TL-03: mở hồ sơ bắt đầu ở Dòng thời gian.
  const [tab, setTab] = useState('timeline');
  // CL-03 L2: ô trống của Trí nhớ ẩn sau nút "Bổ sung"; mặc định đóng mỗi lần mở hồ sơ.
  const [supplementOpen, setSupplementOpen] = useState(false);
  // CP-01: ô trống của Nhu cầu hiện tại dùng nút "Bổ sung" riêng.
  const [needsSupplementOpen, setNeedsSupplementOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [missingKey, setMissingKey] = useState('');
  // Bấm "Còn thiếu: …" → mở đúng tab/khối rồi cuộn tới ô cần điền (Curtis 03/11).
  const [jump, setJump] = useState<{ target: string; serial: number } | null>(null);
  const [assetsOpenSignal, setAssetsOpenSignal] = useState(0);
  const [needsAdvancedSignal, setNeedsAdvancedSignal] = useState(0);
  const [docCount, setDocCount] = useState(0);
  const [, bumpCatalog] = useState(0);
  const [catalogLoadFailed, setCatalogLoadFailed] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  // CP-03: Thêm việc mở danh sách 5 loại trước, không dùng window.prompt.
  const [addOpen, setAddOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [classifyOpen, setClassifyOpen] = useState(false);
  const teamMembers = useTeamMembers(account);
  const writable = !!customer && !!account && customer.owner_id === account.sync.local.userId && !customer.archived_at;
  // Khách nhóm (D-025) / khách đã giao (D-032): người đang thấy khách sửa thông tin + ghi giùm cuộc gọi, tương tác,
  // ghi chú; Gọi, Zalo, Hẹn, bậc, việc vẫn của người phụ trách.
  const teamInfo = !writable && !!account && canEditTeamInfo(customer, account.sync.local.userId);
  const infoWritable = writable || teamInfo;
  const canEditHistory = !!customer && !!account && canLogHistory(customer, account.sync.local.userId);
  const readOnly = !!customer && !infoWritable;
  const otherOwner = !!customer?.owner_id && !!account && customer.owner_id !== account.sync.local.userId;
  const stage = normStage(customer?.care_stage) || '';
  const sla = customer ? slaStatus(customer, now) : null;
  const timeline = useMemo(() => (customer ? withTaskKinds(customer, customerTimeline(customer)) : []), [customer]);
  const brief = useMemo(() => (customer ? customerBrief(customer) : []), [customer]);
  const tasks = customer ? openTasksOf(customer) : [];
  const calls = customer ? callAttemptsOf(customer) : [];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Mạng đổi trong lúc mở hồ sơ → nút thêm/lưu trữ dự án khoá lại ngay.
  useEffect(() => {
    const refresh = () => setBrowserOnline(navigator.onLine);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  // Mở một khách khác: tab về Dòng thời gian, mọi khu Bổ sung/Nâng cao đóng lại.
  const customerId = customer?.id ?? '';
  // Ô nhu cầu đã có giá trị lúc mở khách vẫn hiện dù bị xoá trắng; giữ qua lần đổi tab, chỉ reset khi sang khách khác.
  const [needsVisible, setNeedsVisible] = useState<{ id: string; keys: Set<string> }>(() => ({
    id: customerId,
    keys: new Set(NEEDS_FIELDS.filter((key) => hasNeedValue(customer?.[key]))),
  }));
  if (needsVisible.id !== customerId) {
    setNeedsVisible({
      id: customerId,
      keys: new Set(NEEDS_FIELDS.filter((key) => hasNeedValue(customer?.[key]))),
    });
  }
  useEffect(() => {
    if (!customerId) return;
    setTab('timeline');
    setAddOpen(false);
    setSupplementOpen(false);
    setNeedsSupplementOpen(false);
    setProjectsOpen(false);
    setStageOpen(false);
  }, [customerId]);

  // Catalog dùng chung: đọc cache local + nghe thay đổi; lỗi load thì giữ nguyên danh mục đang có.
  const catalog = useMemo<ProjectCatalog | null>(() => {
    if (!account?.catalog) return null;
    const source = account.catalog;
    return {
      projects: () =>
        source.projects().map((row) => ({
          ...row,
          id: String(row.id ?? ''),
          name: String(row.name ?? ''),
          archived_at: row.archived_at ?? null,
        })),
      load: () => source.load(),
      onChange: (fn) => source.onChange(fn),
      addProject: (name) =>
        source.addProject(name, undefined).then((row) => ({
          ...row,
          id: String(row.id ?? ''),
          name: String(row.name ?? ''),
          archived_at: row.archived_at ?? null,
        })),
      archiveProject: (id) => source.archiveProject(id),
    };
  }, [account]);
  useEffect(() => {
    if (!catalog) return;
    let alive = true;
    const unsubscribe = catalog.onChange(() => {
      if (alive) bumpCatalog((value) => value + 1);
    });
    setCatalogLoadFailed(false);
    void catalog
      .load()
      .catch(() => false)
      .then((loaded) => {
        if (alive) setCatalogLoadFailed(!loaded);
      });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [catalog]);

  // Ô đích có thể chỉ xuất hiện sau khi tab/khối vừa mở render xong → thử vài khung hình.
  useEffect(() => {
    if (!jump) return;
    let frame = 0;
    let tries = 0;
    const find = () => {
      const target = document.querySelector<HTMLElement>(`[data-jump="${jump.target}"]`);
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target.querySelector<HTMLElement>('input, select, textarea, button')?.focus({ preventScroll: true });
      } else if (tries++ < 20) frame = requestAnimationFrame(find);
    };
    frame = requestAnimationFrame(find);
    return () => cancelAnimationFrame(frame);
  }, [jump]);

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
  const save = async (
    patch: Record<string, unknown>,
    message = 'Đã lưu trên thiết bị',
    options: { careStageNote?: string | null } = {},
  ): Promise<boolean> => {
    if (!account || busy || !(writable || (teamInfo && isTeamInfoPatch(patch)))) return false;
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
      // Chỉ truyền options khi thật sự có ghi chú bậc — giữ đúng chữ ký update(id, patch) cũ cho mọi lần lưu khác.
      if (options.careStageNote) await account.customers.update(c.id, patch, options);
      else await account.customers.update(c.id, patch);
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
  const setAdvancedField = (key: string, value: unknown) =>
    setField('advanced', advancedPatch(c.advanced, key, value).advanced);
  // Ô vừa xoá trắng vẫn nằm trong form tới khi mở khách khác.
  const keepNeedVisible = (key: string) =>
    setNeedsVisible((prev) => (prev.id === customerId ? { ...prev, keys: new Set(prev.keys).add(key) } : prev));
  const setNeedField = (key: keyof Customer, value: unknown) => {
    if (!hasNeedValue(value)) keepNeedVisible(String(key));
    setField(key, value);
  };
  // layout: thanh đáy điện thoại dàn hai mép; trong thẻ máy tính là lưới 4 ô bằng nhau (PF-10).
  const actionBar = (className = '', layout = 'flex items-center justify-between') => (
    <nav aria-label="Hành động nhanh" className={`${layout} min-w-0 gap-2 ${className}`}>
      <ActionButton
        action="call"
        label="Gọi"
        display="stacked"
        className="md:w-auto md:flex-row md:px-4 xl:min-h-11 xl:gap-2 xl:py-0 xl:text-sm"
        disabled={!writable}
        onClick={() => openQuickAction(c.id, 'call')}
      />
      <ActionButton
        action="message"
        label="Zalo"
        display="stacked"
        className="md:w-auto md:flex-row md:px-4 xl:min-h-11 xl:gap-2 xl:py-0 xl:text-sm"
        disabled={!writable}
        onClick={() => openQuickAction(c.id, 'zalo')}
      />
      <ActionButton
        action="note"
        label="Ghi chú"
        display="stacked"
        className="md:w-auto md:flex-row md:px-4 xl:min-h-11 xl:gap-2 xl:py-0 xl:text-sm"
        disabled={!infoWritable}
        onClick={() => openQuickAction(c.id, 'note')}
      />
      <ActionButton
        action="call_sched"
        label="Hẹn"
        display="stacked"
        className="md:w-auto md:flex-row md:px-4 xl:min-h-11 xl:gap-2 xl:py-0 xl:text-sm"
        disabled={!writable}
        onClick={() => openQuickAction(c.id, 'schedule')}
      />
    </nav>
  );
  const onStage = async (next: string, note: string, suggestion: ScheduleSuggestion | null) => {
    if (!writable || !account || !canMoveStage(stage, next)) return false;
    const patch: Record<string, unknown> = { care_stage: next };
    if (suggestion) {
      patch.next_call_at = suggestion.start.toISOString();
      patch.next_call_end = suggestion.end.toISOString();
      patch.next_call_reason = suggestion.reason;
    }
    return save(patch, 'Đã cập nhật bậc', { careStageNote: note });
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
  // CP-03: nội dung bắt buộc; hạn do form quyết định, không tự bịa nội dung hay hạn.
  const saveNewTask = async (kind: Exclude<TaskActionKind, 'call'>, text: string, due: TaskDueValue) => {
    if (!account || !writable) throw new Error('Khách chỉ được xem.');
    await account.customers.addTask(c.id, text, due, kind);
    toast({ title: 'Đã thêm việc', description: `${text} · ${c.full_name}` });
  };
  const completeTask = async (at: string) => {
    if (account && writable) await account.customers.completeTask(c.id, at);
  };
  const priceCatalog = (account?.catalog as PriceCatalog | undefined) ?? null;
  const estimate = estimatePrice(c, priceCatalog);
  const rates = priceRates(c, priceCatalog);
  const loanInfo = profileLoan(c, estimate, rates);
  // Phân cấp thông tin (Curtis 06/11): ô cơ bản trống ẩn sau "Mở rộng"; "Nâng cao" chỉ hiện khi đã mở rộng
  // hoặc ô cơ bản đã đủ. Người chỉ xem không có "Mở rộng" nên luôn thấy "Nâng cao".
  // PF-11 (Curtis 08/11): nút Mở rộng/Thu gọn nằm DƯỚI "Nâng cao" — thu gọn thì ẩn cả ô trống lẫn Nâng cao;
  // ô cơ bản đã đủ thì không còn nút (kể cả đang mở rộng), Nâng cao hiện thẳng.
  const memoryHidden = infoHiddenCount(c) + contactPrefsMissingCount(c);
  const showMemoryAdvanced = !infoWritable || supplementOpen || memoryHidden === 0;
  const needsHidden = needsHiddenFor(c, needsVisible.keys, estimate);
  const showNeedsAdvanced = !infoWritable || needsSupplementOpen || needsHidden === 0;
  const supplementToggle = (open: boolean, count: number, onToggle: () => void) =>
    infoWritable && count > 0 ? (
      <Button variant="secondary" className="w-full" aria-expanded={open} onClick={onToggle}>
        {open ? 'Thu gọn' : `Mở rộng (${count})`}
      </Button>
    ) : null;
  const timelineContent = (
    <ProfileTimeline
      key={c.id}
      customer={c}
      entries={timeline}
      writable={writable}
      canEditHistory={canEditHistory}
      busy={busy}
      repo={account?.customers}
      now={now}
      onStage={() => setStageOpen(true)}
      onSave={save}
    />
  );
  const memoryContent = (
    <div key={c.id} className="space-y-5">
      <ProfileInfoFields
        customer={c}
        writable={infoWritable}
        busy={busy}
        now={now}
        showEmpty={supplementOpen}
        onSaveField={setField}
        onSaveDob={(dob) => void save(dobSavePatch(c, dob), dob ? 'Đã lưu ngày sinh' : 'Đã xoá ngày sinh')}
      />
      <CustomerMemory
        customer={c}
        writable={infoWritable}
        onSave={(patch, message) => void save(patch, message)}
        now={now}
        hideEmpty={!supplementOpen && memoryHidden > 0}
        sections={{ interests: false, household: false }}
      />
      {showMemoryAdvanced && (
        <ProfileAdvanced
          customer={c}
          writable={infoWritable}
          now={now}
          onSaveAdvanced={setAdvancedField}
          openSignal={assetsOpenSignal}
        />
      )}
      {supplementToggle(supplementOpen, memoryHidden, () => setSupplementOpen(!supplementOpen))}
    </div>
  );
  const needsContent = (
    <div key={c.id} className="space-y-4">
      <section className="space-y-3">
        <h2 className="text-title">Nhu cầu hiện tại</h2>
        {catalogLoadFailed && (
          <p role="alert" className="text-caption text-alert-text">
            Chưa tải được danh mục dự án. Đang giữ dữ liệu trên máy; các tên chưa có trong danh mục có thể chưa được tải
            về.
          </p>
        )}
        <ProfileNeedsFields
          customer={c}
          writable={infoWritable}
          busy={busy}
          showEmpty={needsSupplementOpen}
          stayVisible={needsVisible.keys}
          projectsOpen={projectsOpen}
          onToggleProjects={() => setProjectsOpen(!projectsOpen)}
          onSaveField={setNeedField}
          onSaveProjects={(names, message) => {
            if (!hasNeedValue(names)) keepNeedVisible('projects');
            return save(factPatch(c, 'projects', names), message || 'Đã cập nhật dự án quan tâm');
          }}
          catalog={catalog}
          online={browserOnline && !!account?.sync.isOnline()}
          estimate={estimate}
          rates={rates}
        />
      </section>
      {/* PF-11: Nâng cao + nút Mở rộng/Thu gọn liền dưới thẻ Nhu cầu (phần mở rộng của thẻ), Checklist Booking sau. */}
      {showNeedsAdvanced && (
        <CustomerNeedsAdvanced
          customer={c}
          writable={infoWritable}
          onSave={(patch, message) => void save(patch, message)}
          now={now}
          projectCatalog={catalog}
          openSignal={needsAdvancedSignal}
        >
          <FormSubsection title="Sở thích bất động sản">
            {PROFILE_PREF_FIELDS.map((field) => (
              <div key={field.key} className={LONG_FIELD}>
                {field.key === PROFILE_PREF_CONDITIONS.key ? (
                  <LegacyAssistField
                    key={field.key}
                    label={field.label}
                    value={c.advanced?.[field.key]}
                    disabled={!infoWritable}
                    placeholder={field.ph}
                    legacy={legacyValues(c.advanced || {}, PREF_CONDITIONS_LEGACY)}
                    onSave={(value) => setAdvancedField(field.key, value)}
                  />
                ) : (
                  <Field
                    key={field.key}
                    label={field.label}
                    value={c.advanced?.[field.key]}
                    disabled={!infoWritable}
                    placeholder={field.ph}
                    onSave={(value) => setAdvancedField(field.key, value)}
                  />
                )}
              </div>
            ))}
          </FormSubsection>
        </CustomerNeedsAdvanced>
      )}
      {supplementToggle(needsSupplementOpen, needsHidden, () => setNeedsSupplementOpen(!needsSupplementOpen))}
      {stage === CARE_STAGE_BOOKING && (
        <section className="space-y-3">
          <h2 className="text-title">Checklist Booking & làm hồ sơ</h2>
          {bookingSteps(c, now).map((row) => (
            <label key={row.key} className="flex min-h-12 items-center gap-3 border-b border-line py-2">
              <input
                type="checkbox"
                checked={!!row.doneAt}
                disabled={!writable}
                onChange={(e) => void toggleBooking(row.key, e.target.checked)}
              />
              <span className="flex-1">
                <span className="block text-body-strong">{row.label}</span>
                <span className="text-caption text-ink-muted">{row.text}</span>
              </span>
              {row.due && (
                <span
                  className={`rounded-sm px-2 py-1 text-caption ${row.state === 'over' ? 'bg-alert-tint text-alert-text' : row.state === 'warn' ? 'bg-soon-tint text-soon-text' : 'bg-surface-200 text-ink-muted'}`}
                >
                  {new Date(row.due).toLocaleDateString('vi-VN')}
                </span>
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
    <div className="space-y-3">
      {account && (
        <section className="grid grid-cols-2 gap-3" aria-label="Ảnh hồ sơ">
          <ProfilePhotoFrame kind="avatar" customer={c} remote={account.remote} writable={writable} busy={busy} />
          <ProfilePhotoFrame kind="cover" customer={c} remote={account.remote} writable={writable} busy={busy} />
        </section>
      )}
      <DocumentsSection
        customerId={c.id}
        remote={account?.remote ?? null}
        writable={writable}
        busy={busy}
        online={account?.sync.isOnline() ?? false}
        onCountChange={setDocCount}
      />
      {teamInfo && (
        <p className="text-caption text-ink-muted">
          Khách của đồng nghiệp: bạn sửa được thông tin và ghi giùm kết quả cuộc gọi, tương tác, ghi chú. Gọi, Zalo,
          hẹn, bậc, việc, ảnh và tài liệu do người phụ trách quản lý.
        </p>
      )}
    </div>
  );
  const tabs = [
    { value: 'timeline', label: 'Dòng thời gian', count: timeline.length, content: timelineContent },
    { value: 'memory', label: 'Trí nhớ', content: memoryContent },
    { value: 'needs', label: 'Nhu cầu & căn', content: needsContent },
    { value: 'docs', label: 'Tài liệu', count: docCount, content: docsContent },
  ];

  const goTo = (tab: string, target: string) => {
    setTab(tab);
    setJump((current) => ({ target, serial: (current?.serial ?? 0) + 1 }));
  };
  const jumpToMissing = (key: string) => {
    if (key === 'purpose') {
      keepNeedVisible('purpose');
      goTo('needs', 'purpose');
    } else if (key === 'need') {
      setProjectsOpen(true);
      goTo('needs', 'projects');
    } else if (key === 'finance') {
      setSupplementOpen(true);
      setAssetsOpenSignal((value) => value + 1);
      goTo('memory', 'capital');
    } else if (key === 'decision') {
      setNeedsSupplementOpen(true);
      setNeedsAdvancedSignal((value) => value + 1);
      goTo('needs', 'household');
    } else if (key === 'contact_preference') {
      setSupplementOpen(true);
      goTo('memory', 'contact');
    } else if (key === 'promise') {
      if (writable) setAddOpen(true);
    } else if (writable) {
      // Vướng mắc / Liên hệ cuối: ghi ngay một ghi chú cho khách.
      openQuickAction(c.id, 'note');
    }
  };
  const briefParts = splitBrief(brief);
  const lastTouch = lastTouchOf(c, now);
  const extra = extraFacts(c, now);
  const stageLabel = CARE_STAGE_DISPLAY[stage] || stage || 'Chưa có bậc';
  const slaMeter = slaMeterFor(c, now);
  const age = dobView(c.dob, now).age;
  const classifiable = !!account && canClassify(c, account.sync.local.userId);
  const assignable = canAssignWithTeam(c, account?.sync.local.userId ?? '', teamMembers);
  // Dưới tên: nhóm khách (cùng chip ở màn Khách hàng); nguồn đã có ở phần thông tin bên dưới.
  const groupText = CUSTOMER_GROUP_LABEL[customerGroupOf(c, account?.sync.local.userId ?? c.owner_id ?? '')];
  // Hẹn gọi nằm ở trường riêng (next_call_at), không phải next_tasks → thêm 1 dòng đầu "Việc tiếp theo".
  const callStart = c.next_call_at ? Date.parse(c.next_call_at) : Number.NaN;
  const callTag = countdownTag(callStart, c.next_call_end ? Date.parse(c.next_call_end) : callStart, false, now);
  const callWhen = callScheduleLabel(c, now);
  // Cuộc gọi (thường từ nhật ký máy) chưa ghi kết quả → nhắc ngay trong "Việc tiếp theo" để ghi.
  const pendingCalls = otherOwner ? [] : pendingCallsOf(c);
  // Việc đến hạn/quá hạn đứng đầu hồ sơ, vạch đỏ để không bỏ quên (D-010).
  const tones = [
    ...tasks.map((task) => dueTone(taskDueInfo(task, now))),
    callTag?.state === 'missed' ? ('over' as const) : callTag?.state === 'due' ? ('soon' as const) : undefined,
    pendingCalls.length ? ('soon' as const) : undefined,
  ];
  const nextTone = tones.includes('over') ? 'over' : tones.includes('soon') ? 'soon' : undefined;
  const asked = briefParts.missing.find((item) => item.key === missingKey) ?? null;
  // Khách của đồng nghiệp: SLA không thuộc phạm vi chăm sóc của mình → không hiện nút hoàn tác (L3).
  const undoPlan = account && !otherOwner ? planSlaUndo(c, now, account.sync.local.userId) : null;

  return (
    <main
      className="mx-auto w-full max-w-[1360px] space-y-4 p-4 pb-[calc(92px+env(safe-area-inset-bottom))] lg:p-6 lg:pb-6"
      data-testid="customer-profile"
    >
      <ArchivedBanner customer={c} />
      {/*
        Desktop: 2 cột độc lập (cột chính đọc liền mạch + cột phụ dính), không lưới hàng ghép cặp thẻ.
        Mobile (<1200): hai khối `contents` để thứ tự đọc giữ nguyên như cũ (order bên dưới).
      */}
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-6">
        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
          <header className="relative overflow-hidden rounded-md border border-line bg-surface-100 max-xl:order-1">
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
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h1 className="min-w-0 truncate text-title">{c.full_name}</h1>
                    {/* Curtis 06/11: có năm sinh thì hiện tuổi cạnh tên — cỡ bằng SĐT, nét mảnh hơn một bậc. */}
                    {age != null && (
                      <span className="shrink-0 text-[14px] leading-5 font-normal text-ink-muted">{age} tuổi</span>
                    )}
                    {readOnly && (
                      <span className="rounded-sm border border-line px-2 py-1 text-caption text-ink-muted">
                        Chỉ xem
                      </span>
                    )}
                    {teamInfo && (
                      <span className="rounded-sm border border-line px-2 py-1 text-caption text-ink-muted">
                        Khách nhóm · sửa thông tin
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-numeric text-ink-muted">{c.phone}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={`Đổi bậc · ${stageLabel}`}
                  disabled={!writable || busy}
                  onClick={() => setStageOpen(true)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full text-left disabled:opacity-60"
                >
                  <StageChip stage={stage || 'idle'}>{stageLabel}</StageChip>
                  <Icon name="expand" size={16} className="text-ink-muted" />
                </button>
                {!otherOwner && (calls.length || c.next_call_at) ? (
                  <span className="inline-flex items-center gap-1.5 text-caption text-ink-muted">
                    <span
                      aria-hidden
                      className={`size-2 rounded-full ${sla?.state === 'over' ? 'bg-alert' : sla?.state === 'warn' ? 'bg-soon' : 'bg-ok'}`}
                    />
                    {sla?.state === 'over' ? 'Quá hạn' : sla?.state === 'warn' ? 'Sắp đến hạn' : 'Đúng nhịp'}
                  </span>
                ) : null}
                <span className="rounded-sm border border-line bg-surface-100 px-2 py-1 text-caption text-ink-muted">
                  {groupText}
                </span>
              </div>
              {!otherOwner && slaMeter && (
                // Bỏ dòng "còn/quá …" dưới thanh (Curtis 08/11): đầu thanh đã ghi đúng con số đó.
                <SlaMeter {...slaMeter} />
              )}
              {/* PF-10 (Curtis 08/11, mockup B): sau vạch ngăn, hàng quyết định và hàng Gọi/Zalo/Ghi chú/Hẹn (máy tính)
                  dùng chung lưới 4 cột nên mép nút thẳng nhau. Khách tiềm năng chỉ còn Giao, vẫn ở cột cuối. */}
              <div
                className={`-mx-4 space-y-2 border-t border-line px-4 pt-3 ${classifiable || assignable ? '' : 'max-xl:hidden'}`}
              >
                {(classifiable || assignable) && (
                  <div className="grid grid-cols-4 gap-2">
                    {classifiable && (
                      <>
                        <Button
                          variant="primary"
                          className="col-span-2 min-w-0 px-2"
                          aria-label="Chuyển tiềm năng"
                          disabled={busy || !hasTalked(c)}
                          title={hasTalked(c) ? undefined : 'Cần một cuộc gọi "Nói chuyện được" trước khi chuyển'}
                          onClick={() =>
                            account &&
                            void qualifyLead(account.customers, c.id)
                              .then(() => toast({ title: 'Đã chuyển sang Tiềm năng' }))
                              .catch((e) =>
                                toast({
                                  title: 'Chưa chuyển được',
                                  description: String(e?.message ?? e),
                                  tone: 'error',
                                }),
                              )
                          }
                        >
                          <Icon name="qualify" size={20} />
                          {/* 360px: ô 2 cột chỉ vừa "Tiềm năng" kèm icon. */}
                          <span className="sm:hidden">Tiềm năng</span>
                          <span className="max-sm:hidden">Chuyển tiềm năng</span>
                        </Button>
                        <Button
                          className="min-w-0 gap-1.5 px-1.5"
                          disabled={busy}
                          onClick={() => setClassifyOpen(true)}
                        >
                          <Icon name="drop" size={20} />
                          Loại
                        </Button>
                      </>
                    )}
                    {assignable && (
                      <Button
                        className="col-start-4 min-w-0 gap-1.5 px-1.5"
                        aria-label="Giao khách"
                        onClick={() => setAssignOpen(true)}
                      >
                        <Icon name="assign" size={20} />
                        Giao
                      </Button>
                    )}
                  </div>
                )}
                {classifiable && !hasTalked(c) && (
                  <p className="text-caption text-ink-muted">
                    Chuyển tiềm năng cần ít nhất một cuộc gọi "Nói chuyện được".
                  </p>
                )}
                <div className="hidden xl:block">{actionBar('', 'grid grid-cols-4')}</div>
              </div>
              {otherOwner && <p className="text-caption text-ink-muted">Người phụ trách khác · hồ sơ chỉ xem.</p>}
              {undoPlan && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-200 p-3">
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
            className="relative overflow-hidden rounded-md border border-line bg-surface-100 p-4 max-xl:order-2"
          >
            {nextTone === 'over' && (
              <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-[3px] bg-alert" />
            )}
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-section-head">Việc tiếp theo</h2>
              <Button disabled={!writable} onClick={() => setAddOpen(true)}>
                Thêm việc
              </Button>
            </div>
            {tasks.length || callWhen || pendingCalls.length ? (
              <ul className="mt-2 space-y-3">
                {pendingCalls.map((attempt) => {
                  const ms = Date.parse(attempt.at);
                  const dur = callDuration(attempt.duration);
                  return (
                    <li key={`pending-${attempt.at}`} className="flex items-start gap-3">
                      <Icon name="call" size={20} className="mt-0.5 text-soon-text" />
                      <div className="min-w-0 flex-1">
                        <p className="text-body-strong">Cuộc gọi chưa ghi kết quả</p>
                        <p className="mt-1 text-caption text-ink-muted">
                          {dashWhen(ms, now)}
                          {dur ? ` · ${dur}` : ''}
                        </p>
                      </div>
                      <Button
                        disabled={!infoWritable}
                        aria-label={`Ghi kết quả cuộc gọi ${dashWhen(ms, now)}`}
                        onClick={() => openQuickAction(c.id, 'outcome', callDraftOf(attempt))}
                      >
                        Ghi kết quả
                      </Button>
                    </li>
                  );
                })}
                {callWhen && (
                  <li className="flex items-start gap-3">
                    <Icon name="call" size={20} className="mt-0.5 text-ink-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="text-body-strong">
                        Hẹn gọi lại{c.next_call_reason ? ` · ${c.next_call_reason}` : ''}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
                        <span>{callWhen}</span>
                        {callTag && callTag.state !== 'far' && (
                          <span
                            className={`rounded-sm px-2 py-1 text-caption ${callTag.state === 'missed' ? 'bg-alert-tint text-alert-text' : 'bg-soon-tint text-soon-text'}`}
                          >
                            {callTag.text}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                )}
                {tasks.map((task) => {
                  const due = taskDueInfo(task, now);
                  const kindInfo = taskKindOf(task.kind);
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
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
                          <span className="inline-flex items-center gap-1">
                            <Icon name={kindInfo.icon} size={16} />
                            {kindInfo.label}
                          </span>
                          <span>{task.side === 'customer' ? 'Khách hẹn' : 'Em hứa'}</span>
                          {tag && (
                            <span
                              className={`rounded-sm px-2 py-1 text-caption ${tag.state === 'missed' ? 'bg-alert-tint text-alert-text' : tag.state === 'due' || tag.state === 'soon' ? 'bg-soon-tint text-soon-text' : 'bg-surface-200 text-ink-muted'}`}
                            >
                              {tag.text}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-body text-ink-muted">
                Chưa có bước tiếp theo. Ghi lại việc cần làm hoặc lời hứa để không bỏ quên khách.
              </p>
            )}
          </section>

          <section aria-label="Lần trước" className="rounded-md border border-line bg-surface-100 p-4 max-xl:order-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-section-head">Lần trước{lastTouch?.when ? ` · ${lastTouch.when}` : ''}</h2>
              {lastTouch && <span className="text-caption text-ink-muted">{lastTouch.meta}</span>}
            </div>
            {lastTouch ? (
              <p className="mt-2 text-body">
                {lastTouch.headline && <b className="font-semibold">{lastTouch.headline}. </b>}
                {lastTouch.text}
              </p>
            ) : (
              <p className="mt-2 text-body text-ink-muted">Chưa có liên hệ nào được ghi.</p>
            )}
          </section>

          {actionBar(
            'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-0 px-4 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] shadow-overlay xl:hidden',
          )}

          {/* Giá & vay ngay trên hàng tab (Curtis 06/11, mockup B): thay nút trong tab Nhu cầu và tab Tính vay cũ. */}
          <section
            aria-label="Giá và vay"
            className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface-100 py-3 pr-3 pl-4 max-xl:order-5"
          >
            <dl className="grid min-w-0 flex-1 basis-40 grid-cols-2 gap-x-3 gap-y-1">
              <div className="min-w-0">
                <dt className="text-overline text-ink-muted">Giá căn</dt>
                <dd className="font-mono text-body-strong tabular-nums">
                  {loanInfo.price == null ? '—' : `≈ ${formatVndShort(loanInfo.price)}`}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-overline text-ink-muted">Vay {loanInfo.ltv}%</dt>
                <dd className="font-mono text-body-strong tabular-nums">
                  {loanInfo.loan == null ? '—' : `≈ ${formatVndShort(loanInfo.loan)}`}
                </dd>
              </div>
              <dd className="col-span-2 text-caption text-ink-muted">
                {loanInfo.manual
                  ? 'Giá anh nhập · vay tính trên giá gồm VAT'
                  : loanInfo.price != null
                    ? 'Giá ước tính · vay tính trên giá gồm VAT'
                    : 'Chưa đủ dữ liệu để ước giá'}
              </dd>
            </dl>
            <Button variant="primary" onClick={() => navigate(loanPath(loanInfo.prefill))}>
              <Icon name="loan" size={20} />
              Tính vay
            </Button>
          </section>

          <div className="max-xl:order-5">
            <TabsPrimitive value={tab} onValueChange={setTab}>
              <TabsList
                aria-label="Nội dung hồ sơ khách"
                // 5 tab không vừa 360px: cuộn ngang trong thanh tab thay vì ép chữ chồng lên nhau.
                // Header hiện lại: tab xuống ngay để không chồng lên nhau; chỉ dịch tab lên sau khi header đã ẩn xong.
                className="sticky top-[calc(56px+env(safe-area-inset-top))] z-20 transition-none max-md:[[data-header-hidden]_&]:-translate-y-14 max-md:[[data-header-hidden]_&]:transition-transform max-md:[[data-header-hidden]_&]:duration-200 max-md:[[data-header-hidden]_&]:delay-200 motion-reduce:!transition-none gap-0 overflow-x-auto bg-surface-0 [scrollbar-width:none] [&_[role=tab]]:scroll-mt-14"
              >
                {tabs.map((item) => (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="shrink-0 px-3 text-xs sm:min-w-0 sm:flex-1 sm:px-2 sm:text-sm"
                  >
                    {item.label}
                    {item.count !== undefined ? (
                      <span className="font-mono text-caption text-ink-muted">{item.count}</span>
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
              {tabs.map((item) => (
                <TabsContent key={item.value} value={item.value} aria-label={item.label} className="mt-4">
                  {item.content}
                </TabsContent>
              ))}
            </TabsPrimitive>
          </div>

          <div className="max-xl:order-8">
            <ArchiveCustomerSection customer={c} />
          </div>
        </div>

        {/*
          Cột phụ: cùng một khối dính dưới thanh tiêu đề (56px). Cao đúng phần còn lại của màn hình
          (trừ thêm 56px lề dưới của khung) để khi cuộn hết trang cột vẫn nằm ngay dưới tiêu đề;
          nội dung dài hơn thì tự cuộn bên trong, không bị cắt.
        */}
        <div className="contents xl:sticky xl:top-[calc(56px+env(safe-area-inset-top))] xl:flex xl:h-[calc(100dvh-112px)] xl:flex-col xl:gap-4 xl:overflow-y-auto">
          <section aria-label="Đã biết" className="rounded-md border border-line bg-surface-100 p-4 max-xl:order-4">
            <h2 className="text-section-head">Đã biết</h2>
            {briefParts.known.length ? (
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
                {briefParts.known.map((item) => (
                  <div key={item.key} className="min-w-0">
                    <dt className="text-caption text-ink-muted">{item.label}</dt>
                    <dd className="text-body [overflow-wrap:anywhere]">{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-body text-ink-muted">Chưa có thông tin nào được ghi.</p>
            )}
            {briefParts.missing.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-caption text-ink-muted">Còn thiếu:</span>
                {briefParts.missing.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setMissingKey(item.key);
                      jumpToMissing(item.key);
                    }}
                    className="inline-flex min-h-9 items-center rounded-full border border-dashed border-line px-3 text-caption text-ink-muted hover:bg-surface-200"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            {asked && <p className="mt-2 text-caption text-ink-muted">Có thể hỏi: {asked.question}</p>}
          </section>

          <section
            aria-label="Thông tin thêm"
            className="rounded-md border border-line bg-surface-100 p-4 max-xl:order-6"
          >
            <h2 className="text-title">Thông tin thêm</h2>
            {extra.length ? (
              <dl className="mt-3 grid grid-cols-2 gap-3 text-caption sm:max-xl:grid-cols-3">
                {extra.map((row) => (
                  <div key={row.label} className="min-w-0">
                    <dt className="text-ink-muted">{row.label}</dt>
                    <dd className="whitespace-pre-wrap text-body [overflow-wrap:anywhere]">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-body text-ink-muted">Chưa có thông tin bổ sung.</p>
            )}
          </section>

          <div className="max-xl:order-7">
            <AiBrief customer={c} />
          </div>
        </div>
      </div>

      <AddTaskSheet
        key={c.id}
        open={addOpen}
        customerName={c.full_name}
        onOpenChange={setAddOpen}
        onScheduleCall={() => {
          setAddOpen(false);
          openQuickAction(c.id, 'schedule');
        }}
        onSave={saveNewTask}
      />

      <ClassifyLeadSheet account={account} customer={c} open={classifyOpen} onOpenChange={setClassifyOpen} />
      <AssignCustomerSheet
        account={account}
        customer={c}
        members={teamMembers}
        open={assignOpen}
        onOpenChange={setAssignOpen}
      />

      {stageOpen && (
        <StageChangeSheet customer={c} busy={busy} onClose={() => setStageOpen(false)} onConfirm={onStage} />
      )}
      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className="fixed inset-x-4 bottom-20 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-md border border-line bg-surface-200 p-3 text-ink shadow-overlay lg:right-4 lg:bottom-4 lg:left-auto"
        >
          <span className="min-w-0 flex-1">
            <strong className="block text-body-strong">{notice.title}</strong>
            {notice.description && <span className="text-caption text-ink-muted">{notice.description}</span>}
          </span>
          {notice.onUndo && (
            <Button variant="ghost" onClick={notice.onUndo}>
              Hoàn tác
            </Button>
          )}
          <Button variant="ghost" aria-label="Đóng thông báo" onClick={() => setNotice(null)}>
            Đóng
          </Button>
        </div>
      )}
    </main>
  );
}

export const route: FeatureRoute = {
  path: '/ho-so/:id',
  element: <Profile />,
  handle: { title: 'Hồ sơ khách', hideNav: true, wide: true },
};
