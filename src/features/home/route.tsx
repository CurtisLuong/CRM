import type { FeatureRoute } from '@/app/routes';

function Home() {
  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="text-2xl font-semibold">Sổ Khách v2</h1>
      <p className="mt-2 text-gray-600">Bản đang xây — dữ liệu thử (staging).</p>
    </main>
  );
}

export const route: FeatureRoute = { path: '/', element: <Home /> };
