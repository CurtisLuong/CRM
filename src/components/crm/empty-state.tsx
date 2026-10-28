import { CircleCheckBig, Inbox, type LucideIcon, SearchX, Users, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRESETS = {
  customers: {
    icon: Users,
    title: 'Chưa có khách nào',
    text: 'Thêm khách đầu tiên, hoặc nhập danh sách từ Excel / Facebook Lead Ads.',
    tone: undefined,
  },
  results: {
    icon: SearchX,
    title: 'Không tìm thấy khách phù hợp',
    text: 'Thử bỏ bớt bộ lọc, hoặc tìm theo 4 số cuối điện thoại.',
    tone: undefined,
  },
  done: {
    icon: CircleCheckBig,
    title: 'Không còn việc quá hạn',
    text: 'Hàng đợi hôm nay đã sạch. Tranh thủ chăm nhóm Chăm dài hạn?',
    tone: 'ok' as const,
  },
  error: {
    icon: WifiOff,
    title: 'Không tải được dữ liệu',
    text: 'Kiểm tra kết nối mạng rồi thử lại. Dữ liệu chưa lưu vẫn ở trên máy.',
    tone: 'alert' as const,
  },
};

/** Never a blank screen: the reason + one next step. Show only after data arrived empty (loading = Skeleton). */
export function EmptyState({
  kind,
  icon,
  title,
  text,
  tone,
  actions,
  compact,
}: {
  kind?: keyof typeof PRESETS;
  icon?: LucideIcon;
  title?: React.ReactNode;
  text?: React.ReactNode;
  tone?: 'ok' | 'alert';
  actions?: React.ReactNode;
  compact?: boolean;
}) {
  const p = kind ? PRESETS[kind] : undefined;
  const Icon = icon ?? p?.icon ?? Inbox;
  const t = tone ?? p?.tone;
  return (
    <div
      role={kind === 'error' ? 'alert' : undefined}
      className={cn('flex flex-col items-center gap-2 text-center', compact ? 'px-4 py-8' : 'px-6 py-12')}
    >
      <span
        className={cn(
          'mb-1 grid size-14 place-items-center rounded-lg border border-dashed border-line bg-surface-200 text-ink-muted',
          t === 'ok' && 'border-0 bg-ok-tint text-ok-text',
          t === 'alert' && 'border-0 bg-alert-tint text-alert-text',
        )}
      >
        <Icon className="size-6" />
      </span>
      <span className="text-base font-semibold">{title ?? p?.title}</span>
      {(text ?? p?.text) && <span className="max-w-[360px] text-sm text-ink-muted">{text ?? p?.text}</span>}
      {actions && <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
