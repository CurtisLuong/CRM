import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useBlocker, useNavigate, useParams } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { ADVANCED_GROUPS } from '@/config/advanced';
import { APT_TYPES } from '@/config/aptTypes';
import { SOURCE_DEFAULT, SOURCES } from '@/config/sources';
import { CARE_STAGE_DEFAULT, CARE_STAGE_OPTIONS, CONTACT_STATUSES } from '@/config/stages';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { calcCungFromDOB, calcMenhFromSolarDOB } from '@/domain/lunar/lunar';
import { Button } from '@/ui';
import {
  addOcrNote,
  defaultIntakeValues,
  findPhoneMatches,
  lastUsedSource,
  mergeOcrValues,
  toCustomerPayload,
} from './model';
import { IntakeSchema, type IntakeValues } from './schema';

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

function dobToIso(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const parts = value.split(/[/.-]/).map((part) => part.trim());
  if (parts.length !== 2 && parts.length !== 3) throw new Error('Ngày sinh dùng dạng ngày/tháng hoặc ngày/tháng/năm.');
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = parts.length === 3 ? Number(parts[2]) : undefined;
  const maxDay =
    month === 2
      ? year && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)
        ? 29
        : 29
      : [4, 6, 9, 11].includes(month)
        ? 30
        : 31;
  if (!Number.isInteger(day) || !Number.isInteger(month) || day < 1 || day > maxDay || month < 1 || month > 12)
    throw new Error('Ngày sinh không hợp lệ.');
  if (!year) return `--${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear())
    throw new Error('Năm sinh không hợp lệ.');
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) throw new Error('Ngày sinh không hợp lệ.');
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
  const fileInput = useRef<HTMLInputElement>(null);
  const initialized = useRef('');
  const [, setCatalogRevision] = useState(0);
  const customer = useMemo(() => customers.find((row) => row.id === customerId) ?? null, [customers, customerId]);
  const phoneMatches = findPhoneMatches(customers, values.phone, customerId);
  const dirty = formState.isDirty || JSON.stringify(manualNotes) !== initialManualNotes || !!newManualNote.trim();
  const blocker = useBlocker(dirty);

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
      return;
    }
    const checked = IntakeSchema.safeParse(rawValues);
    if (!checked.success) {
      const errors: Record<string, string> = {};
      for (const issue of checked.error.issues) errors[String(issue.path[0])] = issue.message;
      setFieldErrors(errors);
      setError('Kiểm tra lại các trường được đánh dấu.');
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    if (!account) {
      setError('Chưa có phiên đăng nhập hoặc kho dữ liệu local.');
      return;
    }
    const matches = findPhoneMatches(customers, checked.data.phone, customerId);
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
      navigate('/khach-hang');
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : 'Không lưu được khách.');
    } finally {
      setSaving(false);
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

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 pb-24">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-label text-text-3">Khách hàng</p>
          <h1 className="text-title">{customer ? 'Sửa thông tin khách' : 'Thêm khách mới'}</h1>
        </div>
        <Button onClick={() => navigate(-1)}>Đóng</Button>
      </header>
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
            {select('Giới tính', 'gender', ['nam', 'nữ', 'khác'])}
            {input('Ngày sinh (ngày/tháng/năm)', 'dob', 'text', { placeholder: '15/08/1988' })}
            <p className="text-small text-text-2">
              Mệnh: {values.dob ? calcMenhFromSolarDOB(safeDob(values.dob)) || 'Chưa xác định' : 'Chưa biết'} · Cung:{' '}
              {values.dob ? calcCungFromDOB(safeDob(values.dob)) || 'Chưa xác định' : 'Chưa biết'}
            </p>
            {select('Tình trạng hôn nhân', 'marital_status', ['đã kết hôn', 'chưa kết hôn'])}
            {select('Công việc', 'occupation', ['Tự do', 'Công ty, DN', 'Công, viên chức', 'Công an, Bộ đội'])}
            {input('Thu nhập', 'income')}
            {input('Thường trú', 'residence')}
            {input('Thời gian đăng ký', 'registered_at', 'datetime-local')}
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
            {input('Chiến dịch', 'campaign')}
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
            {input('Diện tích (m²)', 'apt_area', 'number', { min: 0, step: 'any' })}
            {input('Mã toà', 'building_code')}
            {input('Mã căn', 'apt_code', 'text', { list: 'intake-units' })}
            <datalist id="intake-units">
              {account?.catalog
                .units()
                .filter((unit: Record<string, unknown>) =>
                  values.projects.includes(String(account.catalog.project(unit.project_id)?.name)),
                )
                .map((unit: Record<string, unknown>) => (
                  <option key={String(unit.id)} value={String(unit.code)} />
                ))}
            </datalist>
            {select('Hướng căn', 'apt_direction', [
              'Đông',
              'Tây',
              'Nam',
              'Bắc',
              'Đông Bắc',
              'Đông Nam',
              'Tây Bắc',
              'Tây Nam',
            ])}
            {input('Tầng', 'apt_floor', 'number', { min: 1, step: 1 })}
            {input('Giá căn (VNĐ)', 'apt_price', 'number', { min: 0, step: 'any' })}
            {input('Vốn sẵn có (VNĐ)', 'finance', 'number', { min: 0, step: 'any' })}
            {select('Mục đích', 'purpose', ['Ở', 'Đầu tư', 'Cho tặng'])}
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
            <label className="flex flex-col gap-1 text-small text-text-2 sm:col-span-2">
              Ghi chú đăng ký
              <textarea
                value={values.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={3}
                className="rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-text"
              />
            </label>
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
        {ADVANCED_GROUPS.map((group) => (
          <details key={group.title} className="rounded-card border border-border bg-surface p-4 shadow-e1">
            <summary className="cursor-pointer text-section">{group.title}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {group.fields.map((field) => (
                <div key={field.key} className="flex flex-col gap-1 text-small text-text-2">
                  <label htmlFor={`advanced-${field.key}`}>{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      id={`advanced-${field.key}`}
                      value={String(values.advanced[field.key] ?? '')}
                      onChange={(e) => set('advanced', { ...values.advanced, [field.key]: e.target.value })}
                      placeholder={field.ph}
                      rows={2}
                      className="rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-text"
                    />
                  ) : (
                    <input
                      id={`advanced-${field.key}`}
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={String(values.advanced[field.key] ?? '')}
                      onChange={(e) =>
                        set('advanced', {
                          ...values.advanced,
                          [field.key]:
                            field.type === 'number' && e.target.value ? Number(e.target.value) : e.target.value,
                        })
                      }
                      placeholder={field.ph}
                      className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body text-text"
                    />
                  )}
                </div>
              ))}
            </div>
          </details>
        ))}
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

function safeDob(value: string): string {
  try {
    return dobToIso(value) || '';
  } catch {
    return '';
  }
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
