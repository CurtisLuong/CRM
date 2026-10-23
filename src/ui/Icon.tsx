import {
  AlarmClock,
  Archive,
  ArrowDownUp,
  ArrowLeft,
  ArrowLeftRight,
  Bell,
  Building2,
  Cake,
  Calculator,
  Calendar,
  CalendarClock,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleX,
  Clock,
  CloudOff,
  Coffee,
  Command,
  Copy,
  Ellipsis,
  Eye,
  File,
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
  Image,
  Layers,
  Lightbulb,
  ListFilter,
  LogOut,
  type LucideIcon,
  MessageSquareText,
  Mic,
  NotebookPen,
  Phone,
  PhoneCall,
  PhoneForwarded,
  Play,
  Plus,
  RefreshCw,
  Scale,
  Settings,
  Sparkles,
  Sprout,
  SquareCheckBig,
  SunMoon,
  Target,
  Timer,
  Trash2,
  TriangleAlert,
  User,
  UserPlus,
  Users,
  UsersRound,
  Zap,
} from 'lucide-react';
import { ICON_FALLBACK, ICONS, type IconName } from '@/config/icons';

// Glyph → component. Import từng glyph (tree-shake); TS bắt buộc đủ mọi glyph mà src/config/icons.ts dùng.
const GLYPHS: Record<(typeof ICONS)[IconName], LucideIcon> = {
  AlarmClock,
  Archive,
  ArrowDownUp,
  ArrowLeft,
  ArrowLeftRight,
  Bell,
  Building2,
  Cake,
  Calculator,
  Calendar,
  CalendarClock,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleX,
  Clock,
  CloudOff,
  Coffee,
  Command,
  Copy,
  Ellipsis,
  Eye,
  File,
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
  Image,
  Layers,
  Lightbulb,
  ListFilter,
  LogOut,
  MessageSquareText,
  Mic,
  NotebookPen,
  Phone,
  PhoneCall,
  PhoneForwarded,
  Play,
  Plus,
  RefreshCw,
  Scale,
  Settings,
  Sparkles,
  Sprout,
  SquareCheckBig,
  SunMoon,
  Target,
  Timer,
  Trash2,
  TriangleAlert,
  User,
  UserPlus,
  Users,
  UsersRound,
  Zap,
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
