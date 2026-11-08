import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import type { Size } from './geometry';
import { loadPdf } from './pdf';
import { ZoomSurface } from './zoom-surface';

export function ImageDocument({
  blob,
  name,
  onError,
  onNavigate,
}: {
  blob: Blob;
  name: string;
  onError: () => void;
  onNavigate?: (direction: -1 | 1) => void;
}) {
  const [image, setImage] = useState<{ url: string; size: Size } | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    const probe = new Image();
    probe.onload = () => setImage({ url, size: { width: probe.naturalWidth, height: probe.naturalHeight } });
    probe.onerror = onError;
    probe.src = url;
    return () => {
      probe.onload = null;
      probe.onerror = null;
      probe.src = '';
      URL.revokeObjectURL(url);
    };
  }, [blob, onError]);
  if (!image)
    return (
      <p role="status" className="m-auto p-4 text-body">
        Đang tải…
      </p>
    );
  return (
    <ZoomSurface size={image.size} onNavigate={onNavigate}>
      {() => (
        <img
          src={image.url}
          alt={name}
          draggable={false}
          className="block size-full max-w-none select-none object-contain"
        />
      )}
    </ZoomSurface>
  );
}

type PdfPage = { page: PDFPageProxy; width: number; height: number };
function PdfCanvas({ item, scale, onError }: { item: PdfPage; scale: number; onError: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!canvas.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), {
      rootMargin: '400px',
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = canvas.current;
    if (!node || !visible) return;
    const viewport = item.page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
    node.width = Math.ceil(viewport.width);
    node.height = Math.ceil(viewport.height);
    const task = item.page.render({ canvas: node, viewport });
    void task.promise.catch((error: unknown) => {
      if (!(error instanceof Error && error.name === 'RenderingCancelledException')) onError();
    });
    return () => {
      task.cancel();
      // Không giữ bộ đệm trang ở ngoài vùng xem, nhất là PDF scan trên điện thoại.
      node.width = 1;
      node.height = 1;
    };
  }, [item, scale, visible, onError]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={`Trang ${item.page.pageNumber}`}
      data-testid="pdf-page"
      className="mx-auto block"
      style={{ width: item.width * scale, height: item.height * scale }}
    />
  );
}

export function PdfDocument({
  blob,
  onError,
  onNavigate,
}: {
  blob: Blob;
  onError: () => void;
  onNavigate?: (direction: -1 | 1) => void;
}) {
  const [pages, setPages] = useState<PdfPage[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    let document: PDFDocumentProxy | undefined;
    void (async () => {
      document = await loadPdf(blob, controller.signal);
      const next: PdfPage[] = [];
      for (let index = 1; index <= document.numPages; index++) {
        controller.signal.throwIfAborted();
        const page = await document.getPage(index);
        const viewport = page.getViewport({ scale: 1 });
        next.push({ page, width: viewport.width, height: viewport.height });
      }
      if (!controller.signal.aborted) setPages(next);
    })().catch(() => {
      if (!controller.signal.aborted) onError();
    });
    return () => {
      controller.abort();
      void document?.loadingTask.destroy();
    };
  }, [blob, onError]);
  if (!pages.length)
    return (
      <p role="status" className="m-auto p-4 text-body">
        Đang tải…
      </p>
    );
  const size = {
    width: Math.max(...pages.map((item) => item.width)),
    height: pages.reduce((sum, item) => sum + item.height, 0) + (pages.length - 1) * 16,
  };
  return (
    <ZoomSurface size={size} pdf onNavigate={onNavigate}>
      {(scale) => (
        <div className="flex flex-col" style={{ gap: 16 * scale }}>
          {pages.map((item) => (
            <PdfCanvas key={item.page.pageNumber} item={item} scale={scale} onError={onError} />
          ))}
        </div>
      )}
    </ZoomSurface>
  );
}
