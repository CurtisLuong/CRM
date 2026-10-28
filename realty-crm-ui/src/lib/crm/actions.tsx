import {
  CalendarClock, Coffee, FolderCheck, HandCoins, MapPinHouse, MessageCircleMore, NotebookPen, Phone, Signature,
  type LucideIcon,
} from "lucide-react";

/** The nine CRM actions. One action = one icon, everywhere. Order follows the deal journey. */
export type ActionId = "call" | "schedule" | "message" | "note" | "meet" | "visit" | "booking" | "paperwork" | "contract";

export interface ActionDef { id: ActionId; label: string; short: string; icon: LucideIcon }

export const ACTIONS: ActionDef[] = [
  { id: "call", label: "Gọi", short: "Gọi", icon: Phone },
  { id: "schedule", label: "Hẹn lịch gọi", short: "Hẹn gọi", icon: CalendarClock },
  { id: "message", label: "Nhắn Zalo / tin nhắn", short: "Nhắn tin", icon: MessageCircleMore },
  { id: "note", label: "Ghi chú", short: "Ghi chú", icon: NotebookPen },
  { id: "meet", label: "Gặp cà phê", short: "Gặp", icon: Coffee },
  { id: "visit", label: "Xem nhà mẫu", short: "Xem nhà", icon: MapPinHouse },
  { id: "booking", label: "Booking (đặt cọc)", short: "Booking", icon: HandCoins },
  { id: "paperwork", label: "Làm giấy tờ", short: "Hồ sơ", icon: FolderCheck },
  { id: "contract", label: "Ký hợp đồng", short: "Ký HĐ", icon: Signature },
];

export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a])) as Record<ActionId, ActionDef>;
