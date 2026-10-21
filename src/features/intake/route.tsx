import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useBlocker, useNavigate, useParams } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { APT_TYPES } from '@/config/aptTypes';
import { SOURCE_DEFAULT, SOURCES } from '@/config/sources';
import { CARE_STAGE_DEFAULT, CARE_STAGE_OPTIONS, CONTACT_STATUSES } from '@/config/stages';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { detectDuplicatePairs, findDuplicateCandidates } from '@/domain/customer/merge';
import { Button } from '@/ui';
import {
  addOcrNote,
  defaultIntakeValues,
  findPhoneMatches,
  lastUsedSource,
  mergeOcrValues,
  toCustomerPayload,
} from './model';
import { IntakeMore } from './more';
import { IntakeSchema, type IntakeValues } from './schema';
import { countMoreFilled, dobToIso, MORE_FIELD_KEYS } from './view';

const LAST_SOURCE_KEY = 'crm_last_source';

function readLastSource(): string {
  try {
    const remembered = localStorage.getItem(LAST_SOURCE_KEY);
    return remembered && SOURCES[remembered] ? remembered : '';
  } catch {
    return '';
  }
}

function initialDob(customer?: Customer | null): string {
  if (!customer?.dob) return '';
  if (customer.dob.startsWith('--')) return customer.dob.slice(2).split('-').reverse().join('/');
  const [year, month, day] = customer.dob.split('-');
  return `${day}/${month}/${year}`;
}

