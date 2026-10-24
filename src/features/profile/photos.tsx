import { useCallback, useEffect, useRef, useState } from 'react';
import type { Customer } from '@/domain/customer';
import { Avatar, Button, Icon, Sheet, useToast } from '@/ui';
import { cn } from '@/ui/cn';

/** Hai vị trí ảnh của hồ sơ khách. Chỉ nhận ảnh; upload cần mạng và quyền của người phụ trách. */
export type PhotoKind = 'avatar' | 'cover';

export type PhotoCustomer = Pick<Customer, 'id' | 'full_name' | 'avatar_path' | 'cover_path'>;

/** Phần remote API có sẵn mà khối ảnh dùng (không thêm hàm dữ liệu mới). */
export type PhotoRemote = {
  uploadAvatar(customerId: string, file: Blob & { name?: string }): Promise<string>;
  uploadCover(customerId: string, file: Blob & { name?: string }): Promise<string>;
  removeAvatar(customerId: string): Promise<void>;
  removeCover(customerId: string): Promise<void>;
  avatarUrl(path: string | null | undefined): string | null;
  coverUrl(path: string | null | undefined): string | null;
};

const LABEL: Record<PhotoKind, string> = { avatar: 'Ảnh đại diện', cover: 'Ảnh bìa' };
const LOWER: Record<PhotoKind, string> = { avatar: 'ảnh đại diện', cover: 'ảnh bìa' };
const EMPTY_CLIPBOARD = 'Clipboard chưa có ảnh. Hãy sao chép một ảnh rồi thử lại, hoặc chọn từ máy.';
const NO_CLIPBOARD = 'Trình duyệt không đọc được clipboard. Hãy dán bằng Ctrl/Cmd+V hoặc chọn từ máy.';
const CLIPBOARD_DENIED = 'Không đọc được clipboard (có thể bị chặn quyền). Hãy dán bằng Ctrl/Cmd+V hoặc chọn từ máy.';
const NOT_IMAGE = 'Chỉ nhận ảnh cho ảnh đại diện và ảnh bìa.';
const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

