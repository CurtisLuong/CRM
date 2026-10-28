import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast as notify } from 'sonner';
import type { FeatureRoute } from '@/app/routes';
import { type Column, DataTable, TextField } from '@/components/crm';
import { Button } from '@/components/ui/button';
import { CARE_DONE_STAGES } from '@/config/stages';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { customersForUnit, match as matchCustomer, price as totalPrice } from '@/domain/matching/property';
import {
  downloadCatalogTemplate,
  formatPricePerM2,
  parseCatalogCsv,
  parseCatalogMatrix,
  parsePrice,
  unitMatchesQuery,
} from './model';

const DIRECTIONS = ['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Bắc', 'Đông Nam', 'Tây Bắc', 'Tây Nam'];
const fieldClass = 'mt-1 h-11 w-full rounded-sm border border-input bg-surface-100 px-3 text-body text-ink';
const labelClass = 'block text-label text-ink-muted';
type ProjectForm = {
  name: string;
  typical_price_per_m2: string;
  vat_rate: string;
  kpbt_rate: string;
  handover_date: string;
  title_after_months: string;
};
type BuildingForm = { code: string; approved_price_per_m2: string; handover_date: string };
type UnitForm = {
  code: string;
  apt_type: string;
  floor: string;
  direction: string;
  area_m2: string;
  price_per_m2_override: string;
  status: string;
};
const emptyProject: ProjectForm = {
  name: '',
  typical_price_per_m2: '',
  vat_rate: '5',
  kpbt_rate: '2',
  handover_date: '',
  title_after_months: '1.5',
};
const emptyBuilding: BuildingForm = { code: '', approved_price_per_m2: '', handover_date: '' };
const emptyUnit: UnitForm = {
  code: '',
  apt_type: '',
  floor: '',
  direction: '',
  area_m2: '',
  price_per_m2_override: '',
  status: 'available',
};
const asPrice = (value: string) => parsePrice(value);
const asNumber = (value: string) => (value.trim() ? Number(value.replace(',', '.')) : null);
const money = (value: number | null) =>
  value == null ? 'Chưa đủ dữ liệu giá' : `${Math.round(value).toLocaleString('vi-VN')} ₫ gồm VAT + KPBT`;

