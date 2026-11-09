import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast as notify } from 'sonner';
import type { FeatureRoute } from '@/app/routes';
import { type Column, DataTable, TextField } from '@/components/crm';
import { FormGrid, FormSection, FormSubsection, LONG_FIELD, SHORT_FIELD } from '@/components/crm/form-section';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { DIRECTIONS, directionValue } from '@/config/directions';
import { CARE_DONE_STAGES } from '@/config/stages';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { customersForUnit, match as matchCustomer, price as totalPrice } from '@/domain/matching/property';
import { displayDate } from '@/ui/display';
import { Icon } from '@/ui/Icon';
import { CatalogDrawer } from './CatalogDrawer';
import { DirectionField } from './direction-field';
import {
  catalogBuildings,
  catalogScopeCounts,
  downloadCatalogTemplate,
  formatPricePerM2,
  parseCatalogCsv,
  parseCatalogMatrix,
  parsePrice,
  projectSelection,
  unitMatchesQuery,
} from './model';

const fieldClass = 'h-11 w-full min-w-0 rounded-sm border border-input bg-surface-100 px-3 text-body text-ink';
const labelClass = 'flex min-w-0 flex-col gap-1.5 text-label text-ink-muted';
type ProjectForm = {
  name: string;
  typical_price_per_m2: string;
  fee: string;
  vat_rate: string;
  kpbt_rate: string;
  handover_date: string;
  title_after_months: string;
};
type ProjectTypeDraft = {
  key: string;
  id: string;
  name: string;
  area: string;
  savedName: string;
  savedArea: string;
  archived: boolean;
};
type BuildingForm = { code: string; approved_price_per_m2: string; fee: string; handover_date: string };
type UnitForm = {
  code: string;
  apt_type: string;
  floor: string;
  direction: string;
  area_m2: string;
  price_per_m2_override: string;
  fee: string;
  status: string;
};
const emptyProject: ProjectForm = {
  name: '',
  typical_price_per_m2: '',
  fee: '',
  vat_rate: '5',
  kpbt_rate: '2',
  handover_date: '',
  title_after_months: '1.5',
};
const emptyBuilding: BuildingForm = { code: '', approved_price_per_m2: '', fee: '', handover_date: '' };
const emptyUnit: UnitForm = {
  code: '',
  apt_type: '',
  floor: '',
  direction: '',
  area_m2: '',
  price_per_m2_override: '',
  fee: '',
  status: 'available',
};
const asPrice = (value: string) => parsePrice(value);
const asNumber = (value: string) => (value.trim() ? Number(value.replace(',', '.')) : null);
const money = (value: number | null) =>
  value == null ? 'Chưa đủ dữ liệu giá' : `${Math.round(value).toLocaleString('vi-VN')} ₫ gồm VAT + KPBT + phí`;

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
  const [projectTypeDrafts, setProjectTypeDrafts] = useState<ProjectTypeDraft[]>([]);
  const [projectOriginalName, setProjectOriginalName] = useState('');
  const [buildingQuery, setBuildingQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [buildingProjectId, setBuildingProjectId] = useState('');
  const [unitBuildingId, setUnitBuildingId] = useState('');
  const [buildingTypesOriginal, setBuildingTypesOriginal] = useState('');
  const [buildingForm, setBuildingForm] = useState<BuildingForm>(emptyBuilding);
  const [buildingEditing, setBuildingEditing] = useState('');
  const [drawer, setDrawer] = useState<'picker' | 'buildingPicker' | 'project' | 'building' | 'unit' | null>(null);
  const openDrawer = (next: NonNullable<typeof drawer>) => {
    setError('');
    setDrawer(next);
  };
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
  const allBuildings = projects.flatMap((row) =>
    (catalog?.buildingsOf(row.id) || []).map((item) => ({
      id: String(item.id),
      project_id: String(item.project_id),
      code: String(item.code),
    })),
  );
  const buildings = catalogBuildings(allBuildings, projectId);
  const scopeCounts = catalogScopeCounts(allBuildings, catalog?.units() || [], projectId, buildingId);
  const selectProject = (id: string) => {
    const next = projectSelection(id, buildingId, allBuildings);
    setProjectId(next.projectId);
    setBuildingId(next.buildingId);
    setLimit(50);
  };
  const selectBuilding = (id: string) => {
    const row = catalog?.building(id);
    if (row) setProjectId(row.project_id);
    setBuildingId(id);
    setLimit(50);
  };
  const project = projectId ? catalog?.project(projectId) : null;
  const building = buildingId ? catalog?.building(buildingId) : null;
  const unitProjectId = catalog?.building(unitBuildingId)?.project_id || projectId;
  const filterCount = [
    query.trim(),
    status,
    typeFilter.trim(),
    directionFilter,
    floorMin,
    floorMax,
    areaMin,
    areaMax,
    priceMin,
    priceMax,
    matchingCustomer,
    matchingCustomer && matchingMaxPrice,
  ].filter(Boolean).length;
  const clearFilters = () => {
    setQuery('');
    setStatus('');
    setTypeFilter('');
    setDirectionFilter('');
    setFloorMin('');
    setFloorMax('');
    setAreaMin('');
    setAreaMax('');
    setPriceMin('');
    setPriceMax('');
    setMatchingCustomer('');
    setMatchingMaxPrice('');
    setLimit(50);
  };
  const directionChoices = [
    ...new Set<string>([
      ...DIRECTIONS,
      ...(catalog?.units() || []).map((unit) => directionValue(unit.direction)).filter(Boolean),
    ]),
  ];
  const unitDraft = {
    project_id: unitProjectId,
    building_id: unitBuildingId,
    net_price_override: unitEditing ? catalog?.units().find((row) => row.id === unitEditing)?.net_price_override : null,
    apt_type: unitForm.apt_type,
    area_m2: asNumber(unitForm.area_m2),
    price_per_m2_override: asPrice(unitForm.price_per_m2_override),
    fee: asPrice(unitForm.fee),
  };
  const buildingDraft = {
    project_id: buildingProjectId,
    approved_price_per_m2: asPrice(buildingForm.approved_price_per_m2),
    fee: asPrice(buildingForm.fee),
    handover_date: buildingForm.handover_date || null,
  };
  const unitPriceHint =
    !unitForm.price_per_m2_override.trim() && catalog?.unitPriceSource(unitDraft)
      ? `Theo ${catalog.unitPriceSource(unitDraft)}: ${formatPricePerM2(catalog.unitPrice(unitDraft))} triệu/m²`
      : undefined;
  // Phí mỗi căn (LF-01): ô trống → theo toà → dự án, như giá.
  const unitFeeHint =
    !unitForm.fee.trim() && catalog?.unitFeeSource(unitDraft)
      ? `Theo ${catalog.unitFeeSource(unitDraft)}: ${formatPricePerM2(catalog.unitFee(unitDraft))} triệu`
      : undefined;
  const buildingFeeHint =
    !buildingForm.fee.trim() && catalog?.buildingFeeSource(buildingDraft)
      ? `Theo ${catalog.buildingFeeSource(buildingDraft)}: ${formatPricePerM2(catalog.buildingFee(buildingDraft))} triệu`
      : undefined;
  const unitAreaHint =
    !unitForm.area_m2.trim() && catalog?.unitAreaSource(unitDraft)
      ? `Theo ${catalog.unitAreaSource(unitDraft)}: ${catalog.unitArea(unitDraft)} m²`
      : undefined;
  const buildingPriceHint =
    !buildingForm.approved_price_per_m2.trim() && catalog?.buildingPriceSource(buildingDraft)
      ? `Theo ${catalog.buildingPriceSource(buildingDraft)}: ${formatPricePerM2(catalog.buildingPrice(buildingDraft))} triệu/m²`
      : undefined;
  const buildingHandoverHint =
    !buildingForm.handover_date && catalog?.buildingHandoverSource(buildingDraft)
      ? `Theo ${catalog.buildingHandoverSource(buildingDraft)}: ${displayDate(catalog.buildingHandover(buildingDraft))}`
      : undefined;
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
      if (directionFilter && directionValue(unit.direction) !== directionFilter) return false;
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
          .filter(
            (item) =>
              item.match &&
              (!projectId || item.unit.project_id === projectId) &&
              (!buildingId || item.unit.building_id === buildingId),
          )
      : [];
  const unitRows = visibleUnits.slice(0, limit).map((unit) => {
    const p = catalog?.project(unit.project_id);
    const b = catalog?.building(unit.building_id);
    const area = catalog?.unitArea(unit);
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
      matching,
    };
  });
  const unitColumns: Column<(typeof unitRows)[number]>[] = [
    { key: 'unit', label: 'Căn', render: ({ unit }) => <span className="font-semibold">{unit.code}</span> },
    { key: 'project', label: 'Dự án', render: (row) => row.projectName },
    { key: 'building', label: 'Toà', render: (row) => row.buildingCode },
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
    setProjectOriginalName(row.name || '');
    setProjectTypeDrafts(
      (catalog?.projectTypes(id) || []).map((type) => ({
        key: type.id,
        id: type.id,
        name: type.apt_type,
        area: type.typical_area_m2 == null ? '' : String(type.typical_area_m2),
        savedName: type.apt_type,
        savedArea: type.typical_area_m2 == null ? '' : String(type.typical_area_m2),
        archived: false,
      })),
    );
    openDrawer('project');
    setProjectForm({
      name: row.name || '',
      typical_price_per_m2: formatPricePerM2(row.typical_price_per_m2),
      fee: formatPricePerM2(row.fee),
      vat_rate: String(row.vat_rate ?? 5),
      kpbt_rate: String(row.kpbt_rate ?? 2),
      handover_date: row.handover_date || '',
      title_after_months: String(row.title_after_months ?? 1.5),
    });
  };
  const addProject = () => {
    setProjectEditing('');
    setProjectOriginalName('');
    setProjectForm(emptyProject);
    setProjectTypeDrafts([]);
    openDrawer('project');
  };
  const saveProject = async () => {
    if (!catalog) return;
    const oldName = projectOriginalName;
    const patch = {
      name: projectForm.name.trim(),
      typical_price_per_m2: asPrice(projectForm.typical_price_per_m2),
      fee: asPrice(projectForm.fee),
      vat_rate: asNumber(projectForm.vat_rate),
      kpbt_rate: asNumber(projectForm.kpbt_rate),
      handover_date: projectForm.handover_date || null,
      title_after_months: asNumber(projectForm.title_after_months),
    };
    if (!patch.name || projectTypeDrafts.some((row) => !row.archived && !row.name.trim())) {
      setError(!patch.name ? 'Cần nhập tên dự án.' : 'Cần nhập tên cho mỗi loại căn.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Tải lại trước khi thử lưu để tìm được dòng đã ghi thành công ở lần trước.
      if (!(await catalog.load())) throw new Error('Chưa tải lại được danh mục. Vui lòng thử lại khi có mạng.');
      let savedId = projectEditing;
      if (savedId) await catalog.updateProject(savedId, patch);
      else {
        const created = await catalog.addProject(patch.name, patch);
        savedId = created.id;
        setProjectEditing(savedId);
        setProjectId(savedId);
        setBuildingId('');
      }
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
      for (const row of projectTypeDrafts) {
        const persistedId =
          row.id ||
          (row.savedName ? catalog.projectTypes(savedId).find((item) => item.apt_type === row.savedName)?.id : '');
        if (!row.id && row.savedName && !persistedId)
          throw new Error(`Chưa đối chiếu được loại căn “${row.savedName}” đã ghi. Vui lòng tải lại rồi thử lại.`);
        if (row.archived) {
          if (persistedId) await catalog.archiveProjectType(persistedId);
          setProjectTypeDrafts((rows) => rows.filter((item) => item.key !== row.key));
        } else if (!persistedId || row.name.trim() !== row.savedName || row.area !== row.savedArea) {
          await catalog.saveProjectType({
            id: persistedId || null,
            project_id: savedId,
            apt_type: row.name.trim(),
            typical_area_m2: asNumber(row.area),
          });
          const saved = catalog.projectTypes(savedId).find((item) => item.apt_type === row.name.trim());
          setProjectTypeDrafts((rows) =>
            rows.map((item) =>
              item.key === row.key
                ? { ...item, id: saved?.id || persistedId, savedName: row.name.trim(), savedArea: row.area }
                : item,
            ),
          );
        }
      }
      if (!(await catalog.load()))
        throw new Error('Đã ghi thay đổi nhưng chưa tải lại được danh mục. Vui lòng thử lại khi có mạng.');
      notify.success(projectOriginalName ? 'Đã lưu dự án' : 'Đã thêm dự án');
      setProjectEditing('');
      setProjectForm(emptyProject);
      setDrawer(null);
      setRevision((value) => value + 1);
    } catch (raw) {
      setError(
        `Chưa lưu xong dự án. Một số thay đổi có thể đã được lưu. Dữ liệu đã nhập vẫn giữ để thử lại. ${raw instanceof Error ? raw.message : ''}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const editBuilding = (id: string) => {
    const row = catalog?.building(id);
    if (!row) return;
    setBuildingProjectId(row.project_id);
    prepareBuildingTypes(id, row.project_id);
    setBuildingEditing(id);
    openDrawer('building');
    setBuildingForm({
      code: row.code || '',
      approved_price_per_m2: formatPricePerM2(row.approved_price_per_m2),
      fee: formatPricePerM2(row.fee),
      handover_date: row.handover_date || '',
    });
  };
  const saveBuilding = () =>
    run(
      async () => {
        const form = {
          project_id: buildingProjectId,
          id: buildingEditing || undefined,
          code: buildingForm.code.trim(),
          approved_price_per_m2: asPrice(buildingForm.approved_price_per_m2),
          fee: asPrice(buildingForm.fee),
          handover_date: buildingForm.handover_date || null,
        };
        if (!form.project_id || !form.code) throw new Error('Chọn dự án và nhập mã toà.');
        await catalog?.saveBuilding(form);
        const savedId = buildingEditing || catalog?.buildingByCode(buildingProjectId, form.code)?.id || '';
        setBuildingEditing(savedId);
        if (JSON.stringify(buildingTypeDraft) !== buildingTypesOriginal) {
          await catalog?.setBuildingTypes(
            savedId,
            Object.entries(buildingTypeDraft)
              .filter(([, value]) => value.selected)
              .map(([apt_type, value]) => ({ apt_type, area_m2: asNumber(value.area) })),
          );
        }
        selectBuilding(savedId);
        setBuildingEditing('');
        setBuildingForm(emptyBuilding);
        setDrawer(null);
      },
      buildingEditing ? 'Đã lưu toà' : 'Đã thêm toà',
    );

  const prepareBuildingTypes = (id: string, parentId: string) => {
    if (!catalog) return;
    const own = id ? catalog.buildingTypeRows(id) : [];
    const defaults = catalog.projectTypes(parentId);
    const allowed = own.length ? own.map((row) => row.apt_type) : defaults.map((row) => row.apt_type);
    const draft = Object.fromEntries(
      defaults.map((row) => {
        const current = own.find((item) => item.apt_type === row.apt_type);
        return [
          row.apt_type,
          { selected: allowed.includes(row.apt_type), area: current?.area_m2 == null ? '' : String(current.area_m2) },
        ];
      }),
    );
    setBuildingTypeDraft(draft);
    setBuildingTypesOriginal(JSON.stringify(draft));
  };

  const editUnit = (id: string) => {
    const row = catalog?.units().find((unit) => unit.id === id);
    if (!row) return;
    setUnitBuildingId(row.building_id);
    setUnitEditing(id);
    openDrawer('unit');
    setUnitForm({
      code: row.code || '',
      apt_type: row.apt_type || '',
      floor: row.floor == null ? '' : String(row.floor),
      direction: row.direction || '',
      area_m2: row.area_m2 == null ? '' : String(row.area_m2),
      price_per_m2_override: formatPricePerM2(row.price_per_m2_override),
      fee: formatPricePerM2(row.fee),
      status: row.status || 'available',
    });
  };
  const saveUnit = () =>
    run(
      async () => {
        if (!unitBuildingId) throw new Error('Cần chọn toà cho căn.');
        const payload = {
          id: unitEditing || undefined,
          building_id: unitBuildingId,
          code: unitForm.code.trim(),
          apt_type: unitForm.apt_type.trim() || null,
          floor: asNumber(unitForm.floor),
          direction: unitForm.direction || null,
          area_m2: asNumber(unitForm.area_m2),
          price_per_m2_override: asPrice(unitForm.price_per_m2_override),
          fee: asPrice(unitForm.fee),
          status: unitForm.status,
        };
        await catalog?.saveUnit(payload);
        setUnitEditing('');
        setUnitForm(emptyUnit);
        setDrawer(null);
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
      {error && !drawer && (
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

      <section className="min-w-0 space-y-5 rounded-lg border border-line bg-surface-100 p-4">
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <section aria-label="Dự án" className="min-w-0 space-y-2">
            <h2 className="text-overline text-ink-muted">DỰ ÁN</h2>
            <div className="flex min-w-0 gap-2">
              <Button
                variant="secondary"
                className="h-auto min-h-11 min-w-0 flex-1 justify-between gap-2 whitespace-normal break-words text-left"
                aria-label={`Chọn dự án: ${project?.name || (projects.length ? 'Tất cả dự án' : 'Chưa có dự án')}`}
                onClick={() => openDrawer('picker')}
              >
                <span className="min-w-0">{project?.name || (projects.length ? 'Tất cả dự án' : 'Chưa có dự án')}</span>
                <span aria-hidden="true" className="shrink-0 text-ink-muted">
                  <Icon name="expand" size={16} />
                </span>
              </Button>
              <Button variant="secondary" aria-label="Thêm dự án" onClick={addProject}>
                + Thêm
              </Button>
            </div>
            <p className="text-caption text-ink-muted">
              {scopeCounts.buildings} toà · {catalogScopeCounts(allBuildings, catalog.units(), projectId).units} căn
            </p>
          </section>
          <section aria-label="Toà" className="min-w-0 space-y-2">
            <h2 className="text-overline text-ink-muted">TOÀ</h2>
            <div className="flex min-w-0 gap-2">
              <Button
                variant="secondary"
                className="h-auto min-h-11 min-w-0 flex-1 justify-between gap-2 whitespace-normal break-words text-left"
                aria-label={`Chọn toà: ${building?.code || 'Tất cả toà'}`}
                onClick={() => {
                  setBuildingQuery('');
                  openDrawer('buildingPicker');
                }}
              >
                <span className="min-w-0">{building?.code || 'Tất cả toà'}</span>
                <span aria-hidden="true" className="shrink-0 text-ink-muted">
                  <Icon name="expand" size={16} />
                </span>
              </Button>
              <Button
                variant="secondary"
                aria-label="Thêm toà"
                disabled={!projectId}
                onClick={() => {
                  setBuildingProjectId(projectId);
                  setBuildingEditing('');
                  setBuildingForm(emptyBuilding);
                  prepareBuildingTypes('', projectId);
                  openDrawer('building');
                }}
              >
                + Thêm
              </Button>
            </div>
            <p className="text-caption text-ink-muted">{scopeCounts.units} căn</p>
          </section>
        </div>
        <section aria-label="Căn" className="min-w-0 space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-overline text-ink-muted">CĂN</h2>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                aria-expanded={filtersOpen}
                aria-controls="catalog-unit-filters"
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                Tìm căn{filterCount ? ` (${filterCount})` : ''}
              </Button>
              <Button
                variant="secondary"
                aria-label="Thêm căn"
                disabled={!buildings.length}
                onClick={() => {
                  setUnitEditing('');
                  setUnitBuildingId(buildingId);
                  setUnitForm(emptyUnit);
                  openDrawer('unit');
                }}
              >
                + Thêm
              </Button>
            </div>
          </div>
          {filtersOpen && (
            <div id="catalog-unit-filters" className="min-w-0 space-y-3">
              <FormSection title="Tìm căn và khách phù hợp">
                <div className={LONG_FIELD}>
                  <p className="text-caption text-ink-muted">
                    Giá lọc là giá dự kiến (gồm VAT + KPBT + phí); thiếu giá hoặc diện tích không được tính là đạt lọc
                    giá.
                  </p>
                </div>
                <FormGrid className={LONG_FIELD}>
                  <TextField
                    className={LONG_FIELD}
                    label="Tìm căn"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setLimit(50);
                    }}
                    placeholder="Tìm căn…"
                    hint="Mã căn, dự án, toà, ghi chú"
                  />
                  <label className={`${SHORT_FIELD} ${labelClass}`}>
                    Tình trạng
                    <select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="">Tất cả</option>
                      <option value="available">Còn</option>
                      <option value="holding">Giữ chỗ</option>
                      <option value="sold">Đã bán</option>
                    </select>
                  </label>
                  <label className={`${SHORT_FIELD} ${labelClass}`}>
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
                </FormGrid>
                {matchingCustomer && (
                  <TextField
                    className={LONG_FIELD}
                    label="Giá tối đa riêng để ghép khách"
                    suffix="triệu (giá dự kiến)"
                    numeric
                    value={matchingMaxPrice}
                    onChange={(e) => setMatchingMaxPrice(e.target.value)}
                    placeholder="Để trống nếu chưa xác định"
                  />
                )}
                <FormGrid className={LONG_FIELD}>
                  <label className={`${SHORT_FIELD} ${labelClass}`}>
                    Loại căn
                    <input
                      className={fieldClass}
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      placeholder="VD: 2N hoặc 2N-2WC"
                    />
                  </label>
                  <label className={`${SHORT_FIELD} ${labelClass}`}>
                    Hướng
                    <select
                      className={fieldClass}
                      value={directionFilter}
                      onChange={(e) => setDirectionFilter(e.target.value)}
                    >
                      <option value="">Tất cả</option>
                      {directionChoices.map((direction) => (
                        <option key={direction}>{direction}</option>
                      ))}
                    </select>
                  </label>
                </FormGrid>
                <FormGrid className={LONG_FIELD}>
                  <FormSubsection title="Tầng từ / đến" className="min-w-0 basis-full lg:flex-1 lg:basis-0">
                    <TextField
                      className="min-w-0 flex-1 basis-[calc(50%_-_0.375rem)]"
                      label="Tầng từ"
                      suffix="tầng"
                      numeric
                      value={floorMin}
                      onChange={(e) => setFloorMin(e.target.value)}
                    />
                    <TextField
                      className="min-w-0 flex-1 basis-[calc(50%_-_0.375rem)]"
                      label="Tầng đến"
                      suffix="tầng"
                      numeric
                      value={floorMax}
                      onChange={(e) => setFloorMax(e.target.value)}
                    />
                  </FormSubsection>
                  <FormSubsection title="Diện tích từ / đến" className="min-w-0 basis-full lg:flex-1 lg:basis-0">
                    <TextField
                      className="min-w-0 flex-1 basis-[calc(50%_-_0.375rem)]"
                      label="Diện tích từ"
                      suffix="m²"
                      numeric
                      value={areaMin}
                      onChange={(e) => setAreaMin(e.target.value)}
                    />
                    <TextField
                      className="min-w-0 flex-1 basis-[calc(50%_-_0.375rem)]"
                      label="Diện tích đến"
                      suffix="m²"
                      numeric
                      value={areaMax}
                      onChange={(e) => setAreaMax(e.target.value)}
                    />
                  </FormSubsection>
                  <FormSubsection
                    title="Giá từ / đến (đã gồm thuế)"
                    className="min-w-0 basis-full lg:flex-1 lg:basis-0"
                  >
                    <TextField
                      className="min-w-0 flex-1 basis-[calc(50%_-_0.375rem)]"
                      label="Giá từ"
                      suffix="triệu"
                      numeric
                      value={priceMin}
                      onChange={(e) => setPriceMin(e.target.value)}
                    />
                    <TextField
                      className="min-w-0 flex-1 basis-[calc(50%_-_0.375rem)]"
                      label="Giá đến"
                      suffix="triệu"
                      numeric
                      value={priceMax}
                      onChange={(e) => setPriceMax(e.target.value)}
                    />
                  </FormSubsection>
                </FormGrid>
                <div className={`${LONG_FIELD} flex flex-wrap gap-2`}>
                  <Button variant="secondary" onClick={clearFilters}>
                    Xoá lọc
                  </Button>
                  <Button variant="ghost" onClick={() => setFiltersOpen(false)}>
                    Thu gọn
                  </Button>
                </div>
              </FormSection>
            </div>
          )}
          {matchingCustomer && customerForMatch && (
            <div className="rounded-md bg-surface-200 p-3 text-caption">
              Đang đối chiếu theo dự án và loại căn đã ghi cho {customerForMatch.full_name}. Vốn sẵn có không được xem
              là giá tối đa.
              <div className="mt-2 space-y-2">
                {customerUnits.slice(0, 50).map(({ unit, match }) => (
                  <p key={unit.id}>
                    {catalog.project(unit.project_id)?.name} · {catalog.building(unit.building_id)?.code} · {unit.code}{' '}
                    — {match?.reasons.join(' · ')}
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
            {unitRows.map(({ unit, projectName, buildingCode, area, matching }) => (
              <article key={unit.id} className="rounded-md border border-line bg-surface-100 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold">
                      {projectName} · {buildingCode} · {unit.code}
                    </h3>
                    <p className="mt-1 text-caption text-ink-muted">
                      {area == null ? 'Chưa rõ diện tích' : `${area} m²`} ·{' '}
                      {directionValue(unit.direction) || 'Chưa rõ hướng'} ·{' '}
                      {unit.floor == null ? 'Chưa rõ tầng' : `Tầng ${unit.floor}`} · {catalog.statusLabel(unit.status)}
                    </p>
                  </div>
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
      </section>

      {/* Khung app hiện dùng toast cũ; màn này cần nơi hiển thị Sonner. */}
      <Toaster closeButton={false} offset={80} mobileOffset={80} />
      <CatalogDrawer
        open={drawer !== null}
        onClose={() => {
          if (!saving) {
            setDrawer(null);
            setError('');
          }
        }}
        title={
          drawer === 'picker'
            ? 'Chọn dự án'
            : drawer === 'buildingPicker'
              ? 'Chọn toà'
              : drawer === 'project'
                ? projectOriginalName
                  ? `Sửa dự án ${projectOriginalName}`
                  : 'Thêm dự án'
                : drawer === 'building'
                  ? buildingEditing
                    ? `Sửa toà ${catalog.building(buildingEditing)?.code || buildingForm.code}`
                    : 'Thêm toà'
                  : unitEditing
                    ? `Sửa căn ${unitForm.code}`
                    : 'Thêm căn'
        }
        error={error}
        saving={saving}
        saveLabel={drawer === 'project' ? 'Lưu dự án' : drawer === 'building' ? 'Lưu toà' : 'Lưu căn'}
        onSave={
          drawer === 'picker' || drawer === 'buildingPicker'
            ? undefined
            : () => {
                if (drawer === 'project') void saveProject();
                else if (drawer === 'building') void saveBuilding();
                else if (drawer === 'unit') void saveUnit();
              }
        }
      >
        {drawer === 'picker' && (
          <div className="space-y-2">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                selectProject('');
                setDrawer(null);
              }}
            >
              Tất cả dự án
            </Button>
            {projects.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
                <button
                  type="button"
                  aria-label={p.name}
                  className="min-h-11 min-w-0 flex-1 break-words text-left text-body text-ink"
                  onClick={() => {
                    selectProject(p.id);
                    setDrawer(null);
                  }}
                >
                  <span className="block">{p.name}</span>
                  <span className="block text-caption text-ink-muted">
                    {catalog.buildingsOf(p.id).length} toà · {catalog.unitsOfProject(p.id).length} căn
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Sửa dự án ${p.name}`}
                  className="min-h-11 px-2 text-caption text-ion"
                  onClick={() => editProject(p.id)}
                >
                  Sửa
                </button>
                <button
                  type="button"
                  aria-label={`Lưu trữ dự án ${p.name}`}
                  className="min-h-11 px-2 text-caption text-alert-text"
                  onClick={() => {
                    if (window.confirm(`Lưu trữ dự án “${p.name}”? Toà và căn vẫn được giữ nguyên.`)) {
                      void run(async () => {
                        await catalog.archiveProject(p.id);
                        if (projectId === p.id) {
                          setProjectId('');
                          setBuildingId('');
                        }
                      }, 'Đã lưu trữ dự án');
                    }
                  }}
                >
                  Lưu trữ
                </button>
              </div>
            ))}
            <Button variant="secondary" className="w-full" onClick={addProject}>
              + Thêm dự án
            </Button>
          </div>
        )}
        {drawer === 'buildingPicker' && (
          <div className="min-w-0 space-y-3">
            <TextField
              label="Tìm mã toà"
              placeholder="Tìm mã toà…"
              value={buildingQuery}
              onChange={(e) => setBuildingQuery(e.target.value)}
            />
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                selectBuilding('');
                setDrawer(null);
              }}
            >
              Tất cả toà
            </Button>
            {projects
              .filter((p) => !projectId || p.id === projectId)
              .map((p) => {
                const rows = buildings.filter(
                  (row) => row.project_id === p.id && unitMatchesQuery([['toà', row.code]], buildingQuery),
                );
                if (!rows.length) return null;
                return (
                  <section key={p.id} aria-label={p.name} className="space-y-2">
                    {!projectId && <h3 className="text-section-head text-ink-muted">{p.name}</h3>}
                    {rows.map((row) => (
                      <div key={row.id} className="flex min-w-0 items-center gap-2 rounded-md border border-line p-2">
                        <button
                          type="button"
                          aria-label={`Chọn toà ${row.code}`}
                          className="min-h-11 min-w-0 flex-1 break-words text-left"
                          onClick={() => {
                            selectBuilding(row.id);
                            setDrawer(null);
                          }}
                        >
                          <span className="block text-body">{row.code}</span>
                          <span className="block text-caption text-ink-muted">
                            {catalog.unitsOf(row.id).length} căn
                          </span>
                        </button>
                        <Button
                          variant="ghost"
                          aria-label={`Sửa toà ${row.code}`}
                          className="px-2"
                          onClick={() => editBuilding(row.id)}
                        >
                          Sửa
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label={`Lưu trữ toà ${row.code}`}
                          className="px-2 text-alert-text"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Lưu trữ toà ${row.code}? ${catalog.unitsOf(row.id).length} căn vẫn được giữ nguyên.`,
                              )
                            )
                              void run(async () => {
                                await catalog.archiveBuilding(row.id);
                                if (buildingId === row.id) setBuildingId('');
                              }, 'Đã lưu trữ toà');
                          }}
                        >
                          Lưu trữ
                        </Button>
                      </div>
                    ))}
                  </section>
                );
              })}
            {!buildings.some((row) => unitMatchesQuery([['toà', row.code]], buildingQuery)) && (
              <p className="text-caption text-ink-muted">Không có toà phù hợp.</p>
            )}
          </div>
        )}
        {drawer === 'project' && (
          <>
            <FormSection title="Thông tin dự án">
              <label className={`${LONG_FIELD} ${labelClass}`}>
                Tên dự án
                <input
                  className={fieldClass}
                  value={projectForm.name}
                  onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                />
              </label>
              <TextField
                className={SHORT_FIELD}
                label="Giá dự án"
                suffix="triệu/m²"
                numeric
                value={projectForm.typical_price_per_m2}
                onChange={(e) => setProjectForm({ ...projectForm, typical_price_per_m2: e.target.value })}
              />
              <TextField
                className={SHORT_FIELD}
                label="Phí mỗi căn"
                hint="Cộng vào giá dự kiến, đóng đợt 1. Toà/căn nhập riêng thì ghi đè."
                suffix="triệu"
                numeric
                value={projectForm.fee}
                onChange={(e) => setProjectForm({ ...projectForm, fee: e.target.value })}
              />
              <label className={`${SHORT_FIELD} ${labelClass}`}>
                Bàn giao dự kiến
                <input
                  type="date"
                  className={fieldClass}
                  value={projectForm.handover_date}
                  onChange={(e) => setProjectForm({ ...projectForm, handover_date: e.target.value })}
                />
              </label>
              <TextField
                className={SHORT_FIELD}
                label="VAT"
                suffix="%"
                numeric
                value={projectForm.vat_rate}
                onChange={(e) => setProjectForm({ ...projectForm, vat_rate: e.target.value })}
              />
              <TextField
                className={SHORT_FIELD}
                label="KPBT"
                suffix="%"
                numeric
                value={projectForm.kpbt_rate}
                onChange={(e) => setProjectForm({ ...projectForm, kpbt_rate: e.target.value })}
              />
              <TextField
                className={SHORT_FIELD}
                label="Nhận sổ sau bàn giao"
                suffix="tháng"
                numeric
                value={projectForm.title_after_months}
                onChange={(e) => setProjectForm({ ...projectForm, title_after_months: e.target.value })}
              />
            </FormSection>
            <FormSection title="Loại căn của dự án">
              {projectTypeDrafts.map((row, index) => (
                <FormSubsection
                  key={row.key}
                  title={row.archived ? `${row.name} · Sẽ lưu trữ` : `Loại căn ${index + 1}`}
                  className={LONG_FIELD}
                >
                  <TextField
                    className={SHORT_FIELD}
                    label="Tên loại"
                    aria-label={`Tên loại căn ${index + 1}`}
                    value={row.name}
                    disabled={row.archived || saving}
                    onChange={(e) =>
                      setProjectTypeDrafts((rows) =>
                        rows.map((item) => (item.key === row.key ? { ...item, name: e.target.value } : item)),
                      )
                    }
                  />
                  <TextField
                    className={SHORT_FIELD}
                    label="Diện tích"
                    aria-label={`Diện tích điển hình ${index + 1}`}
                    suffix="m²"
                    numeric
                    value={row.area}
                    disabled={row.archived || saving}
                    onChange={(e) =>
                      setProjectTypeDrafts((rows) =>
                        rows.map((item) => (item.key === row.key ? { ...item, area: e.target.value } : item)),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    disabled={saving}
                    onClick={() => {
                      if (
                        row.archived ||
                        !row.id ||
                        window.confirm(`Lưu trữ loại căn “${row.name}”? Dữ liệu cũ vẫn được giữ.`)
                      )
                        setProjectTypeDrafts((rows) =>
                          rows.map((item) => (item.key === row.key ? { ...item, archived: !item.archived } : item)),
                        );
                    }}
                  >
                    {row.archived ? 'Hoàn tác' : 'Lưu trữ'}
                  </Button>
                </FormSubsection>
              ))}
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() =>
                  setProjectTypeDrafts((rows) => [
                    ...rows,
                    {
                      key: crypto.randomUUID(),
                      id: '',
                      name: '',
                      area: '',
                      savedName: '',
                      savedArea: '',
                      archived: false,
                    },
                  ])
                }
              >
                + Thêm loại
              </Button>
            </FormSection>
          </>
        )}
        {drawer === 'building' && (
          <>
            <FormSection title="Thông tin toà">
              <label className={`${SHORT_FIELD} ${labelClass}`}>
                Mã toà
                <input
                  className={fieldClass}
                  value={buildingForm.code}
                  onChange={(e) => setBuildingForm({ ...buildingForm, code: e.target.value })}
                />
              </label>
              <TextField
                className={SHORT_FIELD}
                label="Giá duyệt toà"
                hint={buildingPriceHint}
                placeholder={buildingPriceHint}
                suffix="triệu/m²"
                numeric
                value={buildingForm.approved_price_per_m2}
                onChange={(e) => setBuildingForm({ ...buildingForm, approved_price_per_m2: e.target.value })}
              />
              <TextField
                className={SHORT_FIELD}
                label="Phí mỗi căn của toà"
                hint={buildingFeeHint}
                placeholder={buildingFeeHint}
                suffix="triệu"
                numeric
                value={buildingForm.fee}
                onChange={(e) => setBuildingForm({ ...buildingForm, fee: e.target.value })}
              />
              <label className={`${SHORT_FIELD} ${labelClass}`}>
                Bàn giao riêng của toà
                <input
                  type="date"
                  className={fieldClass}
                  aria-describedby="building-handover-hint"
                  value={buildingForm.handover_date}
                  onChange={(e) => setBuildingForm({ ...buildingForm, handover_date: e.target.value })}
                />
              </label>
              <p id="building-handover-hint" className={`${LONG_FIELD} text-caption text-ink-muted`}>
                {buildingHandoverHint}
              </p>
            </FormSection>
            <FormSection title="Loại căn được dùng ở toà">
              {catalog.projectTypes(buildingProjectId).map((type) => {
                const value = buildingTypeDraft[type.apt_type] || { selected: false, area: '' };
                return (
                  <FormSubsection key={type.id} title={type.apt_type} className={LONG_FIELD}>
                    <label className={`${SHORT_FIELD} flex min-h-11 items-center gap-2 text-caption`}>
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
                      className={SHORT_FIELD}
                      label={`Diện tích riêng ${type.apt_type}`}
                      suffix="m²"
                      numeric
                      value={value.area}
                      onChange={(e) =>
                        setBuildingTypeDraft({
                          ...buildingTypeDraft,
                          [type.apt_type]: { ...value, area: e.target.value },
                        })
                      }
                      placeholder={String(catalog.typicalArea(buildingProjectId, null, type.apt_type) ?? '')}
                      hint={
                        !value.area.trim() && catalog.typicalArea(buildingProjectId, null, type.apt_type) != null
                          ? `Theo dự án: ${catalog.typicalArea(buildingProjectId, null, type.apt_type)} m²`
                          : undefined
                      }
                    />
                    <span className={`${LONG_FIELD} text-caption text-ink-muted`}>
                      {value.selected ? 'Được dùng' : 'Không chọn'}
                    </span>
                  </FormSubsection>
                );
              })}
            </FormSection>
          </>
        )}
        {drawer === 'unit' && (
          <FormSection title="Thông tin căn">
            {!unitEditing && !buildingId && (
              <label className={`${LONG_FIELD} ${labelClass}`}>
                Toà của căn
                <select
                  className={fieldClass}
                  required
                  aria-label="Toà của căn"
                  value={unitBuildingId}
                  onChange={(e) => setUnitBuildingId(e.target.value)}
                >
                  <option value="">Chọn toà</option>
                  {projects
                    .filter((p) => !projectId || p.id === projectId)
                    .map((p) => (
                      <optgroup key={p.id} label={p.name}>
                        {buildings
                          .filter((row) => row.project_id === p.id)
                          .map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.code}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                </select>
              </label>
            )}

            <label className={`${SHORT_FIELD} ${labelClass}`}>
              Mã căn
              <input
                className={fieldClass}
                value={unitForm.code}
                onChange={(e) => setUnitForm({ ...unitForm, code: e.target.value })}
              />
            </label>
            <label className={`${SHORT_FIELD} ${labelClass}`}>
              Loại căn
              <input
                className={fieldClass}
                list="catalog-types"
                value={unitForm.apt_type}
                onChange={(e) => setUnitForm({ ...unitForm, apt_type: e.target.value })}
              />
              <datalist id="catalog-types">
                {unitProjectId &&
                  catalog.projectTypes(unitProjectId).map((type) => <option key={type.id} value={type.apt_type} />)}
              </datalist>
            </label>
            <TextField
              className={SHORT_FIELD}
              label="Tầng"
              suffix="tầng"
              numeric
              value={unitForm.floor}
              onChange={(e) => setUnitForm({ ...unitForm, floor: e.target.value })}
            />
            <DirectionField
              className={SHORT_FIELD}
              value={unitForm.direction}
              disabled={saving}
              onChange={(direction) => setUnitForm({ ...unitForm, direction })}
            />
            <TextField
              className={SHORT_FIELD}
              label="Diện tích"
              suffix="m²"
              numeric
              value={unitForm.area_m2}
              onChange={(e) => setUnitForm({ ...unitForm, area_m2: e.target.value })}
              hint={unitAreaHint}
              placeholder={unitAreaHint}
            />
            <TextField
              className={SHORT_FIELD}
              label="Giá riêng"
              hint={unitPriceHint}
              placeholder={unitPriceHint}
              suffix="triệu/m²"
              numeric
              value={unitForm.price_per_m2_override}
              onChange={(e) => setUnitForm({ ...unitForm, price_per_m2_override: e.target.value })}
            />
            <TextField
              className={SHORT_FIELD}
              label="Phí riêng"
              hint={unitFeeHint}
              placeholder={unitFeeHint}
              suffix="triệu"
              numeric
              value={unitForm.fee}
              onChange={(e) => setUnitForm({ ...unitForm, fee: e.target.value })}
            />
            <label className={`${SHORT_FIELD} ${labelClass}`}>
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
            <p className={`${LONG_FIELD} text-caption text-ink-muted`}>
              Giá dự kiến: {money(totalPrice(unitDraft, catalog))}
            </p>
          </FormSection>
        )}
      </CatalogDrawer>
    </main>
  );
}

export const route: FeatureRoute = {
  path: '/gio-hang',
  element: <CatalogPage />,
  // Màn đã có tiêu đề riêng "Giỏ hàng" → không đặt title cho thanh đầu (tránh 2 h1).
  handle: { wide: true },
};
