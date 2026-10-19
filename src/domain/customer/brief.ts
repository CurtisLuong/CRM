import { isSaleTouch } from './interactions';
import { callAttemptsOf, openTasksOf } from './normalize';
import type { Customer } from './types';

export type BriefFact = { key: string; label: string; value: string; question: string };

const text = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '');

/** Rule-only, offline-safe customer brief. Missing facts remain explicit; no inference is made. */
export function customerBrief(customer: Customer): BriefFact[] {
  const latestCall = callAttemptsOf(customer).at(-1);
  const latestNote = Array.isArray(customer.notes_manual)
    ? customer.notes_manual
        .flatMap((note) => (note?.at && note.text ? [note] : []))
        .sort((a, b) => (b.at || '').localeCompare(a.at || ''))[0]
    : undefined;
  const latestInteraction = Array.isArray(customer.interactions)
    ? customer.interactions
        .flatMap((item) => (item?.at && isSaleTouch(item) ? [item] : []))
        .sort((a, b) => (b.at || '').localeCompare(a.at || ''))[0]
    : undefined;
  const lastContactAt = [latestCall?.at, latestNote?.at, latestInteraction?.at].filter(Boolean).sort().at(-1);
  const openPromise = openTasksOf(customer).find((task) => task.side === 'customer') ?? openTasksOf(customer)[0];
  const advanced = customer.advanced && typeof customer.advanced === 'object' ? customer.advanced : {};
  const openInterests = (customer.interests || []).filter((interest) => interest?.status === 'open');
  const project = [
    ...(Array.isArray(customer.projects) ? customer.projects : []),
    ...openInterests.map((interest) => interest?.project),
  ]
    .filter((value): value is string => !!value)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(', ');
  const aptTypes = [customer.apt_type, ...openInterests.map((interest) => interest?.apt_type)]
    .filter((value): value is string => !!value)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(', ');
  const budgetMax = [...openInterests]
    .reverse()
    .map((interest) => interest?.budget_max)
    .find((value) => value != null && value !== '');
  const known = (value: unknown) => text(value) || 'Chưa biết';
  return [
    {
      key: 'purpose',
      label: 'Mua để',
      value: known(customer.purpose || [...openInterests].reverse().find((interest) => interest?.purpose)?.purpose),
      question: 'Anh/chị mua để ở hay đầu tư?',
    },
    {
      key: 'need',
      label: 'Cần gì',
      value: known([project, aptTypes, customer.apt_area ? `${customer.apt_area} m²` : ''].filter(Boolean).join(' · ')),
      question: 'Anh/chị ưu tiên dự án, loại căn và diện tích nào?',
    },
    {
      key: 'finance',
      label: 'Tài chính',
      value: known(
        [
          customer.finance ? `Vốn ${customer.finance}` : '',
          budgetMax != null ? `Ngân sách đợt quan tâm ${budgetMax}` : '',
          advanced.loan_need ? `Vay ${advanced.loan_need}` : '',
          advanced.monthly_payment ? `Trả tháng ${advanced.monthly_payment}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      ),
      question: 'Mức vốn sẵn có và khoản trả hàng tháng phù hợp là bao nhiêu?',
    },
    {
      key: 'decision',
      label: 'Người quyết định',
      value: known(
        advanced.decision_influencers ||
          customer.household
            ?.map((member) =>
              member?.role ? `${member?.name || 'Người cùng quyết định'} (${member.role})` : member?.name,
            )
            .filter(Boolean)
            .join(', '),
      ),
      question: 'Ngoài anh/chị, ai cùng quyết định?',
    },
    {
      key: 'objection',
      label: 'Vướng mắc gần nhất',
      value: known(
        advanced.financial_barriers ||
          advanced.pain_points ||
          latestCall?.note ||
          latestNote?.text ||
          latestInteraction?.note,
      ),
      question: 'Điều gì đang khiến anh/chị chưa quyết định?',
    },
    {
      key: 'promise',
      label: 'Lời hứa mở',
      value: known(openPromise?.text),
      question: 'Mình đã hứa sẽ làm gì tiếp theo?',
    },
    {
      key: 'last_contact',
      label: 'Liên hệ cuối',
      value: lastContactAt ? new Date(lastContactAt).toLocaleString('vi-VN') : 'Chưa biết',
      question: 'Lần gần nhất mình trao đổi với anh/chị là khi nào?',
    },
    {
      key: 'contact_preference',
      label: 'Liên hệ',
      value: customer.contact_prefs?.do_not_contact
        ? `Không liên hệ${customer.contact_prefs.dnc_reason ? ` · ${customer.contact_prefs.dnc_reason}` : ''}`
        : known([customer.contact_prefs?.channel, customer.contact_prefs?.slot].filter(Boolean).join(' · ')),
      question: 'Anh/chị muốn trao đổi qua kênh nào và khung giờ nào?',
    },
  ];
}
