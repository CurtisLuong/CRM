import type { Customer } from '@/domain/customer';
import { fillGreeting } from '@/domain/followup';

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
