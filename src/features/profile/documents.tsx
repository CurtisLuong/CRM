import { useEffect, useState } from 'react';
import type { IconName } from '@/config/icons';
import { Button, Icon, useToast } from '@/ui';

/** Hàng `documents` có sẵn (storage_path chỉ dùng để mở/xoá, không hiện cho người dùng). */
export type ProfileDocument = {
  id: string;
  customer_id?: string;
  label?: string | null;
  kind?: string | null;
  storage_path: string;
  mime?: string | null;
  size?: number | null;
};

/** Phần remote API có sẵn mà khối tài liệu dùng. */
export type DocumentsRemote = {
  listDocuments(customerId: string): Promise<ProfileDocument[]>;
  uploadDocument(
    customerId: string,
    file: Blob & { name?: string },
    kind?: string,
    label?: string | null,
  ): Promise<ProfileDocument>;
  deleteDocument(doc: ProfileDocument): Promise<void>;
  signedDocUrl(storagePath: string): Promise<string | null>;
};

type GroupKey = 'image' | 'pdf' | 'word' | 'sheet' | 'other';

const GROUPS: ReadonlyArray<{ key: GroupKey; label: string; icon: IconName }> = [
  { key: 'image', label: 'Ảnh chụp', icon: 'image' },
  { key: 'pdf', label: 'PDF', icon: 'file' },
  { key: 'word', label: 'Văn bản', icon: 'docs' },
  { key: 'sheet', label: 'Bảng tính', icon: 'file' },
  { key: 'other', label: 'Khác', icon: 'file' },
];
const GROUP_LABEL = Object.fromEntries(GROUPS.map((group) => [group.key, group.label])) as Record<GroupKey, string>;
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'svg', 'tif', 'tiff']);
const WORD_EXT = new Set(['doc', 'docx']);
const SHEET_EXT = new Set(['xls', 'xlsx']);
const TYPE_BY_EXT: Record<string, string> = {
  jpg: 'Ảnh JPG',
  jpeg: 'Ảnh JPEG',
  png: 'Ảnh PNG',
  gif: 'Ảnh GIF',
  webp: 'Ảnh WEBP',
  heic: 'Ảnh HEIC',
  pdf: 'PDF',
  doc: 'Word',
  docx: 'Word',
  xls: 'Excel',
  xlsx: 'Excel',
};

/** Tên tệp người dùng (ưu tiên nhãn đã lưu), không bao giờ là storage_path. */
export function documentName(doc: ProfileDocument): string {
  const label = typeof doc.label === 'string' ? doc.label.trim() : '';
  if (label) return label;
  const fromPath = doc.storage_path.split('/').pop() || '';
  return fromPath || 'Tài liệu';
}

function fileExt(doc: ProfileDocument): string {
  const name = documentName(doc);
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function documentGroup(doc: ProfileDocument): GroupKey {
  const mime = (doc.mime || '').toLowerCase();
  const ext = fileExt(doc);
  if (mime.startsWith('image/') || IMAGE_EXT.has(ext)) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime === 'application/msword' || mime.includes('wordprocessingml') || WORD_EXT.has(ext)) return 'word';
  if (mime === 'application/vnd.ms-excel' || mime.includes('spreadsheetml') || SHEET_EXT.has(ext)) return 'sheet';
  return 'other';
}

