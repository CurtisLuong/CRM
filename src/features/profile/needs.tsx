import { useState } from 'react';
import type { Customer } from '@/domain/customer';
import { Button, IconButton, useToast } from '@/ui';
import { ProfileTextField } from './advanced';
import { LONG_FIELD, SHORT_FIELD } from './fields';
import { ChoiceField, hasFieldValue } from './info';

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
  'finance',
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
export function needsHiddenCount(customer: Customer, stayVisible: ReadonlySet<string> = new Set()): number {
  return NEEDS_FIELDS.filter((key) => !stayVisible.has(key) && !hasNeedValue(customer[key])).length;
}

type PickerProps = {
  customer: Customer;
  writable: boolean;
  online: boolean;
  catalog: ProjectCatalog | null;
  onSave: (names: string[], message?: string) => Promise<boolean>;
};

/**
 * Dự án quan tâm: chọn nhiều tên từ catalog đang hoạt động, không cho gõ dấu phẩy tự do.
 * Thêm/lưu trữ danh mục là thao tác server; lỗi server hiện nguyên nhân, không tạo dự án giả.
 */
function ProjectPicker({ customer, writable, online, catalog, onSave }: PickerProps) {
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
        <p className="text-small text-text-2">Dự án quan tâm</p>
        {rawNames.length ? (
          <ul className="space-y-1" aria-label="Dự án quan tâm">
            {rawNames.map((name) => (
              <li key={name} className="text-body [overflow-wrap:anywhere]">
                {name}
                {!active.has(projectKey(name)) && <span className="text-small text-text-3"> (cũ/đã ngừng dùng)</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-text-2">Chưa có dự án quan tâm.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-small text-text-2">Dự án quan tâm</p>
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
                  <IconButton
                    icon="delete"
                    variant="ghost"
                    label={`Lưu trữ dự án ${row.name}`}
                    disabled={!online || !!archiving}
                    onClick={() => void archive(row)}
                  />
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
                {name} <span className="text-small text-text-3">(cũ/đã ngừng dùng)</span>
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
      {!active.size && !legacy.length && <p className="text-body text-text-2">Chưa có dự án nào trong danh mục.</p>}
      {canEdit && !online && (
        <p className="text-small text-text-2">
          Cần mạng để thêm hoặc lưu trữ dự án; vẫn chọn được dự án đã có trên máy.
        </p>
      )}
      {canEdit &&
        (adding ? (
          <div className="space-y-2 rounded-control border border-dashed border-border-strong bg-surface-2 p-3">
            <label className="block space-y-1 text-small text-text-2">
              Tên dự án mới
              <input
                aria-label="Tên dự án mới"
                className="min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body"
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
              <p role="alert" className="text-small text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" loading={saving} disabled={!online} onClick={() => void add()}>
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
          <Button variant="secondary" icon="add" disabled={!online} onClick={() => setAdding(true)}>
            Thêm mới
          </Button>
        ))}
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
  onToggleSupplement: () => void;
  onSaveField: (key: keyof Customer, value: unknown) => void;
  onSaveProjects: (names: string[], message?: string) => Promise<boolean>;
  catalog: ProjectCatalog | null;
  online: boolean;
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
}: NeedsProps) {
  const hidden = needsHiddenCount(customer, stayVisible);

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
            type="number"
            disabled={!writable}
            onSave={(value) => onSaveField('apt_area', value === '' ? null : Number(value))}
          />
        );
      case 'finance':
        return (
          <ProfileTextField
            label="Tài chính sẵn có (VNĐ)"
            value={customer.finance}
            type="number"
            disabled={!writable}
            onSave={(value) => onSaveField('finance', value === '' ? null : Number(value))}
          />
        );
      case 'building_code':
        return (
          <ProfileTextField
            label="Mã toà"
            value={customer.building_code}
            disabled={!writable}
            onSave={(value) => onSaveField('building_code', value)}
          />
        );
      case 'apt_code':
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
          <ProfileTextField
            label="Hướng"
            value={customer.apt_direction}
            disabled={!writable}
            onSave={(value) => onSaveField('apt_direction', value)}
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
          />
        );
    }
  };

  const isVisible = (key: NeedsField) => showEmpty || stayVisible.has(key) || hasNeedValue(customer[key]);
  // Ô ngắn xếp trước để luôn đủ 2 ô/hàng ở 360px; dự án (tên dài) chiếm cả hàng cuối.
  const ordered = [...NEEDS_FIELDS.filter((key) => key !== 'projects'), 'projects' as const];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {ordered.filter(isVisible).map((key) => (
          <div key={key} className={key === 'projects' ? LONG_FIELD : SHORT_FIELD}>
            {field(key)}
          </div>
        ))}
      </div>
      {writable && hidden > 0 && (
        <Button variant="secondary" block aria-expanded={showEmpty} onClick={onToggleSupplement}>
          Bổ sung ({hidden})
        </Button>
      )}
    </div>
  );
}
