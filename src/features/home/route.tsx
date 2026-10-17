import type { FeatureRoute } from '@/app/routes';
import { TodayPage } from '@/features/today/route';

function Home() {
  return (
    <>
      <h1 className="sr-only">Sổ Khách v2</h1>
      <TodayPage />
    </>
  );
}

export const route: FeatureRoute = { path: '/', element: <Home /> };
