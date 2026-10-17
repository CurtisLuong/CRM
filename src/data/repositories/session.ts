/** Optional composition root; AccountAuth callbacks keep repository snapshots local-first. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AccountAuth } from '../auth';
import type { CustomerSync } from '../sync';
import { createSyncStatus, type SyncSnapshot } from '../syncStatus';
import { createCatalogRepository } from './catalog';
import { CustomerRepository } from './customers';
import { createRemoteRepository } from './remote';
export type RepositoryAccount = {
  customers: CustomerRepository;
  remote: ReturnType<typeof createRemoteRepository>;
  catalog: ReturnType<typeof createCatalogRepository>;
  sync: CustomerSync;
};
export class RepositorySession {
  private account: RepositoryAccount | null = null;
  private listeners = new Set<() => void>();
  private cleanup: (() => void)[] = [];
  private emptyStatus = createSyncStatus().getSnapshot();
  readonly auth: AccountAuth;
  constructor(
    client: SupabaseClient,
    options: { storage?: Storage; idb?: IDBFactory; isOnline?: () => boolean; onError?: (error: unknown) => void } = {},
  ) {
    this.auth = new AccountAuth(
      client,
      {
        onAccount: (sync) => {
          for (const dispose of this.cleanup) dispose();
          this.cleanup = [];
          this.account = null;
          if (sync) {
            const customers = new CustomerRepository(sync);
            this.account = {
              customers,
              sync,
              remote: createRemoteRepository(sync, customers),
              catalog: createCatalogRepository(sync, options.storage),
            };
            this.cleanup.push(customers.subscribe(this.emit), sync.status.subscribe(this.emit));
            void customers.refresh().catch(options.onError ?? (() => {}));
          }
          this.emit();
        },
        onChange: () => {
          void this.account?.customers.refresh().catch(options.onError ?? (() => {}));
        },
        onError: options.onError,
      },
      options,
    );
  }
  private emit = () => {
    for (const fn of this.listeners) fn();
  };
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.account;
  getSyncSnapshot = (): SyncSnapshot => this.account?.sync.status.getSnapshot() ?? this.emptyStatus;
  dispose() {
    this.auth.dispose();
    this.listeners.clear();
  }
}
