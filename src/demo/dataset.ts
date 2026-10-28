import { CARE_STAGE_BOOKING, CARE_STAGE_DROPPED, CARE_STAGE_NURTURE, CARE_STAGE_WON } from '@/config/stages';
import type { Customer } from '@/domain/customer';

export const DEMO_USER_ID = 'dm01-preview';
export const DEMO_TEAM_USER_ID = 'dm01-team';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Bộ dữ liệu dùng đồng hồ lúc nạp để các hạn và tín hiệu luôn còn mới. */
export function demoDataset(now: number): Customer[] {
  const at = (offset: number) => new Date(now + offset).toISOString();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const base = (index: number, patch: Partial<Customer> = {}): Customer => {
    const careStage = patch.care_stage ?? 'Đăng kí mới';
    const created = patch.created_at ?? at(-DAY);
    const stageAt = patch.care_stage_updated_at ?? created;
    return {
      id: `dm01-${String(index).padStart(2, '0')}`,
      phone: `0900${String(index).padStart(6, '0')}`,
      full_name: `Khách mẫu ${String(index).padStart(2, '0')}`,
      owner_id: DEMO_USER_ID,
      created_at: created,
      registered_at: created,
      updated_at: at(0),
      care_stage: careStage,
      care_stage_updated_at: stageAt,
      care_stage_history: [{ stage: careStage, note: null, at: stageAt }],
      interest_level: 40,
      source: ['facebook_ads'],
      projects: ['Nhà ở xã hội Hải Phòng'],
      apt_type: '2 phòng ngủ',
      call_attempts: [],
      notes_manual: [],
      next_tasks: [],
      interactions: [],
      ...patch,
    } as Customer;
  };
  const qualified = (index: number, stage: string, daysInStage: number, patch: Partial<Customer> = {}) => {
    const stageAt = at(-daysInStage * DAY);
    return base(index, {
      care_stage: stage,
      care_stage_updated_at: stageAt,
      care_stage_history: [{ stage, note: null, at: stageAt }],
      qualified_at: at(-Math.max(daysInStage, 2) * DAY),
      interest_level: 50,
      ...patch,
    });
  };
  const task = (key: string, text: string, due: string, dueAllday = false) => ({
    at: `demo-${key}`,
    key: `demo-${key}`,
    text,
    kind: 'docs',
    due,
    due_allday: dueAllday,
    done_at: null,
    side: 'me',
    source: 'manual',
  });

  const due = qualified(1, 'Đang chăm sóc', 3, {
    full_name: 'An Nhiên · Hẹn đã quá giờ',
    next_call_at: at(-2 * HOUR),
    next_call_end: at(-90 * MINUTE),
    next_call_reason: 'Xác nhận lịch xem nhà mẫu',
    call_attempts: [{ at: at(-4 * DAY), result: 'talked', note: 'Đã trao đổi nhu cầu.' }],
  });
  const slaOver = qualified(2, 'Xem dự án', 16, {
    full_name: 'Bảo Minh · Quá hạn SLA',
    interest_level: 75,
    call_attempts: [{ at: at(-3 * DAY), result: 'talked', note: 'Đã xem dự án.' }],
  });
  const taskOverdue = qualified(3, 'Đang chăm sóc', 2, {
    full_name: 'Cẩm Tú · Việc quá hạn',
    next_tasks: [task('overdue', 'Gửi danh sách giấy tờ', at(-2 * HOUR))],
  });
  const todayCall = qualified(4, 'Đang chăm sóc', 2, {
    full_name: 'Đức Anh · Hẹn trong hôm nay',
    next_call_at: at(2 * HOUR),
    next_call_end: at(2.5 * HOUR),
    next_call_reason: 'Trao đổi phương án vay',
  });
  const newLead = base(5, {
    full_name: 'Gia Hân · Khách mới',
    created_at: at(-5 * MINUTE),
    registered_at: at(-5 * MINUTE),
    care_stage_updated_at: at(-5 * MINUTE),
    care_stage_history: [{ stage: 'Đăng kí mới', note: null, at: at(-5 * MINUTE) }],
    source: ['facebook_ads'],
  });
  const retry = base(6, {
    full_name: 'Hoàng Long · Gọi lại',
    created_at: at(-4 * DAY),
    registered_at: at(-4 * DAY),
    care_stage: 'Đang tiếp cận',
    care_stage_updated_at: at(-4 * DAY),
    care_stage_history: [{ stage: 'Đang tiếp cận', note: null, at: at(-4 * DAY) }],
    call_attempts: [{ at: at(-2 * DAY), result: 'no_answer', note: 'Chưa nghe máy.' }],
    source: ['referral'],
  });
  const decide = base(7, {
    full_name: 'Khánh Linh · Chờ phân loại',
    created_at: at(-4 * DAY),
    registered_at: at(-4 * DAY),
    care_stage: 'Đang tiếp cận',
    care_stage_updated_at: at(-4 * DAY),
    care_stage_history: [{ stage: 'Đang tiếp cận', note: null, at: at(-4 * DAY) }],
    call_attempts: [{ at: at(-2 * DAY), result: 'talked', note: 'Đã trao đổi, cần chọn dự án.' }],
  });
  const pending = qualified(8, 'Đang chăm sóc', 2, {
    full_name: 'Minh Châu · Chưa ghi kết quả',
    call_attempts: [{ at: at(-2 * HOUR), result: null, note: null }],
    next_tasks: [task('pending-followup', 'Xem lại hồ sơ sau cuộc gọi', at(3 * DAY))],
  });
  const hot = qualified(9, 'Đang chăm sóc', 8, {
    full_name: 'Ngọc Hà · Khách quan tâm cao',
    interest_level: 85,
    interactions: [{ at: at(-8 * DAY), channel: 'zalo', kind: 'message', note: 'Đã gửi thông tin dự án.' }],
    source: ['zalo'],
  });
  const warm = qualified(10, 'Đang chăm sóc', 15, {
    full_name: 'Phúc An · Chăm sóc lâu ngày',
    interest_level: 45,
    next_tasks: [task('warm-followup', 'Chuẩn bị thông tin căn phù hợp', at(2 * DAY))],
    source: ['referral'],
  });
  const noNext = qualified(11, 'Đang chăm sóc', 2, {
    full_name: 'Quỳnh Mai · Chưa có việc tiếp theo',
    interest_level: 55,
    notes_manual: [{ at: at(-2 * HOUR), text: 'Khách muốn nhận danh sách căn mới.' }],
  });
  const atTarget = qualified(12, 'Đang chăm sóc', 10, {
    full_name: 'Thanh Bình · Đúng mốc mục tiêu SLA',
    interest_level: 45,
    call_attempts: [{ at: at(-5 * DAY), result: 'talked', note: 'Đã cập nhật nhu cầu.' }],
  });
  const withinTarget = qualified(13, 'Đang chăm sóc', 3, {
    full_name: 'Uyên Vy · Trong mục tiêu SLA',
    interest_level: 30,
    call_attempts: [{ at: at(-HOUR), result: 'talked', note: 'Đã xác nhận loại căn.' }],
  });
  const archived = base(14, {
    full_name: 'Vân Khánh · Khách lưu trữ',
    care_stage: CARE_STAGE_DROPPED,
    archived_at: at(-HOUR),
    disqualified_at: at(-2 * DAY),
    disqualify_reason: 'khac',
  });
  const teamCustomer = qualified(15, 'Đang chăm sóc', 2, {
    full_name: 'Xuân Phong · Khách nhóm',
    owner_id: DEMO_TEAM_USER_ID,
    followers: [DEMO_USER_ID],
    notes_manual: [{ at: at(-DAY), text: 'Khách được đồng nghiệp phụ trách.' }],
  });
  const booking = qualified(16, CARE_STAGE_BOOKING, 4, {
    full_name: 'Yến Nhi · Booking còn checklist',
    interest_level: 90,
    booking_steps: {},
    projects: ['Nhà ở xã hội Hải Phòng', 'Khu đô thị Hưng Yên'],
    apt_type: '3 phòng ngủ',
  });
  const nurture = qualified(17, CARE_STAGE_NURTURE, 30, {
    full_name: 'Anh Khoa · Nuôi dài hạn',
    next_call_at: at(2 * DAY),
    next_call_reason: 'Hỏi thăm kế hoạch mua nhà',
    interest_level: 35,
  });
  const wonAt = at(-30 * DAY);
  const won = qualified(18, CARE_STAGE_WON, 30, {
    full_name: 'Bích Ngọc · Đã ký HĐMB',
    care_stage_updated_at: wonAt,
    care_stage_history: [{ stage: CARE_STAGE_WON, note: 'Đã hoàn tất giao dịch.', at: wonAt }],
    interest_level: 100,
  });
  const dropped = base(19, {
    full_name: 'Chiến Thắng · Không chốt',
    care_stage: CARE_STAGE_DROPPED,
    disqualified_at: at(-DAY),
    disqualify_reason: 'do_gia',
  });
  const allDayTask = qualified(20, 'Đang chăm sóc', 1, {
    full_name: 'Diệu Linh · Việc cả ngày',
    next_tasks: [task('all-day', 'Rà lại hồ sơ trong ngày', today.toISOString(), true)],
  });
  const upcomingTask = qualified(21, 'Đang chăm sóc', 1, {
    full_name: 'Hải Đăng · Việc sắp tới',
    next_tasks: [task('upcoming', 'Chuẩn bị phương án căn hộ', at(3 * DAY))],
  });
  const mixedNeeds = qualified(22, 'Đang chăm sóc', 2, {
    full_name: 'Kim Ngân · Nhu cầu đa dạng',
    interest_level: 70,
    source: ['facebook_ads', 'referral'],
    projects: ['Nhà ở xã hội Hải Phòng', 'Khu đô thị Hưng Yên'],
    apt_type: 'Studio',
    interests: [
      {
        id: 'demo-interest-22-a',
        project: 'Nhà ở xã hội Hải Phòng',
        apt_type: 'Studio',
        budget_max: 1_200_000_000,
        purpose: 'Mua để ở',
        timeline: 'Trong 6 tháng',
        status: 'open',
        source: 'facebook_ads',
        at: at(-DAY),
      },
      {
        id: 'demo-interest-22-b',
        project: 'Khu đô thị Hưng Yên',
        apt_type: '2 phòng ngủ',
        budget_max: 1_500_000_000,
        purpose: 'Đầu tư',
        timeline: 'Trong năm nay',
        status: 'open',
        source: 'referral',
        at: at(-2 * DAY),
      },
    ],
    interactions: [{ at: at(-HOUR), channel: 'zalo', kind: 'message', note: 'Đã gửi hai phương án.' }],
    next_tasks: [task('mixed-followup', 'Gọi lại sau khi xem phương án', at(4 * DAY))],
  });

  return [
    due,
    slaOver,
    taskOverdue,
    todayCall,
    newLead,
    retry,
    decide,
    pending,
    hot,
    warm,
    noNext,
    atTarget,
    withinTarget,
    archived,
    teamCustomer,
    booking,
    nurture,
    won,
    dropped,
    allDayTask,
    upcomingTask,
    mixedNeeds,
  ];
}
