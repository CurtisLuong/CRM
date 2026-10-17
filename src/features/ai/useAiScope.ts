import { useCallback, useEffect, useRef } from 'react';
import type { RepositoryAccount } from '@/data/repositories/session';
/** Captured requests stay invalid after A→B→A and after unmount. */
export function useAiScope(identity: string, account: RepositoryAccount | null) {
  const latest = useRef({ identity, account, active: true });
  if (latest.current.identity !== identity || latest.current.account !== account)
    latest.current = { identity, account, active: true };
  const scope = latest.current;
  useEffect(() => {
    scope.active = true;
    return () => {
      scope.active = false;
    };
  }, [scope]);
  return useCallback(() => scope.active && latest.current === scope, [scope]);
}
