import { RouterProvider } from 'react-router';
import { router } from './router';
import { AppSessionProvider } from './session';

export function App() {
  return (
    <AppSessionProvider>
      <RouterProvider router={router} />
    </AppSessionProvider>
  );
}
