import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import { computeSignals, type Signal, type SignalUiState } from '@/domain/signals';

/** Màn Thông báo và chuông cần cùng một trạng thái ẩn trong cùng tab. */
const keyFor = (userId: string) => `crm_signal_ui_state:${userId}`;

type NotificationState = { uiState: SignalUiState; status: string };
type NotificationStore = {
  state: NotificationState;
  listeners: Set<() => void>;
  remoteLoaded: boolean;
  revision: number;
};

const stores = new Map<string, NotificationStore>();
const emptyState: NotificationState = { uiState: {}, status: '' };

function storeFor(userId: string): NotificationStore {
  let store = stores.get(userId);
  if (store) return store;
  let uiState: SignalUiState = {};
  try {
    const cached = localStorage.getItem(keyFor(userId));
    if (cached) uiState = JSON.parse(cached) as SignalUiState;
  } catch {
    uiState = {};
  }
  store = { state: { uiState, status: '' }, listeners: new Set(), remoteLoaded: false, revision: 0 };
  stores.set(userId, store);
  return store;
}

function updateStore(userId: string, update: (state: NotificationState) => NotificationState) {
  const store = storeFor(userId);
  store.state = update(store.state);
  for (const listener of store.listeners) listener();
}

function subscribe(userId: string, listener: () => void) {
  const store = storeFor(userId);
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

export function useNotificationSignals() {
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const userId = account?.sync.local.userId || '';
  const snapshot = useSyncExternalStore(
    useCallback((listener) => (userId ? subscribe(userId, listener) : () => {}), [userId]),
    () => (userId ? storeFor(userId).state : emptyState),
    () => emptyState,
  );
  const { uiState, status } = snapshot;
  const [now, setNow] = useState(() => Date.now());

  // Theo phút: tín hiệu thay đổi khi qua mốc hẹn/SLA dù dữ liệu khách không đổi.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!account || !userId) return;
    const store = storeFor(userId);
    if (store.remoteLoaded) return;
    store.remoteLoaded = true;
    const revision = store.revision;
    void account.remote
      .getUiStateRemote()
      .then((raw) => {
        if (!raw || typeof raw !== 'object') return;
        const signals = (raw as { signals?: SignalUiState['signals'] }).signals;
        updateStore(userId, (current) => {
          // Hành động ẩn ngay trên thiết bị không bị ghi đè bởi lần đọc đang chạy.
          if (store.revision !== revision) return current;
          const next = { uiState: { signals }, status: current.status };
          try {
            localStorage.setItem(keyFor(userId), JSON.stringify(next.uiState));
          } catch {
            // Bộ nhớ trong tab vẫn là nguồn đang dùng.
          }
          return next;
        });
      })
      .catch(() =>
        updateStore(userId, (current) => ({
          ...current,
          status: 'Đang hiển thị tín hiệu đã lưu trên thiết bị.',
        })),
      );
  }, [account, userId]);

  const signals = useMemo(
    () => (account ? computeSignals(customers, { now, ownerId: userId, ui_state: uiState }) : []),
    [account, customers, now, userId, uiState],
  );

  const hideSignals = useCallback(
    (hiddenSignals: readonly Signal[]) => {
      if (!userId) return;
      const store = storeFor(userId);
      const hidden = hiddenSignals.flatMap((signal) => [signal, ...(signal.secondaryReasons ?? [])]);
      const next: SignalUiState = {
        ...store.state.uiState,
        signals: {
          ...store.state.uiState.signals,
          ...Object.fromEntries(hidden.map((signal) => [signal.id, { fingerprint: signal.fingerprint, hidden: true }])),
        },
      };
      store.revision += 1;
      updateStore(userId, (current) => ({ ...current, uiState: next }));
      try {
        localStorage.setItem(keyFor(userId), JSON.stringify(next));
      } catch {
        updateStore(userId, (current) => ({
          ...current,
          status: 'Đã ẩn tín hiệu trên màn hình này nhưng chưa lưu được trên thiết bị.',
        }));
      }
      void account?.remote
        .saveUiStateRemote({ signals: next.signals })
        .then((saved) => {
          if (!saved)
            updateStore(userId, (current) => ({
              ...current,
              status: 'Tín hiệu đã ẩn trên thiết bị nhưng chưa đồng bộ được.',
            }));
        })
        .catch(() =>
          updateStore(userId, (current) => ({
            ...current,
            status: 'Tín hiệu đã ẩn trên thiết bị nhưng chưa đồng bộ được.',
          })),
        );
    },
    [account, userId],
  );
  const hideSignal = useCallback((signal: Signal) => hideSignals([signal]), [hideSignals]);

  return { account, customers, signals, status, userId, hideSignal, hideSignals };
}
