import type { SupabaseClient } from '@supabase/supabase-js';
import { openUserDB } from './legacyImport';
import { startProbe } from './probe';
import { startLive } from './realtime';
import { CustomerSync } from './sync';

export type AccountUser = { id: string; email?: string };
export const LAST_USER_KEY = 'crm_last_user';
export function rememberedUser(storage: Storage = localStorage): AccountUser | null {
  try {
    const user = JSON.parse(storage.getItem(LAST_USER_KEY) || 'null');
    return user && typeof user.id === 'string' && user.id ? { id: user.id, email: user.email || '' } : null;
  } catch {
    return null;
  }
}

/** Account lifecycle. onAccount fires with local cache BEFORE any network reads. */
export class AccountAuth {
  private epoch = 0;
  private disposed = false;
  private authEventRevision = 0;
  private stopLive?: () => void;
  private stopProbe?: () => void;
  private unsubscribe?: () => void;
  user: AccountUser | null = null;
  sync: CustomerSync | null = null;
  constructor(
    readonly client: SupabaseClient,
    readonly callbacks: {
      onAccount?: (sync: CustomerSync | null) => void;
      onChange?: () => void;
      onError?: (error: unknown) => void;
    } = {},
    readonly options: { storage?: Storage; idb?: IDBFactory; isOnline?: () => boolean } = {},
  ) {}
  private get storage() {
    return this.options.storage ?? localStorage;
  }
  private get online() {
    return this.options.isOnline ?? (() => navigator.onLine);
  }
  private clear() {
    this.epoch++;
    this.stopLive?.();
    this.stopLive = undefined;
    this.stopProbe?.();
    this.stopProbe = undefined;
    this.sync?.local.close();
    this.sync = null;
    this.user = null;
    this.callbacks.onAccount?.(null);
  }
  async setAccount(user: AccountUser | null) {
    if (this.disposed) return;
    if (user && user.id === this.user?.id) return;
    const previousUserId = rememberedUser(this.storage)?.id;
    this.clear();
    if (!user) return;
    const epoch = this.epoch;
    const local = await openUserDB(user.id, { previousUserId, idb: this.options.idb });
    if (epoch !== this.epoch) {
      local.close();
      return;
    }
    this.user = user;
    const sync = new CustomerSync(local, this.client, this.online);
    this.sync = sync;
    try {
      this.storage.setItem(LAST_USER_KEY, JSON.stringify({ id: user.id, email: user.email || '' }));
    } catch {}
    this.callbacks.onAccount?.(sync);
    if (epoch !== this.epoch || local.isClosed) return;
    const active = () => epoch === this.epoch && !local.isClosed;
    const monitoring = startProbe(sync, this.callbacks.onChange);
    this.stopProbe = monitoring.stop;
    this.stopLive = startLive(sync, {
      onChange: this.callbacks.onChange,
      onResync: () => {
        void monitoring.checkRemote();
      },
    });
    try {
      await sync.flushQueue();
      if (!active()) return;
      const result = await sync.pull();
      if (active() && result.ok && result.changed) this.callbacks.onChange?.();
    } catch (error) {
      if (active()) this.callbacks.onError?.(error);
    }
  }
  async boot() {
    if (this.disposed || this.unsubscribe) return;
    const epoch = this.epoch;
    const eventRevision = this.authEventRevision;
    // Subscribe before the initial session/cache/network work; no signout event can be missed.
    const { data: listener } = this.client.auth.onAuthStateChange((_event, session) => {
      const epoch = this.epoch;
      const eventRevision = ++this.authEventRevision;
      // Leave the Supabase auth lock before opening cache or issuing queries.
      setTimeout(() => {
        if (this.disposed || epoch !== this.epoch || eventRevision !== this.authEventRevision) return;
        if (!session && !this.online() && rememberedUser(this.storage)) return;
        void this.setAccount(session?.user ?? null).catch((e) => this.callbacks.onError?.(e));
      });
    });
    this.unsubscribe = () => listener.subscription.unsubscribe();
    const { data, error } = await this.client.auth.getSession();
    if (this.disposed || epoch !== this.epoch || eventRevision !== this.authEventRevision) return;
    if (error && this.online()) throw error;
    await this.setAccount(data.session?.user ?? (!this.online() ? rememberedUser(this.storage) : null));
  }
  async signIn(email: string, password: string) {
    const epoch = this.epoch;
    const { data, error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    if (this.disposed || epoch !== this.epoch) return;
    await this.setAccount(data.user);
  }
  async signOut() {
    try {
      this.storage.removeItem(LAST_USER_KEY);
    } catch {}
    this.clear();
    try {
      await this.client.auth.signOut();
    } catch {
      /* Local logout still succeeds offline. */
    }
  }
  dispose() {
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.clear();
  }
}
