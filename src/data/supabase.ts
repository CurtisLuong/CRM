import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CustomerRemote } from './queue';

const PRODUCTION_PROJECT_ID = 'nrqccwamwctihivpxjww';
let originalFetch: typeof globalThis.fetch | null = null;

function isCapacitorNative() {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  try {
    return capacitor?.isNativePlatform?.() === true;
  } catch {
    return true;
  }
}

/** Preview và môi trường dev được phép dùng dữ liệu mẫu; production và vỏ Android thì không. */
export function isDemoAvailable(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  if (url.includes(PRODUCTION_PROJECT_ID) || isCapacitorNative()) return false;
  return !import.meta.env.PROD || !!url;
}

/** Khoá mọi fetch trong phiên mẫu để cả SDK và Worker đều không thể gửi request ra ngoài. */
export function blockDemoNetwork() {
  if (originalFetch || typeof globalThis.fetch !== 'function') return;
  originalFetch = globalThis.fetch.bind(globalThis);
  // Báo lỗi như mất mạng (không trả 200 giả): nơi gọi hiện trạng thái lỗi sẵn có, không coi là dữ liệu trống.
  globalThis.fetch = async () => {
    throw new TypeError('Tính năng này không có trong dữ liệu mẫu.');
  };
}

export function restoreDemoNetwork() {
  if (!originalFetch) return;
  globalThis.fetch = originalFetch;
  originalFetch = null;
}

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
