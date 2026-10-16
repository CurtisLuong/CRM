import type { RouteObject } from 'react-router';

/**
 * Mỗi tính năng khai báo route trong `src/features/<tên>/route.tsx`:
 *   export const route: FeatureRoute = { path: '/khach', element: <Customers /> };
 * Router tự gom (import.meta.glob) — không sửa file router chung (tasks.md §0 luật 3).
 */
export type FeatureRoute = RouteObject & { path: string };

export type RouteModule = { route?: FeatureRoute };

/** Gom route từ các module tính năng; sắp theo path để thứ tự ổn định; báo lỗi khi 2 tính năng trùng path. */
export function collectRoutes(modules: Record<string, RouteModule>): FeatureRoute[] {
  const seen = new Map<string, string>();
  const routes: FeatureRoute[] = [];
  for (const [file, mod] of Object.entries(modules)) {
    if (!mod.route) throw new Error(`${file} phải export const route`);
    const other = seen.get(mod.route.path);
    if (other) throw new Error(`Trùng route "${mod.route.path}": ${other} và ${file}`);
    seen.set(mod.route.path, file);
    routes.push(mod.route);
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path));
}
