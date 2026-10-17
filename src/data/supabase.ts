import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CustomerRemote } from './queue';

/** Use only the public anon key; the authenticated session and RLS govern access. */
export function createSupabaseClient(
  url = import.meta.env.VITE_SUPABASE_URL,
  anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY,
): SupabaseClient {
  if (!url || !anonKey) throw new Error('Thiếu cấu hình Supabase.');
  return createClient(url, anonKey);
}

export function customerRemote(client: SupabaseClient): CustomerRemote {
  return {
    upsert: (payload) => client.from('customers').upsert(payload),
    update: (id, payload) => client.from('customers').update(payload).eq('id', id),
    // Compatibility only: flush existing v1 delete ops. Ordinary UI uses archiveCustomer.
    delete: (id) => client.from('customers').delete().eq('id', id),
    // Gộp mảng (D-021): đọc cột mảng + updated_at, rồi patch có điều kiện updated_at chưa đổi.
    read: async (id, columns) => {
      const { data, error } = await client.from('customers').select(columns.join(',')).eq('id', id).maybeSingle();
      return { data: (data as Record<string, unknown> | null) ?? null, error };
    },
    updateIf: async (id, payload, expectedUpdatedAt) => {
      const base = client.from('customers').update(payload).eq('id', id);
      const guarded =
        expectedUpdatedAt == null ? base.is('updated_at', null) : base.eq('updated_at', String(expectedUpdatedAt));
      const { data, error } = await guarded.select('id');
      return { error, matched: Array.isArray(data) && data.length > 0 };
    },
  };
}
