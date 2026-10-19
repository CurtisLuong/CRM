/** D-015: thresholds and legacy queue policy live here; SLA/deadlines retain their own config. */
export const SIGNALS_CONFIG = {
  // Approved local T2.B5 exception: UX ranking, with separate v1 baseline projection.
  defaultOrdering: 'ux' as const,
  hotInterestMin: 60,
  idleHotDays: 7,
  idleWarmDays: 14,
  leadRetryHours: 24,
  birthdayDays: 7,
  // P1 signals S11–S18 (PRD F-04). Missing source data means no candidate.
  briefMissingFieldsMin: 1,
  retargetReminderDays: 0,
  projectViewFeedbackDays: 2,
  postPurchaseMilestonesDays: [30, 90] as const,
  postPurchaseMilestoneWindowDays: 0,
  nurtureCallbackReminderDays: 3,
  groupOrder: ['due', 'sla', 'tasks', 'today', 'new', 'retry', 'decide', 'pending', 'hot', 'warm', 'nonext'] as const,
  // Hôm nay v3 (D-023): nhóm gấp nhất hiện thẻ đầy đủ; nhóm ít gấp thu gọn thành dòng mở rộng; còn lại thẻ gọn.
  todayFullGroups: ['due', 'sla', 'new'] as const,
  todayCollapsedGroups: ['hot', 'warm', 'nonext'] as const,
  // Thẻ gọn trong một nhóm: hiện tối đa N, còn lại sau "Xem thêm".
  todayCompactLimit: 5,
};
export type SignalGroup = (typeof SIGNALS_CONFIG.groupOrder)[number];
export const SIGNAL_GROUPS: Record<SignalGroup, { title: string; contact: boolean }> = {
  due: { title: 'Đến giờ / quá giờ hẹn gọi', contact: true },
  sla: { title: 'Quá hạn mức SLA phễu', contact: true },
  tasks: { title: 'Việc đến hạn hôm nay', contact: false },
  today: { title: 'Hẹn gọi còn lại hôm nay', contact: true },
  new: { title: 'Khách mới chưa gọi', contact: true },
  retry: { title: 'Gọi lại khách chưa liên lạc được', contact: true },
  decide: { title: 'Đã nói chuyện — chờ phân loại', contact: true },
  pending: { title: 'Cuộc gọi chưa ghi chú', contact: false },
  hot: { title: 'Khách nóng đang nguội', contact: true },
  warm: { title: 'Khách đang chăm lâu chưa liên hệ', contact: true },
  nonext: { title: 'Chưa có việc tiếp theo', contact: true },
};
