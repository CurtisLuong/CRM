import { APT_TYPES } from '@/config/aptTypes';
import { PROJECT_SHORT_NAMES, PROJECT_SHORT_PHRASES } from '@/config/projectShort';
import { canonicalAptType } from '@/domain/customer/aptType';

/** Dòng nhu cầu dùng thống nhất trên các thẻ khách. */
export type CustomerNeed = { aptType: string; project: string; title?: string };

type NeedSource = {
  apt_type?: unknown;
  projects?: unknown;
  interests?: unknown;
};

function values(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : [];
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      for (const key of ['name', 'label', 'text']) {
        if (typeof record[key] === 'string' && record[key].trim()) return [record[key].trim()];
      }
    }
    return [];
  });
}

function unique(items: string[]) {
  return [...new Set(items)];
}

function norm(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
}

function shortProject(value: string) {
  const spaced = value.trim().replace(/\s+/g, ' ');
  const key = Object.keys(PROJECT_SHORT_NAMES).find((name) => norm(name) === norm(spaced));
  if (key && PROJECT_SHORT_NAMES[key]) return PROJECT_SHORT_NAMES[key];
  return PROJECT_SHORT_PHRASES.reduce<string>(
    (result, [phrase, replacement]) => result.replace(new RegExp(phrase, 'ig'), replacement),
    spaced,
  );
}

function firstAndCount(items: string[], fallback: string) {
  return items.length > 1 ? `${items[0]} +${items.length - 1}` : (items[0] ?? fallback);
}

export function customerNeed(source: NeedSource): CustomerNeed {
  const open = Array.isArray(source.interests)
    ? source.interests.filter((interest): interest is Record<string, unknown> =>
        Boolean(interest && typeof interest === 'object' && (interest as Record<string, unknown>).status === 'open'),
      )
    : [];
  const rawAptTypes = unique([...values(source.apt_type), ...open.flatMap((interest) => values(interest.apt_type))]);
  const aptTypes = unique(
    rawAptTypes.map((aptType) => {
      const isCode = /^\dN.*WC(?:-G)?$/i.test(aptType) || APT_TYPES.some((type) => norm(type) === norm(aptType));
      return isCode ? aptType : canonicalAptType(aptType);
    }),
  );
  const rawProjects = unique([...values(source.projects), ...open.flatMap((interest) => values(interest.project))]);
  const projects = unique(rawProjects.map(shortProject));
  const result: CustomerNeed = {
    aptType: firstAndCount(aptTypes, 'Chưa rõ loại căn'),
    project: firstAndCount(projects, 'Chưa rõ dự án'),
  };
  // Metadata của thẻ không làm đổi hợp đồng cũ của hàm hay dữ liệu serialize.
  Object.defineProperty(result, 'title', {
    value: `${rawAptTypes.length ? rawAptTypes.join(' · ') : 'Chưa rõ loại căn'} · ${rawProjects.length ? rawProjects.join(' · ') : 'Chưa rõ dự án'}`,
    enumerable: false,
  });
  return result;
}
