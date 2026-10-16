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
        .flatMap((item) => (item?.at && item.note ? [item] : []))
        .sort((a, b) => (b.at || '').localeCompare(a.at || ''))[0]
    : undefined;
  const lastContactAt = [latestCall?.at, latestNote?.at, latestInteraction?.at].filter(Boolean).sort().at(-1);
  const openPromise = openTasksOf(customer).find((task) => task.side === 'customer') ?? openTasksOf(customer)[0];
  const advanced = customer.advanced && typeof customer.advanced === 'object' ? customer.advanced : {};
  const project = Array.isArray(customer.projects) ? customer.projects.filter(Boolean).join(', ') : '';
  const known = (value: unknown) => text(value) || 'Chưa biết';
  return [
    { key: 'purpose', label: 'Mua để', value: known(customer.purpose), question: 'Anh/chị mua để ở hay đầu tư?' },
    {
      key: 'need',
      label: 'Cần gì',
      value: known(
        [project, customer.apt_type, customer.apt_area ? `${customer.apt_area} m²` : ''].filter(Boolean).join(' · '),
      ),
      question: 'Anh/chị ưu tiên dự án, loại căn và diện tích nào?',
    },
    {
      key: 'finance',
      label: 'Tài chính',
      value: known(
        [
          customer.finance ? `Vốn ${customer.finance}` : '',
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
            ?.map((member) => member?.name)
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
  ];
}
