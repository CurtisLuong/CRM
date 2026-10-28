import type { Customer } from '@/domain/customer';
import { fillGreeting } from '@/domain/followup';
import { compile, match, prepare } from '@/domain/search';

export type SendKitFile = { id: string; name: string; type: string; size: number; blob: Blob };
export type SendKitItem = {
  id: string;
  title: string;
  text: string;
  project: string | null;
  files: SendKitFile[];
  order: number;
  updatedAt: number;
};

export function normalizeProject(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

export function uniqueProjects(names: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const name of names) {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (clean && !byKey.has(normalizeProject(clean))) byKey.set(normalizeProject(clean), clean);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'vi'));
}

export function initiallySelected(item: SendKitItem, customerProjects: string[]): boolean {
  return (
    item.project === null ||
    customerProjects.some((name) => normalizeProject(name) === normalizeProject(item.project ?? ''))
  );
}

export function defaultProject(customerProjects: string[], items: SendKitItem[]): string | null {
  const seen = new Set<string>();
  const projects = customerProjects
    .map((name) => name.trim().replace(/\s+/g, ' '))
    .filter((name) => {
      const key = normalizeProject(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return (
    projects.find((project) =>
      items.some((item) => item.project && normalizeProject(item.project) === normalizeProject(project)),
    ) ??
    projects[0] ??
    null
  );
}

export function visibleItems(items: SendKitItem[], project: string | null): SendKitItem[] {
  if (project === null) return items;
  const key = normalizeProject(project);
  return items.filter((item) => item.project === null || (!!item.project && normalizeProject(item.project) === key));
}

export function filterItems(items: SendKitItem[], query: string): SendKitItem[] {
  const search = compile(query);
  if (!search.active) return items;
  return items.filter(
    (item) =>
      match(
        prepare([
          ['Tiêu đề', item.title],
          ['Nội dung', item.text],
          ['Tên tệp', item.files.map((file) => file.name).join(' ')],
        ]),
        search,
      ).match,
  );
}

export function selectFirstShownProject(
  items: SendKitItem[],
  selected: Set<string>,
  project: string | null,
  includeCommon = false,
): Set<string> {
  const next = new Set(selected);
  for (const item of items) {
    if (project === null || (item.project && normalizeProject(item.project) === normalizeProject(project)))
      next.add(item.id);
    else if (includeCommon && item.project === null) next.add(item.id);
  }
  return next;
}

export function sendKitText(items: SendKitItem[], selected: Set<string>, customer: Customer): string {
  return items
    .filter((item) => selected.has(item.id))
    .sort((a, b) => a.order - b.order)
    .map((item) => fillGreeting(item.text, customer).trim())
    .filter(Boolean)
    .join('\n\n');
}

export function selectedFiles(items: SendKitItem[], selected: Set<string>): SendKitFile[] {
  return items
    .filter((item) => selected.has(item.id))
    .sort((a, b) => a.order - b.order)
    .flatMap((item) => item.files);
}

export function totalFileSize(files: SendKitFile[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
