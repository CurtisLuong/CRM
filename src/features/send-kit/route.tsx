import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { isDemo } from '@/app/session';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import { appendInteractionPatch, createInteraction } from '@/domain/customer/interactions';
import { Button, EmptyState, useToast } from '@/ui';
import {
  formatBytes,
  initiallySelected,
  normalizeProject,
  type SendKitFile,
  type SendKitItem,
  selectedFiles,
  sendKitText,
  totalFileSize,
  uniqueProjects,
} from './model';
import { deleteSendKitItem, listSendKitItems, reorderSendKitItems, saveSendKitItem } from './store';

const FIELD =
  'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-text focus:outline-2 focus:outline-accent';
const sizeLabel = (files: SendKitFile[]) => `${files.length} tệp · ${formatBytes(totalFileSize(files))}`;

function ImagePreview({ file }: { file: SendKitFile }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url ? <img src={url} alt={file.name} className="size-14 rounded-control object-cover" /> : null;
}

function SendKitPage() {
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const customerId = params.get('customer');
  const customer = customers.find((item) => item.id === customerId) ?? null;
  const userId = account?.sync.local.userId;
  const writable = !!account && !!customer && customer.owner_id === userId && !customer.archived_at;
  const [items, setItems] = useState<SendKitItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SendKitItem | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [project, setProject] = useState('');
  const [files, setFiles] = useState<SendKitFile[]>([]);
  const [error, setError] = useState('');
  const [catalogProjects, setCatalogProjects] = useState<string[]>([]);
  const [confirmText, setConfirmText] = useState(false);

  const projectNames = useMemo(() => {
    const fromCustomers = customers.flatMap((row) =>
      Array.isArray(row.projects) ? row.projects.filter((name): name is string => typeof name === 'string') : [],
    );
    return uniqueProjects([...catalogProjects, ...fromCustomers]);
  }, [customers, catalogProjects]);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void listSendKitItems(userId)
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Không đọc được kho tài liệu.');
      })
      .finally(() => active && setLoading(false));
    if (!isDemo())
      void account?.catalog.load().then(() => {
        if (active)
          setCatalogProjects(
            account.catalog
              .projects()
              .map((row) => String(row.name ?? ''))
              .filter(Boolean),
          );
      });
    return () => {
      active = false;
    };
  }, [userId, account]);

  useEffect(() => {
    if (!customer) return;
    setSelected(
      new Set(items.filter((item) => initiallySelected(item, customer.projects ?? [])).map((item) => item.id)),
    );
  }, [customer, items]);

  const grouped = useMemo(() => {
    const groups = new Map<string, SendKitItem[]>();
    for (const item of items) {
      const key = item.project ?? '';
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return groups;
  }, [items]);

  const beginCreate = () => {
    setEditing(null);
    setTitle('');
    setText('');
    setProject('');
    setFiles([]);
    setError('');
    setFormOpen(true);
  };
  const beginEdit = (item: SendKitItem) => {
    setEditing(item);
    setTitle(item.title);
    setText(item.text);
    setProject(item.project ?? '');
    setFiles(item.files);
    setError('');
    setFormOpen(true);
  };
  const persist = async () => {
    if (!userId) return;
    if (!title.trim()) {
      setError('Nhập tiêu đề tài liệu.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const now = Date.now();
      const item: SendKitItem = {
        id: editing?.id ?? crypto.randomUUID(),
        title: title.trim(),
        text: text.trim(),
        project: project || null,
        files,
        order: editing?.order ?? items.length,
        updatedAt: now,
      };
      await saveSendKitItem(userId, item);
      setItems((old) => [...old.filter((row) => row.id !== item.id), item].sort((a, b) => a.order - b.order));
      setFormOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không lưu được tài liệu.');
    } finally {
      setSaving(false);
    }
  };
  const removeItem = async (item: SendKitItem) => {
    if (!userId) return;
    try {
      await deleteSendKitItem(userId, item.id);
      const next = items.filter((row) => row.id !== item.id).map((row, index) => ({ ...row, order: index }));
      await reorderSendKitItems(userId, next);
      setItems(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không xoá được tài liệu.');
    }
  };
  const move = async (item: SendKitItem, offset: -1 | 1) => {
    if (!userId) return;
    const next = [...items];
    const index = next.findIndex((row) => row.id === item.id);
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    const current = next[index];
    const adjacent = next[target];
    if (!current || !adjacent) return;
    next[index] = adjacent;
    next[target] = current;
    const ordered = next.map((row, order) => ({ ...row, order }));
    try {
      await reorderSendKitItems(userId, ordered);
      setItems(ordered);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không đổi được thứ tự.');
    }
  };

  const share = async () => {
    if (!account || !customer || !userId || !writable || saving) return;
    const chosen = items.filter((item) => selected.has(item.id)).sort((a, b) => a.order - b.order);
    if (!chosen.length) return;
    setSaving(true);
    setError('');
    const message = sendKitText(chosen, selected, customer);
    const attachments = selectedFiles(chosen, selected);
    const titles = chosen.map((item) => item.title).join(', ');
    try {
      if (!attachments.length) {
        const { copyAndOpenZalo } = await import('@/features/quick-actions/zalo');
        await copyAndOpenZalo(message, customer.phone);
        setConfirmText(true);
        toast({
          title: 'Đã chép chữ và mở Zalo',
          description: 'Khi quay lại, xác nhận nếu bạn đã gửi để ghi lịch sử.',
        });
        setSaving(false);
        return;
      }
      const shareFiles = attachments.map(
        (file) => new File([file.blob], file.name, { type: file.type || 'application/octet-stream' }),
      );
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (
        typeof nav.share === 'function' &&
        typeof nav.canShare === 'function' &&
        nav.canShare({ files: shareFiles })
      ) {
        if (message) await navigator.clipboard.writeText(message);
        await nav.share({ files: shareFiles, text: message });
        const latest = account.customers.getSnapshot().find((row) => row.id === customer.id) ?? customer;
        await account.customers.update(
          customer.id,
          appendInteractionPatch(
            latest,
            createInteraction('sent', userId, new Date().toISOString(), `Đã gửi tài liệu: ${titles}`),
          ),
        );
        toast({ title: 'Đã chép chữ', description: 'Nếu Zalo không kèm chữ, dán vào khung chat.' });
      } else {
        if (message) await navigator.clipboard.writeText(message);
        for (const file of shareFiles) {
          const url = URL.createObjectURL(file);
          const link = document.createElement('a');
          link.href = url;
          link.download = file.name;
          link.click();
          URL.revokeObjectURL(url);
        }
        const { copyAndOpenZalo } = await import('@/features/quick-actions/zalo');
        await copyAndOpenZalo(message, customer.phone);
        toast({
          title: 'Đã chép chữ, mở Zalo và tải tệp',
          description: 'Thiết bị này không hỗ trợ chia sẻ tệp trực tiếp; hãy đính kèm các tệp vừa tải trong Zalo.',
        });
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? `Chưa chia sẻ được: ${reason.message}` : 'Chưa chia sẻ được. Hãy thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const confirmTextSent = async () => {
    if (!account || !customer || !userId) return;
    setSaving(true);
    try {
      const latest = account.customers.getSnapshot().find((row) => row.id === customer.id) ?? customer;
      const titles = items
        .filter((item) => selected.has(item.id))
        .sort((a, b) => a.order - b.order)
        .map((item) => item.title)
        .join(', ');
      await account.customers.update(
        customer.id,
        appendInteractionPatch(
          latest,
          createInteraction('sent', userId, new Date().toISOString(), `Đã gửi tài liệu: ${titles}`),
        ),
      );
      toast({ title: 'Đã ghi tương tác Zalo' });
      navigate(-1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không ghi được lịch sử tương tác.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectedCount = selected.size;
  const selectedFileCount = selectedFiles(items, selected).length;
  if (!account || !userId)
    return (
      <main className="mx-auto max-w-3xl p-4">
        <EmptyState
          title="Chưa mở được kho tài liệu"
          hint="Đăng nhập hoặc mở dữ liệu mẫu để dùng tài liệu gửi khách."
        />
      </main>
    );
  if (customerId && !customer)
    return (
      <main className="mx-auto max-w-3xl p-4">
        <EmptyState title="Không tìm thấy khách" hint="Khách có thể đã được lưu trữ hoặc chưa tải trên máy." />
      </main>
    );

  if (customer) {
    const customerProjectNames = uniqueProjects(customer.projects ?? []);
    const common = items.filter((item) => item.project === null);
    const matched = items.filter(
      (item) =>
        item.project &&
        customerProjectNames.some((name) => normalizeProject(name) === normalizeProject(item.project ?? '')),
    );
    const other = items.filter((item) => item.project && !matched.includes(item));
    const groups: [string, SendKitItem[]][] = [
      ['Chung', common],
      ['Dự án của khách', matched],
      ['Dự án khác', other],
    ];
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pb-28">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-small text-text-2">Gửi tài liệu</p>
            <h1 className="text-title">{customer.full_name}</h1>
          </div>
          <Button variant="secondary" onClick={() => navigate('/tai-lieu')}>
            Quản lý
          </Button>
        </header>
        {!writable && (
          <p role="status" className="rounded-control bg-surface-2 p-3 text-small text-text-2">
            Khách nhóm · Chỉ xem. Gửi tài liệu bị tắt.
          </p>
        )}
        {groups.map(
          ([label, rows]) =>
            rows.length > 0 && (
              <section key={label} className="flex flex-col gap-2">
                <h2 className="text-heading">{label}</h2>
                {rows.map((item) => (
                  <label
                    key={item.id}
                    className="flex min-h-12 items-start gap-3 rounded-control border border-border bg-surface p-3"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-current"
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-strong">{item.title}</span>
                      <span className="text-small text-text-2">
                        {item.files.length ? sizeLabel(item.files) : 'Chỉ có chữ'}
                      </span>
                    </span>
                  </label>
                ))}
              </section>
            ),
        )}
        {items.length === 0 && <EmptyState title="Chưa có tài liệu" hint="Thêm tài liệu trước khi gửi cho khách." />}
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}
        <footer className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface p-3">
          <div className="mx-auto max-w-3xl">
            <Button
              variant="primary"
              block
              loading={saving}
              disabled={!writable || selectedCount === 0}
              onClick={() => void share()}
            >
              Gửi qua Zalo ({selectedCount} mục · {selectedFileCount} tệp)
            </Button>
          </div>
        </footer>
        {confirmText && (
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              disabled={!writable || saving || !items.length || selectedCount === 0}
              onClick={() => void confirmTextSent()}
            >
              Đã gửi sau khi quay lại Zalo
            </Button>
          </div>
        )}
      </main>
    );
  }

  const groupNames = [
    '',
    ...uniqueProjects([...projectNames, ...items.map((item) => item.project ?? '').filter(Boolean)]),
  ];
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-small text-text-2">Gửi nhanh qua Zalo</p>
          <h1 className="text-title">Tài liệu gửi khách</h1>
        </div>
        <Button variant="primary" onClick={beginCreate}>
          Thêm tài liệu
        </Button>
      </header>
      <p className="text-small text-text-2">Bản thử: tài liệu lưu trên máy này, chưa đồng bộ sang máy khác</p>
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="text-small text-text-2">
          Đang tải tài liệu…
        </p>
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có tài liệu"
          hint="Lưu điều kiện mua, giấy tờ hoặc tệp dự án để gửi nhanh."
          action={{ label: 'Thêm tài liệu', onClick: beginCreate, icon: 'add' }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groupNames.map((name) => {
            const rows = grouped.get(name) ?? [];
            if (!rows.length && name) return null;
            return (
              <details key={name || 'common'} open className="rounded-card border border-border bg-surface p-3">
                <summary className="cursor-pointer text-heading">
                  {name || 'Chung'} <span className="text-small text-text-2">· {rows.length}</span>
                </summary>
                <div className="mt-3 flex flex-col gap-2">
                  {rows.map((item) => (
                    <article
                      key={item.id}
                      className="flex flex-wrap items-center gap-3 rounded-control bg-surface-2 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="text-body-strong">{item.title}</h3>
                        {item.text && (
                          <p className="line-clamp-2 whitespace-pre-wrap text-small text-text-2">{item.text}</p>
                        )}
                        <p className="text-small text-text-2">
                          {item.files.length ? sizeLabel(item.files) : 'Chỉ có chữ'}
                        </p>
                        {item.files.some((file) => file.type.startsWith('image/')) && (
                          <div className="mt-2 flex gap-2">
                            {item.files
                              .filter((file) => file.type.startsWith('image/'))
                              .slice(0, 3)
                              .map((file) => (
                                <ImagePreview key={file.id} file={file} />
                              ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          aria-label={`Lên ${item.title}`}
                          disabled={items.indexOf(item) === 0}
                          onClick={() => void move(item, -1)}
                        >
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label={`Xuống ${item.title}`}
                          disabled={items.indexOf(item) === items.length - 1}
                          onClick={() => void move(item, 1)}
                        >
                          ↓
                        </Button>
                        <Button variant="secondary" onClick={() => beginEdit(item)}>
                          Sửa
                        </Button>
                        <Button variant="danger" onClick={() => void removeItem(item)}>
                          Xoá
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-kit-form-title"
            className="max-h-[90dvh] w-full max-w-xl overflow-auto rounded-t-card bg-surface p-4 sm:rounded-card"
          >
            <h2 id="send-kit-form-title" className="text-heading">
              {editing ? 'Sửa tài liệu' : 'Thêm tài liệu'}
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-small">
                Tiêu đề
                <input className={FIELD} value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-small">
                Nội dung chữ
                <textarea
                  className={FIELD}
                  rows={5}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Có thể dùng {ten}, {sale}, {du_an}"
                />
              </label>
              <label className="flex flex-col gap-1 text-small">
                Thuộc nhóm
                <select className={FIELD} value={project} onChange={(event) => setProject(event.target.value)}>
                  <option value="">Chung</option>
                  {projectNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-small">
                Tệp đính kèm
                <input
                  className={FIELD}
                  type="file"
                  multiple
                  accept="image/*,video/*,application/pdf"
                  onChange={(event) => {
                    const added = Array.from(event.target.files ?? []).map((file) => ({
                      id: crypto.randomUUID(),
                      name: file.name,
                      type: file.type,
                      size: file.size,
                      blob: file,
                    }));
                    setFiles((old) => [...old, ...added]);
                    event.target.value = '';
                  }}
                />
              </label>
              {files.map((file) => (
                <div key={file.id} className="flex items-center gap-2 text-small">
                  <span className="min-w-0 flex-1 truncate">
                    {file.name} · {formatBytes(file.size)}
                  </span>
                  <Button
                    variant="ghost"
                    aria-label={`Bỏ tệp ${file.name}`}
                    onClick={() => setFiles((old) => old.filter((row) => row.id !== file.id))}
                  >
                    Bỏ
                  </Button>
                </div>
              ))}
              {error && (
                <p role="alert" className="text-small text-danger">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setFormOpen(false)}>
                  Huỷ
                </Button>
                <Button variant="primary" loading={saving} onClick={() => void persist()}>
                  Lưu tài liệu
                </Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export const route: FeatureRoute = { path: '/tai-lieu', element: <SendKitPage />, handle: { title: 'Tài liệu' } };
