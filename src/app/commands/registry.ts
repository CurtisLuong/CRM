import type { IconName } from '@/config/icons';

/**
 * Lệnh của app — tự đăng ký (tasks.md §0 luật 3): mỗi tính năng khai báo trong `src/features/<tên>/commands.ts`:
 *   export const commands: AppCommand[] = [{ id: 'loan.open', label: 'Tính vay', icon: 'loan', tools: true,
 *     run: ({ navigate }) => navigate('/tinh-vay') }];
 * Lệnh hiện trong Bảng lệnh (Cmd/Ctrl+K); `quickAdd` → thêm vào sheet ＋ Ghi nhanh; `tools` → menu Tiện ích.
 */
export type CommandContext = {
  navigate: (to: string) => void;
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
  tools?: boolean;
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
