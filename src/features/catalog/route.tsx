import { useEffect, useMemo, useState } from 'react';
import type { FeatureRoute } from '@/app/routes';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { customersForUnit, match as matchCustomer, price as totalPrice } from '@/domain/matching/property';
import { Button, useToast } from '@/ui';
import { downloadCatalogTemplate, formatPricePerM2, parseCatalogCsv } from './model';

const DIRECTIONS = ['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Bắc', 'Đông Nam', 'Tây Bắc', 'Tây Nam'];
const fieldClass = 'mt-1 min-h-11 w-full rounded-control border border-border bg-surface px-3 text-body text-text';
const labelClass = 'block text-small text-text-2';
type ProjectForm = { name: string; typical_price_per_m2: string; vat_rate: string; kpbt_rate: string; handover_date: string; title_after_months: string };
type BuildingForm = { code: string; approved_price_per_m2: string; handover_date: string };
type UnitForm = { code: string; apt_type: string; floor: string; direction: string; area_m2: string; price_per_m2_override: string; status: string };
const emptyProject: ProjectForm = { name: '', typical_price_per_m2: '', vat_rate: '5', kpbt_rate: '2', handover_date: '', title_after_months: '1.5' };
const emptyBuilding: BuildingForm = { code: '', approved_price_per_m2: '', handover_date: '' };
const emptyUnit: UnitForm = { code: '', apt_type: '', floor: '', direction: '', area_m2: '', price_per_m2_override: '', status: 'available' };
const asPrice = (value: string) => value.trim() ? Number(value.replaceAll('.', '').replace(',', '.')) * (Number(value.replace(',', '.')) < 1000 ? 1_000_000 : 1) : null;
const asNumber = (value: string) => value.trim() ? Number(value.replace(',', '.')) : null;
const money = (value: number | null) => value == null ? 'Chưa đủ dữ liệu giá' : `${Math.round(value).toLocaleString('vi-VN')} ₫ gồm VAT + KPBT`;

