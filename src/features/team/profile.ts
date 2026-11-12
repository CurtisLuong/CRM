import { useEffect, useRef, useState } from 'react';
import type { RepositoryAccount } from '@/data/repositories/session';

const key = (id: string) => `crm_profile:${id}`;

export function profilePhone(raw: unknown): string {
  const state = raw as { profile?: { phone?: unknown } } | null;
  return typeof state?.profile?.phone === 'string' ? state.profile.phone : '';
}

export function cachedProfilePhone(id: string): string {
  if (!id) return '';
  try {
    return profilePhone(JSON.parse(localStorage.getItem(key(id)) || 'null'));
  } catch {
    return '';
  }
}

function cachePhone(id: string, phone: string) {
  try {
    localStorage.setItem(key(id), JSON.stringify({ profile: { phone } }));
  } catch {}
}

/** Đọc bản gần nhất theo tài khoản; đọc lỗi không xoá bản đã lưu. */
export function useMyPhone(account: RepositoryAccount | null) {
  const id = account?.sync.local.userId ?? '';
  const [snapshot, setSnapshot] = useState(() => ({ id, phone: cachedProfilePhone(id), ready: false }));
  const revision = useRef(0);
  useEffect(() => {
    setSnapshot({ id, phone: cachedProfilePhone(id), ready: false });
    if (!account || !id) return;
    const load = () => {
      const request = ++revision.current;
      void Promise.resolve()
        .then(() => account.remote.getUiStateRemote())
        .then((raw: unknown) => {
          if (request !== revision.current || account.sync.local.isClosed || raw === undefined) return;
          const phone = profilePhone(raw);
          cachePhone(id, phone);
          setSnapshot({ id, phone, ready: true });
        })
        .catch(() => {});
    };
    load();
    window.addEventListener('online', load);
    return () => {
      revision.current += 1;
      window.removeEventListener('online', load);
    };
  }, [account, id]);

  const savePhone = async (value: string) => {
    if (!account || !id) return false;
    const phone = value.trim();
    const saved = await account.remote.saveUiStateRemote({ profile: { phone } });
    if (!saved || account.sync.local.isClosed) return false;
    revision.current += 1;
    cachePhone(id, phone);
    setSnapshot({ id, phone, ready: true });
    return true;
  };
  return {
    phone: snapshot.id === id ? snapshot.phone : cachedProfilePhone(id),
    ready: snapshot.id === id && snapshot.ready,
    savePhone,
  };
}
