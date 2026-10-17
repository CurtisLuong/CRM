import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { pagedFetch } from '../../src/data/pagedFetch';

// Opt-in integration boundary until T3 auth screens consume AccountAuth. No production requests.
const url = process.env.STAGING_SUPABASE_URL;
const anonKey = process.env.STAGING_SUPABASE_ANON_KEY;
const email = process.env.STAGING_AUTH_EMAIL;
const password = process.env.STAGING_AUTH_PASSWORD;
const expected = process.env.STAGING_EXPECTED_CUSTOMERS;

test('staging authenticated RLS customer count matches complete paged read', async () => {
  test.skip(
    !url || !anonKey || !email || !password || expected === undefined,
    'Provide local staging test credentials and expected visible customer count.',
  );
  expect(new URL(url || '').hostname).toBe('mksjmpcsfawsiabfhoxe.supabase.co');
  const client = createClient(url || '', anonKey || '', { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const login = await client.auth.signInWithPassword({ email: email || '', password: password || '' });
    expect(login.error).toBeNull();
    expect(login.data.user?.id).toBeTruthy();
    const { error, count } = await client.from('customers').select('id', { count: 'exact', head: true });
    expect(error).toBeNull();
    expect(count).toBe(Number(expected));
    const rows = await pagedFetch(client);
    expect(rows.length).toBe(count);
    expect(new Set(rows.map((row) => row.id)).size).toBe(count);
  } finally {
    await client.auth.signOut();
  }
});
