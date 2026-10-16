import { useCallback, useEffect, useState } from 'react';
import type { FeatureRoute } from '@/app/routes';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import { Avatar, Badge, Button, useToast } from '@/ui';
import { memberLabel, type TeamMember } from './model';

const FIELD =
  'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 text-body text-text focus-visible:outline-2 focus-visible:outline-focus';
const cacheKey = (id: string) => `crm_team:${id}`;

function Team() {
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const toast = useToast();
  const userId = account?.sync.local.userId || '';
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState('');
  const [myName, setMyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    if (!account || !userId) return;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey(userId)) || '[]');
      if (Array.isArray(cached)) setMembers(cached);
    } catch {
      setMembers([]);
    }
    const remote = await account.remote.teamList();
    if (!remote) {
      setOffline(true);
      return;
    }
    const rows = remote as TeamMember[];
    setMembers(rows);
    setOffline(false);
    localStorage.setItem(cacheKey(userId), JSON.stringify(rows));
    setMyName(rows.find((member) => member.is_me)?.full_name || '');
  }, [account, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const me = members.find((member) => member.is_me);
  const admin = !!me?.is_admin;
  const submit = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
      toast({ title: success, description: 'Danh sách nhóm đã cập nhật.' });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause || 'Thử lại.');
      setError(message);
      toast({ title: 'Chưa cập nhật được nhóm', description: message, tone: 'error' });
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
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-24 lg:p-6">
      <header className="space-y-1">
        <h1 className="text-title">Đồng nghiệp</h1>
        <p className="text-small text-text-2">
          Trưởng nhóm thêm thành viên bằng email. Người theo dõi chỉ xem khách; chỉ người phụ trách được sửa.
        </p>
      </header>
      {offline && (
        <p role="status" className="rounded-control border border-border bg-surface-2 p-3 text-small text-text-2">
          Ngoại tuyến hoặc chưa cài SQL nhóm. Đang hiển thị danh sách đã lưu trên thiết bị.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-control bg-danger/10 p-3 text-small text-danger">
          {error}
        </p>
      )}

      <section
        className="space-y-3 rounded-card border border-border bg-surface p-4 shadow-e1"
        aria-labelledby="team-name-title"
      >
        <h2 id="team-name-title" className="text-section">
          Tên hiển thị của bạn
        </h2>
        <p className="text-small text-text-2">Đồng nghiệp sẽ thấy tên này trong danh sách nhóm và khi nhận khách.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="Tên hiển thị"
            className={FIELD}
            maxLength={80}
            value={myName}
            onChange={(e) => setMyName(e.target.value)}
          />
          <Button onClick={saveName} loading={busy} disabled={!myName.trim()}>
            Lưu tên
          </Button>
        </div>
      </section>

      {admin && (
        <section
          className="space-y-3 rounded-card border border-border bg-surface p-4 shadow-e1"
          aria-labelledby="team-add-title"
        >
          <h2 id="team-add-title" className="text-section">
            Thêm đồng nghiệp
          </h2>
          <p className="text-small text-text-2">Người nhận cần tạo tài khoản trong ứng dụng trước.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              aria-label="Email đồng nghiệp"
              className={FIELD}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ten@example.com"
            />
            <Button variant="primary" onClick={addMember} loading={busy}>
              Thêm
            </Button>
          </div>
        </section>
      )}

      <section
        className="overflow-hidden rounded-card border border-border bg-surface"
        aria-labelledby="team-list-title"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 id="team-list-title" className="text-section">
              Thành viên
            </h2>
            <p className="text-small text-text-2">{members.length} người trong nhóm</p>
          </div>
          {admin && <Badge variant="count">Trưởng nhóm</Badge>}
        </div>
        {members.length ? (
          <ul className="divide-y divide-border">
            {members.map((member) => (
              <li key={member.user_id} className="flex items-center gap-3 p-4">
                <Avatar name={memberLabel(member)} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-strong">
                    {memberLabel(member)}
                    {member.is_me ? ' · Bạn' : ''}
                  </p>
                  <p className="truncate text-small text-text-2">{member.email || 'Chưa có email'}</p>
                </div>
                {member.is_admin && <Badge>Trưởng nhóm</Badge>}
                {admin && !member.is_me && !member.is_admin && (
                  <Button variant="danger" onClick={() => removeMember(member)} loading={busy}>
                    Xoá
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-2 p-4 text-body text-text-2">
            <p>Chưa tải được danh sách nhóm.</p>
            <p className="text-small">
              Trưởng nhóm cần chạy SQL/add_team_assign.sql và đặt role admin theo hướng dẫn nhóm.
            </p>
            <Button onClick={() => void refresh()}>Tải lại</Button>
          </div>
        )}
      </section>
    </main>
  );
}

export const route: FeatureRoute = { path: '/dong-nghiep', element: <Team />, handle: { title: 'Đồng nghiệp' } };
