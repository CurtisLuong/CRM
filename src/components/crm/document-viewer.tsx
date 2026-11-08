import { Dialog as DialogPrimitive } from 'radix-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog';
import { fileTypeLabel, formatBytes, OfflineDocumentError, previewKind } from '@/lib/document-viewer/files';
import { ImageDocument, PdfDocument } from '@/lib/document-viewer/preview';
import { Icon } from '@/ui/Icon';

export type DocumentViewerFile = {
  id: string;
  name: string;
  mime: string;
  size?: number | null;
  load: (signal: AbortSignal) => Promise<Blob>;
};
export type DocumentViewerProps = {
  files: DocumentViewerFile[];
  fileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tiêu đề hiển thị (mục tài liệu); không truyền → tên tệp. */
  title?: string;
  onFileChange?: (id: string) => void;
  onReplace?: (file: DocumentViewerFile, replacement: File) => Promise<void>;
  onDelete?: (file: DocumentViewerFile) => Promise<void>;
  onShare?: (file: DocumentViewerFile, blob: Blob) => Promise<void>;
  busy?: boolean;
};

/** Xem trước ảnh/PDF trong app; màn gọi cung cấp blob, quyền và thao tác lưu của riêng mình. */
export function DocumentViewer(props: DocumentViewerProps) {
  const { files, fileId, open, onOpenChange, title, onFileChange, onReplace, onDelete, onShare, busy = false } = props;
  const index = files.findIndex((file) => file.id === fileId);
  const file = files[index];
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [working, setWorking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const picker = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const loader = useRef(file?.load);
  loader.current = file?.load;
  const disabled = busy || working;
  const previewError = useCallback(() => setError('Chưa tải được tệp'), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Thử lại chủ động tạo lượt tải mới dù tệp không đổi.
  useEffect(() => {
    setBlob(null);
    setError('');
    setActionError('');
    if (!open || !fileId || !loader.current) return;
    const controller = new AbortController();
    void loader
      .current(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setBlob(value);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof OfflineDocumentError || navigator.onLine === false
              ? 'Cần mạng để tải tệp này'
              : 'Chưa tải được tệp',
          );
      });
    return () => controller.abort();
  }, [open, fileId, attempt]);

  const run = async (action: () => Promise<void>) => {
    if (disabled) return;
    setWorking(true);
    setActionError('');
    try {
      await action();
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError'))
        setActionError(reason instanceof Error ? reason.message : 'Chưa thực hiện được. Thử lại.');
    } finally {
      setWorking(false);
    }
  };
  const navigate = (direction: -1 | 1) => {
    const next = files[index + direction];
    if (next && !disabled) onFileChange?.(next.id);
  };
  if (!file) return null;
  const kind = previewKind(file.name, file.mime);
  const heading = title?.trim() || file.name;
  const meta = [fileTypeLabel(file.name, file.mime), file.size != null ? formatBytes(file.size) : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[calc(50%+(env(safe-area-inset-top)-env(safe-area-inset-bottom))/2)] z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-line bg-surface-100 text-ink shadow-overlay animate-pop h-[calc(100dvh-16px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-h-[calc(100dvh-16px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[calc(100%-16px)] max-w-[960px] gap-0 overflow-hidden sm:h-[calc(100dvh-32px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:max-h-[calc(100dvh-32px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:w-[calc(100%-32px)]"
          onOpenAutoFocus={() => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
          }}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-line p-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-body" title={file.name}>
                {heading}
              </DialogTitle>
              <DialogDescription className="text-caption">
                {meta}
                {files.length > 1 && (
                  <span className="ml-2">
                    {index + 1}/{files.length}
                  </span>
                )}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button size="icon" aria-label="Đóng" title="Đóng">
                <Icon name="close" />
              </Button>
            </DialogClose>
          </header>
          {files.length > 1 && onFileChange && (
            <nav
              className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-1"
              aria-label="Chuyển tệp"
            >
              <Button className="px-2" disabled={index <= 0 || disabled} onClick={() => navigate(-1)}>
                <Icon name="file_previous" />
                Tệp trước
              </Button>
              <Button className="px-2" disabled={index >= files.length - 1 || disabled} onClick={() => navigate(1)}>
                Tệp sau
                <Icon name="open" />
              </Button>
            </nav>
          )}
          <div className="flex min-h-0 flex-1 flex-col bg-surface-200">
            {error ? (
              <div className="m-auto flex flex-col items-center gap-3 p-4">
                <p role="alert" className="text-body">
                  {error}
                </p>
                <Button onClick={() => setAttempt((value) => value + 1)}>
                  <Icon name="sync" />
                  Thử lại
                </Button>
              </div>
            ) : !blob ? (
              <p role="status" className="m-auto p-4 text-body">
                Đang tải…
              </p>
            ) : kind === 'image' ? (
              <ImageDocument key={file.id} blob={blob} name={file.name} onError={previewError} onNavigate={navigate} />
            ) : kind === 'pdf' ? (
              <PdfDocument key={file.id} blob={blob} onError={previewError} onNavigate={navigate} />
            ) : (
              <div className="m-auto flex max-w-full flex-col items-center gap-2 p-4 text-center">
                <Icon name="file" size={24} />
                <p className="text-body font-semibold">Chưa xem trước được loại tệp này</p>
                <p className="max-w-full break-all text-body">{file.name}</p>
                <p className="text-caption text-ink-muted">{meta}</p>
              </div>
            )}
          </div>
          {actionError && (
            <p role="alert" className="shrink-0 px-3 pt-2 text-caption text-alert-text">
              {actionError}
            </p>
          )}
          {(onReplace || onDelete || onShare) && (
            <footer className="flex shrink-0 items-center justify-end gap-2 overflow-x-auto border-t border-line p-3">
              {onReplace && (
                <>
                  <input
                    ref={picker}
                    type="file"
                    className="sr-only"
                    aria-label="Chọn tệp thay thế"
                    disabled={disabled}
                    onChange={(event) => {
                      const replacement = event.currentTarget.files?.[0];
                      event.currentTarget.value = '';
                      if (replacement) void run(() => onReplace(file, replacement));
                    }}
                  />
                  <Button className="px-2" disabled={disabled} onClick={() => picker.current?.click()}>
                    <Icon name="replace_file" />
                    Đổi tệp
                  </Button>
                </>
              )}
              {onDelete && (
                <Button
                  className="px-2"
                  variant="destructive"
                  disabled={disabled}
                  onClick={() => void run(() => onDelete(file))}
                >
                  <Icon name="delete" />
                  Xoá
                </Button>
              )}
              {onShare && (
                <Button
                  className="px-2"
                  disabled={disabled || !blob}
                  onClick={() => {
                    if (blob) void run(() => onShare(file, blob));
                  }}
                >
                  <Icon name="share" />
                  Chia sẻ
                </Button>
              )}
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
