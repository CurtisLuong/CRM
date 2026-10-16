import { createBrowserRouter } from 'react-router';
import { RootLayout } from './layout';
import { NotFound } from './NotFound';
import { collectRoutes, type RouteModule } from './routes';

const modules = import.meta.glob<RouteModule>('../features/*/route.tsx', { eager: true });

export const featureRoutes = collectRoutes(modules);

export const router = createBrowserRouter([
  { element: <RootLayout />, children: [...featureRoutes, { path: '*', element: <NotFound /> }] },
]);
