import { useEffect, useState } from 'react';

/** Đổi tiêu đề khi toàn bộ phần tử nguồn đã khuất phía trên mép dưới thanh dính. */
export function useScrolledPast(
  target: HTMLElement | null,
  { boundary = null, mediaQuery }: { boundary?: HTMLElement | null; mediaQuery?: string } = {},
) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    if (!target) {
      setPast(false);
      return;
    }
    const media = mediaQuery ? window.matchMedia(mediaQuery) : null;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setPast(
        target.isConnected &&
          (!media || media.matches) &&
          target.getBoundingClientRect().bottom <= (boundary?.getBoundingClientRect().bottom ?? 0),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    media?.addEventListener('change', measure);
    const observer = new ResizeObserver(schedule);
    observer.observe(target);
    if (boundary) observer.observe(boundary);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      media?.removeEventListener('change', measure);
      observer.disconnect();
    };
  }, [target, boundary, mediaQuery]);
  return target != null && past;
}
