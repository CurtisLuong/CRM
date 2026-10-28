import { createBrowserRouter } from 'react-router';
import { RootLayout } from './layout';
import { NotFound } from './NotFound';
import { collectRoutes, type RouteModule } from './routes';

const modules = import.meta.glob<RouteModule>('../features/*/route.tsx', { eager: true });

export const featureRoutes = collectRoutes(modules);

/** Route `handle: { bare: true }` tự vẽ khung (AppShell mới, D-028) → không lồng trong khung cũ RootLayout. */
const isBare = (r: (typeof featureRoutes)[number]) => (r.handle as { bare?: boolean } | undefined)?.bare === true;

export const router = createBrowserRouter([
  ...featureRoutes.filter(isBare),
  {
    element: <RootLayout />,
    children: [...featureRoutes.filter((r) => !isBare(r)), { path: '*', element: <NotFound /> }],
  },
]);
