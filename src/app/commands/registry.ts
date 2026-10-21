import type { IconName } from '@/config/icons';
import type { MenuGroupKey } from '@/config/menu';

/**
 * Lệnh của app — tự đăng ký (tasks.md §0 luật 3): mỗi tính năng khai báo trong `src/features/<tên>/commands.ts`:
 *   export const commands: AppCommand[] = [{ id: 'loan.open', label: 'Tính vay', icon: 'loan', tools: true,
 *     menu: { group: 'tools', label: 'Tính khoản vay', icon: 'loan' },
 *     run: ({ navigate }) => navigate('/tinh-vay') }];
 * Lệnh hiện trong Bảng lệnh (Cmd/Ctrl+K); `quickAdd` → thêm vào sheet ＋ Ghi nhanh; `tools` → menu ⋮.
 */
export type CommandContext = {
  navigate: (to: string) => void;
};

/** Mục trong menu ⋮ (PF-04): nhãn ngắn/icon riêng cho menu, không đổi nhãn ở Bảng lệnh. */
export type CommandMenu = {
  /** Nhóm trong menu (mặc định "Công cụ"). */
  group?: MenuGroupKey;
  /** Nhãn ngắn dạng danh từ, vd "Tệp & Retarget" (mặc định dùng `label`). */
  label?: string;
  /** Icon riêng của mục menu (mặc định dùng `icon` của lệnh). */
  icon?: IconName;
  /** Thứ tự trong nhóm (mặc định `order` của lệnh rồi nhãn). */
  order?: number;
};

export type AppCommand = {
  /** Duy nhất toàn app, dạng "<tính năng>.<việc>". */
  id: string;
  /** Động từ trước: "Thêm khách", "Mở Tính vay". */
  label: string;
  sub?: string;
  icon?: IconName;
  /** Nhóm trong Bảng lệnh (mặc định "Lệnh"). */
  group?: string;
  keywords?: string;
  shortcut?: string[];
  quickAdd?: boolean;
  /** Hiện trong menu ⋮. */
  tools?: boolean;
  /** Khai báo nhóm/nhãn ngắn/icon cho menu ⋮; bỏ trống → nhóm "Công cụ". */
  menu?: CommandMenu;
  /** Thứ tự trong nhóm (nhỏ trước). */
  order?: number;
  run: (ctx: CommandContext) => void;
};

export type CommandModule = { commands?: AppCommand[] };

/** Gom lệnh từ các module; báo lỗi khi thiếu export hoặc trùng id; sắp theo order rồi nhãn. */
export function collectCommands(modules: Record<string, CommandModule>): AppCommand[] {
  const seen = new Map<string, string>();
  const out: AppCommand[] = [];
  for (const [file, mod] of Object.entries(modules)) {
    if (!Array.isArray(mod.commands)) throw new Error(`${file} phải export const commands`);
    for (const c of mod.commands) {
      const other = seen.get(c.id);
      if (other) throw new Error(`Trùng lệnh "${c.id}": ${other} và ${file}`);
      seen.set(c.id, file);
      out.push(c);
    }
  }
  return out.sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.label.localeCompare(b.label, 'vi'));
}
