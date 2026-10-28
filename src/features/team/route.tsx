import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeatureRoute } from '@/app/routes';
import { Avatar, EmptyState, PageHeader } from '@/components/crm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast as sonnerToast } from '@/components/ui/sonner';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import { memberLabel, type TeamMember } from './model';

const FIELD =
  'min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 text-body text-ink focus-visible:outline-2 focus-visible:outline-ion';
const cacheKey = (id: string) => `crm_team:${id}`;

function Team() {
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const userId = account?.sync.local.userId || '';
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState('');
  const [myName, setMyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'offline' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const loadRequest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++loadRequest.current;
    if (!account || !userId) {
      setMembers([]);
      setMyName('');
      return;
    }
    setLoadState('loading');
    setLoadError('');
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey(userId)) || '[]');
      setMembers(Array.isArray(cached) ? cached : []);
    } catch {
      setMembers([]);
    }
    if (!account.sync.isOnline()) {
      setLoadState('offline');
      return;
    }
    try {
      // teamList() discards RPC errors. Read the result here to explain the actual failure.
      account.sync.local.assertOpen();
      const { data, error: rpcError } = await account.sync.client.rpc('team_list');
      if (request !== loadRequest.current) return;
      account.sync.local.assertOpen();
      if (rpcError) throw rpcError;
      const rows = (data || []) as TeamMember[];
      setMembers(rows);
      setLoadState('ready');
      localStorage.setItem(cacheKey(userId), JSON.stringify(rows));
      setMyName(rows.find((member) => member.is_me)?.full_name || '');
    } catch (cause) {
      if (request !== loadRequest.current) return;
      if (!account.sync.isOnline()) {
        setLoadState('offline');
        return;
      }
      const detail = cause as { code?: string; message?: string } | null;
      const message = detail?.message || 'Máy chủ không phản hồi. Vui lòng thử lại.';
      const missingRpc =
        (detail?.code === 'PGRST202' || detail?.code === '42883') && /(?:public\.)?team_list\b/i.test(message);
      const expiredSession = detail?.code === 'PGRST301' || detail?.code === 'PGRST303';
      setLoadError(
        expiredSession
          ? 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại để xem đồng nghiệp.'
          : missingRpc
            ? 'Máy chủ thiếu hàm team_list. Nhờ trưởng nhóm kiểm tra SQL/add_team_assign.sql.'
            : `Chưa tải được danh sách nhóm: ${message}`,
      );
      setLoadState('error');
    }
  }, [account, userId]);

  useEffect(() => {
    void refresh();
    const reload = () => void refresh();
    window.addEventListener('online', reload);
    window.addEventListener('offline', reload);
    return () => {
      loadRequest.current += 1;
      window.removeEventListener('online', reload);
      window.removeEventListener('offline', reload);
    };
  }, [refresh]);

  const me = members.find((member) => member.is_me);
  const admin = !!me?.is_admin;
  const submit = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
      sonnerToast.success(success, { description: 'Danh sách nhóm đã cập nhật.' });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause || 'Thử lại.');
      setError(message);
      sonnerToast.error('Chưa cập nhật được nhóm', { description: message });
    } finally {
      setBusy(false);
    }
  };
  const addMember = () => {
    const normalized = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      setError('Nhập email hợp lệ.');
      return;
    }
    if (!account) return;
    void submit(() => account.remote.teamAdd(normalized), 'Đã thêm đồng nghiệp');
    setEmail('');
  };
  const saveName = () => {
    if (account) void submit(() => account.remote.setMyName(myName.trim()), 'Đã lưu tên hiển thị');
  };
  const removeMember = (member: TeamMember) => {
    if (!account || !admin || member.is_me || member.is_admin) return;
    const assigned = customers.filter((customer) => customer.owner_id === member.user_id).length;
    const warning = assigned
      ? `\n\nNgười này đang phụ trách ${assigned} khách. Khách vẫn thuộc họ cho tới khi bạn giao lại.`
      : '';
    if (!window.confirm(`Xoá ${memberLabel(member)} khỏi nhóm?${warning}`)) return;
    void submit(() => account.remote.teamRemove(member.user_id), 'Đã xoá đồng nghiệp');
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 p-4 pb-24 lg:p-6">
      <PageHeader
        title="Đồng nghiệp"
        count={members.length}
        noun="người"
        subtitle="Trưởng nhóm thêm thành viên bằng email. Người theo dõi chỉ xem khách; chỉ người phụ trách được sửa."
        sticky={false}
      />
      {userId && loadState === 'offline' && (
        <p role="status" className="rounded-md border border-line bg-surface-200 p-3 text-caption text-ink-muted">
          Ngoại tuyến.{' '}
          {members.length ? 'Đang hiển thị danh sách đã lưu trên thiết bị.' : 'Kết nối mạng để tải danh sách nhóm.'}
        </p>
      )}
      {userId && loadState === 'error' && (
        <p role="alert" className="rounded-md bg-alert-tint p-3 text-caption text-alert-text">
          {loadError}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-alert-tint p-3 text-caption text-alert-text">
          {error}
        </p>
      )}

      <section className="space-y-3 rounded-md border border-line bg-surface-100 p-4" aria-labelledby="team-name-title">
        <h2 id="team-name-title" className="text-title">
          Tên hiển thị của bạn
        </h2>
        <p className="text-caption text-ink-muted">
          Đồng nghiệp sẽ thấy tên này trong danh sách nhóm và khi nhận khách.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Tên hiển thị"
            className={FIELD}
            maxLength={80}
            value={myName}
            onChange={(e) => setMyName(e.target.value)}
          />
          <Button onClick={saveName} disabled={busy || !myName.trim() || !userId || loadState !== 'ready'}>
            Lưu tên
          </Button>
        </div>
      </section>

      {admin && (
        <section
          className="space-y-3 rounded-md border border-line bg-surface-100 p-4"
          aria-labelledby="team-add-title"
        >
          <h2 id="team-add-title" className="text-title">
            Thêm đồng nghiệp
          </h2>
          <p className="text-caption text-ink-muted">Người nhận cần tạo tài khoản trong ứng dụng trước.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              aria-label="Email đồng nghiệp"
              className={FIELD}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ten@example.com"
            />
            <Button variant="primary" onClick={addMember} disabled={busy}>
              Thêm
            </Button>
          </div>
        </section>
      )}

      <section
        className="overflow-hidden rounded-md border border-line bg-surface-100"
        aria-labelledby="team-list-title"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 id="team-list-title" className="text-title">
              Thành viên
            </h2>
            <p className="text-caption text-ink-muted">{members.length} người trong nhóm</p>
          </div>
          {admin && (
            <span className="rounded-full border border-line bg-surface-200 px-2 py-1 text-caption">Trưởng nhóm</span>
          )}
        </div>
        {members.length ? (
          <ul className="divide-y divide-border">
            {members.map((member) => (
              <li
                key={member.user_id}
                className="flex min-h-16 items-center gap-3 border-b border-line p-4 last:border-b-0"
              >
                <Avatar name={memberLabel(member)} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-semibold">
                    {memberLabel(member)}
                    {member.is_me ? ' · Bạn' : ''}
                  </p>
                  <p className="truncate text-caption text-ink-muted">{member.email || 'Chưa có email'}</p>
                </div>
                {member.is_admin && (
                  <span className="rounded-full border border-line bg-surface-200 px-2 py-1 text-caption">
                    Trưởng nhóm
                  </span>
                )}
                {admin && !member.is_me && !member.is_admin && (
                  <Button variant="destructive" onClick={() => removeMember(member)} disabled={busy}>
                    Xoá
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            title={
              !userId
                ? 'Bạn chưa đăng nhập'
                : loadState === 'ready'
                  ? 'Nhóm chưa có thành viên'
                  : loadState === 'loading'
                    ? 'Đang tải danh sách nhóm…'
                    : 'Chưa có danh sách nhóm'
            }
            text={
              !userId
                ? 'Đăng nhập để xem đồng nghiệp.'
                : loadState === 'ready'
                  ? 'Nhờ trưởng nhóm thêm đồng nghiệp bằng email.'
                  : loadState === 'offline'
                    ? 'Kết nối mạng để tải danh sách nhóm.'
                    : 'Danh sách nhóm chưa tải được. Vui lòng thử lại.'
            }
            actions={
              userId && loadState !== 'loading' ? <Button onClick={() => void refresh()}>Tải lại</Button> : undefined
            }
          />
        )}
      </section>
    </main>
  );
}

export const route: FeatureRoute = { path: '/dong-nghiep', element: <Team />, handle: { title: 'Đồng nghiệp' } };
