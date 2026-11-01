import { Link } from 'react-router';

export function NotFound() {
  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="text-lg font-semibold">Không tìm thấy trang</h1>
      <Link to="/" className="text-ion underline">
        Về trang chính
      </Link>
    </main>
  );
}
