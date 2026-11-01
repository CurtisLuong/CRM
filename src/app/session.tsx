import type { SupabaseClient } from '@supabase/supabase-js';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { setRepositorySession } from '@/data/hooks';
import { dbNameFor, LocalDB, STORE_CUSTOMERS, STORE_META, STORE_QUEUE } from '@/data/localdb';
import { createCatalogRepository } from '@/data/repositories/catalog';
import { CustomerRepository } from '@/data/repositories/customers';
import { createRemoteRepository } from '@/data/repositories/remote';
import { type RepositoryAccount, RepositorySession } from '@/data/repositories/session';
import { blockDemoNetwork, createSupabaseClient, isDemoAvailable, restoreDemoNetwork } from '@/data/supabase';
import { CustomerSync } from '@/data/sync';
import { DEMO_USER_ID, demoDataset } from '@/demo/dataset';
import { DEMO_MODE_KEY, isDemo } from '@/demo/mode';

type SessionHandle = Pick<RepositorySession, 'auth'>;
type State = {
  session: SessionHandle | null;
  booting: boolean;
  error: string;
  isDemo: boolean;
};
type ContextState = State & { startDemo: () => Promise<void>; exitDemo: () => Promise<void> };
const SessionContext = createContext<ContextState>({
  session: null,
  booting: true,
  error: '',
  isDemo: false,
  startDemo: async () => {},
  exitDemo: async () => {},
});
let demoController: { start: () => Promise<void>; exit: () => Promise<void> } | null = null;

function unavailable(message = 'Tính năng này không có trong dữ liệu mẫu.') {
  return new Error(message);
}

const demoClient = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ data: { user: null }, error: unavailable() }),
  },
  from: () => {
    throw unavailable();
  },
  channel: () => {
    throw unavailable();
  },
  removeChannel: async () => undefined,
  storage: {
    from: () => ({ getPublicUrl: () => ({ data: { publicUrl: null } }) }),
  },
} as unknown as SupabaseClient;

function seedDemoDatabase(local: LocalDB) {
  const rows = demoDataset(Date.now());
  return new Promise<void>((resolve, reject) => {
    const transaction = local.db.transaction([STORE_CUSTOMERS, STORE_QUEUE, STORE_META], 'readwrite');
    transaction.objectStore(STORE_CUSTOMERS).clear();
    transaction.objectStore(STORE_QUEUE).clear();
    transaction.objectStore(STORE_META).clear();
    for (const row of rows) transaction.objectStore(STORE_CUSTOMERS).put(row);
    transaction.objectStore(STORE_META).put({ key: 'dm01-demo-seeded', at: new Date().toISOString() });
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

class DemoRepositorySession {
  private listeners = new Set<() => void>();
  private cleanup: (() => void)[] = [];
  private account: RepositoryAccount;

  constructor(local: LocalDB) {
    const sync = new CustomerSync(local, demoClient, () => false, true);
    const customers = new CustomerRepository(sync);
    this.account = {
      customers,
      sync,
      remote: createRemoteRepository(sync, customers),
      catalog: createCatalogRepository(sync),
    };
    this.cleanup.push(customers.subscribe(this.emit), sync.status.subscribe(this.emit));
    void customers.refresh().catch(() => {});
  }

  private emit = () => {
    for (const listener of this.listeners) listener();
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.account;
  getSyncSnapshot = () => this.account.sync.status.getSnapshot();

  dispose() {
    for (const cleanup of this.cleanup) cleanup();
    this.cleanup = [];
    this.account.sync.local.close();
    this.listeners.clear();
  }
}

function deleteDemoDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbNameFor(DEMO_USER_ID));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Đang có thẻ khác mở dữ liệu mẫu. Hãy đóng thẻ đó rồi thử lại.'));
  });
}

export async function startDemo() {
  if (!isDemoAvailable()) throw new Error('Dữ liệu mẫu không khả dụng ở môi trường này.');
  if (!demoController) throw new Error('Chưa mở được giao diện dữ liệu mẫu. Hãy thử tải lại trang.');
  await demoController.start();
}

export async function exitDemo() {
  if (!demoController) throw new Error('Chưa mở được phiên dữ liệu mẫu. Hãy thử tải lại trang.');
  await demoController.exit();
}

export { isDemo };

