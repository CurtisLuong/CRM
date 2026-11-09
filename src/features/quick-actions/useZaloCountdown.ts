import { useEffect, useRef, useState } from 'react';

export function useZaloCountdown(eligible: boolean, onElapsed: () => void) {
  const [remaining, setRemaining] = useState<number | null>(eligible ? 3 : null);
  const stopped = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const action = useRef(onElapsed);
  action.current = onElapsed;
  const openingFocus = useRef(false);

  const cancel = () => {
    stopped.current = true;
    clearInterval(timer.current);
    setRemaining(null);
  };

  useEffect(() => {
    if (!eligible || stopped.current) {
      setRemaining(null);
      return;
    }
    const started = Date.now();
    setRemaining(3);
    timer.current = setInterval(() => {
      if (stopped.current) return;
      const next = Math.max(0, 3 - Math.floor((Date.now() - started) / 1000));
      if (next) setRemaining(next);
      else {
        stopped.current = true;
        clearInterval(timer.current);
        setRemaining(null);
        action.current();
      }
    }, 1000);
    return () => clearInterval(timer.current);
  }, [eligible]);

  return {
    remaining: eligible ? remaining : null,
    cancel,
    contentProps: {
      onOpenAutoFocus: (event: Event) => {
        // Focus ban đầu của Radix không phải thao tác của người dùng.
        event.preventDefault();
        openingFocus.current = true;
        if (event.target instanceof HTMLElement) event.target.focus();
        openingFocus.current = false;
      },
      onPointerDownCapture: cancel,
      onTouchStartCapture: cancel,
      onClickCapture: cancel,
      onKeyDownCapture: cancel,
      onInputCapture: cancel,
      onChangeCapture: cancel,
      onWheelCapture: cancel,
      onScrollCapture: cancel,
      onFocusCapture: () => {
        if (!openingFocus.current) cancel();
      },
    },
  };
}
