import { Outlet } from 'react-router';
import { UpdatePrompt } from './UpdatePrompt';

/** Khung gốc tạm thời. AppShell (4 tab + nút ＋) thay ở T2.C3. */
export function RootLayout() {
  return (
    <>
      <Outlet />
      <UpdatePrompt />
    </>
  );
}
