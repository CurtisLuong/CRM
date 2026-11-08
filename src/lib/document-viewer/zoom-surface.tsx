import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/ui/Icon';
import { clampPan, fitScale, MAX_SCALE, type Point, type Size, type ViewTransform, zoomAt } from './geometry';

export function ZoomSurface({
  size,
  pdf = false,
  onNavigate,
  children,
}: {
  size: Size;
  pdf?: boolean;
  onNavigate?: (direction: -1 | 1) => void;
  children: (scale: number) => ReactNode;
}) {
  const surface = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState<Size>({ width: 1, height: 1 });
  const minimum = fitScale(size, viewport, pdf);
  const [view, setView] = useState<ViewTransform>({ scale: minimum, x: 0, y: 0 });
  const current = useRef(view);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ start: Point; moved: boolean; pinched: boolean } | null>(null);
  const lastTap = useRef(0);
  const pointerType = useRef('mouse');
  const change = (next: ViewTransform) => {
    current.current = next;
    setView(next);
  };
  const zoom = (scale: number, anchor = { x: viewport.width / 2, y: viewport.height / 2 }) => {
    change(zoomAt(current.current, scale, anchor, size, viewport, minimum));
  };
  const toggleZoom = (anchor: Point) => zoom(current.current.scale > minimum + 0.001 ? minimum : minimum * 2, anchor);

  useLayoutEffect(() => {
    const node = surface.current;
    if (!node) return;
    const measure = () => setViewport({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useLayoutEffect(() => {
    const next = { scale: minimum, x: 0, y: 0 };
    current.current = next;
    setView(next);
  }, [minimum]);

  useLayoutEffect(() => {
    if (!surface.current) return;
    surface.current.scrollLeft = view.x;
    surface.current.scrollTop = view.y;
  }, [view]);

  // Chỉ Ctrl/⌘ + lăn chuột chặn zoom trang; lăn thường vẫn cuộn PDF.
  useEffect(() => {
    const node = surface.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const next = zoomAt(
        current.current,
        current.current.scale * Math.exp(-event.deltaY * 0.01),
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        size,
        viewport,
        minimum,
      );
      current.current = next;
      setView(next);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [minimum, size, viewport]);

  const point = (event: ReactPointerEvent<HTMLElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const end = (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const state = gesture.current;
    const endPoint = point(event);
    pointers.current.delete(event.pointerId);
    if (!state || pointers.current.size) return;
    if (!cancelled && !state.pinched) {
      const dx = endPoint.x - state.start.x;
      const dy = endPoint.y - state.start.y;
      if (current.current.scale <= minimum + 0.001 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        onNavigate?.(dx < 0 ? 1 : -1);
      } else if (!state.moved && event.pointerType === 'touch') {
        const now = Date.now();
        if (now - lastTap.current < 300) {
          toggleZoom(endPoint);
          lastTap.current = 0;
        } else lastTap.current = now;
      }
    }
    gesture.current = null;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2 py-1"
        role="toolbar"
        aria-label="Thu phóng"
      >
        <Button
          size="icon"
          aria-label="Thu nhỏ"
          title="Thu nhỏ"
          disabled={view.scale <= minimum + 0.001}
          onClick={() => zoom(view.scale / 1.5)}
        >
          <Icon name="zoom_out" />
        </Button>
        <Button
          size="icon"
          aria-label="Phóng to"
          title="Phóng to"
          disabled={view.scale >= MAX_SCALE}
          onClick={() => zoom(view.scale * 1.5)}
        >
          <Icon name="zoom_in" />
        </Button>
        <span className="min-w-12 text-center text-caption text-ink-muted">{Math.round(view.scale * 100)}%</span>
        <Button className="px-2" onClick={() => change({ scale: minimum, x: 0, y: 0 })}>
          <Icon name="fit_view" />
          <span>Vừa màn hình</span>
        </Button>
        <Button className="px-2" aria-label="Kích thước gốc" title="Kích thước gốc" onClick={() => zoom(1)}>
          <Icon name="original_size" />
          <span className="hidden sm:inline">Kích thước gốc</span>
        </Button>
      </div>
      <section
        aria-label="Vùng xem tài liệu"
        ref={surface}
        data-testid="document-viewport"
        className="relative min-h-0 flex-1 touch-none overflow-auto overscroll-contain bg-surface-200"
        onScroll={(event) => {
          current.current = { ...current.current, x: event.currentTarget.scrollLeft, y: event.currentTarget.scrollTop };
        }}
        onDoubleClick={(event) => {
          // Chạm đúp đã xử lý ở pointerup; bỏ dblclick tổng hợp để không zoom hai lần.
          if (pointerType.current === 'touch') return;
          const rect = event.currentTarget.getBoundingClientRect();
          toggleZoom({ x: event.clientX - rect.left, y: event.clientY - rect.top });
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          pointerType.current = event.pointerType;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const position = point(event);
          pointers.current.set(event.pointerId, position);
          if (pointers.current.size === 1) gesture.current = { start: position, moved: false, pinched: false };
          else if (gesture.current) gesture.current.pinched = true;
        }}
        onPointerMove={(event) => {
          const previous = pointers.current.get(event.pointerId);
          if (!previous) return;
          const next = point(event);
          const before = [...pointers.current.values()];
          pointers.current.set(event.pointerId, next);
          if (gesture.current && Math.hypot(next.x - gesture.current.start.x, next.y - gesture.current.start.y) > 8)
            gesture.current.moved = true;
          const after = [...pointers.current.values()];
          if (before.length === 2 && after.length === 2) {
            const [a, b] = before as [Point, Point];
            const [c, d] = after as [Point, Point];
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            if (!distance) return;
            const oldMiddle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const newMiddle = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
            const scaled = zoomAt(
              current.current,
              (current.current.scale * Math.hypot(c.x - d.x, c.y - d.y)) / distance,
              oldMiddle,
              size,
              viewport,
              minimum,
            );
            change({
              scale: scaled.scale,
              ...clampPan(
                { x: scaled.x + oldMiddle.x - newMiddle.x, y: scaled.y + oldMiddle.y - newMiddle.y },
                scaled.scale,
                size,
                viewport,
              ),
            });
          } else if (pdf || current.current.scale > minimum + 0.001) {
            change({
              scale: current.current.scale,
              ...clampPan(
                { x: current.current.x + previous.x - next.x, y: current.current.y + previous.y - next.y },
                current.current.scale,
                size,
                viewport,
              ),
            });
          }
        }}
        onPointerUp={(event) => end(event)}
        onPointerCancel={(event) => end(event, true)}
        onLostPointerCapture={(event) => {
          if (pointers.current.has(event.pointerId)) end(event, true);
        }}
      >
        <div
          className="relative"
          style={{
            width: Math.max(viewport.width, size.width * view.scale),
            height: Math.max(viewport.height, size.height * view.scale),
          }}
        >
          <div
            className="absolute"
            data-testid="document-content"
            style={{
              width: size.width * view.scale,
              height: size.height * view.scale,
              left: Math.max(0, (viewport.width - size.width * view.scale) / 2),
              top: Math.max(0, (viewport.height - size.height * view.scale) / 2),
            }}
          >
            {children(view.scale)}
          </div>
        </div>
      </section>
    </div>
  );
}
