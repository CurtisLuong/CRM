import { useEffect, useRef, useState } from 'react';
import type { FeatureRoute } from '@/app/routes';
import { useAppSession } from '@/app/session';
import { EmptyState, TextField } from '@/components/crm';
import { Button, Card, Textarea, toast } from '@/components/ui';
import { useRepositoryAccount } from '@/data/hooks';
import { defaultTemplates, localSettingsKey, type SettingsTemplate, validTemplates } from '@/features/settings/model';

const FIELD = 'min-h-11 w-full rounded-sm border border-input bg-surface-100 px-3 py-2 text-body text-ink';

function ZaloTemplatesPage() {
  const account = useRepositoryAccount();
  const { isDemo } = useAppSession();
  const userId = account?.sync.local.userId || '';
  const [templates, setTemplates] = useState<SettingsTemplate[]>(defaultTemplates());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [online, setOnline] = useState(() => !isDemo && (typeof navigator === 'undefined' || navigator.onLine));
  const pendingSync = useRef(false);
  const syncBusy = useRef(false);
  const templatesRef = useRef(templates);
  templatesRef.current = templates;

  useEffect(() => {
    const update = () => setOnline(!isDemo && navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [isDemo]);

  useEffect(() => {
    if (!online || syncBusy.current || !pendingSync.current || !account || !userId) return;
    let active = true;
    syncBusy.current = true;
    setSaving(true);
    void account.remote
      .saveZaloTemplatesRemote(templatesRef.current)
      .then((ok) => {
        if (!active) return;
        pendingSync.current = !ok;
        if (ok) setMessage('Đã đồng bộ mẫu tin đã lưu trên thiết bị.');
      })
      .catch(() => {
        pendingSync.current = true;
      })
      .finally(() => {
        syncBusy.current = false;
        if (active) setSaving(false);
      });
    return () => {
      active = false;
    };
  }, [online, account, userId]);

  useEffect(() => {
    if (!account || !userId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    try {
      const local = localStorage.getItem(localSettingsKey('zalo', userId));
      if (local) setTemplates(validTemplates(JSON.parse(local)));
    } catch {
      /* Giữ mẫu mặc định nếu dữ liệu cục bộ không đọc được. */
    }
    if (isDemo) {
      setLoading(false);
      setMessage('Đang dùng mẫu tin lưu trên trình duyệt. Dữ liệu mẫu không đồng bộ lên tài khoản.');
      return () => {
        active = false;
      };
    }
    void account.remote
      .getZaloTemplatesRemote()
      .then((remoteTemplates) => {
        if (!active) return;
        if (Array.isArray(remoteTemplates)) {
          const valid = validTemplates(remoteTemplates);
          setTemplates(valid);
          localStorage.setItem(localSettingsKey('zalo', userId), JSON.stringify(remoteTemplates));
        } else if (remoteTemplates === null) {
          const local = localStorage.getItem(localSettingsKey('zalo', userId));
          if (local) void account.remote.saveZaloTemplatesRemote(validTemplates(JSON.parse(local)));
        }
      })
      .catch(() => {
        if (active) setMessage('Đang dùng mẫu tin đã lưu trên thiết bị.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [account, userId, isDemo]);

  const setTemplate = (id: string, patch: Partial<SettingsTemplate>) =>
    setTemplates((all) => all.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const addTemplate = () => setTemplates((all) => [...all, { id: `u_${crypto.randomUUID()}`, name: '', text: '' }]);
  const save = async () => {
    if (!account || !userId || saving) return;
    syncBusy.current = true;
    setSaving(true);
    setMessage('');
    try {
      localStorage.setItem(localSettingsKey('zalo', userId), JSON.stringify(templates));
      if (isDemo) {
        setMessage('Đã lưu trên trình duyệt. Dữ liệu mẫu không đồng bộ lên tài khoản.');
        toast.success('Đã lưu mẫu tin');
        return;
      }
      const ok = await account.remote.saveZaloTemplatesRemote(templates);
      pendingSync.current = !ok;
      setMessage(ok ? 'Đã lưu và đồng bộ mẫu tin.' : 'Đã lưu trên thiết bị; đồng bộ sẽ thử lại khi có mạng.');
      toast.success('Đã lưu mẫu tin');
    } catch {
      pendingSync.current = !isDemo;
      setMessage('Đã lưu trên thiết bị; chưa đồng bộ được lên tài khoản.');
    } finally {
      syncBusy.current = false;
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4 pb-28">
      <header>
        <h1 className="text-title">Mẫu tin Zalo</h1>
        <p className="text-caption text-ink-muted">Lưu mẫu để điền nhanh khi chăm sóc khách. Tin nhắn không tự gửi.</p>
      </header>
      {!account ? <EmptyState title="Chưa đăng nhập" text="Đăng nhập để đồng bộ mẫu tin theo tài khoản." /> : null}
      {isDemo && (
        <p role="status" className="rounded-md bg-ion-tint p-3 text-caption text-ink">
          Mẫu tin trong dữ liệu mẫu chỉ lưu trên trình duyệt.
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-ink-muted">{templates.length} mẫu tin</p>
        <Button disabled={!account || loading} onClick={addTemplate}>
          Thêm mẫu
        </Button>
      </div>
      {loading ? (
        <p className="text-caption text-ink-muted">Đang tải mẫu tin…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((item) => (
            <Card key={item.id} className="flex flex-col gap-3 p-4">
              <TextField
                label="Tên mẫu"
                aria-label="Tên mẫu"
                maxLength={60}
                value={item.name}
                onChange={(event) => setTemplate(item.id, { name: event.target.value })}
                placeholder="Tên mẫu"
              />
              <label className="flex flex-col gap-1 text-caption" htmlFor={`zalo-template-${item.id}`}>
                Nội dung {item.name ? `— ${item.name}` : 'mẫu mới'}
                <Textarea
                  id={`zalo-template-${item.id}`}
                  className={`${FIELD} min-h-28`}
                  rows={4}
                  value={item.text}
                  onChange={(event) => setTemplate(item.id, { text: event.target.value })}
                  placeholder="Nội dung tin nhắn"
                />
              </label>
              {!defaultTemplates().some((template) => template.id === item.id) && (
                <Button
                  variant="destructive"
                  onClick={() => setTemplates((all) => all.filter((entry) => entry.id !== item.id))}
                >
                  Xoá mẫu
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
      <div className="sticky bottom-2 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-100/95 p-3 shadow-lg backdrop-blur">
        <Button
          disabled={!account || loading || saving}
          variant="primary"
          onClick={() => {
            if (window.confirm('Khôi phục mẫu mặc định? Mẫu bạn tự thêm sẽ bị xoá khi bấm Lưu.'))
              setTemplates(defaultTemplates());
          }}
        >
          Khôi phục mẫu mặc định
        </Button>
        <Button variant="primary" disabled={!account || loading || saving} onClick={() => void save()}>
          {saving ? 'Đang lưu…' : 'Lưu mẫu tin'}
        </Button>
        {message && (
          <p role="status" className="basis-full text-caption text-ink-muted">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}

export const route: FeatureRoute = {
  path: '/mau-zalo',
  element: <ZaloTemplatesPage />,
  handle: { title: 'Mẫu tin Zalo' },
};