type NativeBridge = {
  isNativePlatform?: () => boolean;
  nativePromise?: (plugin: string, method: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

/** Tệp ảnh đầu tiên trong danh sách; tệp khác loại bị bỏ (chỉ nhận ảnh). */
export function imageFileFromList(files: ArrayLike<File> | null | undefined): File | null {
  if (!files) return null;
  for (const file of Array.from(files)) if (file.type.startsWith('image/')) return file;
  return null;
}

/** Ảnh từ sự kiện dán (Ctrl/Cmd+V): ưu tiên files, sau đó items. */
export function imageFileFromPaste(data: DataTransfer | null | undefined): File | null {
  if (!data) return null;
  const file = imageFileFromList(data.files);
  if (file) return file;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const picked = item.getAsFile();
    if (picked) return picked;
  }
  return null;
}

export function blobFromBase64(data: string, mime: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function fileFromBlob(blob: Blob, mime: string): File {
  const ext = IMAGE_EXT[mime] || mime.split('/')[1] || 'png';
  return new File([blob], `clipboard-${Date.now()}.${ext}`, { type: mime || 'image/png' });
}

/**
 * Đọc ảnh mới nhất trong clipboard: cầu nối Android `ClipboardImage.read` → navigator.clipboard.read.
 * Trả `message` nói rõ vì sao không đọc được; KHÔNG coi "không có ảnh" là lỗi mạng.
 */
export async function readClipboardImage(): Promise<{ file: File | null; message?: string }> {
  const native = (window as Window & { Capacitor?: NativeBridge }).Capacitor;
  if (native?.isNativePlatform?.() && typeof native.nativePromise === 'function') {
    try {
      const result = await native.nativePromise('ClipboardImage', 'read', {});
      const data = typeof result?.data === 'string' ? result.data : '';
      if (!data) return { file: null, message: EMPTY_CLIPBOARD };
      const mime = typeof result?.mime === 'string' && result.mime.startsWith('image/') ? result.mime : 'image/png';
      return { file: fileFromBlob(blobFromBase64(data, mime), mime) };
    } catch (error) {
      // APK cũ chưa có plugin → rơi xuống cách của trình duyệt; lỗi khác báo rõ.
      if (!/not implemented|not available|unimplemented/i.test(String(error))) {
        return { file: null, message: 'Không đọc được ảnh trong clipboard. Hãy thử “Chọn từ máy”.' };
      }
    }
  }
  if (typeof navigator === 'undefined' || !navigator.clipboard?.read) {
    return { file: null, message: NO_CLIPBOARD };
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((candidate) => candidate.startsWith('image/'));
      if (!type) continue;
      return { file: fileFromBlob(await item.getType(type), type) };
    }
    return { file: null, message: EMPTY_CLIPBOARD };
  } catch {
    return { file: null, message: CLIPBOARD_DENIED };
  }
}

/**
 * Khung ảnh đại diện / ảnh bìa bấm được. Chưa có ảnh → hộp thoại hai nguồn (máy · clipboard);
 * có ảnh → xem đầy đủ object-contain kèm Đổi ảnh / Xoá ảnh (có xác nhận). Khách chỉ xem không thấy thao tác ghi.
 */
export function ProfilePhotoFrame({
  kind,
  customer,
  remote,
  writable,
  busy = false,
  className,
}: {
  kind: PhotoKind;
  customer: PhotoCustomer;
  remote: PhotoRemote;
  /** Chỉ người phụ trách khách đang hoạt động mới thêm/đổi/xoá (D-003). */
  writable: boolean;
  busy?: boolean;
  className?: string;
}) {
  const toast = useToast();
  const label = LABEL[kind];
  const lower = LOWER[kind];
  const path = kind === 'avatar' ? customer.avatar_path : customer.cover_path;
  const url = path ? (kind === 'avatar' ? remote.avatarUrl(path) : remote.coverUrl(path)) : null;
  const [sheet, setSheet] = useState<'picker' | 'viewer' | 'confirm' | null>(null);
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastCustomer = useRef(customer.id);

  // Đổi khách trên cùng màn: đóng hộp thoại, không mang ảnh/trạng thái của khách trước sang.
  useEffect(() => {
    if (lastCustomer.current === customer.id) return;
    lastCustomer.current = customer.id;
    setSheet(null);
    setNotice('');
  }, [customer.id]);

  const submit = useCallback(
    async (file: File | null) => {
      if (!file || !writable || busy || uploading) return;
      if (!file.type.startsWith('image/')) {
        setNotice(NOT_IMAGE);
        return;
      }
      setNotice('');
      setUploading(true);
      try {
        if (kind === 'avatar') await remote.uploadAvatar(customer.id, file);
        else await remote.uploadCover(customer.id, file);
        setSheet(null);
        toast({ title: url ? `Đã đổi ${lower}` : `Đã thêm ${lower}` });
      } catch (error) {
        // Không cập nhật hồ sơ local → ảnh cũ vẫn nguyên.
        setNotice(`Chưa tải được ${lower}. Ảnh cũ vẫn được giữ. ${error instanceof Error ? error.message : ''}`.trim());
        toast({ title: `Chưa tải được ${lower}`, description: 'Ảnh cũ vẫn được giữ.', tone: 'error' });
      } finally {
        setUploading(false);
      }
    },
    [busy, customer.id, kind, lower, remote, toast, uploading, url, writable],
  );

  // Ctrl/Cmd+V khi hộp thoại chọn ảnh đang mở (paste event, không đọc clipboard trước thao tác).
  useEffect(() => {
    if (sheet !== 'picker') return;
    const onPaste = (event: ClipboardEvent) => {
      const file = imageFileFromPaste(event.clipboardData);
      if (file) {
        event.preventDefault();
        void submit(file);
      } else if (event.clipboardData) {
        setNotice(EMPTY_CLIPBOARD);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [sheet, submit]);

  const readClipboard = async () => {
    if (!writable || busy || uploading) return;
    setNotice('');
    setReading(true);
    try {
      const result = await readClipboardImage();
      if (result.file) await submit(result.file);
      else setNotice(result.message || EMPTY_CLIPBOARD);
    } finally {
      setReading(false);
    }
  };

  const remove = async () => {
    if (!writable || busy || removing) return;
    setRemoving(true);
    try {
      if (kind === 'avatar') await remote.removeAvatar(customer.id);
      else await remote.removeCover(customer.id);
      setSheet(null);
      setNotice('');
      toast({ title: `Đã xoá ${lower}` });
    } catch (error) {
      toast({
        title: `Chưa xoá được ${lower}`,
        description: error instanceof Error ? error.message : 'Thử lại.',
        tone: 'error',
      });
    } finally {
      setRemoving(false);
    }
  };

  const openFrame = () => {
    if (url) setSheet('viewer');
    else if (writable && !busy) setSheet('picker');
  };

  const frameClass = cn(
    'relative block overflow-hidden bg-surface-2 text-text-3 focus-visible:outline-2 focus-visible:outline-focus',
    kind === 'cover' ? 'h-24 w-full' : 'size-14 rounded-full',
    (writable || url) && 'cursor-pointer hover:brightness-95',
    className,
  );
  const frameBody = url ? (
    <img
      src={url}
      alt={kind === 'avatar' ? `${label} của ${customer.full_name}` : `${label} của ${customer.full_name}`}
      className="h-full w-full object-cover"
    />
  ) : (
    <span className="flex h-full w-full items-center justify-center">
      <Icon name="add" size={kind === 'cover' ? 24 : 20} label={writable ? label : undefined} />
    </span>
  );

  return (
    <div className={cn('flex flex-col gap-1', kind === 'cover' ? 'w-full' : 'shrink-0 items-center', className)}>
      {url || writable ? (
        <button
          type="button"
          aria-label={label}
          title={label}
          disabled={!url && (!writable || busy)}
          onClick={openFrame}
          className={frameClass}
        >
          {frameBody}
          {kind === 'cover' && (
            <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-surface/90 px-2 py-0.5 text-small text-text-2">
              {label}
            </span>
          )}
        </button>
      ) : kind === 'avatar' ? (
        <span role="img" aria-label={label} title={label} className="inline-flex">
          <Avatar name={customer.full_name} size={56} />
        </span>
      ) : (
        <span
          role="img"
          aria-label={label}
          title={label}
          className="flex h-24 w-full items-center justify-center bg-surface-2 text-text-3"
        >
          <Icon name="image" size={24} />
        </span>
      )}
      {kind === 'avatar' && <span className="text-small text-text-3">{label}</span>}

      <Sheet
        open={sheet === 'viewer'}
        onOpenChange={(open) => {
          if (!open) {
            setSheet(null);
            setNotice('');
          }
        }}
        title={label}
        description={writable ? 'Xem toàn bộ ảnh, không cắt.' : 'Bạn chỉ có quyền xem ảnh này.'}
      >
        <div className="space-y-4">
          {url && (
            <img
              src={url}
              alt={label}
              data-testid={`photo-viewer-${kind}`}
              className="max-h-[60dvh] w-full rounded-card bg-surface-2 object-contain"
            />
          )}
          {writable ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon="image" disabled={busy} onClick={() => setSheet('picker')}>
                Đổi ảnh
              </Button>
              <Button variant="danger" icon="delete" disabled={busy} onClick={() => setSheet('confirm')}>
                Xoá ảnh
              </Button>
            </div>
          ) : (
            <p className="text-small text-text-2">Khách nhóm và khách lưu trữ chỉ xem ảnh.</p>
          )}
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'picker'}
        onOpenChange={(open) => {
          if (!open) {
            setSheet(null);
            setNotice('');
          }
        }}
        title={url ? `Đổi ${lower}` : `Thêm ${lower}`}
        description="Chọn ảnh từ máy hoặc dán ảnh đã sao chép."
      >
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="primary"
              icon="image"
              disabled={busy || uploading}
              onClick={() => inputRef.current?.click()}
            >
              Chọn từ máy
            </Button>
            <Button
              variant="secondary"
              icon="copy"
              disabled={busy || uploading}
              loading={reading}
              onClick={() => void readClipboard()}
            >
              Dán từ clipboard
            </Button>
          </div>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            aria-label={`Chọn ${lower} từ máy`}
            disabled={busy || uploading}
            onChange={(event) => {
              void submit(event.currentTarget.files?.[0] ?? null);
              event.currentTarget.value = '';
            }}
          />
          <p className="text-small text-text-2">
            Mẹo: sao chép ảnh rồi bấm Ctrl/Cmd+V khi hộp thoại đang mở, hoặc dùng “Dán từ clipboard”.
          </p>
          {notice && (
            <p role="alert" className="text-small text-danger">
              {notice}
            </p>
          )}
          {uploading && (
            <p role="status" className="text-small text-text-2">
              Đang tải ảnh…
            </p>
          )}
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'confirm'}
        onOpenChange={(open) => {
          if (!open) setSheet(url ? 'viewer' : null);
        }}
        title={`Xoá ${lower}?`}
        description="Ảnh sẽ bị xoá khỏi hồ sơ khách. Thao tác này không hoàn tác được."
      >
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setSheet('viewer')}>
            Huỷ
          </Button>
          <Button
            className="flex-1"
            variant="danger"
            icon="delete"
            loading={removing}
            disabled={busy}
            onClick={() => void remove()}
          >
            Xoá ảnh
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