export function AppSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ session: null, booting: true, error: '', isDemo: false });
  const realSession = useRef<RepositorySession | null>(null);
  const demoSession = useRef<DemoRepositorySession | null>(null);
  const realCleanup = useRef<(() => void) | null>(null);
  const lifecycle = useRef(0);

  useEffect(() => {
    const generation = ++lifecycle.current;
    const current = () => generation === lifecycle.current;

    const stopRealSession = () => {
      const active = realSession.current;
      if (active) {
        const auth = active.auth.client.auth as typeof active.auth.client.auth & { stopAutoRefresh?: () => void };
        auth.stopAutoRefresh?.();
      }
      realCleanup.current?.();
      realCleanup.current = null;
    };

    const openRealSession = () => {
      if (!current()) return;
      setState({ session: null, booting: true, error: '', isDemo: false });
      let session: RepositorySession;
      try {
        const fail = (error: unknown) => {
          if (current())
            setState((previous) => ({
              ...previous,
              booting: false,
              error: error instanceof Error ? error.message : 'Không mở được phiên đăng nhập.',
            }));
        };
        session = new RepositorySession(createSupabaseClient(), { onError: fail });
      } catch (error) {
        setState({
          session: null,
          booting: false,
          error: error instanceof Error ? error.message : 'Không mở được phiên đăng nhập.',
          isDemo: false,
        });
        return;
      }
      realSession.current = session;
      setRepositorySession(session);
      setState({ session, booting: true, error: '', isDemo: false });
      void session.auth
        .boot()
        .then(() => {
          if (current()) setState((previous) => ({ ...previous, booting: false }));
        })
        .catch((error: unknown) => {
          if (current())
            setState((previous) => ({
              ...previous,
              booting: false,
              error: error instanceof Error ? error.message : 'Không mở được phiên đăng nhập.',
            }));
        });
      realCleanup.current = () => {
        setRepositorySession(null);
        session.dispose();
        if (realSession.current === session) realSession.current = null;
      };
    };

    const openDemoSession = async (fresh: boolean) => {
      if (!isDemoAvailable()) throw new Error('Dữ liệu mẫu không khả dụng ở môi trường này.');
      if (!current()) return;
      if (fresh) blockDemoNetwork();
      try {
        localStorage.setItem(DEMO_MODE_KEY, 'active');
      } catch {
        throw new Error('Không lưu được trạng thái dữ liệu mẫu trên trình duyệt.');
      }
      blockDemoNetwork();
      stopRealSession();
      demoSession.current?.dispose();
      demoSession.current = null;
      setRepositorySession(null);
      setState({ session: null, booting: true, error: '', isDemo: true });

      const local = await LocalDB.open(DEMO_USER_ID);
      if (!current()) {
        local.close();
        return;
      }
      try {
        const seeded = await local.getMeta('dm01-demo-seeded');
        if (fresh || !seeded) await seedDemoDatabase(local);
      } catch (error) {
        local.close();
        throw error;
      }
      if (!current()) {
        local.close();
        return;
      }
      const session = new DemoRepositorySession(local);
      demoSession.current = session;
      setRepositorySession(session as unknown as RepositorySession);
      setState({ session: null, booting: false, error: '', isDemo: true });
    };

    const leaveDemo = async () => {
      blockDemoNetwork();
      demoSession.current?.dispose();
      demoSession.current = null;
      setRepositorySession(null);
      await deleteDemoDatabase();
      for (const key of [
        'crm_zalo_templates:dm01-preview',
        'crm_ai_settings:dm01-preview',
        'crm_catalog_v2:dm01-preview',
      ]) {
        localStorage.removeItem(key);
      }
      localStorage.removeItem(DEMO_MODE_KEY);
      restoreDemoNetwork();
      window.location.assign('/today');
    };

    demoController = {
      start: async () => {
        if (!current()) throw new Error('Phiên giao diện đã thay đổi. Hãy thử lại.');
        await openDemoSession(true);
      },
      exit: leaveDemo,
    };

    if (isDemo() && isDemoAvailable()) {
      blockDemoNetwork();
      void openDemoSession(false).catch((error: unknown) => {
        if (current())
          setState({
            session: null,
            booting: false,
            error: error instanceof Error ? error.message : 'Không mở được dữ liệu mẫu.',
            isDemo: true,
          });
      });
    } else {
      localStorage.removeItem(DEMO_MODE_KEY);
      openRealSession();
    }

    return () => {
      if (current()) lifecycle.current++;
      if (demoController?.start) demoController = null;
      stopRealSession();
      demoSession.current?.dispose();
      demoSession.current = null;
    };
  }, []);

  return (
    <SessionContext.Provider value={{ ...state, startDemo, exitDemo }}>
      {state.isDemo && (
        <aside className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ion-tint px-3 py-2 text-label text-ink sm:px-4">
          <p className="min-w-0 flex-1">Dữ liệu mẫu — không lưu lên máy chủ</p>
          <Button variant="secondary" size="sm" onClick={() => void exitDemo()}>
            Thoát dữ liệu mẫu
          </Button>
        </aside>
      )}
      {children}
    </SessionContext.Provider>
  );
}

export const useAppSession = () => useContext(SessionContext);
