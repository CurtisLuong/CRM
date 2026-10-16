/**
 * Component dùng chung của v2 (DESIGN_SYSTEM.md §3). Feature import từ '@/ui'; không tạo component trùng chức năng.
 * AppShell + CommandPalette thuộc T2.C3. Gallery: /dev/ui.
 */
export { Badge, type BadgeVariant, type Tone } from './Badge';
export { Button, type ButtonProps, type ButtonVariant, IconButton, type IconButtonProps } from './Button';
export {
  AIBlock,
  BriefCard,
  type BriefItem,
  type CardAction,
  FactRow,
  NextActionCard,
  SignalCard,
  Timeline,
  type TimelineDay,
  type TimelineEntry,
} from './cards';
export { ActionBar, type ActionItem, BottomNav, Header, type NavTab, SyncIndicator, type SyncState } from './chrome';
export { cn } from './cn';
export { Icon, type IconSize } from './Icon';
export { Kbd } from './Kbd';
export { type ChartPoint, MetricTile, MiniChart } from './metrics';
export { type DayOption, OutcomePicker, SlotPicker } from './pickers';
export { Avatar, ListRow, QueueRow, RowList } from './rows';
export { Sheet } from './Sheet';
export { EmptyState, ErrorState, Loading, Skeleton } from './states';
export {
  type Countdown,
  type DeadlineState,
  DeadlineTag,
  type Health,
  HealthDot,
  SlaRing,
  StageChip,
} from './status';
export { SegmentedControl, type SegmentOption, type TabItem, Tabs } from './Tabs';
export { type ToastInput, ToastProvider, useToast } from './Toast';