function CatalogPage() {
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const toast = useToast();
  const catalog = account?.catalog;
  const userId = account?.sync.local.userId || '';
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('available');
  const [projectId, setProjectId] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [projectForm, setProjectForm] = useState<ProjectForm>(emptyProject);
  const [projectEditing, setProjectEditing] = useState('');
  const [buildingForm, setBuildingForm] = useState<BuildingForm>(emptyBuilding);
  const [buildingEditing, setBuildingEditing] = useState('');
  const [unitForm, setUnitForm] = useState<UnitForm>(emptyUnit);
  const [unitEditing, setUnitEditing] = useState('');
  const [matchingCustomer, setMatchingCustomer] = useState('');
  const [unitClient, setUnitClient] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [pendingImport, setPendingImport] = useState<ReturnType<typeof parseCatalogCsv> | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    if (!catalog || !userId) return;
    let alive = true;
    setLoading(true);
    const changed = () => { if (alive) setRevision((value) => value + 1); };
    const unsubscribe = catalog.onChange(changed);
    void catalog.load().finally(() => { if (alive) { setLoading(false); changed(); } });
    return () => { alive = false; unsubscribe?.(); };
  }, [catalog, userId]);

  const projects = catalog?.projects() || [];
  const buildings = projectId ? catalog?.buildingsOf(projectId) || [] : [];
  const project = projectId ? catalog?.project(projectId) : null;
  const building = buildingId ? catalog?.building(buildingId) : null;
  const visibleUnits = useMemo(() => {
    if (!catalog) return [];
    const needle = query.trim().toLocaleLowerCase('vi');
    return catalog.units().filter((unit) => {
      if (status && unit.status !== status) return false;
      if (projectId && unit.project_id !== projectId) return false;
      if (buildingId && unit.building_id !== buildingId) return false;
      const p = catalog.project(unit.project_id);
      const b = catalog.building(unit.building_id);
      const haystack = `${unit.code} ${unit.apt_type || ''} ${unit.note || ''} ${b?.code || ''} ${p?.name || ''}`.toLocaleLowerCase('vi');
      return !needle || haystack.includes(needle);
    });
  }, [catalog, revision, query, status, projectId, buildingId]);
  const customerForMatch = customers.find((row) => row.id === matchingCustomer) as Customer | undefined;
  const currentUnit = catalog?.units().find((row) => row.id === unitClient) || null;
  const customerHits = currentUnit && catalog
    ? customersForUnit(currentUnit, customers.filter((row) => !row.disqualified_at && row.care_stage !== 'Đã mua' && row.care_stage !== 'Đã xong') as Customer[], catalog)
    : [];
  const customerUnits = matchingCustomer && customerForMatch && catalog
    ? catalog.units().map((unit) => ({ unit, match: matchCustomer(customerForMatch, unit, catalog) })).filter((item) => item.match)
    : [];

  const run = async (work: () => Promise<unknown>, success: string) => {
    if (!catalog) return;
    setError(''); setSaving(true);
    try { await work(); setRevision((value) => value + 1); toast({ title: success }); }
    catch (raw) { setError(raw instanceof Error ? raw.message : 'Không lưu được thay đổi.'); }
    finally { setSaving(false); }
  };

  const editProject = (id: string) => {
    const row = catalog?.project(id);
    if (!row) return;
    setProjectEditing(id);
    setProjectForm({ name: row.name || '', typical_price_per_m2: formatPricePerM2(row.typical_price_per_m2), vat_rate: String(row.vat_rate ?? 5), kpbt_rate: String(row.kpbt_rate ?? 2), handover_date: row.handover_date || '', title_after_months: String(row.title_after_months ?? 1.5) });
  };
  const saveProject = async () => {
    if (!catalog) return;
    const oldName = projectEditing ? catalog.project(projectEditing)?.name : '';
    const patch = { name: projectForm.name.trim(), typical_price_per_m2: asPrice(projectForm.typical_price_per_m2), vat_rate: asNumber(projectForm.vat_rate), kpbt_rate: asNumber(projectForm.kpbt_rate), handover_date: projectForm.handover_date || null, title_after_months: asNumber(projectForm.title_after_months) };
    if (!patch.name) { setError('Cần nhập tên dự án.'); return; }
    setSaving(true); setError('');
    try {
      if (projectEditing) {
        await catalog.updateProject(projectEditing, patch);
        if (oldName && oldName !== patch.name) {
          await Promise.all(customers.filter((row) => row.owner_id === userId && Array.isArray(row.projects) && row.projects.includes(oldName)).map((row) => account?.customers.update(row.id, { projects: row.projects.map((name) => name === oldName ? patch.name : name) })));
        }
        toast({ title: 'Đã lưu dự án' });
      } else {
        const created = await catalog.addProject(patch.name, patch);
        setProjectId(created.id);
        toast({ title: 'Đã thêm dự án' });
      }
      setProjectEditing(''); setProjectForm(emptyProject); setRevision((value) => value + 1);
    } catch (raw) { setError(raw instanceof Error ? raw.message : 'Không lưu được dự án.'); }
    finally { setSaving(false); }
  };

  const editBuilding = (id: string) => {
    const row = catalog?.building(id);
    if (!row) return;
    setBuildingEditing(id); setBuildingForm({ code: row.code || '', approved_price_per_m2: formatPricePerM2(row.approved_price_per_m2), handover_date: row.handover_date || '' });
  };
  const saveBuilding = () => run(async () => {
    const form = { project_id: projectId, id: buildingEditing || undefined, code: buildingForm.code.trim(), approved_price_per_m2: asPrice(buildingForm.approved_price_per_m2), handover_date: buildingForm.handover_date || null };
    if (!form.project_id || !form.code) throw new Error('Chọn dự án và nhập mã toà.');
    await catalog?.saveBuilding(form);
    setBuildingId(catalog?.buildingByCode(projectId, form.code)?.id || buildingId);
    setBuildingEditing(''); setBuildingForm(emptyBuilding);
  }, buildingEditing ? 'Đã lưu toà' : 'Đã thêm toà');

  const editUnit = (id: string) => {
    const row = catalog?.units().find((unit) => unit.id === id);
    if (!row) return;
    setBuildingId(row.building_id); setProjectId(row.project_id); setUnitEditing(id);
    setUnitForm({ code: row.code || '', apt_type: row.apt_type || '', floor: row.floor == null ? '' : String(row.floor), direction: row.direction || '', area_m2: row.area_m2 == null ? '' : String(row.area_m2), price_per_m2_override: formatPricePerM2(row.price_per_m2_override), status: row.status || 'available' });
  };
  const saveUnit = () => run(async () => {
    if (!buildingId) throw new Error('Chọn toà trước khi thêm căn.');
    const payload = { id: unitEditing || undefined, building_id: buildingId, code: unitForm.code.trim(), apt_type: unitForm.apt_type.trim() || null, floor: asNumber(unitForm.floor), direction: unitForm.direction || null, area_m2: asNumber(unitForm.area_m2), price_per_m2_override: asPrice(unitForm.price_per_m2_override), status: unitForm.status };
    await catalog?.saveUnit(payload);
    setUnitEditing(''); setUnitForm(emptyUnit);
  }, unitEditing ? 'Đã lưu căn' : 'Đã thêm căn');

  const importFile = async (file?: File) => {
    if (!file) return;
    setError(''); setPendingImport(null); setImportFileName(file.name);
    if (/\.xlsx?$/i.test(file.name)) { setError('Tệp .xlsx chưa được hỗ trợ trong bản này. Hãy lưu bảng tính thành CSV UTF-8 rồi nhập.'); return; }
    try { setPendingImport(parseCatalogCsv(await file.text())); }
    catch (raw) { setError(raw instanceof Error ? raw.message : 'Không đọc được file.'); }
  };
  const confirmImport = async () => {
    if (!catalog || !pendingImport) return;
    setImportBusy(true); setError('');
    try {
      const result = await catalog.importRows(pendingImport.rows, pendingImport.cols);
      setPendingImport(null); setImportFileName(''); setRevision((value) => value + 1);
      toast({ title: `Đã nhập ${result.projects} dự án, ${result.buildings} toà, ${result.units} căn mới` });
    } catch (raw) { setError(raw instanceof Error ? raw.message : 'Nhập file thất bại.'); }
    finally { setImportBusy(false); }
  };

  if (!account || !catalog) return <main className="mx-auto max-w-3xl p-5"><h1 className="text-title">Giỏ hàng</h1><p>Đăng nhập để xem catalog của tài khoản.</p></main>;
  return <main className="mx-auto max-w-7xl space-y-5 p-4 pb-24 sm:p-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-label text-primary">DANH MỤC BẤT ĐỘNG SẢN</p><h1 className="text-title">Giỏ hàng</h1><p className="text-small text-text-2">{loading ? 'Đang đồng bộ danh mục…' : `${projects.length} dự án · ${catalog.units().length} căn`} · cache riêng tài khoản, xem được khi offline</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => downloadCatalogTemplate()}>Tải mẫu CSV cho Excel</Button><label className="inline-flex min-h-11 cursor-pointer items-center rounded-control bg-primary px-4 text-small font-semibold text-on-primary">Nhập bảng tính<input aria-label="Chọn file CSV" className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => void importFile(event.target.files?.[0])} /></label></div>
    </header>
    {error && <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 p-3 text-small text-danger">{error}</p>}
    {pendingImport && <section className="rounded-card border border-border bg-surface p-4" aria-live="polite"><h2 className="text-heading">Xem trước nhập: {importFileName}</h2><p className="mt-1 text-small text-text-2">{pendingImport.rows.length} dòng; tối đa {pendingImport.projects} tên dự án, {pendingImport.buildings} cặp dự án/toà, {pendingImport.units} dòng có mã căn. Cột có trong file sẽ ghi đè; ô trống xoá giá trị ở cột đó.</p><div className="mt-3 flex gap-2"><Button disabled={importBusy} onClick={() => void confirmImport()}>{importBusy ? 'Đang nhập…' : 'Xác nhận nhập'}</Button><Button variant="ghost" onClick={() => setPendingImport(null)}>Huỷ</Button></div></section>}

    <section className="grid gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
      <div className="space-y-4 rounded-card border border-border bg-surface p-4">
        <div className="flex items-center justify-between"><h2 className="text-heading">Dự án</h2><Button variant="secondary" onClick={() => { setProjectEditing(''); setProjectForm(emptyProject); }}>+ Thêm</Button></div>
        <label className={labelClass}>Chọn dự án<select className={fieldClass} value={projectId} onChange={(event) => { setProjectId(event.target.value); setBuildingId(''); setUnitEditing(''); }}><option value="">Tất cả dự án</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <div className="max-h-56 space-y-1 overflow-auto">{projects.map((p) => <div key={p.id} className="flex items-center justify-between gap-2 rounded-control px-2 py-1.5"><button type="button" className="min-h-10 flex-1 text-left text-body text-text" onClick={() => { setProjectId(p.id); setBuildingId(''); }}>{p.name}</button><button type="button" className="min-h-10 px-2 text-small text-primary" onClick={() => editProject(p.id)}>Sửa</button><button type="button" className="min-h-10 px-2 text-small text-danger" onClick={() => { if (window.confirm(`Xoá dự án “${p.name}” cùng toàn bộ toà và căn? Khách đã lưu không bị ảnh hưởng.`)) void run(() => catalog.deleteProject(p.id), 'Đã xoá dự án'); }}>Xoá</button></div>)}</div>
        <div className="border-t border-border pt-4"><h3 className="text-heading">{projectEditing ? 'Sửa dự án' : 'Thông tin dự án mới'}</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={`${labelClass} sm:col-span-2`}>Tên dự án<input className={fieldClass} value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} /></label>
          <label className={labelClass}>Giá dự án (triệu/m²)<input inputMode="decimal" className={fieldClass} value={projectForm.typical_price_per_m2} onChange={(e) => setProjectForm({ ...projectForm, typical_price_per_m2: e.target.value })} /></label>
          <label className={labelClass}>Bàn giao dự kiến<input type="date" className={fieldClass} value={projectForm.handover_date} onChange={(e) => setProjectForm({ ...projectForm, handover_date: e.target.value })} /></label>
          <label className={labelClass}>VAT (%)<input inputMode="decimal" className={fieldClass} value={projectForm.vat_rate} onChange={(e) => setProjectForm({ ...projectForm, vat_rate: e.target.value })} /></label>
          <label className={labelClass}>KPBT (%)<input inputMode="decimal" className={fieldClass} value={projectForm.kpbt_rate} onChange={(e) => setProjectForm({ ...projectForm, kpbt_rate: e.target.value })} /></label>
          <label className={labelClass}>Nhận sổ sau bàn giao (tháng)<input inputMode="decimal" className={fieldClass} value={projectForm.title_after_months} onChange={(e) => setProjectForm({ ...projectForm, title_after_months: e.target.value })} /></label>
        </div><div className="mt-3 flex gap-2"><Button disabled={saving} onClick={() => void saveProject()}>{projectEditing ? 'Lưu dự án' : 'Thêm dự án'}</Button>{projectEditing && <Button variant="ghost" onClick={() => { setProjectEditing(''); setProjectForm(emptyProject); }}>Huỷ</Button>}</div></div>
      </div>

      <div className="space-y-4 rounded-card border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-heading">Toà và căn</h2><label className={labelClass}>Chọn toà<select className={`${fieldClass} min-w-48`} disabled={!projectId} value={buildingId} onChange={(e) => setBuildingId(e.target.value)}><option value="">Tất cả toà</option>{buildings.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></label></div>
        <div className="grid gap-3 rounded-control border border-border p-3 sm:grid-cols-2"><label className={labelClass}>{buildingEditing ? 'Mã toà' : 'Thêm toà — mã'}<input className={fieldClass} value={buildingForm.code} onChange={(e) => setBuildingForm({ ...buildingForm, code: e.target.value })} /></label><label className={labelClass}>Giá duyệt toà (triệu/m²)<input inputMode="decimal" className={fieldClass} value={buildingForm.approved_price_per_m2} onChange={(e) => setBuildingForm({ ...buildingForm, approved_price_per_m2: e.target.value })} /></label><label className={labelClass}>Bàn giao riêng của toà<input type="date" className={fieldClass} value={buildingForm.handover_date} onChange={(e) => setBuildingForm({ ...buildingForm, handover_date: e.target.value })} /></label><div className="flex items-end gap-2"><Button disabled={saving || !projectId} onClick={() => void saveBuilding()}>{buildingEditing ? 'Lưu toà' : 'Thêm toà'}</Button>{buildingEditing && <Button variant="ghost" onClick={() => { setBuildingEditing(''); setBuildingForm(emptyBuilding); }}>Huỷ</Button>}</div></div>
        {buildings.length > 0 && <div className="flex flex-wrap gap-2">{buildings.map((b) => <div key={b.id} className={`flex items-center gap-1 rounded-control border px-2 ${buildingId === b.id ? 'border-primary bg-primary/10' : 'border-border'}`}><button type="button" className="min-h-10 px-2 text-small" onClick={() => setBuildingId(b.id)}>{b.code}</button><button type="button" className="min-h-10 px-2 text-small text-primary" onClick={() => editBuilding(b.id)}>Sửa</button><button type="button" className="min-h-10 px-2 text-small text-danger" onClick={() => { const count = catalog.unitsOf(b.id).length; if (window.confirm(`Xoá toà ${b.code}${count ? ` cùng ${count} căn` : ''}?`)) void run(() => catalog.deleteBuilding(b.id), 'Đã xoá toà'); }}>Xoá</button></div>)}</div>}
        {building && <div className="rounded-control bg-surface-2 p-3 text-small text-text-2">Giá hiệu lực: {formatPricePerM2(catalog.buildingPrice(building)) || 'chưa có'} triệu/m² · bàn giao: {catalog.buildingHandover(building) || 'theo dự án/chưa có'}</div>}

        <div className="border-t border-border pt-4"><h3 className="text-heading">{unitEditing ? 'Sửa căn' : 'Thêm căn'}</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>Mã căn<input className={fieldClass} value={unitForm.code} onChange={(e) => setUnitForm({ ...unitForm, code: e.target.value })} /></label>
          <label className={labelClass}>Loại căn<input className={fieldClass} list="catalog-types" value={unitForm.apt_type} onChange={(e) => setUnitForm({ ...unitForm, apt_type: e.target.value })} /><datalist id="catalog-types">{project && catalog.projectTypes(project.id).map((type) => <option key={type.id} value={type.apt_type} />)}</datalist></label>
          <label className={labelClass}>Tầng<input inputMode="numeric" className={fieldClass} value={unitForm.floor} onChange={(e) => setUnitForm({ ...unitForm, floor: e.target.value })} /></label>
          <label className={labelClass}>Hướng<select className={fieldClass} value={unitForm.direction} onChange={(e) => setUnitForm({ ...unitForm, direction: e.target.value })}><option value="">Chưa rõ</option>{DIRECTIONS.map((direction) => <option key={direction}>{direction}</option>)}</select></label>
          <label className={labelClass}>Diện tích (m²)<input inputMode="decimal" className={fieldClass} value={unitForm.area_m2} onChange={(e) => setUnitForm({ ...unitForm, area_m2: e.target.value })} placeholder={unitForm.apt_type && project ? `theo loại (${catalog.typicalArea(project.id, buildingId || null, unitForm.apt_type) || '—'})` : ''} /></label>
          <label className={labelClass}>Giá riêng (triệu/m²)<input inputMode="decimal" className={fieldClass} value={unitForm.price_per_m2_override} onChange={(e) => setUnitForm({ ...unitForm, price_per_m2_override: e.target.value })} /></label>
          <label className={labelClass}>Tình trạng<select className={fieldClass} value={unitForm.status} onChange={(e) => setUnitForm({ ...unitForm, status: e.target.value })}><option value="available">Còn</option><option value="holding">Giữ chỗ</option><option value="sold">Đã bán</option></select></label>
          <div className="flex items-end gap-2"><Button disabled={saving || !buildingId} onClick={() => void saveUnit()}>{unitEditing ? 'Lưu căn' : 'Thêm căn'}</Button>{unitEditing && <Button variant="ghost" onClick={() => { setUnitEditing(''); setUnitForm(emptyUnit); }}>Huỷ</Button>}</div>
        </div></div>
      </div>
    </section>

    <section className="space-y-3 rounded-card border border-border bg-surface p-4">
      <div><h2 className="text-heading">Tìm căn và khách phù hợp</h2><p className="text-small text-text-2">Giá hiển thị gồm VAT + KPBT; thiếu giá hoặc diện tích không được tính là đạt lọc giá.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className={labelClass}>Tìm căn<input className={fieldClass} value={query} onChange={(e) => { setQuery(e.target.value); setLimit(50); }} placeholder="Mã căn, dự án, toà, ghi chú" /></label><label className={labelClass}>Tình trạng<select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tất cả</option><option value="available">Còn</option><option value="holding">Giữ chỗ</option><option value="sold">Đã bán</option></select></label><label className={labelClass}>Dự án<select className={fieldClass} value={projectId} onChange={(e) => { setProjectId(e.target.value); setBuildingId(''); }}><option value="">Tất cả</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className={labelClass}>Khách cần tìm căn phù hợp<select className={fieldClass} value={matchingCustomer} onChange={(e) => setMatchingCustomer(e.target.value)}><option value="">Không chọn khách</option>{customers.filter((c) => c.owner_id === userId && !c.disqualified_at && !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label></div>
      {matchingCustomer && customerForMatch && <div className="rounded-control bg-surface-2 p-3 text-small">Đang đối chiếu theo dự án và loại căn đã ghi cho {customerForMatch.full_name}. Vốn sẵn có không được xem là giá tối đa.<div className="mt-2 space-y-2">{customerUnits.slice(0, 50).map(({ unit, match }) => <p key={unit.id}>{catalog.project(unit.project_id)?.name} · {catalog.building(unit.building_id)?.code} · {unit.code} — {match?.reasons.join(' · ')}{match?.missing.length ? ` · Thiếu ${match.missing.join(', ')}` : ''}</p>)}</div></div>}
      <p role="status" className="text-small text-text-2">{visibleUnits.length} căn phù hợp bộ lọc{visibleUnits.length > limit ? ` · đang hiển thị ${limit}` : ''}</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleUnits.slice(0, limit).map((unit) => {
        const p = catalog.project(unit.project_id); const b = catalog.building(unit.building_id); const area = catalog.unitArea(unit); const amount = totalPrice(unit, catalog); const matching = customerForMatch ? matchCustomer(customerForMatch, unit, catalog) : null;
        return <article key={unit.id} className="rounded-control border border-border p-3"><div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold">{p?.name || 'Chưa rõ dự án'} · {b?.code || ''} · {unit.code}</h3><p className="mt-1 text-small text-text-2">{unit.apt_type || 'Chưa rõ loại'} · {area == null ? 'Chưa rõ diện tích' : `${area} m²`} · {unit.direction || 'Chưa rõ hướng'} · {unit.floor == null ? 'Chưa rõ tầng' : `Tầng ${unit.floor}`} · {catalog.statusLabel(unit.status)}</p></div><span className="text-small text-text-2">{money(amount)}</span></div>{matching && <p className="mt-2 text-small text-primary">{matching.reasons.join(' · ')}{matching.missing.length ? ` · Thiếu ${matching.missing.join(', ')}` : ''}</p>}<div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => editUnit(unit.id)}>Sửa</Button><Button variant="ghost" onClick={() => setUnitClient(unitClient === unit.id ? '' : unit.id)}>Tìm khách phù hợp</Button><Button variant="danger" onClick={() => { if (window.confirm(`Xoá căn ${unit.code}?`)) void run(() => catalog.deleteUnit(unit.id), 'Đã xoá căn'); }}>Xoá</Button></div>{unitClient === unit.id && <div className="mt-3 border-t border-border pt-3"><p className="text-small">Khách đang hoạt động khớp dự án và loại căn: {customerHits.length}</p>{customerHits.slice(0, 10).map(({ customer, match }) => <p key={customer.id} className="mt-1 text-small">{customer.full_name} — {match.reasons.join(' · ')}{match.missing.length ? ` · Thiếu ${match.missing.join(', ')}` : ''}</p>)}</div>}</article>;
      })}</div>
      {visibleUnits.length > limit && <Button variant="secondary" onClick={() => setLimit((n) => n + 50)}>Xem thêm {visibleUnits.length - limit} căn</Button>}
    </section>
  </main>;
}

export const route: FeatureRoute = { path: '/gio-hang', element: <CatalogPage /> };
