import type { ActionId } from "./actions";

/** Signal types: what happened, and which action clears it. Level comes from the data. */
export type NotifType = "new_uncalled" | "callback_due" | "sla_breach" | "appointment" | "payment_due" | "docs_missing" | "nurture_touch" | "system";

export const NOTIF_TYPES: Record<NotifType, { title: string; action?: ActionId; cta?: string; ctaAction?: ActionId; bulk?: string }> = {
  new_uncalled: { title: "Khách mới chưa gọi", action: "call", cta: "Gọi", bulk: "Gọi lần lượt" },
  callback_due: { title: "Đến giờ gọi lại", action: "call", cta: "Gọi", bulk: "Gọi lần lượt" },
  sla_breach: { title: "Quá SLA stage", action: "note", cta: "Xử lý", bulk: "Xem danh sách" },
  appointment: { title: "Sắp tới lịch hẹn", action: "visit", cta: "Xem lịch" },
  payment_due: { title: "Đến hạn đóng cọc", action: "booking", cta: "Nhắc khách" },
  docs_missing: { title: "Hồ sơ còn thiếu", action: "paperwork", cta: "Nhắn bổ sung", ctaAction: "message" },
  nurture_touch: { title: "Đến lượt chạm lại", action: "message", cta: "Nhắn", bulk: "Nhắn hàng loạt" },
  system: { title: "Hệ thống" },
};
