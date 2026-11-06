import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { useToast } from '@/ui/Toast';
import {
  type AssignmentMode,
  assignmentFollowers,
  assignmentNote,
  canAssignCustomer,
  memberLabel,
  type TeamMember,
} from './model';

export type TeamPerson = {
  user_id?: string;
  id?: string;
  name?: string;
  full_name?: string;
  email?: string;
  is_admin?: boolean;
  is_me?: boolean;
};

export const toMembers = (team: TeamPerson[]) =>
  team
    .map((person) => ({
      user_id: person.user_id || person.id || '',
      full_name: person.full_name || person.name,
      email: person.email,
      is_admin: person.is_admin,
      is_me: person.is_me,
    }))
    .filter((person) => person.user_id) as TeamMember[];

/** Đồng nghiệp trong nhóm: đọc bản lưu trên máy trước (dùng được khi mất mạng), rồi làm mới từ server. */
export function useTeamMembers(account: RepositoryAccount | null | undefined): TeamMember[] {
  const userId = account?.sync.local.userId ?? '';
  const [team, setTeam] = useState<TeamPerson[]>([]);
  useEffect(() => {
    if (!account || !userId) {
      setTeam([]);
      return;
    }
    try {
      const cached = JSON.parse(localStorage.getItem(`crm_team:${userId}`) || '[]');
      setTeam(Array.isArray(cached) ? cached : []);
    } catch {
      setTeam([]);
    }
    let alive = true;
    // Bản giả/cũ của remote có thể chưa có teamList: không có nhóm thì không có nút Giao.
    void Promise.resolve()
      .then(() => account.remote.teamList())
      .then((members: TeamPerson[] | undefined) => {
        if (!alive || !members) return;
        setTeam(members);
        try {
          localStorage.setItem(`crm_team:${userId}`, JSON.stringify(members));
        } catch {}
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [account, userId]);
  return toMembers(team);
}

/** Có nút Giao khách không: người phụ trách hoặc trưởng nhóm, nhóm có ít nhất 2 người. Mọi bậc đều giao được. */
export function canAssignWithTeam(customer: Customer | null | undefined, userId: string, members: TeamMember[]) {
  return !!customer && !customer.archived_at && members.length > 1 && canAssignCustomer(customer, userId, members);
}

export function AssignCustomerSheet({
  account,
  customer,
  members,
  open,
  onOpenChange,
}: {
  account: RepositoryAccount | null | undefined;
  customer: Customer | null | undefined;
  members: TeamMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const userId = account?.sync.local.userId ?? '';
  const [assignTo, setAssignTo] = useState('');
  const [mode, setMode] = useState<AssignmentMode>('keep');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // Mỗi lần mở là một lần giao mới: xoá lựa chọn cũ.
  useEffect(() => {
    if (!open) return;
    setAssignTo('');
    setMode('keep');
    setNote('');
  }, [open]);
  const assignable = customer ? members.filter((person) => person.user_id !== customer.owner_id) : [];
  const save = async () => {
    if (!customer || !account || !assignTo || busy) return;
    const recipient = members.find((person) => person.user_id === assignTo);
    if (!recipient || !canAssignCustomer(customer, userId, members)) return;
    const keep = mode === 'keep' && assignTo !== userId;
    const followers = assignmentFollowers(customer.followers, userId, assignTo, keep ? 'keep' : 'handoff');
    const text = assignmentNote(recipient, assignTo, userId, keep ? 'keep' : 'handoff', note);
    setBusy(true);
    try {
      await account.customers.update(
        customer.id,
        { owner_id: assignTo, followers },
        { assign: true, assignmentNote: text },
      );
      onOpenChange(false);
      toast({
        title:
          assignTo === userId
            ? 'Đã lấy khách về'
            : `Đã giao cho ${recipient.full_name || recipient.email || 'đồng nghiệp'}`,
        description: account.sync.isOnline() ? 'Đang đồng bộ.' : 'Ngoại tuyến · thay đổi đã xếp hàng đồng bộ.',
      });
    } catch (error) {
      toast({
        title: 'Chưa giao được khách',
        description: error instanceof Error ? error.message : 'Thử lại.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };
  const title = `Giao khách${customer ? `: ${customer.full_name || ''}` : ''}`;
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <SheetContent aria-label={title}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            Giao khách đi qua hàng đợi đồng bộ. Nếu vẫn theo dõi, bạn vẫn ghi giùm được cuộc gọi, tương tác, ghi chú.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {customer && (
            <div className="space-y-4">
              <label className="block space-y-1 text-label text-ink-muted">
                <span>Người nhận</span>
                <select
                  aria-label="Người nhận khách"
                  value={assignTo}
                  onChange={(event) => setAssignTo(event.target.value)}
                  className="min-h-11 w-full rounded-md border border-line bg-surface-100 px-3 text-body text-ink"
                >
                  <option value="">Chọn người nhận</option>
                  {assignable.map((person) => (
                    <option key={person.user_id} value={person.user_id}>
                      {person.user_id === userId ? 'Tôi (lấy lại)' : memberLabel(person)}
                    </option>
                  ))}
                </select>
              </label>
              {assignTo !== userId && (
                <fieldset className="space-y-2">
                  <legend className="text-label text-ink-muted">Sau khi giao</legend>
                  <label className="flex min-h-11 items-center gap-3 rounded-md border border-line p-3 text-body">
                    <input
                      type="radio"
                      name="assign-mode"
                      value="keep"
                      checked={mode === 'keep'}
                      onChange={() => setMode('keep')}
                    />
                    <span>
                      Tôi vẫn theo dõi{' '}
                      <span className="block text-label text-ink-muted">
                        Người nhận phụ trách; tôi vẫn ghi giùm cuộc gọi, tương tác, ghi chú.
                      </span>
                    </span>
                  </label>
                  <label className="flex min-h-11 items-center gap-3 rounded-md border border-line p-3 text-body">
                    <input
                      type="radio"
                      name="assign-mode"
                      value="handoff"
                      checked={mode === 'handoff'}
                      onChange={() => setMode('handoff')}
                    />
                    <span>
                      Giao hẳn <span className="block text-label text-ink-muted">Khách rời danh sách của tôi.</span>
                    </span>
                  </label>
                </fieldset>
              )}
              <label className="block space-y-1 text-label text-ink-muted">
                <span>Ghi chú cho người nhận (tuỳ chọn)</span>
                <textarea
                  aria-label="Ghi chú giao khách"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-md border border-line bg-surface-100 p-3 text-body text-ink"
                  placeholder="Ví dụ: khách hẹn xem nhà mẫu thứ 7"
                />
              </label>
            </div>
          )}
        </SheetBody>
        <SheetFooter>
          <Button className="flex-1" onClick={() => onOpenChange(false)} disabled={busy}>
            Huỷ
          </Button>
          <Button variant="primary" className="flex-1" onClick={() => void save()} disabled={!assignTo || busy}>
            Xác nhận giao
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
