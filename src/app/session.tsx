import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { setRepositorySession, useSyncStatus } from '@/data/hooks';
import { RepositorySession } from '@/data/repositories/session';
import { createSupabaseClient } from '@/data/supabase';

type State = { session: RepositorySession | null; booting: boolean; error: string };
const SessionContext = createContext<State>({ session: null, booting: true, error: '' });
function StatusBridge() {
  useSyncStatus();
  return null;
}
/** One account lifecycle for every route. No fallback identity or example customer data. */
export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ session: null, booting: true, error: '' });
  useEffect(() => {
    let active = true;
    let session: RepositorySession | null = null;
    const fail = (error: unknown) => {
      if (active)
        setState((s) => ({
          ...s,
          booting: false,
          error: error instanceof Error ? error.message : 'Không mở được phiên đăng nhập.',
        }));
    };
    try {
      session = new RepositorySession(createSupabaseClient(), { onError: fail });
      setRepositorySession(session);
      setState({ session, booting: true, error: '' });
      void session.auth
        .boot()
        .then(() => {
          if (active) setState((s) => ({ ...s, booting: false }));
        })
        .catch(fail);
    } catch (error) {
      fail(error);
    }
    return () => {
      active = false;
      setRepositorySession(null);
      session?.dispose();
    };
  }, []);
  return (
    <SessionContext.Provider value={state}>
      <StatusBridge />
      {children}
    </SessionContext.Provider>
  );
}
export const useAppSession = () => useContext(SessionContext);
