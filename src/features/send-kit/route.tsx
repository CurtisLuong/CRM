import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { FeatureRoute } from '@/app/routes';
import { isDemo } from '@/app/session';
import { EmptyState, SearchBar, TextField } from '@/components/crm';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/components/ui/sonner';
import { Textarea } from '@/components/ui/textarea';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import { appendInteractionPatch, createInteraction } from '@/domain/customer/interactions';
import {
  defaultProject,
  filterItems,
  formatBytes,
  normalizeProject,
  type SendKitFile,
  type SendKitItem,
  selectedFiles,
  selectFirstShownProject,
  sendKitText,
  totalFileSize,
  uniqueProjects,
  visibleItems,
} from './model';
import { deleteSendKitItem, listSendKitItems, reorderSendKitItems, saveSendKitItem } from './store';

const sizeLabel = (files: SendKitFile[]) => `${files.length} tệp · ${formatBytes(totalFileSize(files))}`;

function ImagePreview({ file }: { file: SendKitFile }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url ? <img src={url} alt={file.name} className="size-14 rounded-sm object-cover" /> : null;
}

function SendKitPage() {
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const [params] = useSearchParams();
  const navigate = useNavigate();
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
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [pasteHelpMessage, setPasteHelpMessage] = useState('');
  const initializedCustomer = useRef<string | null>(null);
  const shownProjects = useRef(new Set<string>());

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
    if (!customer || loading || initializedCustomer.current === customer.id) return;
    const initialProject = defaultProject(customer.projects ?? [], items);
    initializedCustomer.current = customer.id;
    shownProjects.current = new Set([initialProject === null ? '__all__' : normalizeProject(initialProject)]);
    setActiveProject(initialProject);
    setSelected(selectFirstShownProject(items, new Set(), initialProject, true));
  }, [customer, items, loading]);

  const projectOptions = useMemo(
    () => uniqueProjects([...projectNames, ...items.map((item) => item.project ?? '').filter(Boolean)]),
    [projectNames, items],
  );
  const shownItems = useMemo(
    () => filterItems(visibleItems(items, activeProject), searchText),
    [items, activeProject, searchText],
  );
  const changeProject = (project: string | null) => {
    setActiveProject(project);
    if (customer) {
      const key = project === null ? '__all__' : normalizeProject(project);
      if (!shownProjects.current.has(key)) {
        shownProjects.current.add(key);
        setSelected((old) => selectFirstShownProject(items, old, project));
      }
    }
  };

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
      setSelected((old) => {
        const selection = new Set(old);
        selection.delete(item.id);
        return selection;
      });
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
      // Chỉ có chữ: link zalo.me/<số> báo "trang không tồn tại" khi khách không cho tìm bằng số (Curtis thử 28/10)
      // → dùng bảng chia sẻ như khi có tệp; máy không có bảng chia sẻ mới mở link Zalo.
      if (!attachments.length && typeof navigator.share === 'function') {
        await navigator.clipboard.writeText(message);
        await navigator.share({ text: message });
        const latest = account.customers.getSnapshot().find((row) => row.id === customer.id) ?? customer;
        await account.customers.update(
          customer.id,
          appendInteractionPatch(
            latest,
            createInteraction('sent', userId, new Date().toISOString(), `Đã gửi tài liệu: ${titles}`),
          ),
        );
        toast.success('Đã gửi tài liệu', { description: 'Đã ghi vào lịch sử khách.' });
        return;
      }
      if (!attachments.length) {
        const { copyAndOpenZalo } = await import('@/features/quick-actions/zalo');
        await copyAndOpenZalo(message, customer.phone);
        setConfirmText(true);
        toast.info('Đã chép chữ và mở Zalo', { description: 'Khi quay lại, xác nhận nếu bạn đã gửi để ghi lịch sử.' });
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
        if (attachments.length >= 2 && message) setPasteHelpMessage(message);
        else toast.info('Đã chép chữ', { description: 'Nếu Zalo không kèm chữ, dán vào khung chat.' });
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
        if (attachments.length >= 2 && message) setPasteHelpMessage(message);
        toast.info('Đã chép chữ, mở Zalo và tải tệp', {
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
      toast.success('Đã ghi tương tác Zalo');
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
  const hiddenSelected = items.filter(
    (item) => selected.has(item.id) && !shownItems.some((visible) => visible.id === item.id),
  );
  const projectValue = activeProject ?? '__all__';
  if (!account || !userId)
    return (
      <main className="mx-auto max-w-3xl p-4">
        <EmptyState
          title="Chưa mở được kho tài liệu"
          text="Đăng nhập hoặc mở dữ liệu mẫu để dùng tài liệu gửi khách."
        />
      </main>
    );
  if (customerId && !customer)
    return (
      <main className="mx-auto max-w-3xl p-4">
        <EmptyState title="Không tìm thấy khách" text="Khách có thể đã được lưu trữ hoặc chưa tải trên máy." />
      </main>
    );

  if (customer) {
    const customerProjectNames = uniqueProjects(customer.projects ?? []);
    const prioritizedProjects = [
      ...customerProjectNames.filter((name) =>
        projectOptions.some((option) => normalizeProject(option) === normalizeProject(name)),
      ),
      ...projectOptions.filter(
        (name) =>
          !customerProjectNames.some((customerName) => normalizeProject(customerName) === normalizeProject(name)),
      ),
    ];
    const commonItems = shownItems.filter((item) => item.project === null);
    const projectItems = shownItems.filter((item) => item.project !== null);
    const activeIsCustomerProject =
      !!activeProject &&
      customerProjectNames.some((name) => normalizeProject(name) === normalizeProject(activeProject));
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pb-36">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-label text-ink-muted">Gửi tài liệu</p>
            <h1 className="text-title">{customer.full_name}</h1>
          </div>
          <Button variant="secondary" onClick={() => navigate('/tai-lieu')}>
            Quản lý
          </Button>
        </header>
        {!writable && (
          <p role="status" className="rounded-sm bg-surface-200 p-3 text-label text-ink-muted">
            Khách nhóm · Chỉ xem. Gửi tài liệu bị tắt.
          </p>
        )}
        <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-2 border-y border-line bg-surface-100 p-3 shadow-sm sm:flex-row">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-label">
            Dự án
            <select
              aria-label="Dự án"
              className="min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 py-2 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion"
              value={projectValue}
              onChange={(event) => changeProject(event.target.value === '__all__' ? null : event.target.value)}
            >
              <option value="__all__">Tất cả dự án</option>
              {prioritizedProjects.map((name) => {
                const belongsToCustomer = customerProjectNames.some(
                  (customerName) => normalizeProject(customerName) === normalizeProject(name),
                );
                return (
                  <option key={name} value={name}>
                    {name}
                    {belongsToCustomer ? ' · của khách' : ''}
                  </option>
                );
              })}
            </select>
          </label>
          <div className="min-w-0 flex-1">
            <SearchBar
              label="Tìm tài liệu"
              value={searchText}
              onChange={setSearchText}
              placeholder="Tiêu đề, nội dung, tên tệp"
            />
          </div>
        </div>
        {commonItems.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-title">Chung</h2>
            {commonItems.map((item) => (
              <label
                key={item.id}
                className="flex min-h-12 items-start gap-3 rounded-sm border border-line bg-surface-100 p-3"
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-current"
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{item.title}</span>
                  <span className="text-label text-ink-muted">
                    {item.files.length ? sizeLabel(item.files) : 'Chỉ có chữ'}
                  </span>
                </span>
              </label>
            ))}
          </section>
        )}
        {projectItems.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-title">
              {activeProject === null ? 'Dự án' : `${activeProject}${activeIsCustomerProject ? ' · của khách' : ''}`}
            </h2>
            {projectItems.map((item) => (
              <label
                key={item.id}
                className="flex min-h-12 items-start gap-3 rounded-sm border border-line bg-surface-100 p-3"
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-current"
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{item.title}</span>
                  <span className="text-label text-ink-muted">
                    {item.files.length ? sizeLabel(item.files) : 'Chỉ có chữ'}
                  </span>
                </span>
              </label>
            ))}
          </section>
        )}
        {shownItems.length === 0 &&
          (searchText.trim() ? (
            <EmptyState
              title="Không có tài liệu khớp"
              actions={
                <Button variant="secondary" aria-label="Hiện lại danh sách" onClick={() => setSearchText('')}>
                  Xoá tìm kiếm
                </Button>
              }
            />
          ) : (
            <EmptyState title="Chưa có tài liệu" text="Thêm tài liệu trước khi gửi cho khách." />
          ))}
        {hiddenSelected.length > 0 && (
          <details className="rounded-sm border border-line bg-surface-100 p-3">
            <summary className="cursor-pointer font-semibold">Mục đã chọn đang ẩn · {hiddenSelected.length}</summary>
            <div className="mt-2 flex flex-col gap-2">
              {hiddenSelected.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-label">
                  <input type="checkbox" checked onChange={() => toggle(item.id)} />
                  {item.title} · {item.project ?? 'Chung'}
                </label>
              ))}
            </div>
          </details>
        )}
        {error && (
          <p role="alert" className="text-label text-alert-text">
            {error}
          </p>
        )}
        <footer className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface-100 p-3">
          <div className="mx-auto max-w-3xl">
            <p className="mb-2 text-center text-label text-ink-muted">
              Đã chọn {selectedCount} mục · {selectedFileCount} tệp
            </p>
            <Button
              variant="primary"
              className="w-full"
              disabled={saving || !writable || selectedCount === 0}
              onClick={() => void share()}
            >
              Gửi qua Zalo ({selectedCount} mục · {selectedFileCount} tệp)
            </Button>
          </div>
        </footer>
        {pasteHelpMessage && (
          <aside
            role="status"
            className="fixed inset-x-0 bottom-28 z-40 mx-auto flex max-w-3xl flex-col gap-2 border border-line bg-surface-100 p-3 shadow-lg"
          >
            <p className="text-label">
              Zalo không kèm chữ khi gửi nhiều tệp. Chữ đã chép sẵn — trong Zalo giữ ô chat → Dán → Gửi.
            </p>
            <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(pasteHelpMessage)}>
              Chép lại chữ
            </Button>
          </aside>
        )}
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

  const groupNames = activeProject === null ? ['', ...projectOptions] : ['', activeProject];
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-label text-ink-muted">Gửi nhanh qua Zalo</p>
          <h1 className="text-title">Tài liệu gửi khách</h1>
        </div>
        <Button variant="primary" onClick={beginCreate}>
          Thêm tài liệu
        </Button>
      </header>
      <p className="text-label text-ink-muted">Bản thử: tài liệu lưu trên máy này, chưa đồng bộ sang máy khác</p>
      <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-2 border-y border-line bg-surface-100 p-3 shadow-sm sm:flex-row">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-label">
          Dự án
          <select
            aria-label="Dự án"
            className="min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 py-2 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion"
            value={projectValue}
            onChange={(event) => changeProject(event.target.value === '__all__' ? null : event.target.value)}
          >
            <option value="__all__">Tất cả dự án</option>
            {projectOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="min-w-0 flex-1">
          <SearchBar
            label="Tìm tài liệu"
            value={searchText}
            onChange={setSearchText}
            placeholder="Tiêu đề, nội dung, tên tệp"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-label text-alert-text">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="text-label text-ink-muted">
          Đang tải tài liệu…
        </p>
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có tài liệu"
          text="Lưu điều kiện mua, giấy tờ hoặc tệp dự án để gửi nhanh."
          actions={<Button onClick={beginCreate}>Thêm tài liệu</Button>}
        />
      ) : shownItems.length === 0 ? (
        searchText.trim() ? (
          <EmptyState
            title="Không có tài liệu khớp"
            actions={
              <Button variant="secondary" aria-label="Hiện lại danh sách" onClick={() => setSearchText('')}>
                Xoá tìm kiếm
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Chưa có tài liệu"
            text="Lưu điều kiện mua, giấy tờ hoặc tệp dự án để gửi nhanh."
            actions={<Button onClick={beginCreate}>Thêm tài liệu</Button>}
          />
        )
      ) : (
        <div className="flex flex-col gap-4">
          {groupNames.map((name) => {
            const rows = shownItems.filter((item) => normalizeProject(item.project ?? '') === normalizeProject(name));
            if (!rows.length && name) return null;
            return (
              <details key={name || 'common'} open className="rounded-lg border border-line bg-surface-100 p-3">
                <summary className="cursor-pointer text-title">
                  {name || 'Chung'} <span className="text-label text-ink-muted">· {rows.length}</span>
                </summary>
                <div className="mt-3 flex flex-col gap-2">
                  {rows.map((item) => (
                    <Card key={item.id} className="bg-surface-200">
                      <CardContent className="flex flex-wrap items-center gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold">{item.title}</h3>
                          {item.text && (
                            <p className="line-clamp-2 whitespace-pre-wrap text-label text-ink-muted">{item.text}</p>
                          )}
                          <p className="text-label text-ink-muted">
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
                          <Button variant="destructive" onClick={() => void removeItem(item)}>
                            Xoá
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
      <Sheet open={formOpen} onOpenChange={(open) => open && setFormOpen(true)}>
        <SheetContent
          aria-labelledby="send-kit-form-title"
          onEscapeKeyDown={(event) => event.preventDefault()}
          className="w-full sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle id="send-kit-form-title">{editing ? 'Sửa tài liệu' : 'Thêm tài liệu'}</SheetTitle>
          </SheetHeader>
          <SheetBody className="gap-3">
            <TextField label="Tiêu đề" value={title} onChange={(event) => setTitle(event.target.value)} />
            <label htmlFor="send-kit-text" className="flex flex-col gap-1.5 text-label">
              Nội dung chữ
              <Textarea
                id="send-kit-text"
                rows={5}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Có thể dùng {ten}, {sale}, {du_an}"
              />
            </label>
            <label className="flex flex-col gap-1 text-label">
              Thuộc nhóm
              <select
                className="min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 py-2 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion"
                value={project}
                onChange={(event) => setProject(event.target.value)}
              >
                <option value="">Chung</option>
                {projectNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-label">
              Tệp đính kèm
              <input
                className="min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 py-2 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion"
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
              <div key={file.id} className="flex items-center gap-2 text-label">
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
              <p role="alert" className="text-label text-alert-text">
                {error}
              </p>
            )}
          </SheetBody>
          <SheetFooter className="justify-end">
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Huỷ
            </Button>
            <Button variant="primary" disabled={saving} onClick={() => void persist()}>
              Lưu tài liệu
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </main>
  );
}

/** Đổi khách (hoặc bỏ khách → trang quản lý) dựng lại màn để dự án/tìm/hướng dẫn dán trở về mặc định. */
function SendKitRoute() {
  const [params] = useSearchParams();
  return <SendKitPage key={params.get('customer') ?? ''} />;
}

export const route: FeatureRoute = { path: '/tai-lieu', element: <SendKitRoute />, handle: { title: 'Tài liệu' } };
