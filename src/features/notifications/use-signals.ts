import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import { computeSignals, type Signal, type SignalUiState } from '@/domain/signals';

/** Nguồn dùng chung của chuông header và màn Thông báo: cùng hàm computeSignals, cùng ui_state. */
const keyFor = (userId: string) => `crm_signal_ui_state:${userId}`;

export function useNotificationSignals() {
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const [uiState, setUiState] = useState<SignalUiState>({});
  const [now, setNow] = useState(() => Date.now());
  const [status, setStatus] = useState('');
  const userId = account?.sync.local.userId || '';

  // Theo phút: tín hiệu thay đổi khi qua mốc hẹn/SLA dù dữ liệu khách không đổi.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!account || !userId) {
      setUiState({});
      return;
    }
    let active = true;
    try {
      const cached = localStorage.getItem(keyFor(userId));
      if (cached) setUiState(JSON.parse(cached) as SignalUiState);
    } catch {
      setUiState({});
    }
    void account.remote
      .getUiStateRemote()
      .then((raw) => {
        if (!active || !raw || typeof raw !== 'object') return;
        const signals = (raw as { signals?: SignalUiState['signals'] }).signals;
        const next = { signals };
        setUiState(next);
        localStorage.setItem(keyFor(userId), JSON.stringify(next));
      })
      .catch(() => {
        if (active) setStatus('Đang hiển thị tín hiệu đã lưu trên thiết bị.');
      });
    return () => {
      active = false;
    };
  }, [account, userId]);

  const signals = useMemo(
    () => (account ? computeSignals(customers, { now, ownerId: userId, ui_state: uiState }) : []),
    [account, customers, now, userId, uiState],
  );

  const hideSignals = useCallback(
    (hiddenSignals: readonly Signal[]) => {
      if (!userId) return;
      const next: SignalUiState = {
        ...uiState,
        signals: {
          ...uiState.signals,
          ...Object.fromEntries(
            hiddenSignals.map((signal) => [signal.id, { fingerprint: signal.fingerprint, hidden: true }]),
          ),
        },
      };
      setUiState(next);
      try {
        localStorage.setItem(keyFor(userId), JSON.stringify(next));
      } catch {
        setStatus('Đã ẩn tín hiệu trên màn hình này nhưng chưa lưu được trên thiết bị.');
      }
      if (account) {
        void account.remote
          .saveUiStateRemote({ signals: next.signals })
          .then((saved) => {
            if (!saved) setStatus('Tín hiệu đã ẩn trên thiết bị nhưng chưa đồng bộ được.');
          })
          .catch(() => setStatus('Tín hiệu đã ẩn trên thiết bị nhưng chưa đồng bộ được.'));
      }
    },
    [account, uiState, userId],
  );
  const hideSignal = useCallback((signal: Signal) => hideSignals([signal]), [hideSignals]);

  return { account, customers, signals, status, userId, hideSignal, hideSignals };
}
