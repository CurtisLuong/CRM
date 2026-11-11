import { useEffect, useState } from 'react';
import { MoneyField } from '@/components/crm/money-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { directionValue } from '@/config/directions';
import { useRepositoryAccount } from '@/data/hooks';
import type { Customer } from '@/domain/customer';
import { factPatch } from '@/domain/customer/facts';
import { DirectionField } from '@/features/catalog/direction-field';
import { formatPricePerM2 } from '@/features/catalog/model';
import { moneyValue } from '@/ui/display';
import { Icon } from '@/ui/Icon';
import { useToast } from '@/ui/Toast';
import { fieldId, ProfileTextField } from './advanced';
import { LONG_FIELD, SHORT_FIELD } from './fields';
import { ChoiceField, hasFieldValue } from './info';
import {
  DEFAULT_PRICE_RATES,
  expectedPrice,
  formatVndShort,
  PRICE_ESTIMATE_MISSING,
  type PriceEstimate,
  type PriceRates,
} from './model';
import { UnitPicker } from './unit-picker';

export const PURPOSE_OPTIONS = ['Ở', 'Đầu tư', 'Cho tặng'].map((value) => ({ value, label: value }));

/** Dự án trong danh mục dùng chung; chỉ cần đúng phần hồ sơ đọc/ghi. */
export type ProjectRow = { id: string; name: string; archived_at?: string | null };

/** Phần catalog mà hồ sơ dùng: đọc cache, nghe thay đổi, thêm/lưu trữ mềm. */
export type ProjectCatalog = {
  projects: () => ProjectRow[];
  load: () => Promise<boolean>;
  onChange: (fn: () => void) => () => void;
  addProject: (name: string) => Promise<ProjectRow>;
  archiveProject: (id: string) => Promise<void>;
};

/** Các ô của "Nhu cầu hiện tại" (D-012: tên trường giữ nguyên như dữ liệu cũ). */
export const NEEDS_FIELDS = [
  'purpose',
  'apt_type',
  'projects',
  'apt_area',
  'building_code',
  'apt_code',
  'apt_direction',
  'apt_floor',
] as const;

export type NeedsField = (typeof NEEDS_FIELDS)[number];

const projectKey = (name: string) => name.trim().toLocaleLowerCase('vi');

