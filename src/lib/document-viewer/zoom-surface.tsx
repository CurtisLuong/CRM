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
import { clampPan, fitScale, MAX_SCALE, type Point, panView, type Size, type ViewTransform, zoomAt } from './geometry';

type Pinch = { a: number; b: number; view: ViewTransform; distance: number; middle: Point };
type Gesture = {
  start: Point;
  moved: boolean;
  pinched: boolean;
  pan: { view: ViewTransform; point: Point } | null;
  pinch: Pinch | null;
};
const middleOf = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distanceOf = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

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
  const box = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Size>({ width: 1, height: 1 });
  const minimum = fitScale(size, viewport, pdf);
  const [view, setView] = useState<ViewTransform>({ scale: minimum, x: 0, y: 0 });
  // `current` = trạng thái đã cam kết (khớp layout); `pending` = trạng thái đang kéo/chụm (chỉ transform).
  const current = useRef(view);
  const pending = useRef<ViewTransform | null>(null);
  const frame = useRef(0);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef(0);
  const pointerType = useRef('mouse');

  const clearFrame = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
  };
  /** Gốc nội dung trên màn hình ứng với một view khi layout đang ở đúng view đó. */
  const origin = (value: ViewTransform): Point => ({
    x: Math.max(0, (viewport.width - size.width * value.scale) / 2) - value.x,
    y: Math.max(0, (viewport.height - size.height * value.scale) / 2) - value.y,
  });
  /** Vẽ trạng thái mới bằng transform trên layout cũ — không đổi width/height, không layout lại. */
  const paint = (next: ViewTransform) => {
    const node = box.current;
    if (!node) return;
    if (next.scale === current.current.scale && next.x === current.current.x && next.y === current.current.y) {
      node.style.transform = '';
      return;
    }
    const from = origin(current.current);
    const to = origin(next);
    node.style.transform = `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${next.scale / current.current.scale})`;
  };
  const schedule = (next: ViewTransform) => {
    pending.current = next;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (pending.current) paint(pending.current);
    });
  };
  const commit = (next: ViewTransform) => {
    clearFrame();
    pending.current = null;
    current.current = next;
    setView(next);
  };
  const zoom = (scale: number, anchor = { x: viewport.width / 2, y: viewport.height / 2 }) => {
    commit(zoomAt(current.current, scale, anchor, size, viewport, minimum));
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
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    pending.current = null;
    const next = { scale: minimum, x: 0, y: 0 };
    current.current = next;
    setView(next);
    box.current?.style.removeProperty('transform');
  }, [minimum]);

  // Cam kết xong mới đổi layout: cuộn tới đúng chỗ và bỏ transform trong cùng một khung hình.
  useLayoutEffect(() => {
    const node = surface.current;
    if (node) {
      node.scrollLeft = view.x;
      node.scrollTop = view.y;
    }
    box.current?.style.removeProperty('transform');
  }, [view]);

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

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
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
      pending.current = null;
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
  const beginPinch = (state: Gesture) => {
    const entries = [...pointers.current.entries()];
    const first = entries[0];
    const second = entries[1];
    if (!first || !second) return;
    const [a, pa] = first;
    const [b, pb] = second;
    state.pinched = true;
    state.moved = true;
    state.pan = null;
    state.pinch = {
      a,
      b,
      view: pending.current ?? current.current,
      distance: Math.max(1, distanceOf(pa, pb)),
      middle: middleOf(pa, pb),
    };
  };
  const rebase = (state: Gesture) => {
    const entries = [...pointers.current.entries()];
    const [first, second] = entries;
    if (!first) return;
    if (second) {
      beginPinch(state);
      return;
    }
    state.pinch = null;
    state.pan = { view: pending.current ?? current.current, point: first[1] };
    state.moved = true;
  };
  const end = (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const state = gesture.current;
    const endPoint = point(event);
    pointers.current.delete(event.pointerId);
    if (!state) return;
    if (pointers.current.size) {
      rebase(state);
      return;
    }
    gesture.current = null;
    const desired = pending.current ?? current.current;
    commit(desired);
    if (cancelled) return;
    if (!state.pinched) {
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
        <Button className="px-2" onClick={() => commit({ scale: minimum, x: 0, y: 0 })}>
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
          if (!gesture.current) {
            gesture.current = {
              start: position,
              moved: false,
              pinched: false,
              pan: { view: current.current, point: position },
              pinch: null,
            };
          }
          if (pointers.current.size === 2 && gesture.current) beginPinch(gesture.current);
        }}
        onPointerMove={(event) => {
          const previous = pointers.current.get(event.pointerId);
          if (!previous) return;
          const next = point(event);
          pointers.current.set(event.pointerId, next);
          const state = gesture.current;
          if (!state) return;
          if (Math.hypot(next.x - state.start.x, next.y - state.start.y) > 8) state.moved = true;
          if (state.pinch && pointers.current.has(state.pinch.a) && pointers.current.has(state.pinch.b)) {
            const a = pointers.current.get(state.pinch.a);
            const b = pointers.current.get(state.pinch.b);
            if (!a || !b) return;
            const distance = distanceOf(a, b);
            if (!distance) return;
            const middle = middleOf(a, b);
            const zoomed = zoomAt(
              state.pinch.view,
              (state.pinch.view.scale * distance) / state.pinch.distance,
              state.pinch.middle,
              size,
              viewport,
              minimum,
            );
            schedule({
              scale: zoomed.scale,
              ...clampPan(
                {
                  x: zoomed.x + state.pinch.middle.x - middle.x,
                  y: zoomed.y + state.pinch.middle.y - middle.y,
                },
                zoomed.scale,
                size,
                viewport,
              ),
            });
          } else if (state.pan && (pdf || state.pan.view.scale > minimum + 0.001)) {
            schedule(panView(state.pan.view, state.pan.point, next, size, viewport));
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
            ref={box}
            className="absolute"
            data-testid="document-content"
            style={{
              width: size.width * view.scale,
              height: size.height * view.scale,
              left: Math.max(0, (viewport.width - size.width * view.scale) / 2),
              top: Math.max(0, (viewport.height - size.height * view.scale) / 2),
              transformOrigin: '0 0',
            }}
          >
            {children(view.scale)}
          </div>
        </div>
      </section>
    </div>
  );
}
