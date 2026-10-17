export type TeamMember = {
  user_id: string;
  full_name?: string | null;
  email?: string | null;
  is_admin?: boolean;
  is_me?: boolean;
};

export type AssignmentMode = 'keep' | 'handoff';

export function memberLabel(member: TeamMember | undefined, fallback = 'Đồng nghiệp') {
  return member?.full_name?.trim() || member?.email?.split('@')[0] || fallback;
}

export function canAssignCustomer(customer: { owner_id?: string | null }, userId: string, members: TeamMember[]) {
  return (
    members.some((member) => member.is_me && member.is_admin) || !customer.owner_id || customer.owner_id === userId
  );
}

export function assignmentFollowers(
  followers: string[] | null | undefined,
  userId: string,
  recipientId: string,
  mode: AssignmentMode,
) {
  const next = (Array.isArray(followers) ? followers : []).filter((id) => id !== userId && id !== recipientId);
  if (mode === 'keep' && recipientId !== userId) next.push(userId);
  return [...new Set(next)];
}

export function assignmentNote(
  recipient: TeamMember | undefined,
  recipientId: string,
  userId: string,
  mode: AssignmentMode,
  extra: string,
) {
  const base =
    recipientId === userId
      ? 'Lấy lại về tôi'
      : `Giao cho ${memberLabel(recipient)}${mode === 'keep' ? ' (người giao vẫn theo dõi)' : ''}`;
  return `${base}${extra.trim() ? `. ${extra.trim()}` : ''}`;
}
