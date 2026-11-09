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
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleX,
  Clock,
  CloudOff,
  Coffee,
  Command,
  ContactRound,
  Copy,
  Ellipsis,
  File,
  Flame,
  FolderCheck,
  Gauge,
  Grip,
  HandCoins,
  HandHelping,
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
  MapPinHouse,
  Maximize,
  MessageCircleMore,
  Mic,
  NotebookPen,
  Phone,
  PhoneCall,
  PhoneForwarded,
  Play,
  Plus,
  RefreshCw,
  Replace,
  Scale,
  Scan,
  Settings,
  Share2,
  Signature,
  Sparkles,
  Sprout,
  Square,
  SquareCheckBig,
  SunMoon,
  Target,
  Timer,
  Trash2,
  TriangleAlert,
  User,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
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
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleX,
  Clock,
  CloudOff,
  Coffee,
  Command,
  ContactRound,
  Copy,
  Ellipsis,
  File,
  Flame,
  FolderCheck,
  Gauge,
  Grip,
  HandCoins,
  HandHelping,
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
  Maximize,
  MapPinHouse,
  MessageCircleMore,
  Mic,
  NotebookPen,
  Phone,
  PhoneCall,
  PhoneForwarded,
  Play,
  Plus,
  RefreshCw,
  Replace,
  Scale,
  Scan,
  Settings,
  Share2,
  Signature,
  Sparkles,
  Sprout,
  Square,
  SquareCheckBig,
  SunMoon,
  Target,
  Timer,
  Trash2,
  TriangleAlert,
  User,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
  Zap,
  X,
  ZoomIn,
  ZoomOut,
};

/** Component glyph của một khái niệm — cho component cần cỡ icon riêng (src/components/crm/actions.tsx). */
export function iconGlyph(name: IconName | string): LucideIcon {
  return GLYPHS[ICONS[(name in ICONS ? name : ICON_FALLBACK) as IconName]];
}

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
  const Glyph = iconGlyph(key);
  return (
    <Glyph
      size={size}
      strokeWidth={1.75}
      className={className}
      data-icon={key}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
    />
  );
}
