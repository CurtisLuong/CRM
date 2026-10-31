/** Dòng nhu cầu dùng thống nhất trên các thẻ khách. */
export type CustomerNeed = { aptType: string; project: string };

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

export function customerNeed(source: NeedSource): CustomerNeed {
  const open = Array.isArray(source.interests)
    ? source.interests.filter((interest): interest is Record<string, unknown> =>
        Boolean(interest && typeof interest === 'object' && (interest as Record<string, unknown>).status === 'open'),
      )
    : [];
  const aptTypes = unique([...values(source.apt_type), ...open.flatMap((interest) => values(interest.apt_type))]);
  const projects = unique([...values(source.projects), ...open.flatMap((interest) => values(interest.project))]);
  return {
    aptType: aptTypes.length > 1 ? `${aptTypes[0]} +${aptTypes.length - 1}` : (aptTypes[0] ?? 'Chưa rõ loại căn'),
    project: projects.length > 1 ? `${projects[0]} +${projects.length - 1}` : (projects[0] ?? 'Chưa rõ dự án'),
  };
}