/** Supabase trả lỗi dạng object { message, code } chứ không phải Error — vẫn phải hiện lý do server. */
function errorMessage(raw: unknown, fallback: string): string {
  if (raw instanceof Error) return raw.message;
  if (raw && typeof raw === 'object' && 'message' in raw) {
    const message = (raw as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

/**
 * Ô nhu cầu coi là trống khi null/undefined, chuỗi chỉ khoảng trắng, hoặc mảng không còn tên.
 * Số 0 là giá trị thật (khác hasFieldValue của Trí nhớ ở chỗ mảng toàn khoảng trắng).
 */
export function hasNeedValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => String(item ?? '').trim() !== '');
  return hasFieldValue(value);
}

/** Số ô còn trống và đang ẩn; ô vừa xoá trong phiên này vẫn hiện nên không tính. */
/** Số ô Nhu cầu đang ẩn sau "Mở rộng" — diện tích kế thừa Giỏ hàng tính là đã có. */
export function needsHiddenFor(customer: Customer, stayVisible: ReadonlySet<string>, estimate?: PriceEstimate): number {
  const visible = estimate?.areaSource === 'catalog' ? new Set([...stayVisible, 'apt_area']) : stayVisible;
  return needsHiddenCount(customer, visible);
}

export function needsHiddenCount(customer: Customer, stayVisible: ReadonlySet<string> = new Set()): number {
  return NEEDS_FIELDS.filter((key) => !stayVisible.has(key) && !hasNeedValue(customer[key])).length;
}

type PickerProps = {
  customer: Customer;
  writable: boolean;
  online: boolean;
  catalog: ProjectCatalog | null;
  onSave: (names: string[], message?: string) => Promise<boolean>;
  open: boolean;
  onToggle: () => void;
};

/**
 * Dự án quan tâm: chọn nhiều tên từ catalog đang hoạt động, không cho gõ dấu phẩy tự do.
 * Thêm/lưu trữ danh mục là thao tác server; lỗi server hiện nguyên nhân, không tạo dự án giả.
 */
function ProjectPicker({ customer, writable, online, catalog, onSave, open, onToggle }: PickerProps) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState('');

  const rawNames = Array.isArray(customer.projects) ? customer.projects : [];
  const selectedKeys = new Set(rawNames.map(projectKey));
  const active = new Map<string, ProjectRow>();
  for (const row of catalog?.projects() || []) {
    const name = String(row?.name ?? '').trim();
    if (!name || row?.archived_at) continue;
    const key = projectKey(name);
    if (!active.has(key)) active.set(key, { ...row, name });
  }
  const legacy = rawNames.filter((name) => !active.has(projectKey(name)));
  const canEdit = writable && !!catalog;

  const saveNames = async (names: string[], message?: string) => {
    if (!canEdit) return;
    await onSave(names, message);
  };

  const toggle = (row: ProjectRow, checked: boolean) => {
    const key = projectKey(row.name);
    if (checked) {
      if (selectedKeys.has(key)) return;
      void saveNames([...rawNames, row.name.trim()], 'Đã cập nhật dự án quan tâm');
    } else {
      void saveNames(
        rawNames.filter((name) => projectKey(name) !== key),
        'Đã cập nhật dự án quan tâm',
      );
    }
  };

  const add = async () => {
    const name = draft.trim();
    if (!name) {
      setError('Tên dự án không được để trống.');
      return;
    }
    if (!catalog || !canEdit || !online || saving) return;
    setSaving(true);
    setError('');
    try {
      // Chỉ báo thành công sau khi server nhận dự án; trùng tên do repository trả bản ghi cũ.
      const created = await catalog.addProject(name);
      const createdName = String(created?.name || name).trim() || name;
      const key = projectKey(createdName);
      if (selectedKeys.has(key)) {
        // Repository trả bản ghi cùng tên: không thêm bản sao, không ghi lại hồ sơ.
        toast({ title: 'Dự án đã có trong hồ sơ', description: createdName });
        setAdding(false);
        setDraft('');
        return;
      }
      if (await onSave([...rawNames, createdName], 'Đã thêm dự án')) {
        setAdding(false);
        setDraft('');
      }
    } catch (raw) {
      setError(errorMessage(raw, 'Không thêm được dự án.'));
    } finally {
      setSaving(false);
    }
  };

  const archive = async (row: ProjectRow) => {
    if (!catalog || !canEdit || !online || archiving) return;
    const ok = window.confirm(
      `Lưu trữ dự án “${row.name}”? Dự án sẽ ẩn khỏi danh mục dùng chung; hồ sơ cũ, toà và căn vẫn được giữ nguyên.`,
    );
    if (!ok) return;
    setArchiving(row.id);
    try {
      await catalog.archiveProject(row.id);
      toast({
        title: 'Đã lưu trữ dự án',
        description: 'Dự án ẩn khỏi danh mục dùng chung; hồ sơ khách đã chọn vẫn giữ nguyên.',
      });
    } catch (raw) {
      toast({
        title: 'Chưa lưu trữ được dự án',
        description: errorMessage(raw, 'Thử lại.'),
        tone: 'error',
      });
    } finally {
      setArchiving('');
    }
  };

  // Chỉ xem: chỉ hiện tên đã chọn, không có ô chọn/nút thêm/lưu trữ danh mục.
  if (!writable) {
    return (
      <div className="space-y-1">
        <p className="text-caption text-ink-muted">Dự án quan tâm</p>
        {rawNames.length ? (
          <ul className="space-y-1" aria-label="Dự án quan tâm">
            {rawNames.map((name) => (
              <li key={name} className="text-body [overflow-wrap:anywhere]">
                {name}
                {!active.has(projectKey(name)) && (
                  <span className="text-caption text-ink-muted"> (cũ/đã ngừng dùng)</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-hint">Chưa có dự án quan tâm.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        aria-label={`Dự án quan tâm: ${rawNames.length ? rawNames.join(', ') : 'Chưa có dự án quan tâm'}`}
        aria-expanded={open}
        aria-controls="profile-project-picker"
        onClick={onToggle}
        className="min-h-11 w-full min-w-0 max-w-full shrink justify-start rounded-sm border border-line bg-surface-100 px-3 text-left"
      >
        <span className="flex min-w-0 flex-col items-start gap-0.5 [overflow-wrap:anywhere]">
          <span className="text-caption text-ink-muted">Dự án quan tâm</span>
          <span className={`text-body ${rawNames.length ? 'text-ink' : 'text-ink-muted'}`}>
            {rawNames.length ? rawNames.join(', ') : 'Chưa có dự án quan tâm.'}
          </span>
        </span>
      </Button>
      {open && (
        <div id="profile-project-picker" className="space-y-2">
          {active.size > 0 && (
            <ul className="space-y-1" aria-label="Dự án trong danh mục">
              {[...active.values()].map((row) => {
                const key = projectKey(row.name);
                return (
                  <li key={row.id} className="flex min-h-11 items-center gap-2">
                    <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-body">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(key)}
                        disabled={!canEdit}
                        onChange={(event) => toggle(row, event.target.checked)}
                      />
                      <span className="min-w-0 [overflow-wrap:anywhere]">{row.name}</span>
                    </label>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Lưu trữ dự án ${row.name}`}
                        disabled={!online || !!archiving}
                        onClick={() => void archive(row)}
                      >
                        <Icon name="delete" size={20} />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {legacy.length > 0 && (
            <ul className="space-y-1" aria-label="Dự án cũ trong hồ sơ">
              {legacy.map((name) => (
                <li key={name} className="flex min-h-11 items-center gap-2">
                  <span className="min-w-0 flex-1 text-body [overflow-wrap:anywhere]">
                    {name} <span className="text-caption text-ink-muted">(cũ/đã ngừng dùng)</span>
                  </span>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      aria-label={`Bỏ chọn dự án ${name} (cũ/đã ngừng dùng)`}
                      onClick={() => void saveNames(rawNames.filter((item) => projectKey(item) !== projectKey(name)))}
                    >
                      Bỏ chọn
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!active.size && !legacy.length && <p className="text-hint">Chưa có dự án nào trong danh mục.</p>}
          {canEdit && !online && (
            <p className="text-caption text-ink-muted">
              Cần mạng để thêm hoặc lưu trữ dự án; vẫn chọn được dự án đã có trên máy.
            </p>
          )}
          {canEdit &&
            (adding ? (
              <div className="space-y-2 rounded-sm border border-dashed border-line bg-surface-200 p-3">
                <label className="block space-y-1 text-caption text-ink-muted">
                  Tên dự án mới
                  <input
                    aria-label="Tên dự án mới"
                    className="min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 text-body"
                    value={draft}
                    disabled={saving}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      if (error) setError('');
                    }}
                    placeholder="Ví dụ: NOXH Tràng Duệ"
                  />
                </label>
                {error && (
                  <p role="alert" className="text-caption text-alert-text">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" disabled={!online || saving} onClick={() => void add()}>
                    Thêm dự án
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setAdding(false);
                      setDraft('');
                      setError('');
                    }}
                  >
                    Huỷ
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="secondary" disabled={!online} onClick={() => setAdding(true)}>
                Thêm mới
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}

type NeedsProps = {
  customer: Customer;
  writable: boolean;
  busy: boolean;
  showEmpty: boolean;
  /** Ô đã có giá trị lúc mở hồ sơ / vừa bị xoá trắng: vẫn hiện tới khi mở khách khác. */
  stayVisible: ReadonlySet<string>;
  /** Không truyền = nút Mở rộng/Thu gọn do màn bên ngoài đặt (route để nút dưới Nâng cao, Curtis 08/11). */
  onToggleSupplement?: () => void;
  onSaveField: (key: keyof Customer, value: unknown) => void;
  onSaveProjects: (names: string[], message?: string) => Promise<boolean>;
  catalog: ProjectCatalog | null;
  online: boolean;
  projectsOpen: boolean;
  onToggleProjects: () => void;
  /** Giá ước tính (diện tích × giá/m² Giỏ hàng) — thay ô "Tài chính sẵn có" trùng với Vốn hiện có. */
  estimate?: PriceEstimate;
  /** VAT, KPBT, phí của căn để ô Giá căn ra Giá dự kiến (D-031). */
  rates?: PriceRates;
};

/**
 * Tab mặc định "Nhu cầu & căn". Ô trống ẩn sau "Bổ sung (n)"; ô vừa xoá vẫn hiện tới lần mở sau.
 * Ô ngắn dùng SHORT_FIELD (2 ô/hàng mobile, 3–4 cột desktop); dự án chiếm cả hàng.
 */
export function ProfileNeedsFields({
  customer,
  writable,
  busy,
  showEmpty,
  stayVisible,
  onToggleSupplement,
  onSaveField,
  onSaveProjects,
  catalog,
  online,
  projectsOpen,
  onToggleProjects,
  estimate,
  rates = DEFAULT_PRICE_RATES,
}: NeedsProps) {
  const account = useRepositoryAccount();
  const inventory = account?.catalog;
  const toast = useToast();
  const [, bumpCatalog] = useState(0);
  const [savingCode, setSavingCode] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [kept, setKept] = useState({ id: customer.id, keys: new Set<string>() });
  if (kept.id !== customer.id) setKept({ id: customer.id, keys: new Set() });
  useEffect(() => inventory?.onChange(() => bumpCatalog((revision) => revision + 1)), [inventory]);

  // Cùng thứ tự catalogRows của model: dự án đầu tiên trong projects có trong Giỏ hàng.
  const project =
    typeof inventory?.projectByName === 'function' && Array.isArray(customer.projects)
      ? customer.projects.map((name) => inventory.projectByName(name)).find((row) => !!row)
      : null;
  const building = project ? inventory?.buildingByCode(project.id, customer.building_code) : null;
  const disabledCode = !writable || busy || savingCode;

  const saveCode = async (key: 'building_code' | 'apt_code', code: string): Promise<boolean> => {
    if (!account || disabledCode) return false;
    // Thêm Giỏ hàng có thể chờ server; lấy lại khách local để không ghi đè ô vừa được sửa trong lúc chờ.
    const current = account.customers.getSnapshot?.().find((row) => row.id === customer.id) ?? customer;
    const values: Record<string, unknown> = {};
    if (code !== (current[key] ?? '')) values[key] = code || null;
    if (
      key === 'building_code' &&
      code.trim().toLocaleLowerCase('vi') !==
        String(current.building_code ?? '')
          .trim()
          .toLocaleLowerCase('vi') &&
      hasNeedValue(current.apt_code)
    ) {
      const nextBuilding = project && inventory?.buildingByCode(project.id, code);
      if (!nextBuilding || !inventory?.unitByCode(nextBuilding.id, current.apt_code)) values.apt_code = null;
    }
    const unit = key === 'apt_code' && building && inventory?.unitByCode(building.id, code);
    if (unit) {
      for (const [target, source] of [
        ['apt_direction', 'direction'],
        ['apt_floor', 'floor'],
        ['apt_type', 'apt_type'],
      ] as const) {
        if (!hasNeedValue(current[target]) && hasNeedValue(unit[source])) {
          values[target] = target === 'apt_direction' ? directionValue(unit[source]) : unit[source];
        }
      }
    }
    if (!Object.keys(values).length) return true;
    // Một patch cho mã và các ô phụ thuộc; giữ nguồn fact và mọi khoá lạ của metadata.
    let patch: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(values)) {
      patch = { ...patch, ...factPatch({ ...current, ...patch } as Customer, field, value) };
    }
    setSavingCode(true);
    try {
      await account.customers.update(customer.id, patch);
      setKept((prev) => ({ id: customer.id, keys: new Set([...prev.keys, ...Object.keys(values)]) }));
      toast({ title: 'Đã lưu', description: online ? 'Đang đồng bộ.' : 'Ngoại tuyến · chờ đồng bộ.' });
      return true;
    } catch (raw) {
      toast({ title: 'Chưa lưu được', description: errorMessage(raw, 'Thử lại.'), tone: 'error' });
      return false;
    } finally {
      setSavingCode(false);
    }
  };

  const addCode = async (key: 'building_code' | 'apt_code', code: string): Promise<boolean> => {
    if (!inventory || !project || disabledCode) return false;
    setCatalogError('');
    let failed = '';
    try {
      if (key === 'building_code') {
        if (!inventory.buildingByCode(project.id, code)) await inventory.saveBuilding({ project_id: project.id, code });
      } else if (building && !inventory.unitByCode(building.id, code)) {
        const details: Record<string, unknown> = {};
        for (const [target, source] of [
          ['direction', 'apt_direction'],
          ['floor', 'apt_floor'],
          ['apt_type', 'apt_type'],
          ['area_m2', 'apt_area'],
        ] as const) {
          if (hasNeedValue(customer[source])) {
            details[target] = target === 'direction' ? directionValue(customer.apt_direction) : customer[source];
          }
        }
        await inventory.saveUnit({ building_id: building.id, code, ...details });
      }
    } catch (raw) {
      failed = errorMessage(raw, 'Không thêm được vào Giỏ hàng.');
    }
    // Repository từ chối (mạng/quyền): mã vẫn được lưu local như khi nhập tay.
    const saved = await saveCode(key, code);
    if (failed) setCatalogError(failed);
    return saved && !failed;
  };

  const inheritedArea = estimate?.areaSource === 'catalog' ? estimate.area : undefined;
  const hidden = needsHiddenFor(customer, new Set([...stayVisible, ...kept.keys]), estimate);
  const visible = new Set([...stayVisible, ...kept.keys, ...(inheritedArea ? ['apt_area'] : [])]);

  const field = (key: NeedsField) => {
    switch (key) {
      case 'purpose':
        return (
          <ChoiceField
            label="Mục đích mua"
            value={customer.purpose}
            disabled={!writable || busy}
            options={PURPOSE_OPTIONS}
            onSave={(value) => onSaveField('purpose', value)}
          />
        );
      case 'apt_type':
        return (
          <ProfileTextField
            label="Loại căn"
            value={customer.apt_type}
            disabled={!writable}
            onSave={(value) => onSaveField('apt_type', value)}
          />
        );
      case 'apt_area':
        return (
          <ProfileTextField
            label="Diện tích (m²)"
            value={customer.apt_area}
            placeholder={inheritedArea?.toLocaleString('vi-VN')}
            hint={inheritedArea ? `${inheritedArea.toLocaleString('vi-VN')} m² · theo Giỏ hàng` : undefined}
            type="number"
            disabled={!writable}
            onSave={(value) => onSaveField('apt_area', value === '' ? null : Number(value))}
          />
        );
      case 'building_code':
        if (project && inventory && typeof inventory.buildingsOf === 'function') {
          return (
            <UnitPicker
              key={`${customer.id}:${project.id}:building`}
              label="Mã toà"
              kind="toà"
              value={customer.building_code}
              rows={inventory.buildingsOf(project.id).map((row) => ({ id: String(row.id), code: String(row.code) }))}
              disabled={disabledCode}
              onSelect={(code) => {
                setCatalogError('');
                return saveCode('building_code', code);
              }}
              onAdd={(code) => addCode('building_code', code)}
            />
          );
        }
        return (
          <ProfileTextField
            label="Mã toà"
            value={customer.building_code}
            disabled={!writable}
            hint="Chọn dự án quan tâm có trong Giỏ hàng để chọn toà/căn"
            onSave={(value) => onSaveField('building_code', value)}
          />
        );
      case 'apt_code':
        if (building && inventory && typeof inventory.unitsOf === 'function') {
          return (
            <UnitPicker
              key={`${customer.id}:${building.id}:unit`}
              label="Mã căn"
              kind="căn"
              value={customer.apt_code}
              rows={inventory
                .unitsOf(building.id)
                .map((row: { id: unknown; code: unknown }) => ({ id: String(row.id), code: String(row.code) }))}
              disabled={disabledCode}
              onSelect={(code) => {
                setCatalogError('');
                return saveCode('apt_code', code);
              }}
              onAdd={(code) => addCode('apt_code', code)}
            />
          );
        }
        return (
          <ProfileTextField
            label="Mã căn"
            value={customer.apt_code}
            disabled={!writable}
            onSave={(value) => onSaveField('apt_code', value)}
          />
        );
      case 'apt_direction':
        return (
          <DirectionField
            value={customer.apt_direction}
            disabled={!writable || busy}
            className="[&_label]:min-h-9"
            onChange={(value) => onSaveField('apt_direction', value || null)}
          />
        );
      case 'apt_floor':
        return (
          <ProfileTextField
            label="Tầng"
            value={customer.apt_floor}
            type="number"
            disabled={!writable}
            onSave={(value) => onSaveField('apt_floor', value === '' ? null : Number(value))}
          />
        );
      case 'projects':
        return (
          <ProjectPicker
            customer={customer}
            writable={writable}
            online={online}
            catalog={catalog}
            onSave={onSaveProjects}
            open={projectsOpen}
            onToggle={onToggleProjects}
          />
        );
    }
  };

  const isVisible = (key: NeedsField) => showEmpty || visible.has(key) || hasNeedValue(customer[key]);
  // Ô ngắn xếp trước để luôn đủ 2 ô/hàng ở 360px; dự án (tên dài) chiếm cả hàng cuối.
  const ordered = [...NEEDS_FIELDS.filter((key) => key !== 'projects'), 'projects' as const];

  return (
    <Card className="min-w-0 w-full max-w-full space-y-3 overflow-hidden p-4">
      <div className="flex flex-wrap gap-3">
        {ordered.filter(isVisible).flatMap((key) => [
          <div key={key} data-jump={key} className={key === 'projects' ? LONG_FIELD : SHORT_FIELD}>
            {field(key)}
          </div>,
          // Ngay sau Diện tích: ô Giá căn, trống thì điền sẵn giá ước tính; không tính vào "Bổ sung".
          ...(key === 'apt_area' && estimate
            ? [
                <div key="estimate" className={SHORT_FIELD}>
                  <PriceField
                    customer={customer}
                    estimate={estimate}
                    rates={rates}
                    disabled={!writable}
                    onSave={(value) => onSaveField('apt_price', value)}
                  />
                </div>,
              ]
            : []),
        ])}
      </div>
      {catalogError && (
        <p role="alert" className="text-caption text-alert-text [overflow-wrap:anywhere]">
          {catalogError}
        </p>
      )}
      {writable && onToggleSupplement && (hidden > 0 || showEmpty) && (
        <Button variant="secondary" className="w-full" aria-expanded={showEmpty} onClick={onToggleSupplement}>
          {showEmpty ? 'Thu gọn' : `Mở rộng (${hidden})`}
        </Button>
      )}
    </Card>
  );
}

/**
 * Ô "Giá căn" nhập theo triệu, ghi `apt_price` theo đồng. Chưa nhập thì điền sẵn giá ước tính (Curtis 06/11) nhưng
 * chỉ ghi khi người dùng sửa — mở hồ sơ không tự ghi, ước tính vẫn theo diện tích/Giỏ hàng.
 */
function PriceField({
  customer,
  estimate,
  rates,
  disabled,
  onSave,
}: {
  customer: Customer;
  estimate: PriceEstimate;
  rates: PriceRates;
  disabled: boolean;
  onSave: (value: number | null) => void;
}) {
  const label = 'Giá căn';
  const stored = customer.apt_price;
  const saved = moneyValue(stored);
  // Giá căn = Giá dự kiến: thuần (diện tích × đơn giá) + VAT + KPBT + phí (Curtis 06/11).
  const estimated = 'total' in estimate ? expectedPrice(estimate.total, rates) : null;
  // Ghi cũ dạng chữ (vd. "2 tỷ") không đọc được thành số → hiện ra, không coi là trống (D-012).
  const legacyText = saved == null && stored != null && String(stored).trim() !== '' ? String(stored) : null;
  const basis =
    'total' in estimate
      ? `${estimate.area.toLocaleString('vi-VN')} m² × ${formatPricePerM2(estimate.pricePerM2)} triệu/m² + VAT ${rates.vatRate.toLocaleString('vi-VN')}% + KPBT ${rates.kpbtRate.toLocaleString('vi-VN')}%${rates.fee > 0 ? ` + phí ${formatVndShort(rates.fee)}` : ''}`
      : PRICE_ESTIMATE_MISSING[estimate.missing];
  const hint =
    saved == null
      ? estimated != null
        ? `Ước tính · ${basis}`
        : basis
      : estimated != null && Math.abs(estimated - saved) >= 1_000_000
        ? `Ước tính ≈ ${formatVndShort(estimated)}`
        : undefined;
  return (
    <div className="space-y-1">
      {legacyText && <p className="text-ink-muted [overflow-wrap:anywhere]">Đang lưu: {legacyText}</p>}
      <MoneyField
        id={fieldId(label)}
        label={label}
        className="[&_label]:block [&_label]:min-h-9"
        value={saved ?? estimated}
        disabled={disabled}
        hint={hint}
        onCommit={onSave}
      />
    </div>
  );
}