/** "2,4 MB"; không có kích thước → ''. */
export function formatFileSize(size: number | null | undefined): string {
  if (!size || size <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: unit > 0 ? 1 : 0 }).format(value)} ${units[unit]}`;
}

/** Loại + kích thước nếu có, ví dụ "PDF · 2,4 MB". */
export function documentMeta(doc: ProfileDocument): string {
  const ext = fileExt(doc);
  const type = TYPE_BY_EXT[ext] || (ext ? `Tệp ${ext.toUpperCase()}` : GROUP_LABEL[documentGroup(doc)]);
  return [type, formatFileSize(doc.size)].filter(Boolean).join(' · ');
}

/** Nhóm theo loại, chỉ giữ nhóm có tệp, theo thứ tự cố định. */
export function groupDocuments(docs: ProfileDocument[]): Array<{
  key: GroupKey;
  label: string;
  icon: IconName;
  docs: ProfileDocument[];
}> {
  return GROUPS.map((group) => ({
    ...group,
    docs: docs.filter((doc) => documentGroup(doc) === group.key),
  })).filter((group) => group.docs.length > 0);
}

/**
 * Tài liệu của khách: tải danh sách khi mở, nhóm theo loại, mở/tải lên/xoá có xác nhận.
 * Lỗi tải KHÔNG hiện như "chưa có tài liệu"; trạng thái trống chỉ hiện khi đã đọc xong.
 */
export function DocumentsSection({
  customerId,
  remote,
  writable,
  busy = false,
  online = true,
  onCountChange,
}: {
  customerId: string;
  remote: DocumentsRemote | null;
  writable: boolean;
  busy?: boolean;
  online?: boolean;
  onCountChange?: (count: number) => void;
}) {
  const toast = useToast();
  const [docs, setDocs] = useState<ProfileDocument[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  useEffect(() => {
    let alive = true;
    setDocs([]);
    setError('');
    setLoading(true);
    if (!remote) {
      setLoading(false);
      setError('Chưa tải được tài liệu.');
      return;
    }
    void remote
      .listDocuments(customerId)
      .then((rows) => {
        if (!alive) return;
        const list = Array.isArray(rows) ? rows : [];
        setDocs(list);
        onCountChange?.(list.length);
      })
      .catch((reason: unknown) => {
        if (!alive) return;
        setError(reason instanceof Error ? reason.message : 'Chưa tải được tài liệu.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [customerId, remote, onCountChange]);

  const upload = async (file?: File | null) => {
    if (!file || !remote || !writable || uploading) return;
    setUploading(true);
    try {
      const doc = await remote.uploadDocument(
        customerId,
        file,
        file.type.startsWith('image/') ? 'anh' : 'khac',
        file.name,
      );
      const next = [...docs, doc];
      setDocs(next);
      onCountChange?.(next.length);
      toast({ title: 'Đã tải tài liệu lên' });
    } catch (reason) {
      toast({
        title: 'Chưa tải được tài liệu',
        description: reason instanceof Error ? reason.message : 'Thử lại.',
        tone: 'error',
      });
    } finally {
      setUploading(false);
    }
  };

  const remove = async (doc: ProfileDocument) => {
    if (!remote || !writable || deletingId) return;
    if (!window.confirm(`Xoá tài liệu “${documentName(doc)}”?`)) return;
    setDeletingId(doc.id);
    try {
      await remote.deleteDocument(doc);
      const next = docs.filter((item) => item.id !== doc.id);
      setDocs(next);
      onCountChange?.(next.length);
      toast({ title: 'Đã xoá tài liệu' });
    } catch (reason) {
      toast({
        title: 'Chưa xoá được tài liệu',
        description: reason instanceof Error ? reason.message : 'Thử lại.',
        tone: 'error',
      });
    } finally {
      setDeletingId('');
    }
  };

  const open = async (doc: ProfileDocument) => {
    if (!remote) return;
    try {
      const url = await remote.signedDocUrl(doc.storage_path);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else toast({ title: 'Chưa mở được tài liệu', description: 'Cần mạng để lấy liên kết.', tone: 'error' });
    } catch (reason) {
      toast({
        title: 'Chưa mở được tài liệu',
        description: reason instanceof Error ? reason.message : 'Thử lại.',
        tone: 'error',
      });
    }
  };

  const groups = groupDocuments(docs);

  return (
    <section className="space-y-4" aria-label="Tài liệu khách">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-section">Tài liệu &amp; ảnh</h2>
        {writable && (
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-border-strong px-3 text-body-strong">
            Tải tài liệu
            <input
              className="sr-only"
              type="file"
              aria-label="Tải tài liệu"
              disabled={busy || uploading}
              onChange={(event) => {
                void upload(event.currentTarget.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
      {!error && loading && (
        <p role="status" className="text-body text-text-2">
          Đang tải tài liệu…
        </p>
      )}
      {!error && !loading && !docs.length && (
        <p className="text-body text-text-2">
          {online ? 'Chưa có tài liệu.' : 'Ngoại tuyến · tài liệu chỉ tải khi có mạng.'}
        </p>
      )}
      {!error &&
        groups.map((group) => (
          <section key={group.key} aria-labelledby={`profile-doc-group-${group.key}`} className="space-y-1">
            <h3 id={`profile-doc-group-${group.key}`} className="flex items-center gap-2 text-label text-text-2">
              <Icon name={group.icon} size={16} />
              {group.label}
              <span className="font-data text-mono-data text-text-3">{group.docs.length}</span>
            </h3>
            <ul>
              {group.docs.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-start justify-between gap-3 border-b border-border py-2"
                  data-document-id={doc.id}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <Icon name={group.icon} size={20} className="mt-1 shrink-0 text-text-3" />
                    <div className="min-w-0">
                      <p className="text-body-strong [overflow-wrap:anywhere]">{documentName(doc)}</p>
                      <p className="text-small text-text-3">{documentMeta(doc)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button onClick={() => void open(doc)}>Mở</Button>
                    {writable && (
                      <Button
                        variant="ghost"
                        icon="delete"
                        loading={deletingId === doc.id}
                        disabled={busy}
                        aria-label={`Xoá ${documentName(doc)}`}
                        onClick={() => void remove(doc)}
                      >
                        Xoá
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      {!writable && <p className="text-small text-text-2">Bạn chỉ có quyền xem; thao tác sửa và tải lên đã khoá.</p>}
    </section>
  );
}