function dateToLocal(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function makeValues(customer: Customer | null, source: string): IntakeValues {
  const base = defaultIntakeValues(source);
  if (!customer) return base;
  return {
    ...base,
    full_name: customer.full_name,
    phone: customer.phone,
    gender: customer.gender || '',
    dob: initialDob(customer),
    marital_status: customer.marital_status || '',
    occupation: customer.occupation || '',
    income: customer.income || '',
    residence: customer.residence || '',
    registered_at: dateToLocal(customer.registered_at),
    source_channel: Array.isArray(customer.source)
      ? customer.source[0] || source
      : typeof customer.source === 'string'
        ? customer.source
        : source,
    campaign: customer.campaign || '',
    apt_type: customer.apt_type || '',
    projects: customer.projects || [],
    apt_code: customer.apt_code || '',
    building_code: customer.building_code || '',
    apt_area: customer.apt_area == null ? '' : String(customer.apt_area),
    apt_direction: customer.apt_direction || '',
    apt_floor: customer.apt_floor == null ? '' : String(customer.apt_floor),
    apt_price: customer.apt_price == null ? '' : String(customer.apt_price),
    finance: customer.finance == null ? '' : String(customer.finance),
    purpose: customer.purpose || '',
    interest_level: customer.interest_level == null ? 20 : Number(customer.interest_level),
    care_stage: customer.care_stage || CARE_STAGE_DEFAULT,
    contact_status: customer.contact_status || '',
    care_stage_note: '',
    notes: customer.notes || '',
    advanced: { ...(customer.advanced || {}) },
  };
}

function IntakePage() {
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { register, setValue, reset, watch, handleSubmit, formState } = useForm<IntakeValues>({
    defaultValues: defaultIntakeValues(readLastSource() || SOURCE_DEFAULT),
    mode: 'onSubmit',
  });
  const values = watch();
  const [manualNotes, setManualNotes] = useState<Record<string, unknown>[]>([]);
  const [initialManualNotes, setInitialManualNotes] = useState('[]');
  const [newManualNote, setNewManualNote] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrImage, setOcrImage] = useState(false);
  const [ocrPhoto, setOcrPhoto] = useState<Blob | null>(null);
  const [customAptType, setCustomAptType] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedDuplicate, setSelectedDuplicate] = useState<[string, string] | null>(null);
  const [keeperId, setKeeperId] = useState('');
  const [mergeBusy, setMergeBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const initialized = useRef('');
  const [, setCatalogRevision] = useState(0);
  const customer = useMemo(() => customers.find((row) => row.id === customerId) ?? null, [customers, customerId]);
  const phoneMatches = findPhoneMatches(customers, values.phone, customerId);
  const intakeCandidates = findDuplicateCandidates(customers, values.phone, values.full_name, customerId);
  const duplicatePairs = useMemo(() => detectDuplicatePairs(customers), [customers]);
  const selectedPair = selectedDuplicate
    ? selectedDuplicate.map((id) => customers.find((row) => row.id === id)).filter((row): row is Customer => !!row)
    : [];
  const dirty = formState.isDirty || JSON.stringify(manualNotes) !== initialManualNotes || !!newManualNote.trim();
  // Lưu xong thì rời màn không hỏi bỏ nháp (form vẫn "dirty" tới khi màn đóng).
  const savedRef = useRef(false);
  const blocker = useBlocker(() => dirty && !savedRef.current);

  useEffect(() => {
    if (!account) return;
    void account.catalog.load().finally(() => setCatalogRevision((revision) => revision + 1));
  }, [account]);

  useEffect(() => {
    if (customerId && !customer) return;
    const key = `${account?.sync.local.userId || 'no-account'}:${customerId || 'new'}`;
    if (initialized.current === key) return;
    initialized.current = key;
    const source = customer ? undefined : readLastSource() || lastUsedSource(customers);
    const next = makeValues(customer, source || SOURCE_DEFAULT);
    setCustomAptType(!!next.apt_type && !APT_TYPES.includes(next.apt_type as (typeof APT_TYPES)[number]));
    setMoreOpen(false);
    reset(next);
    const notes = Array.isArray(customer?.notes_manual)
      ? customer.notes_manual.filter((note): note is Record<string, unknown> => !!note && typeof note === 'object')
      : [];
    setManualNotes(notes);
    setInitialManualNotes(JSON.stringify(notes));
    setNewManualNote('');
  }, [account, customer, customerId, customers, reset]);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Bản nháp chưa lưu. Rời màn này và bỏ các thay đổi?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = (key: keyof IntakeValues, value: unknown) => {
    setValue(key, value as IntakeValues[typeof key], { shouldDirty: true, shouldValidate: true });
    setFieldErrors((previous) => ({ ...previous, [key]: '' }));
  };

  const handleOcr = async (file?: File) => {
    if (!file) return;
    const workerUrl = (import.meta.env.VITE_WORKER_URL || '').replace(/\/+$/, '');
    if (!workerUrl) {
      setOcrStatus('Chưa cấu hình VITE_WORKER_URL.');
      return;
    }
    setOcrBusy(true);
    setOcrStatus('Đang đọc ảnh…');
    try {
      const session = await account?.sync.client.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error('Cần đăng nhập lại trước khi đọc ảnh.');
      const image = await resizeImage(file, 1024);
      const response = await fetch(`${workerUrl}/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: image.base64, mime: image.mime }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.error) throw new Error(body.error || `Worker trả lỗi ${response.status}.`);
      const updated = mergeOcrValues(watch(), body.data || {});
      // OCR điền vào trường đang ẩn → mở khu "Thêm thông tin" để sale thấy và sửa trước khi lưu.
      if (countMoreFilled(updated) > countMoreFilled(watch())) setMoreOpen(true);
      reset(updated, { keepDefaultValues: true });
      setCustomAptType(!!updated.apt_type && !APT_TYPES.includes(updated.apt_type as (typeof APT_TYPES)[number]));
      if (typeof body.data?.note === 'string' && body.data.note.trim()) {
        setManualNotes((current) => addOcrNote(current, body.data.note));
      }
      setOcrPhoto(image.blob);
      setOcrImage(true);
      setOcrStatus('Đã điền gợi ý từ ảnh. Hãy kiểm tra kỹ SĐT và nội dung trước khi lưu.');
    } catch (raw) {
      setOcrStatus(`Đọc ảnh thất bại: ${raw instanceof Error ? raw.message : 'lỗi không rõ'}`);
    } finally {
      setOcrBusy(false);
    }
  };

  const save = async (rawValues: IntakeValues) => {
    setError('');
    let dob: string | undefined;
    try {
      dob = dobToIso(rawValues.dob);
    } catch (raw) {
      setFieldErrors((prev) => ({ ...prev, dob: raw instanceof Error ? raw.message : 'Ngày sinh không hợp lệ.' }));
      setMoreOpen(true);
      return;
    }
    const checked = IntakeSchema.safeParse(rawValues);
    if (!checked.success) {
      const errors: Record<string, string> = {};
      for (const issue of checked.error.issues) errors[String(issue.path[0])] = issue.message;
      setFieldErrors(errors);
      setError('Kiểm tra lại các trường được đánh dấu.');
      // Lỗi ở trường đang ẩn thì mở khu để thấy câu báo; lỗi bắt buộc vẫn như cũ.
      const hiddenError = Object.keys(errors).some((key) => (MORE_FIELD_KEYS as readonly string[]).includes(key));
      if (hiddenError) setMoreOpen(true);
      const focusFirst = () => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      if (hiddenError) requestAnimationFrame(focusFirst);
      else focusFirst();
      return;
    }
    if (!account) {
      setError('Chưa có phiên đăng nhập hoặc kho dữ liệu local.');
      return;
    }
    const matches = findPhoneMatches(customers, checked.data.phone, customerId);
    const nearDuplicates = findDuplicateCandidates(customers, checked.data.phone, checked.data.full_name, customerId);
    if (nearDuplicates.length) {
      setError(
        `Có hồ sơ trùng gần giống: ${nearDuplicates.map((row) => row.full_name).join(', ')}. Mở hồ sơ đó để cập nhật, hoặc xử lý cặp nghi trùng bên dưới.`,
      );
      return;
    }
    const sameOwner = matches.find((match) => match.owner_id === account.sync.local.userId);
    if (sameOwner) {
      setError(`Số điện thoại đã thuộc khách ${sameOwner.full_name}. Mở hồ sơ cũ để sửa thay vì tạo trùng.`);
      return;
    }
    const otherOwner = matches[0];
    if (
      otherOwner &&
      !window.confirm(
        `SĐT này đang thuộc khách “${otherOwner.full_name}” của người phụ trách khác. Vẫn tạo khách riêng trong danh sách của bạn?`,
      )
    )
      return;
    setSaving(true);
    try {
      const payload = toCustomerPayload(checked.data, customer || undefined, dob);
      if (JSON.stringify(manualNotes) !== initialManualNotes) payload.notes_manual = manualNotes;
      const mutationOptions = { careStageNote: checked.data.care_stage_note || null };
      const saved = customerId
        ? await account.customers.update(customerId, payload, mutationOptions)
        : await account.customers.create({ ...payload, intake_method: ocrImage ? 'ocr' : 'manual' }, mutationOptions);
      if (saved && ocrPhoto && account.sync.isOnline()) {
        try {
          await account.remote.uploadDocument(saved.id, ocrPhoto, 'reg_image', 'Ảnh đăng ký');
        } catch (uploadError) {
          console.warn('Lưu ảnh đăng ký lỗi:', uploadError);
        }
      }
      try {
        localStorage.setItem(LAST_SOURCE_KEY, checked.data.source_channel);
      } catch {}
      savedRef.current = true;
      navigate('/khach-hang');
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : 'Không lưu được khách.');
    } finally {
      setSaving(false);
    }
  };

  const mergeSelected = async () => {
    if (!account || selectedPair.length !== 2 || !keeperId) return;
    const duplicate = selectedPair.find((row) => row.id !== keeperId);
    const keeper = selectedPair.find((row) => row.id === keeperId);
    if (!duplicate || !keeper) return;
    if (
      !window.confirm(
        `Gộp “${duplicate.full_name}” vào “${keeper.full_name}” và lưu trữ mềm hồ sơ trùng? Thao tác được ghi audit.`,
      )
    )
      return;
    setMergeBusy(true);
    setError('');
    try {
      await account.customers.merge(keeper.id, duplicate.id);
      setSelectedDuplicate(null);
      setKeeperId('');
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : 'Không gộp được hồ sơ.');
    } finally {
      setMergeBusy(false);
    }
  };

  if (customerId && !customer)
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 text-body text-text-2">
        Đang tải khách hoặc không tìm thấy bản ghi trong dữ liệu local.
      </main>
    );

  const input = (label: string, name: keyof IntakeValues, type = 'text', props: Record<string, unknown> = {}) => (
    <label className="flex flex-col gap-1 text-small text-text-2" key={name}>
      {label}
      <input
        {...register(name)}
        type={type}
        value={String(values[name] ?? '')}
        onChange={(e) => set(name, e.target.value)}
        aria-invalid={!!fieldErrors[name]}
        className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body text-text focus-visible:outline-2 focus-visible:outline-focus"
        {...props}
      />
      {fieldErrors[name] && <span className="text-small text-danger">{fieldErrors[name]}</span>}
    </label>
  );
  const select = (label: string, name: keyof IntakeValues, options: readonly string[]) => (
    <label className="flex flex-col gap-1 text-small text-text-2" key={name}>
      {label}
      <select
        {...register(name)}
        value={String(values[name] ?? '')}
        onChange={(e) => set(name, e.target.value)}
        aria-invalid={!!fieldErrors[name]}
        className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body text-text focus-visible:outline-2 focus-visible:outline-focus"
      >
        <option value="">— Chưa rõ —</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {fieldErrors[name] && <span className="text-small text-danger">{fieldErrors[name]}</span>}
    </label>
  );

  const catalog = account?.catalog;
  const unitCodes: string[] = catalog
    ? catalog
        .units()
        .filter((unit: Record<string, unknown>) =>
          values.projects.includes(String(catalog.project(unit.project_id)?.name)),
        )
        .map((unit: Record<string, unknown>) => String(unit.code))
    : [];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 pb-24">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-label text-text-3">Khách hàng</p>
          <h1 className="text-title">{customer ? 'Sửa thông tin khách' : 'Thêm khách mới'}</h1>
        </div>
        <Button onClick={() => navigate(-1)}>Đóng</Button>
      </header>
      {duplicatePairs.length > 0 && (
        <section
          className="flex flex-col gap-3 rounded-card border border-border-strong bg-surface p-4 shadow-e1"
          aria-label="Khách có thể trùng"
        >
          <div>
            <h2 className="text-section">Có hồ sơ nghi trùng</h2>
            <p className="text-small text-text-2">
              Phát hiện theo SĐT chuẩn hoá trùng và tên gần giống. Chỉ lưu trữ hồ sơ sau khi chọn giữ lại và xác nhận
              gộp.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {duplicatePairs.map(([left, right]) => (
              <li
                key={`${left.id}:${right.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border p-3"
              >
                <span className="text-body">
                  {left.full_name} · {left.phone} <span className="text-text-3">↔</span> {right.full_name} ·{' '}
                  {right.phone}
                </span>
                <Button
                  onClick={() => {
                    const pair: [string, string] = [left.id, right.id];
                    setSelectedDuplicate(pair);
                    setKeeperId(left.id);
                  }}
                >
                  So sánh
                </Button>
              </li>
            ))}
          </ul>
          {selectedPair.length === 2 && (
            <div className="grid gap-3 md:grid-cols-2">
              {selectedPair.map((row) => (
                <article
                  key={row.id}
                  className={`flex flex-col gap-2 rounded-control border p-3 ${keeperId === row.id ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  <h3 className="text-body-strong">{row.full_name}</h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-small text-text-2">
                    <dt>SĐT</dt>
                    <dd>{row.phone}</dd>
                    <dt>Người phụ trách</dt>
                    <dd>
                      {row.owner_id === account?.sync.local.userId
                        ? 'Bạn'
                        : row.owner_id
                          ? 'Người phụ trách khác'
                          : 'Chưa gán'}
                    </dd>
                    <dt>Nguồn</dt>
                    <dd>{Array.isArray(row.source) ? row.source.join(', ') : row.source || 'Chưa rõ'}</dd>
                    <dt>Ghi chú</dt>
                    <dd>{Array.isArray(row.notes_manual) ? row.notes_manual.length : 0}</dd>
                    <dt>Lịch sử chăm sóc</dt>
                    <dd>{Array.isArray(row.care_stage_history) ? row.care_stage_history.length : 0}</dd>
                    <dt>Tương tác</dt>
                    <dd>{Array.isArray(row.interactions) ? row.interactions.length : 0}</dd>
                  </dl>
                  <Button
                    variant={keeperId === row.id ? 'primary' : 'secondary'}
                    onClick={() => setKeeperId(row.id)}
                    aria-pressed={keeperId === row.id}
                  >
                    {keeperId === row.id ? 'Giữ hồ sơ này' : 'Chọn giữ hồ sơ này'}
                  </Button>
                </article>
              ))}
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button
                  variant="danger"
                  loading={mergeBusy}
                  disabled={!keeperId || mergeBusy}
                  onClick={() => void mergeSelected()}
                >
                  Xác nhận gộp và lưu trữ hồ sơ còn lại
                </Button>
                <Button disabled={mergeBusy} onClick={() => setSelectedDuplicate(null)}>
                  Đóng so sánh
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
      {intakeCandidates.length > 0 && (
        <section
          className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border-strong bg-surface p-3"
          role="status"
        >
          <p className="text-small text-text-2">
            SĐT và tên gần giống hồ sơ {intakeCandidates.map((row) => `“${row.full_name}”`).join(', ')}. Mở hồ sơ hiện
            có để cập nhật, tránh tạo bản ghi trùng.
          </p>
          <Button onClick={() => navigate(`/intake/${intakeCandidates[0]?.id}`)}>Mở hồ sơ hiện có</Button>
        </section>
      )}
      <form onSubmit={handleSubmit(save)} className="flex flex-col gap-4" noValidate>
        <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-e1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-section">Thông tin cá nhân</h2>
            <Button onClick={() => fileInput.current?.click()} loading={ocrBusy}>
              Nhập từ ảnh
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                void handleOcr(event.target.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
          </div>
          {ocrStatus && (
            <p role="status" className="text-small text-text-2">
              {ocrStatus}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {input('Họ tên *', 'full_name')}
            {input('Số điện thoại *', 'phone', 'tel', { autoComplete: 'tel' })}
          </div>
        </section>
        <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-e1">
          <h2 className="text-section">Nguồn khách</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-small text-text-2">
              Kênh *
              <select
                value={values.source_channel}
                onChange={(e) => set('source_channel', e.target.value)}
                className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body text-text"
              >
                {Object.entries(SOURCES).map(([code, label]) => (
                  <option value={code} key={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-e1">
          <h2 className="text-section">Nhu cầu căn hộ</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-small text-text-2">
              Dự án (có thể chọn nhiều)
              <select
                multiple
                value={values.projects}
                onChange={(e) =>
                  set(
                    'projects',
                    Array.from(e.target.selectedOptions, (option) => option.value),
                  )
                }
                className="min-h-28 rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-text"
              >
                {account?.catalog.projects().map((project: Record<string, unknown>) => (
                  <option key={String(project.id)} value={String(project.name)}>
                    {String(project.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-small text-text-2">
              Loại căn
              <select
                value={customAptType ? '__other' : values.apt_type}
                onChange={(e) => {
                  if (e.target.value === '__other') {
                    setCustomAptType(true);
                    set('apt_type', '');
                  } else {
                    setCustomAptType(false);
                    set('apt_type', e.target.value);
                  }
                }}
                className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body text-text"
              >
                <option value="">— Chưa rõ —</option>
                {APT_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
                {account?.catalog
                  .projects()
                  .filter((p: Record<string, unknown>) => values.projects.includes(String(p.name)))
                  .flatMap((p: Record<string, unknown>) =>
                    account.catalog.projectTypes(p.id).map((t: Record<string, unknown>) => String(t.apt_type)),
                  )
                  .filter(
                    (type: string, index: number, all: string[]) =>
                      type && !APT_TYPES.includes(type as (typeof APT_TYPES)[number]) && all.indexOf(type) === index,
                  )
                  .map((type: string) => (
                    <option key={type}>{type}</option>
                  ))}
                <option value="__other">Khác</option>
              </select>
            </label>
            {customAptType ? input('Loại căn khác', 'apt_type') : null}
          </div>
        </section>
        <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-e1">
          <h2 className="text-section">Chăm sóc</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {!customer && (
              <label className="flex min-h-11 items-center gap-3 text-body text-text">
                <input
                  type="checkbox"
                  checked={values.qualify_now}
                  onChange={(e) => {
                    set('qualify_now', e.target.checked);
                    if (e.target.checked && Number(values.interest_level) < 60) set('interest_level', 60);
                    if (e.target.checked) set('care_stage', 'Đang chăm sóc');
                  }}
                />
                Đã nói chuyện và khách quan tâm, đưa thẳng vào chăm sóc
              </label>
            )}
            {(!!customer?.qualified_at || values.qualify_now) && (
              <>
                {select('Tiến độ', 'care_stage', CARE_STAGE_OPTIONS)}
                {select('Trạng thái liên lạc', 'contact_status', CONTACT_STATUSES)}
                {input('Ghi chú cho lần đổi tiến độ', 'care_stage_note')}
                <label className="flex flex-col gap-2 text-small text-text-2 sm:col-span-2">
                  Mức quan tâm: <strong className="text-body-strong text-text">{Number(values.interest_level)}%</strong>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Number(values.interest_level)}
                    onChange={(e) => set('interest_level', Number(e.target.value))}
                  />
                </label>
              </>
            )}
            <div className="flex flex-col gap-2 sm:col-span-2">
              <h3 className="text-body-strong text-text">Ghi chú chăm sóc</h3>
              {manualNotes.map((note, index) => (
                <div key={`${String(note.at ?? 'note')}-${String(note.text ?? '')}`} className="flex items-start gap-2">
                  <textarea
                    aria-label={`Ghi chú ${index + 1}`}
                    value={String(note.text ?? '')}
                    onChange={(event) =>
                      setManualNotes((current) =>
                        current.map((item, i) => (i === index ? { ...item, text: event.target.value } : item)),
                      )
                    }
                    rows={2}
                    className="min-w-0 flex-1 rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-text"
                  />
                  <Button onClick={() => setManualNotes((current) => current.filter((_, i) => i !== index))}>
                    Xoá
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  aria-label="Ghi chú mới"
                  value={newManualNote}
                  onChange={(event) => setNewManualNote(event.target.value)}
                  className="min-h-11 min-w-0 flex-1 rounded-control border border-border-strong bg-surface px-3 text-body text-text"
                  placeholder="Thêm ghi chú…"
                />
                <Button
                  onClick={() => {
                    const text = newManualNote.trim();
                    if (!text) return;
                    setManualNotes((current) => [{ at: new Date().toISOString(), text }, ...current]);
                    setNewManualNote('');
                  }}
                >
                  Thêm
                </Button>
              </div>
            </div>
          </div>
        </section>
        <IntakeMore
          open={moreOpen}
          onToggle={() => setMoreOpen((current) => !current)}
          values={values}
          register={register}
          set={set}
          fieldErrors={fieldErrors}
          unitCodes={unitCodes}
          filledCount={countMoreFilled(values)}
        />
        {phoneMatches.map((match) => (
          <aside
            key={match.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-warning bg-warning-bg p-3 text-small text-warning"
          >
            <span>SĐT đã có ở khách “{match.full_name}”. Kiểm tra trước khi lưu.</span>
            <Button onClick={() => navigate(`/khach-hang/${match.id}`)}>Mở khách cũ</Button>
          </aside>
        ))}
        {error && (
          <p role="alert" className="rounded-control border border-danger bg-danger-bg p-3 text-small text-danger">
            {error}
          </p>
        )}
        <div className="sticky bottom-16 flex justify-end gap-2 border-t border-border bg-surface/95 py-3 backdrop-blur">
          <Button onClick={() => navigate(-1)}>Huỷ</Button>
          <Button type="submit" variant="primary" loading={saving}>
            Lưu khách
          </Button>
        </div>
      </form>
    </main>
  );
}

async function resizeImage(file: File, maxDimension: number): Promise<{ base64: string; mime: string; blob: Blob }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Không xử lý được ảnh.'))),
      'image/jpeg',
      0.86,
    ),
  );
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(blob);
  });
  return { base64, mime: 'image/jpeg', blob };
}

export const route: FeatureRoute = {
  path: '/intake/:customerId?',
  element: <IntakePage />,
  handle: { title: 'Thông tin khách' },
};
