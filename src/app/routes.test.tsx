import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { featureRoutes } from './router';
import { collectRoutes } from './routes';

describe('collectRoutes', () => {
  it('gom route các tính năng, sắp theo path', () => {
    const r = collectRoutes({
      'b/route.tsx': { route: { path: '/khach' } },
      'a/route.tsx': { route: { path: '/' } },
    });
    expect(r.map((x) => x.path)).toEqual(['/', '/khach']);
  });

  it('báo lỗi khi 2 tính năng trùng path', () => {
    expect(() =>
      collectRoutes({ 'a/route.tsx': { route: { path: '/' } }, 'b/route.tsx': { route: { path: '/' } } }),
    ).toThrow(/Trùng route/);
  });

  it('báo lỗi khi file route.tsx không export route', () => {
    expect(() => collectRoutes({ 'a/route.tsx': {} })).toThrow(/export const route/);
  });
});

describe('auto-register src/features/*/route.tsx', () => {
  it('trang chủ hiện "Sổ Khách v2"', () => {
    const router = createMemoryRouter(featureRoutes, { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole('heading', { name: 'Sổ Khách v2' })).toBeTruthy();
  });
});
