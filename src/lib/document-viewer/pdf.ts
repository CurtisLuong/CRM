import type { PDFDocumentProxy } from 'pdfjs-dist';

/** Chỉ kéo pdf.js và worker nội bộ vào khi người dùng mở PDF. */
export async function loadPdf(blob: Blob, signal: AbortSignal): Promise<PDFDocumentProxy> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  signal.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = new Uint8Array(await blob.arrayBuffer());
  signal.throwIfAborted();
  const task = pdfjs.getDocument({ data });
  const cancel = () => void task.destroy();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const pdf = await task.promise;
    if (signal.aborted) {
      await pdf.loadingTask.destroy();
      signal.throwIfAborted();
    }
    return pdf;
  } catch (reason) {
    await task.destroy();
    throw reason;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