function CatalogPage() {
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const catalog = account?.catalog;
  const userId = account?.sync.local.userId || '';
  const [, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [floorMin, setFloorMin] = useState('');
  const [floorMax, setFloorMax] = useState('');
  const [areaMin, setAreaMin] = useState('');
  const [areaMax, setAreaMax] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [projectId, setProjectId] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [projectForm, setProjectForm] = useState<ProjectForm>(emptyProject);
  const [projectEditing, setProjectEditing] = useState('');
  const [aptTypeForm, setAptTypeForm] = useState({ id: '', name: '', area: '' });
  const [buildingForm, setBuildingForm] = useState<BuildingForm>(emptyBuilding);
  const [buildingEditing, setBuildingEditing] = useState('');
  const [buildingTypesEditing, setBuildingTypesEditing] = useState(false);
  const [buildingTypeDraft, setBuildingTypeDraft] = useState<Record<string, { selected: boolean; area: string }>>({});
  const [unitForm, setUnitForm] = useState<UnitForm>(emptyUnit);
  const [unitEditing, setUnitEditing] = useState('');
  const [matchingCustomer, setMatchingCustomer] = useState('');
  const [matchingMaxPrice, setMatchingMaxPrice] = useState('');
  const [unitClient, setUnitClient] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [pendingImport, setPendingImport] = useState<ReturnType<typeof parseCatalogCsv> | null>(null);
  const [archivedImportMatches, setArchivedImportMatches] = useState({ archivedProjects: 0, archivedBuildings: 0 });
  const [importBusy, setImportBusy] = useState(false);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    if (!catalog || !userId) return;
    let alive = true;
    setLoading(true);
    const changed = () => {
      if (alive) setRevision((value) => value + 1);
    };
    const unsubscribe = catalog.onChange(changed);
    void catalog.load().finally(() => {
      if (alive) {
        setLoading(false);
        changed();
      }
    });
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [catalog, userId]);

  const projects = catalog?.projects() || [];
  const buildings = projectId ? catalog?.buildingsOf(projectId) || [] : [];
  const project = projectId ? catalog?.project(projectId) : null;
  const building = buildingId ? catalog?.building(buildingId) : null;
  const visibleUnits = (() => {
    if (!catalog) return [];
    return catalog.units().filter((unit) => {
      if (status && unit.status !== status) return false;
      if (projectId && unit.project_id !== projectId) return false;
      if (buildingId && unit.building_id !== buildingId) return false;
      if (
        typeFilter &&
        !String(unit.apt_type || '')
          .toLocaleLowerCase('vi')
          .includes(typeFilter.toLocaleLowerCase('vi'))
      )
        return false;
      if (directionFilter && unit.direction !== directionFilter) return false;
      const area = catalog.unitArea(unit);
      const price = totalPrice(unit, catalog);
      const inRange = (value: number | null, min: string, max: string) => {
        if (value == null) return min === '' && max === '';
        const lower = min === '' ? null : Number(min.replace(',', '.'));
        const upper = max === '' ? null : Number(max.replace(',', '.'));
        if ((lower != null && !Number.isFinite(lower)) || (upper != null && !Number.isFinite(upper))) return false;
        if (lower != null && upper != null && lower > upper) return false;
        return (lower == null || value >= lower) && (upper == null || value <= upper);
      };
      if (!inRange(unit.floor == null ? null : Number(unit.floor), floorMin, floorMax)) return false;
      if (!inRange(area == null ? null : Number(area), areaMin, areaMax)) return false;
      if (!inRange(price == null ? null : Number(price) / 1_000_000, priceMin, priceMax)) return false;
      const p = catalog.project(unit.project_id);
      const b = catalog.building(unit.building_id);
      return unitMatchesQuery(
        [
          ['Mã căn', unit.code],
          ['Loại căn', unit.apt_type],
          ['Ghi chú', unit.note],
          ['Mã toà', b?.code],
          ['Dự án', p?.name],
        ],
        query,
      );
    });
  })();
  const customerForMatch = customers.find((row) => row.id === matchingCustomer) as Customer | undefined;
  const currentUnit = catalog?.units().find((row) => row.id === unitClient) || null;
  const customerHits =
    currentUnit && catalog
      ? customersForUnit(
          currentUnit,
          customers.filter(
            (row) =>
              !row.disqualified_at && !CARE_DONE_STAGES.includes(row.care_stage as (typeof CARE_DONE_STAGES)[number]),
          ) as Customer[],
          catalog,
        )
      : [];
  const customerUnits =
    matchingCustomer && customerForMatch && catalog
      ? catalog
          .units()
          .map((unit) => ({
            unit,
            match: matchCustomer(customerForMatch, unit, catalog, matchingMaxPrice ? asPrice(matchingMaxPrice) : null),
          }))
          .filter((item) => item.match)
      : [];
  const unitRows = visibleUnits.slice(0, limit).map((unit) => {
    const p = catalog?.project(unit.project_id);
    const b = catalog?.building(unit.building_id);
    const area = catalog?.unitArea(unit);
    const amount = catalog ? totalPrice(unit, catalog) : null;
    const matching =
      customerForMatch && catalog
        ? matchCustomer(customerForMatch, unit, catalog, matchingMaxPrice ? asPrice(matchingMaxPrice) : null)
        : null;
    return {
      id: unit.id,
      unit,
      projectName: p?.name || 'Chưa rõ dự án',
      buildingCode: b?.code || '',
      area,
      amount,
      matching,
    };
  });
  const unitColumns: Column<(typeof unitRows)[number]>[] = [
    { key: 'unit', label: 'Căn', render: ({ unit }) => <span className="font-semibold">{unit.code}</span> },
    { key: 'project', label: 'Dự án', render: (row) => row.projectName },
    { key: 'building', label: 'Toà', render: (row) => row.buildingCode },
    { key: 'type', label: 'Loại căn', render: ({ unit }) => unit.apt_type || '—' },
    {
      key: 'floor',
      label: 'Tầng',
      numeric: true,
      align: 'right',
      render: ({ unit }) => <span className="text-numeric">{unit.floor ?? '—'}</span>,
    },
    {
      key: 'area',
      label: 'Diện tích',
      numeric: true,
      align: 'right',
      render: (row) => <span className="text-numeric">{row.area == null ? '—' : `${row.area} m²`}</span>,
    },
    {
      key: 'price',
      label: 'Giá gồm thuế',
      numeric: true,
      align: 'right',
      render: (row) => <span className="text-numeric">{row.amount == null ? '—' : money(row.amount)}</span>,
    },
    { key: 'status', label: 'Tình trạng', render: ({ unit }) => catalog?.statusLabel(unit.status) },
    {
      key: 'actions',
      label: 'Thao tác',
      render: ({ unit }) => (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => editUnit(unit.id)}>
            Sửa
          </Button>
          <Button variant="ghost" onClick={() => setUnitClient(unitClient === unit.id ? '' : unit.id)}>
            Tìm khách
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (window.confirm(`Lưu trữ căn ${unit.code}? Dữ liệu vẫn được giữ.`))
                void run(() => catalog?.archiveUnit(unit.id) ?? Promise.resolve(), 'Đã lưu trữ căn');
            }}
          >
            Lưu trữ
          </Button>
        </div>
      ),
    },
  ];
  const buildingRows = buildings.map((row) => ({
    id: row.id,
    building: row,
    code: row.code,
    price: catalog?.buildingPrice(row),
    handover: catalog?.buildingHandover(row),
    units: catalog?.unitsOf(row.id).length ?? 0,
  }));
  const buildingColumns: Column<(typeof buildingRows)[number]>[] = [
    { key: 'code', label: 'Toà', render: ({ code }) => <span className="font-semibold">{code}</span> },
    {
      key: 'price',
      label: 'Giá hiệu lực',
      numeric: true,
      align: 'right',
      render: ({ price }) => (
        <span className="text-numeric">{price == null ? '—' : `${formatPricePerM2(price)} triệu/m²`}</span>
      ),
    },
    { key: 'handover', label: 'Bàn giao', render: ({ handover }) => handover || 'Theo dự án/chưa có' },
    {
      key: 'units',
      label: 'Số căn',
      numeric: true,
      align: 'right',
      render: ({ units }) => <span className="text-numeric">{units}</span>,
    },
    {
      key: 'actions',
      label: 'Thao tác',
      render: ({ building: row, units }) => (
        <div className="flex gap-2">
          <Button onClick={() => setBuildingId(row.id)}>Chọn</Button>
          <Button variant="secondary" onClick={() => editBuilding(row.id)}>
            Sửa
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (window.confirm(`Lưu trữ toà ${row.code}? ${units} căn vẫn được giữ nguyên.`)) {
                void run(() => catalog?.archiveBuilding(row.id) ?? Promise.resolve(), 'Đã lưu trữ toà');
                if (buildingId === row.id) setBuildingId('');
              }
            }}
          >
            Lưu trữ
          </Button>
        </div>
      ),
    },
  ];
  const importPreview =
    pendingImport && catalog
      ? (() => {
          const projectsInFile = new Set(
            pendingImport.rows.map((row) => String(row.project).trim().toLocaleLowerCase('vi')),
          );
          const buildingsInFile = new Map<string, { project: string; building: string }>();
          const unitsInFile = new Map<string, { project: string; building: string; code: string }>();
          for (const row of pendingImport.rows) {
            const pName = String(row.project).trim();
            const bCode = String(row.building).trim();
            const projectKey = pName.toLocaleLowerCase('vi');
            const buildingKey = `${projectKey}|${bCode.toLocaleLowerCase('vi')}`;
            buildingsInFile.set(buildingKey, { project: pName, building: bCode });
            if (row.code)
              unitsInFile.set(`${buildingKey}|${String(row.code).trim().toLocaleLowerCase('vi')}`, {
                project: pName,
                building: bCode,
                code: String(row.code).trim(),
              });
          }
          const missingProjects = [...projectsInFile].filter((name) => !catalog.projectByName(name)).length;
          const missingBuildings = [...buildingsInFile.values()].filter(({ project: name, building: code }) => {
            const p = catalog.projectByName(name);
            return !p || !catalog.buildingByCode(p.id, code);
          }).length;
          const newProjects = Math.max(0, missingProjects - archivedImportMatches.archivedProjects);
          const newBuildings = Math.max(0, missingBuildings - archivedImportMatches.archivedBuildings);
          let newUnits = 0;
          let updatedUnits = 0;
          for (const { project: name, building: code, code: unitCode } of unitsInFile.values()) {
            const p = catalog.projectByName(name);
            const b = p && catalog.buildingByCode(p.id, code);
            if (b && catalog.unitByCode(b.id, unitCode)) updatedUnits++;
            else newUnits++;
          }
          return { newProjects, newBuildings, newUnits, updatedUnits, ...archivedImportMatches };
        })()
      : null;

  const run = async (work: () => Promise<unknown>, success: string) => {
    if (!catalog) return;
    setError('');
    setSaving(true);
    try {
      await work();
      setRevision((value) => value + 1);
      notify.success(success);
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : 'Không lưu được thay đổi.');
    } finally {
      setSaving(false);
    }
  };

  const editProject = (id: string) => {
    const row = catalog?.project(id);
    if (!row) return;
    setProjectEditing(id);
    setProjectForm({
      name: row.name || '',
      typical_price_per_m2: formatPricePerM2(row.typical_price_per_m2),
      vat_rate: String(row.vat_rate ?? 5),
      kpbt_rate: String(row.kpbt_rate ?? 2),
      handover_date: row.handover_date || '',
      title_after_months: String(row.title_after_months ?? 1.5),
    });
  };
  const saveProject = async () => {
    if (!catalog) return;
    const oldName = projectEditing ? catalog.project(projectEditing)?.name : '';
    const patch = {
      name: projectForm.name.trim(),
      typical_price_per_m2: asPrice(projectForm.typical_price_per_m2),
      vat_rate: asNumber(projectForm.vat_rate),
      kpbt_rate: asNumber(projectForm.kpbt_rate),
      handover_date: projectForm.handover_date || null,
      title_after_months: asNumber(projectForm.title_after_months),
    };
    if (!patch.name) {
      setError('Cần nhập tên dự án.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (projectEditing) {
        await catalog.updateProject(projectEditing, patch);
        if (oldName && oldName !== patch.name) {
          await Promise.all(
            customers
              .filter((row) => row.owner_id === userId && Array.isArray(row.projects) && row.projects.includes(oldName))
              .map((row) =>
                account?.customers.update(row.id, {
                  projects: (row.projects || []).map((name) => (name === oldName ? patch.name : name)),
                }),
              ),
          );
        }
        notify.success('Đã lưu dự án');
      } else {
        const created = await catalog.addProject(patch.name, patch);
        setProjectId(created.id);
        notify.success('Đã thêm dự án');
      }
      setProjectEditing('');
      setProjectForm(emptyProject);
      setRevision((value) => value + 1);
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : 'Không lưu được dự án.');
    } finally {
      setSaving(false);
    }
  };

  const saveAptType = () =>
    run(
      async () => {
        if (!projectId || !aptTypeForm.name.trim()) throw new Error('Chọn dự án và nhập loại căn.');
        await catalog?.saveProjectType({
          id: aptTypeForm.id || null,
          project_id: projectId,
          apt_type: aptTypeForm.name.trim(),
          typical_area_m2: asNumber(aptTypeForm.area),
        });
        setAptTypeForm({ id: '', name: '', area: '' });
      },
      aptTypeForm.id ? 'Đã lưu loại căn' : 'Đã thêm loại căn',
    );

  const editBuilding = (id: string) => {
    const row = catalog?.building(id);
    if (!row) return;
    setBuildingEditing(id);
    setBuildingForm({
      code: row.code || '',
      approved_price_per_m2: formatPricePerM2(row.approved_price_per_m2),
      handover_date: row.handover_date || '',
    });
  };
  const saveBuilding = () =>
    run(
      async () => {
        const form = {
          project_id: projectId,
          id: buildingEditing || undefined,
          code: buildingForm.code.trim(),
          approved_price_per_m2: asPrice(buildingForm.approved_price_per_m2),
          handover_date: buildingForm.handover_date || null,
        };
        if (!form.project_id || !form.code) throw new Error('Chọn dự án và nhập mã toà.');
        await catalog?.saveBuilding(form);
        setBuildingId(catalog?.buildingByCode(projectId, form.code)?.id || buildingId);
        setBuildingEditing('');
        setBuildingForm(emptyBuilding);
      },
      buildingEditing ? 'Đã lưu toà' : 'Đã thêm toà',
    );

  const beginBuildingTypesEdit = () => {
    if (!buildingId || !catalog) return;
    const own = catalog.buildingTypeRows(buildingId);
    const defaults = catalog.projectTypes(projectId);
    const allowed = own.length ? own.map((row) => row.apt_type) : defaults.map((row) => row.apt_type);
    setBuildingTypeDraft(
      Object.fromEntries(
        defaults.map((row) => {
          const current = own.find((item) => item.apt_type === row.apt_type);
          return [
            row.apt_type,
            { selected: allowed.includes(row.apt_type), area: current?.area_m2 == null ? '' : String(current.area_m2) },
          ];
        }),
      ),
    );
    setBuildingTypesEditing(true);
  };
  const saveBuildingTypes = () =>
    run(async () => {
      if (!buildingId) return;
      await catalog?.setBuildingTypes(
        buildingId,
        Object.entries(buildingTypeDraft)
          .filter(([, value]) => value.selected)
          .map(([apt_type, value]) => ({ apt_type, area_m2: asNumber(value.area) })),
      );
      setBuildingTypesEditing(false);
    }, 'Đã lưu loại căn của toà');

  const editUnit = (id: string) => {
    const row = catalog?.units().find((unit) => unit.id === id);
    if (!row) return;
    setBuildingId(row.building_id);
    setProjectId(row.project_id);
    setUnitEditing(id);
    setUnitForm({
      code: row.code || '',
      apt_type: row.apt_type || '',
      floor: row.floor == null ? '' : String(row.floor),
      direction: row.direction || '',
      area_m2: row.area_m2 == null ? '' : String(row.area_m2),
      price_per_m2_override: formatPricePerM2(row.price_per_m2_override),
      status: row.status || 'available',
    });
  };
  const saveUnit = () =>
    run(
      async () => {
        if (!buildingId) throw new Error('Chọn toà trước khi thêm căn.');
        const payload = {
          id: unitEditing || undefined,
          building_id: buildingId,
          code: unitForm.code.trim(),
          apt_type: unitForm.apt_type.trim() || null,
          floor: asNumber(unitForm.floor),
          direction: unitForm.direction || null,
          area_m2: asNumber(unitForm.area_m2),
          price_per_m2_override: asPrice(unitForm.price_per_m2_override),
          status: unitForm.status,
        };
        await catalog?.saveUnit(payload);
        setUnitEditing('');
        setUnitForm(emptyUnit);
      },
      unitEditing ? 'Đã lưu căn' : 'Đã thêm căn',
    );

  const importFile = async (file?: File) => {
    if (!file) return;
    if (!catalog) return;
    setError('');
    setPendingImport(null);
    setImportFileName(file.name);
    try {
      if (/\.xlsx?$/i.test(file.name)) {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
        const sheetName = workbook.SheetNames[0];
        const firstSheet = sheetName ? workbook.Sheets[sheetName] : undefined;
        if (!firstSheet) throw new Error('File Excel không có trang tính.');
        const parsed = parseCatalogMatrix(
          XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: true, defval: '' }) as unknown[][],
        );
        setArchivedImportMatches(await catalog.previewImport(parsed.rows));
        setPendingImport(parsed);
      } else {
        const parsed = parseCatalogCsv(await file.text());
        setArchivedImportMatches(await catalog.previewImport(parsed.rows));
        setPendingImport(parsed);
      }
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : 'Không đọc được file hoặc không kiểm tra được mục lưu trữ.');
    }
  };
  const confirmImport = async () => {
    if (!catalog || !pendingImport) return;
    setImportBusy(true);
    setError('');
    try {
      const result = await catalog.importRows(pendingImport.rows, pendingImport.cols);
      setPendingImport(null);
      setImportFileName('');
      setArchivedImportMatches({ archivedProjects: 0, archivedBuildings: 0 });
      setRevision((value) => value + 1);
      notify.success(
        `Đã nhập ${result.projects} dự án, ${result.buildings} toà và ${result.units} dòng căn; khôi phục ${result.restoredProjects} dự án, ${result.restoredBuildings} toà`,
      );
    } catch (raw) {
      setError(raw instanceof Error ? raw.message : 'Nhập file thất bại.');
    } finally {
      setImportBusy(false);
    }
  };

  if (!account || !catalog)
    return (
      <main className="mx-auto max-w-3xl p-5">
        <h1 className="text-title">Giỏ hàng</h1>
        <p>Đăng nhập để xem catalog của tài khoản.</p>
      </main>
    );
  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 pb-24 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-label text-ion">DANH MỤC BẤT ĐỘNG SẢN</p>
          <h1 className="text-title">Giỏ hàng</h1>
          <p className="text-caption text-ink-muted">
            {loading ? 'Đang đồng bộ danh mục…' : `${projects.length} dự án · ${catalog.units().length} căn`} · cache
            riêng tài khoản, xem được khi offline
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void downloadCatalogTemplate()}>
            Tải file mẫu Excel
          </Button>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md bg-ion px-4 text-caption font-semibold text-on-ion">
            Nhập Excel / CSV
            <input
              aria-label="Chọn file Excel hoặc CSV"
              className="sr-only"
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              onChange={(event) => void importFile(event.target.files?.[0])}
            />
          </label>
        </div>
      </header>
      {error && (
        <p role="alert" className="rounded-md border border-alert/40 bg-alert-tint p-3 text-caption text-alert-text">
          {error}
        </p>
      )}
      <p className="rounded-md border border-line bg-surface-200 p-3 text-caption text-ink-muted">
        Lưu trữ sẽ ẩn mục khỏi danh sách thường; dữ liệu danh mục vẫn được giữ nguyên trong hệ thống.
      </p>
      {pendingImport && (
        <section className="rounded-lg border border-line bg-surface-100 p-4" aria-live="polite">
          <h2 className="text-heading">Xem trước nhập: {importFileName}</h2>
          <p className="mt-1 text-caption text-ink-muted">
            {pendingImport.rows.length} dòng · tạo {importPreview?.newProjects} dự án, {importPreview?.newBuildings} toà
            và {importPreview?.newUnits} căn · cập nhật {importPreview?.updatedUnits} căn · khôi phục từ lưu trữ{' '}
            {importPreview?.archivedProjects} dự án, {importPreview?.archivedBuildings} toà. Dự án/toà khớp đã lưu trữ
            sẽ được khôi phục; cột có trong file sẽ ghi đè, ô trống xoá giá trị ở cột đó.
          </p>
          <div className="mt-3 flex gap-2">
            <Button disabled={importBusy} onClick={() => void confirmImport()}>
              {importBusy ? 'Đang nhập…' : 'Xác nhận nhập'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPendingImport(null);
                setArchivedImportMatches({ archivedProjects: 0, archivedBuildings: 0 });
              }}
            >
              Huỷ
            </Button>
          </div>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
        {projectId && (
          <div className="mt-4 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-heading">Loại căn của dự án</h3>
              <Button variant="secondary" onClick={() => setAptTypeForm({ id: '', name: '', area: '' })}>
                + Thêm loại
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {catalog.projectTypes(projectId).map((type) => (
                <div
                  key={type.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2"
                >
                  <span>
                    {type.apt_type} ·{' '}
                    {type.typical_area_m2 == null ? 'chưa có diện tích' : `${type.typical_area_m2} m²`}
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className="min-h-11 text-caption text-ion"
                      onClick={() =>
                        setAptTypeForm({
                          id: type.id,
                          name: type.apt_type,
                          area: type.typical_area_m2 == null ? '' : String(type.typical_area_m2),
                        })
                      }
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      className="min-h-11 text-caption text-alert-text"
                      onClick={() => {
                        if (window.confirm(`Lưu trữ loại căn “${type.apt_type}”? Dữ liệu cũ vẫn được giữ.`))
                          void run(() => catalog.archiveProjectType(type.id), 'Đã lưu trữ loại căn');
                      }}
                    >
                      Lưu trữ
                    </button>
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <label className={labelClass}>
                Tên loại căn
                <input
                  className={fieldClass}
                  value={aptTypeForm.name}
                  onChange={(e) => setAptTypeForm({ ...aptTypeForm, name: e.target.value })}
                  placeholder="2N-2WC"
                />
              </label>
              <TextField
                label="Diện tích điển hình"
                suffix="m²"
                numeric
                value={aptTypeForm.area}
                onChange={(e) => setAptTypeForm({ ...aptTypeForm, area: e.target.value })}
              />
              <div className="flex items-end gap-2">
                <Button disabled={saving} onClick={() => void saveAptType()}>
                  {aptTypeForm.id ? 'Lưu loại' : 'Thêm loại'}
                </Button>
                {aptTypeForm.id && (
                  <Button variant="ghost" onClick={() => setAptTypeForm({ id: '', name: '', area: '' })}>
                    Huỷ
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4 rounded-lg border border-line bg-surface-100 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-heading">Dự án</h2>
            <Button
              variant="secondary"
              onClick={() => {
                setProjectEditing('');
                setProjectForm(emptyProject);
              }}
            >
              + Thêm
            </Button>
          </div>
          <label className={labelClass}>
            Chọn dự án
            <select
              className={fieldClass}
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setBuildingId('');
                setUnitEditing('');
              }}
            >
              <option value="">Tất cả dự án</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="max-h-56 space-y-1 overflow-auto">
            {projects.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
                <button
                  type="button"
                  className="min-h-11 flex-1 text-left text-body text-ink"
                  onClick={() => {
                    setProjectId(p.id);
                    setBuildingId('');
                  }}
                >
                  {p.name}
                </button>
                <button type="button" className="min-h-11 px-2 text-caption text-ion" onClick={() => editProject(p.id)}>
                  Sửa
                </button>
                <button
                  type="button"
                  className="min-h-11 px-2 text-caption text-alert-text"
                  onClick={() => {
                    if (window.confirm(`Lưu trữ dự án “${p.name}”? Toà và căn vẫn được giữ nguyên.`)) {
                      void run(() => catalog.archiveProject(p.id), 'Đã lưu trữ dự án');
                      if (projectId === p.id) {
                        setProjectId('');
                        setBuildingId('');
                      }
                    }
                  }}
                >
                  Lưu trữ
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-line pt-4">
            <h3 className="text-heading">{projectEditing ? 'Sửa dự án' : 'Thông tin dự án mới'}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={`${labelClass} sm:col-span-2`}>
                Tên dự án
                <input
                  className={fieldClass}
                  value={projectForm.name}
                  onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                />
              </label>
              <TextField
                label="Giá dự án"
                suffix="triệu/m²"
                numeric
                value={projectForm.typical_price_per_m2}
                onChange={(e) => setProjectForm({ ...projectForm, typical_price_per_m2: e.target.value })}
              />
              <label className={labelClass}>
                Bàn giao dự kiến
                <input
                  type="date"
                  className={fieldClass}
                  value={projectForm.handover_date}
                  onChange={(e) => setProjectForm({ ...projectForm, handover_date: e.target.value })}
                />
              </label>
              <TextField
                label="VAT"
                suffix="%"
                numeric
                value={projectForm.vat_rate}
                onChange={(e) => setProjectForm({ ...projectForm, vat_rate: e.target.value })}
              />
              <TextField
                label="KPBT"
                suffix="%"
                numeric
                value={projectForm.kpbt_rate}
                onChange={(e) => setProjectForm({ ...projectForm, kpbt_rate: e.target.value })}
              />
              <TextField
                label="Nhận sổ sau bàn giao"
                suffix="tháng"
                numeric
                value={projectForm.title_after_months}
                onChange={(e) => setProjectForm({ ...projectForm, title_after_months: e.target.value })}
              />
            </div>
            <div className="mt-3 flex gap-2">
              <Button disabled={saving} onClick={() => void saveProject()}>
                {projectEditing ? 'Lưu dự án' : 'Thêm dự án'}
              </Button>
              {projectEditing && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setProjectEditing('');
                    setProjectForm(emptyProject);
                  }}
                >
                  Huỷ
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-line bg-surface-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-heading">Toà và căn</h2>
            <label className={labelClass}>
              Chọn toà
              <select
                className={`${fieldClass} min-w-48`}
                disabled={!projectId}
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
              >
                <option value="">Tất cả toà</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-2">
            <label className={labelClass}>
              {buildingEditing ? 'Mã toà' : 'Thêm toà — mã'}
              <input
                className={fieldClass}
                value={buildingForm.code}
                onChange={(e) => setBuildingForm({ ...buildingForm, code: e.target.value })}
              />
            </label>
            <TextField
              label="Giá duyệt toà"
              suffix="triệu/m²"
              numeric
              value={buildingForm.approved_price_per_m2}
              onChange={(e) => setBuildingForm({ ...buildingForm, approved_price_per_m2: e.target.value })}
            />
            <label className={labelClass}>
              Bàn giao riêng của toà
              <input
                type="date"
                className={fieldClass}
                value={buildingForm.handover_date}
                onChange={(e) => setBuildingForm({ ...buildingForm, handover_date: e.target.value })}
              />
            </label>
            <div className="flex items-end gap-2">
              <Button disabled={saving || !projectId} onClick={() => void saveBuilding()}>
                {buildingEditing ? 'Lưu toà' : 'Thêm toà'}
              </Button>
              {buildingEditing && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setBuildingEditing('');
                    setBuildingForm(emptyBuilding);
                  }}
                >
                  Huỷ
                </Button>
              )}
            </div>
          </div>
          {buildings.length > 0 && (
            <>
              <div className="hidden lg:block">
                <DataTable
                  caption="Danh sách toà"
                  columns={buildingColumns}
                  rows={buildingRows}
                  density="compact"
                  empty={<p className="m-0 p-4 text-center text-body text-ink-muted">Chưa có toà.</p>}
                />
              </div>
              <div className="space-y-2 lg:hidden">
                {buildingRows.map(({ building: row, price, handover, units }) => (
                  <article
                    key={row.id}
                    className={`rounded-md border p-3 ${buildingId === row.id ? 'border-ion bg-ion-tint' : 'border-line bg-surface-100'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="min-h-11 flex-1 text-left font-semibold"
                        aria-pressed={buildingId === row.id}
                        onClick={() => setBuildingId(row.id)}
                      >
                        Toà {row.code}
                      </button>
                      <span className="text-right text-numeric">
                        {price == null ? 'Chưa có giá' : `${formatPricePerM2(price)} triệu/m²`}
                      </span>
                    </div>
                    <p className="text-caption text-ink-muted">
                      {units} căn · Bàn giao: {handover || 'theo dự án/chưa có'}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button variant="secondary" onClick={() => editBuilding(row.id)}>
                        Sửa
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          if (window.confirm(`Lưu trữ toà ${row.code}? ${units} căn vẫn được giữ nguyên.`)) {
                            void run(() => catalog.archiveBuilding(row.id), 'Đã lưu trữ toà');
                            if (buildingId === row.id) setBuildingId('');
                          }
                        }}
                      >
                        Lưu trữ
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
          {building && (
            <div className="rounded-md bg-surface-200 p-3 text-caption text-ink-muted">
              Giá hiệu lực: {formatPricePerM2(catalog.buildingPrice(building)) || 'chưa có'} triệu/m² · bàn giao:{' '}
              {catalog.buildingHandover(building) || 'theo dự án/chưa có'}
            </div>
          )}
          {building && (
            <section className="rounded-md border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-heading">Loại căn được phép ở toà {building.code}</h3>
                <Button
                  variant="secondary"
                  onClick={buildingTypesEditing ? () => setBuildingTypesEditing(false) : beginBuildingTypesEdit}
                >
                  {buildingTypesEditing ? 'Huỷ' : 'Tuỳ chỉnh'}
                </Button>
              </div>
              {buildingTypesEditing ? (
                <div className="mt-2 space-y-2">
                  {catalog.projectTypes(projectId).map((type) => {
                    const value = buildingTypeDraft[type.apt_type] || { selected: false, area: '' };
                    return (
                      <div key={type.id} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <label className="flex min-h-11 items-center gap-2 text-caption">
                          <input
                            type="checkbox"
                            checked={value.selected}
                            onChange={(e) =>
                              setBuildingTypeDraft({
                                ...buildingTypeDraft,
                                [type.apt_type]: { ...value, selected: e.target.checked },
                              })
                            }
                          />
                          {type.apt_type}
                        </label>
                        <TextField
                          label="Diện tích riêng"
                          suffix="m²"
                          numeric
                          value={value.area}
                          onChange={(e) =>
                            setBuildingTypeDraft({
                              ...buildingTypeDraft,
                              [type.apt_type]: { ...value, area: e.target.value },
                            })
                          }
                          placeholder={`${type.typical_area_m2 || 'theo dự án'}`}
                        />
                        <span className="text-caption text-ink-muted">
                          {value.selected ? 'Được dùng' : 'Không chọn'}
                        </span>
                      </div>
                    );
                  })}
                  <Button disabled={saving} onClick={() => void saveBuildingTypes()}>
                    Lưu loại toà
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-caption text-ink-muted">
                  {catalog.buildingTypes(building.id).length
                    ? catalog
                        .buildingTypes(building.id)
                        .map((item) => item.apt_type)
                        .join(' · ')
                    : 'Toà dùng mọi loại đã khai báo ở dự án.'}
                </p>
              )}
            </section>
          )}

          <div className="border-t border-line pt-4">
            <h3 className="text-heading">{unitEditing ? 'Sửa căn' : 'Thêm căn'}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className={labelClass}>
                Mã căn
                <input
                  className={fieldClass}
                  value={unitForm.code}
                  onChange={(e) => setUnitForm({ ...unitForm, code: e.target.value })}
                />
              </label>
              <label className={labelClass}>
                Loại căn
                <input
                  className={fieldClass}
                  list="catalog-types"
                  value={unitForm.apt_type}
                  onChange={(e) => setUnitForm({ ...unitForm, apt_type: e.target.value })}
                />
                <datalist id="catalog-types">
                  {project &&
                    catalog.projectTypes(project.id).map((type) => <option key={type.id} value={type.apt_type} />)}
                </datalist>
              </label>
              <TextField
                label="Tầng"
                suffix="tầng"
                numeric
                value={unitForm.floor}
                onChange={(e) => setUnitForm({ ...unitForm, floor: e.target.value })}
              />
              <label className={labelClass}>
                Hướng
                <select
                  className={fieldClass}
                  value={unitForm.direction}
                  onChange={(e) => setUnitForm({ ...unitForm, direction: e.target.value })}
                >
                  <option value="">Chưa rõ</option>
                  {DIRECTIONS.map((direction) => (
                    <option key={direction}>{direction}</option>
                  ))}
                </select>
              </label>
              <TextField
                label="Diện tích"
                suffix="m²"
                numeric
                value={unitForm.area_m2}
                onChange={(e) => setUnitForm({ ...unitForm, area_m2: e.target.value })}
                placeholder={
                  unitForm.apt_type && project
                    ? `theo loại (${catalog.typicalArea(project.id, buildingId || null, unitForm.apt_type) || '—'})`
                    : ''
                }
              />
              <TextField
                label="Giá riêng"
                suffix="triệu/m²"
                numeric
                value={unitForm.price_per_m2_override}
                onChange={(e) => setUnitForm({ ...unitForm, price_per_m2_override: e.target.value })}
              />
              <label className={labelClass}>
                Tình trạng
                <select
                  className={fieldClass}
                  value={unitForm.status}
                  onChange={(e) => setUnitForm({ ...unitForm, status: e.target.value })}
                >
                  <option value="available">Còn</option>
                  <option value="holding">Giữ chỗ</option>
                  <option value="sold">Đã bán</option>
                </select>
              </label>
              <div className="flex items-end gap-2">
                <Button disabled={saving || !buildingId} onClick={() => void saveUnit()}>
                  {unitEditing ? 'Lưu căn' : 'Thêm căn'}
                </Button>
                {unitEditing && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setUnitEditing('');
                      setUnitForm(emptyUnit);
                    }}
                  >
                    Huỷ
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-line bg-surface-100 p-4">
        <div>
          <h2 className="text-heading">Tìm căn và khách phù hợp</h2>
          <p className="text-caption text-ink-muted">
            Giá hiển thị gồm VAT + KPBT; thiếu giá hoặc diện tích không được tính là đạt lọc giá.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Tìm căn"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(50);
            }}
            placeholder="Mã căn, dự án, toà, ghi chú"
          />
          <label className={labelClass}>
            Tình trạng
            <select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Tất cả</option>
              <option value="available">Còn</option>
              <option value="holding">Giữ chỗ</option>
              <option value="sold">Đã bán</option>
            </select>
          </label>
          <label className={labelClass}>
            Dự án
            <select
              className={fieldClass}
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setBuildingId('');
              }}
            >
              <option value="">Tất cả</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Khách cần tìm căn phù hợp
            <select
              className={fieldClass}
              value={matchingCustomer}
              onChange={(e) => setMatchingCustomer(e.target.value)}
            >
              <option value="">Không chọn khách</option>
              {customers
                .filter((c) => c.owner_id === userId && !c.disqualified_at && !c.archived_at)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {matchingCustomer && (
          <TextField
            label="Giá tối đa riêng để ghép khách"
            suffix="triệu (đã gồm VAT + KPBT)"
            numeric
            value={matchingMaxPrice}
            onChange={(e) => setMatchingMaxPrice(e.target.value)}
            placeholder="Để trống nếu chưa xác định"
          />
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>
            Loại căn
            <input
              className={fieldClass}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              placeholder="VD: 2N hoặc 2N-2WC"
            />
          </label>
          <label className={labelClass}>
            Hướng
            <select className={fieldClass} value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)}>
              <option value="">Tất cả</option>
              {DIRECTIONS.map((direction) => (
                <option key={direction}>{direction}</option>
              ))}
            </select>
          </label>
          <div className="min-w-0 space-y-1">
            <p className={labelClass}>Tầng từ / đến</p>
            <div className="flex min-w-0 gap-2">
              <TextField
                className="min-w-0 flex-1"
                label="Tầng từ"
                suffix="tầng"
                numeric
                value={floorMin}
                onChange={(e) => setFloorMin(e.target.value)}
              />
              <TextField
                className="min-w-0 flex-1"
                label="Tầng đến"
                suffix="tầng"
                numeric
                value={floorMax}
                onChange={(e) => setFloorMax(e.target.value)}
              />
            </div>
          </div>
          <div className="min-w-0 space-y-1">
            <p className={labelClass}>Diện tích từ / đến</p>
            <div className="flex min-w-0 gap-2">
              <TextField
                className="min-w-0 flex-1"
                label="Diện tích từ"
                suffix="m²"
                numeric
                value={areaMin}
                onChange={(e) => setAreaMin(e.target.value)}
              />
              <TextField
                className="min-w-0 flex-1"
                label="Diện tích đến"
                suffix="m²"
                numeric
                value={areaMax}
                onChange={(e) => setAreaMax(e.target.value)}
              />
            </div>
          </div>
          <div className="min-w-0 space-y-1">
            <p className={labelClass}>Giá từ / đến (đã gồm thuế)</p>
            <div className="flex min-w-0 gap-2">
              <TextField
                className="min-w-0 flex-1"
                label="Giá từ"
                suffix="triệu"
                numeric
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
              />
              <TextField
                className="min-w-0 flex-1"
                label="Giá đến"
                suffix="triệu"
                numeric
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
              />
            </div>
          </div>
        </div>
        {matchingCustomer && customerForMatch && (
          <div className="rounded-md bg-surface-200 p-3 text-caption">
            Đang đối chiếu theo dự án và loại căn đã ghi cho {customerForMatch.full_name}. Vốn sẵn có không được xem là
            giá tối đa.
            <div className="mt-2 space-y-2">
              {customerUnits.slice(0, 50).map(({ unit, match }) => (
                <p key={unit.id}>
                  {catalog.project(unit.project_id)?.name} · {catalog.building(unit.building_id)?.code} · {unit.code} —{' '}
                  {match?.reasons.join(' · ')}
                  {match?.missing.length ? ` · Thiếu ${match.missing.join(', ')}` : ''}
                </p>
              ))}
            </div>
          </div>
        )}
        <p role="status" className="text-caption text-ink-muted">
          {visibleUnits.length} căn phù hợp bộ lọc{visibleUnits.length > limit ? ` · đang hiển thị ${limit}` : ''}
        </p>
        <div className="hidden lg:block">
          <DataTable
            caption="Danh sách căn"
            columns={unitColumns}
            rows={unitRows}
            density="compact"
            empty={<p className="m-0 p-6 text-center text-body text-ink-muted">Không có căn khớp bộ lọc.</p>}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
          {unitRows.map(({ unit, projectName, buildingCode, area, amount, matching }) => (
            <article key={unit.id} className="rounded-md border border-line bg-surface-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold">
                    {projectName} · {buildingCode} · {unit.code}
                  </h3>
                  <p className="mt-1 text-caption text-ink-muted">
                    {unit.apt_type || 'Chưa rõ loại'} · {area == null ? 'Chưa rõ diện tích' : `${area} m²`} ·{' '}
                    {unit.direction || 'Chưa rõ hướng'} · {unit.floor == null ? 'Chưa rõ tầng' : `Tầng ${unit.floor}`} ·{' '}
                    {catalog.statusLabel(unit.status)}
                  </p>
                </div>
                <span className="shrink-0 text-right text-numeric">{money(amount)}</span>
              </div>
              {matching && (
                <p className="mt-2 text-caption text-ion">
                  {matching.reasons.join(' · ')}
                  {matching.missing.length ? ` · Thiếu ${matching.missing.join(', ')}` : ''}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => editUnit(unit.id)}>
                  Sửa
                </Button>
                <Button variant="ghost" onClick={() => setUnitClient(unitClient === unit.id ? '' : unit.id)}>
                  Tìm khách phù hợp
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm(`Lưu trữ căn ${unit.code}? Dữ liệu vẫn được giữ.`))
                      void run(() => catalog.archiveUnit(unit.id), 'Đã lưu trữ căn');
                  }}
                >
                  Lưu trữ
                </Button>
              </div>
              {unitClient === unit.id && (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="text-caption">Khách đang hoạt động khớp dự án và loại căn: {customerHits.length}</p>
                  {customerHits.slice(0, 10).map(({ customer, match }) => (
                    <p key={customer.id} className="mt-1 text-caption">
                      <Link className="font-semibold text-ion underline" to={`/khach-hang/${customer.id}`}>
                        {customer.full_name}
                      </Link>{' '}
                      — {match.reasons.join(' · ')}
                      {match.missing.length ? ` · Thiếu ${match.missing.join(', ')}` : ''}
                    </p>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
        {visibleUnits.length > limit && (
          <Button variant="secondary" onClick={() => setLimit((n) => n + 50)}>
            Xem thêm {visibleUnits.length - limit} căn
          </Button>
        )}
      </section>
    </main>
  );
}

export const route: FeatureRoute = {
  path: '/gio-hang',
  element: <CatalogPage />,
  // Màn đã có tiêu đề riêng "Giỏ hàng" → không đặt title cho thanh đầu (tránh 2 h1).
  handle: { wide: true },
};
