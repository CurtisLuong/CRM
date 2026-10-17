import type { RepositoryAccount } from '@/data/repositories/session';
import type { BankPreset } from '@/domain/loan';
import type { LoanState } from './model';

export type LoanQuote = {
  id: string;
  created_at: string;
  customer_id?: string | null;
  unit_code?: string | null;
  inputs: LoanState;
  summary: Record<string, unknown>;
  [key: string]: unknown;
};
/** v1 loan_quotes are remote-only; this cache serves reads offline and never pretends to queue writes. */
export function createLoanStore(account: RepositoryAccount, storage: Storage = localStorage) {
  const scope = account.sync.local.userId;
  const key = (name: string) => `crm_loan_v2:${scope}:${name}`;
  const active = () => account.sync.local.assertOpen();
  const online = () => {
    active();
    if (!account.sync.isOnline())
      throw new Error('Cần có mạng để lưu phương án lên máy chủ. Bảng tính vẫn dùng ngoại tuyến.');
  };
  const cache = (name: string, value: unknown) => {
    active();
    try {
      storage.setItem(key(name), JSON.stringify(value));
    } catch {}
  };
  const read = (name: string): unknown => {
    active();
    try {
      return JSON.parse(storage.getItem(key(name)) || 'null');
    } catch {
      return null;
    }
  };
  return {
    cachedQuotes(customerId: string | null): LoanQuote[] {
      const value = read(`quotes:${customerId || 'all'}`);
      return Array.isArray(value) ? value : [];
    },
    async listQuotes(customerId: string | null) {
      active();
      if (!account.sync.isOnline()) return this.cachedQuotes(customerId);
      let query = account.sync.client
        .from('loan_quotes')
        .select('id,created_at,customer_id,unit_code,inputs,summary')
        .eq('user_id', scope);
      if (customerId) query = query.eq('customer_id', customerId);
      else query = query.is('customer_id', null);
      const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
      active();
      if (error) throw error;
      const rows = (data ?? []) as LoanQuote[];
      cache(`quotes:${customerId || 'all'}`, rows);
      return rows;
    },
    async saveQuote(input: {
      customerId?: string | null;
      projectId?: string | null;
      unitCode: string;
      inputs: LoanState;
      summary: Record<string, unknown>;
    }) {
      online();
      if (input.customerId) {
        const c = await account.customers.get(input.customerId);
        active();
        if (!c || c.archived_at || c.owner_id !== scope) throw new Error('Chỉ lưu phương án cho khách mình phụ trách.');
      }
      online();
      const { data, error } = await account.sync.client
        .from('loan_quotes')
        .insert({
          user_id: scope,
          customer_id: input.customerId || null,
          project_id: input.projectId || null,
          unit_code: input.unitCode || null,
          inputs: input.inputs,
          summary: input.summary,
        })
        .select('id')
        .single();
      active();
      if (error) throw error;
      return String(data.id);
    },
    readSettings() {
      return read('settings') as { loan?: LoanState['loan']; consultant?: { name: string; phone: string } } | null;
    },
    saveLocalSettings(value: unknown) {
      cache('settings', value);
    },
    async loadBankPresets(): Promise<BankPreset[]> {
      active();
      if (!account.sync.isOnline()) return [];
      const { data, error } = await account.sync.client.from('bank_presets').select('*').order('sort_order');
      active();
      if (error) throw error;
      return (data ?? [])
        .filter(
          (b) =>
            typeof b.key === 'string' &&
            Array.isArray(b.rate_tiers) &&
            b.rate_tiers.every(
              (tier: { rate?: unknown; months?: unknown } | null) =>
                tier && Number.isFinite(Number(tier.rate)) && Number.isFinite(Number(tier.months)),
            ) &&
            Array.isArray(b.prepay_fees),
        )
        .map((b) => ({
          key: b.key,
          name: b.name,
          ltv: Number(b.ltv),
          termYears: Number(b.term_years),
          rateTiers: b.rate_tiers,
          floatingRate: Number(b.floating_rate),
          maxGraceMonths: Number(b.max_grace_months),
          prepayFees: b.prepay_fees,
        }));
    },
  };
}
