import type { ReactNode } from 'react';
import { Icon } from '@/ui';

/**
 * Khối chi tiết thu gọn của màn Hiệu quả (M5-03, D-023 L1).
 * Mặc định đóng; tên nút là tên khối để e2e và trình đọc màn hình nhận đúng.
 * Tên khối không đặt trong <h2> để không trùng tiêu đề bên trong nội dung (vd "Marketing").
 */
export function DetailBlock({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const titleId = `${id}-title`;
  const panelId = `${id}-panel`;
  return (
    <section id={id} aria-labelledby={titleId} className="scroll-mt-20 rounded-lg border border-line bg-surface-100 ">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-h-12 w-full items-center justify-between gap-2 rounded-lg px-4 py-3 text-left hover:bg-surface-200 focus-visible:outline-2 focus-visible:outline-ion"
      >
        <span id={titleId} className="text-body font-semibold">
          {title}
        </span>
        <Icon name={open ? 'expand' : 'open'} />
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-4 border-t border-line p-4">
          {children}
        </div>
      )}
    </section>
  );
}
