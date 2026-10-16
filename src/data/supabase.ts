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
  };
}
