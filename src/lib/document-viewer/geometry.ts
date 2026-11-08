export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type ViewTransform = Point & { scale: number };
export const MAX_SCALE = 8;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function fitScale(content: Size, viewport: Size, widthOnly = false): number {
  if (!content.width || !content.height || !viewport.width || !viewport.height) return 1;
  return widthOnly
    ? Math.min(MAX_SCALE, viewport.width / content.width)
    : Math.min(1, viewport.width / content.width, viewport.height / content.height);
}

export function clampPan(point: Point, scale: number, content: Size, viewport: Size): Point {
  return {
    x: clamp(point.x, 0, Math.max(0, content.width * scale - viewport.width)),
    y: clamp(point.y, 0, Math.max(0, content.height * scale - viewport.height)),
  };
}

/** Kéo nội dung 1:1 với ngón tay/chuột: dịch đúng quãng di chuyển, dừng ở mép. */
export function panView(current: ViewTransform, from: Point, to: Point, content: Size, viewport: Size): ViewTransform {
  return {
    scale: current.scale,
    ...clampPan({ x: current.x + from.x - to.x, y: current.y + from.y - to.y }, current.scale, content, viewport),
  };
}

/** Giữ nguyên điểm ảnh dưới ngón tay/chuột, kể cả khi ảnh chuyển từ giữa khung sang có cuộn. */
export function zoomAt(
  current: ViewTransform,
  requested: number,
  anchor: Point,
  content: Size,
  viewport: Size,
  minimum: number,
): ViewTransform {
  const scale = clamp(requested, minimum, MAX_SCALE);
  const axis = (position: number, cursor: number, extent: number, windowSize: number) => {
    const before = Math.max(0, (windowSize - extent * current.scale) / 2);
    const after = Math.max(0, (windowSize - extent * scale) / 2);
    return ((position + cursor - before) / current.scale) * scale + after - cursor;
  };
  return {
    scale,
    ...clampPan(
      {
        x: axis(current.x, anchor.x, content.width, viewport.width),
        y: axis(current.y, anchor.y, content.height, viewport.height),
      },
      scale,
      content,
      viewport,
    ),
  };
}
