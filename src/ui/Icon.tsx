import {
  AlarmClock,
  ArrowLeftRight,
  Bell,
  Building2,
  Cake,
  Calculator,
  Calendar,
  CalendarClock,
  ChartColumn,
  CircleX,
  Clock,
  CloudOff,
  Coffee,
  Command,
  Eye,
  FileSignature,
  FileText,
  Flame,
  Gauge,
  Grip,
  HandHelping,
  Handshake,
  Headset,
  HeartHandshake,
  HeartPulse,
  History,
  House,
  Layers,
  Lightbulb,
  LogOut,
  type LucideIcon,
  MessageSquareText,
  Mic,
  NotebookPen,
  Phone,
  PhoneCall,
  PhoneForwarded,
  RefreshCw,
  Scale,
  Settings,
  Sparkles,
  Sprout,
  SquareCheckBig,
  Target,
  Timer,
  TriangleAlert,
  User,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import { ICON_FALLBACK, ICONS, type IconName } from '@/config/icons';

// Glyph → component. Import từng glyph (tree-shake); TS bắt buộc đủ mọi glyph mà src/config/icons.ts dùng.
const GLYPHS: Record<(typeof ICONS)[IconName], LucideIcon> = {
  AlarmClock,
  ArrowLeftRight,
  Bell,
  Building2,
  Cake,
  Calculator,
  Calendar,
  CalendarClock,
  ChartColumn,
  CircleX,
  Clock,
  CloudOff,
  Coffee,
  Command,
  Eye,
  FileSignature,
  FileText,
  Flame,
  Gauge,
  Grip,
  HandHelping,
  Handshake,
  Headset,
  HeartHandshake,
  HeartPulse,
  History,
  House,
  Layers,
  Lightbulb,
  LogOut,
  MessageSquareText,
  Mic,
  NotebookPen,
  Phone,
  PhoneCall,
  PhoneForwarded,
  RefreshCw,
  Scale,
  Settings,
  Sparkles,
  Sprout,
  SquareCheckBig,
  Target,
  Timer,
  TriangleAlert,
  User,
  UserPlus,
  Users,
  UsersRound,
};

export type IconSize = 16 | 20 | 24;

/**
 * Icon theo KHÁI NIỆM (D-006): <Icon name="call" />. Mặc định trang trí (aria-hidden);
 * truyền `label` khi icon đứng một mình mang nghĩa.
 */
export function Icon({
  name,
  size = 20,
  label,
  className,
}: {
  name: IconName | string;
  size?: IconSize;
  label?: string;
  className?: string;
}) {
  const key = (name in ICONS ? name : ICON_FALLBACK) as IconName;
  const Glyph = GLYPHS[ICONS[key]];
  return (
    <Glyph
      size={size}
      strokeWidth={1.75}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
    />
  );
}
