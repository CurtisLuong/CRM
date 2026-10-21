import { useState } from 'react';
import { CLOSE_REASONS } from '@/config/reasons';
import type { Customer } from '@/domain/customer';
import { factFreshness, factPatch } from '@/domain/customer/facts';
import { Button } from '@/ui';

type Props = {
  customer: Customer;
  writable: boolean;
  onSave: (patch: Record<string, unknown>, message?: string) => void;
  now?: number;
};

const sourceName: Record<string, string> = {
  sale: 'Sale nhập',
  ai: 'AI đã duyệt',
  customer: 'Khách khai',
  import: 'Nhập dữ liệu',
};
const FACT_LABELS: Record<string, string> = {
  purpose: 'Mục đích mua',
  projects: 'Dự án quan tâm',
  apt_type: 'Loại căn',
  finance: 'Vốn sẵn có',
  income: 'Thu nhập',
  residence: 'Nơi ở',
  contact_prefs: 'Tuỳ chọn liên hệ',
};

/**
 * "Nguồn và độ mới của dữ kiện" — PF-01 chuyển nguyên khối này vào khu "Nâng cao".
 * Tách khỏi CustomerMemory để giữ nguyên chữ ký props của form Trí nhớ.
 */
export function FactFreshnessSection({ customer, now = Date.now() }: { customer: Customer; now?: number }) {
  return (
    <section className="space-y-2">
      <h2 className="text-section">Nguồn và độ mới của dữ kiện</h2>
      {Object.entries(FACT_LABELS).map(([field, label]) => {
        const meta = customer.field_meta?.[field];
        const age = factFreshness(meta?.at, now);
        return (
          <p key={field} className="text-small text-text-2">
            {label}: {sourceName[meta?.by || ''] || 'Nguồn chưa ghi'} · {age.label}
          </p>
        );
      })}
      <p className="text-small text-text-3">Dữ kiện quá 90 ngày cần xác nhận lại.</p>
    </section>
  );
}

export function CustomerMemory({ customer, writable, onSave, now = Date.now() }: Props) {
  const [project, setProject] = useState('');
  const [interestType, setInterestType] = useState('');
  const [interestBudget, setInterestBudget] = useState('');
  const [interestPurpose, setInterestPurpose] = useState('');
  const [interestTimeline, setInterestTimeline] = useState('');
  const [member, setMember] = useState('');
  const [memberRole, setMemberRole] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberNote, setMemberNote] = useState('');
  const [channel, setChannel] = useState(customer.contact_prefs?.channel || '');
  const [slot, setSlot] = useState(customer.contact_prefs?.slot || '');
  const [dncReason, setDncReason] = useState(customer.contact_prefs?.dnc_reason || '');
  const [closeNote, setCloseNote] = useState(customer.close_note || '');
  const [retargetAfter, setRetargetAfter] = useState(customer.retarget_hint?.after || '');
  const [retargetPrice, setRetargetPrice] = useState(String(customer.retarget_hint?.max_price ?? ''));
  const [retargetAptTypes, setRetargetAptTypes] = useState((customer.retarget_hint?.apt_types || []).join(', '));
  const prefs = customer.contact_prefs || {};
  const terminated = customer.care_stage === 'Loại' || customer.care_stage === 'Nuôi dài hạn';
  const markFact = (field: string, value: unknown) =>
    factPatch(customer, field, value, 'sale', new Date(now).toISOString());
  const savePref = (key: string, value: unknown) => {
    onSave(markFact('contact_prefs', { ...prefs, [key]: value }));
  };
  const addInterest = () => {
    const name = project.trim();
    if (!name) return;
    const interests = (customer.interests || []).slice();
    interests.push({
      id: crypto.randomUUID(),
      project: name,
      apt_type: interestType.trim() || null,
      budget_max: interestBudget ? Number(interestBudget) : null,
      purpose: interestPurpose.trim() || null,
      timeline: interestTimeline.trim() || null,
      status: 'open',
      source: 'sale',
      at: new Date(now).toISOString(),
    });
    onSave(markFact('interests', interests), 'Đã thêm đợt quan tâm');
    setProject('');
    setInterestType('');
    setInterestBudget('');
    setInterestPurpose('');
    setInterestTimeline('');
  };
  const updateInterest = (index: number, fields: Record<string, unknown>) => {
    const interests = (customer.interests || []).slice();
    const current = interests[index];
    if (!current) return;
    interests[index] = { ...current, ...fields };
    onSave(markFact('interests', interests), 'Đã cập nhật đợt quan tâm');
  };
  const addHousehold = () => {
    const name = member.trim();
    if (!name) return;
    const household = (customer.household || []).slice();
    household.push({
      id: crypto.randomUUID(),
      name,
      role: memberRole.trim(),
      phone: memberPhone.trim() || null,
      note: memberNote.trim() || null,
      at: new Date(now).toISOString(),
    });
    onSave(markFact('household', household), 'Đã thêm người cùng quyết định');
    setMember('');
    setMemberRole('');
    setMemberPhone('');
    setMemberNote('');
  };
  const retarget = customer.retarget_hint || {};
  const closePatch = (key: string, value: unknown) =>
    onSave(
      key === 'retarget_hint' ? markFact('retarget_hint', { ...retarget, ...(value as object) }) : markFact(key, value),
    );

  return (
    <section aria-label="Trí nhớ khách" className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-section">Tuỳ chọn liên hệ</h2>
        <label className="flex flex-col gap-1 text-small">
          Kênh ưu tiên
          <input
            aria-label="Kênh liên hệ ưu tiên"
            className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
            disabled={!writable}
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            onBlur={() => channel !== (prefs.channel || '') && savePref('channel', channel.trim())}
          />
        </label>
        <label className="flex flex-col gap-1 text-small">
          Khung giờ ưu tiên
          <input
            aria-label="Khung giờ liên hệ"
            className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
            disabled={!writable}
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            onBlur={() => slot !== (prefs.slot || '') && savePref('slot', slot.trim())}
            placeholder="Ví dụ: 18:00–20:00"
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-body">
          <input
            type="checkbox"
            disabled={!writable}
            checked={!!prefs.do_not_contact}
            onChange={(e) =>
              onSave(
                markFact('contact_prefs', {
                  ...prefs,
                  do_not_contact: e.target.checked,
                  dnc_at: e.target.checked ? new Date(now).toISOString() : null,
                }),
              )
            }
          />
          Không liên hệ · chặn gọi, Zalo và danh sách retarget
        </label>
        {prefs.do_not_contact && (
          <label className="flex flex-col gap-1 text-small">
            Lý do không liên hệ
            <input
              className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
              disabled={!writable}
              value={dncReason}
              onChange={(e) => setDncReason(e.target.value)}
              onBlur={() => dncReason !== (prefs.dnc_reason || '') && savePref('dnc_reason', dncReason.trim())}
            />
          </label>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-section">Nhu cầu theo đợt</h2>
        {(customer.interests || []).map((interest, index) => {
          if (!interest) return null;
          const age = factFreshness(interest.at, now);
          return (
            <article key={interest?.id || index} className="rounded-control border border-border p-3">
              <p className="text-body-strong">
                {interest.project || 'Chưa rõ dự án'} · {interest.apt_type || 'Chưa rõ loại căn'}
              </p>
              <p className="text-small text-text-2">
                {interest.status || 'Chưa rõ trạng thái'} · nguồn{' '}
                {sourceName[interest.source || ''] || interest.source || 'chưa ghi'} · {age.label}
              </p>
              {interest.purpose && <p className="text-small text-text-2">Mục đích: {interest.purpose}</p>}
              {interest.timeline && <p className="text-small text-text-2">Thời điểm: {interest.timeline}</p>}
              {interest.budget_max != null && (
                <p className="text-small text-text-2">Ngân sách tối đa: {interest.budget_max}</p>
              )}
              <label className="mt-2 flex flex-col gap-1 text-small">
                Trạng thái đợt
                <select
                  aria-label={`Trạng thái đợt ${interest.project || index + 1}`}
                  className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
                  disabled={!writable}
                  value={interest.status || 'open'}
                  onChange={(e) =>
                    updateInterest(index, {
                      status: e.target.value,
                      closed_at: e.target.value === 'open' ? null : new Date(now).toISOString(),
                    })
                  }
                >
                  <option value="open">Đang quan tâm</option>
                  <option value="won">Đã mua</option>
                  <option value="lost">Không phù hợp</option>
                  <option value="paused">Tạm dừng</option>
                </select>
              </label>
              {interest.status === 'lost' && (
                <label className="mt-2 flex flex-col gap-1 text-small">
                  Lý do kết thúc đợt
                  <input
                    aria-label={`Lý do đợt ${interest.project || index + 1}`}
                    className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
                    disabled={!writable}
                    defaultValue={interest.reason || ''}
                    onBlur={(e) =>
                      e.currentTarget.value !== (interest.reason || '') &&
                      updateInterest(index, { reason: e.currentTarget.value.trim() })
                    }
                  />
                </label>
              )}
            </article>
          );
        })}
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            aria-label="Dự án quan tâm mới"
            className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
            disabled={!writable}
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="Dự án mới — tạo đợt riêng"
          />
          <input
            aria-label="Loại căn đợt mới"
            className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
            disabled={!writable}
            value={interestType}
            onChange={(e) => setInterestType(e.target.value)}
            placeholder="Loại căn"
          />
          <input
            aria-label="Ngân sách đợt mới"
            type="number"
            min="0"
            className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
            disabled={!writable}
            value={interestBudget}
            onChange={(e) => setInterestBudget(e.target.value)}
            placeholder="Ngân sách tối đa (VNĐ)"
          />
          <input
            aria-label="Mục đích đợt mới"
            className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
            disabled={!writable}
            value={interestPurpose}
            onChange={(e) => setInterestPurpose(e.target.value)}
            placeholder="Mục đích mua"
          />
          <input
            aria-label="Thời điểm đợt mới"
            className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
            disabled={!writable}
            value={interestTimeline}
            onChange={(e) => setInterestTimeline(e.target.value)}
            placeholder="Thời điểm dự kiến"
          />
          <Button disabled={!writable || !project.trim()} onClick={addInterest}>
            Thêm đợt
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-section">Người cùng quyết định</h2>
        {(customer.household || []).filter(Boolean).map((person, index) => (
          <p key={person?.id || index} className="text-body">
            {person?.name || 'Chưa có tên'}
            {person?.role ? ` · ${person.role}` : ''}
            {person?.phone ? ` · ${person.phone}` : ''}
          </p>
        ))}
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            aria-label="Tên người cùng quyết định"
            className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
            disabled={!writable}
            value={member}
            onChange={(e) => setMember(e.target.value)}
            placeholder="Tên"
          />
          <input
            aria-label="Vai trò người cùng quyết định"
            className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
            disabled={!writable}
            value={memberRole}
            onChange={(e) => setMemberRole(e.target.value)}
            placeholder="Vai trò"
          />
          <input
            aria-label="Số điện thoại người cùng quyết định"
            className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
            disabled={!writable}
            value={memberPhone}
            onChange={(e) => setMemberPhone(e.target.value)}
            placeholder="Số điện thoại (tuỳ chọn)"
          />
          <input
            aria-label="Ghi chú người cùng quyết định"
            className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
            disabled={!writable}
            value={memberNote}
            onChange={(e) => setMemberNote(e.target.value)}
            placeholder="Ghi chú (tuỳ chọn)"
          />
          <Button disabled={!writable || !member.trim()} onClick={addHousehold}>
            Thêm người
          </Button>
        </div>
      </section>

      {terminated && (
        <section className="space-y-3">
          <h2 className="text-section">Lý do kết thúc và điều kiện retarget</h2>
          <label className="flex flex-col gap-1 text-small">
            Lý do
            <select
              aria-label="Lý do kết thúc"
              className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
              disabled={!writable}
              value={customer.close_reason || ''}
              onChange={(e) => closePatch('close_reason', e.target.value || null)}
            >
              <option value="">Chọn lý do</option>
              {Object.entries(CLOSE_REASONS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-small">
            Ghi chú kết thúc
            <input
              className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
              disabled={!writable}
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
              onBlur={() => closeNote !== (customer.close_note || '') && closePatch('close_note', closeNote.trim())}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-small">
              Liên hệ lại sau ngày
              <input
                type="date"
                className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
                disabled={!writable}
                value={retargetAfter}
                onChange={(e) => setRetargetAfter(e.target.value)}
                onBlur={() =>
                  retargetAfter !== (retarget.after || '') &&
                  closePatch('retarget_hint', { after: retargetAfter || null })
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-small">
              Ngân sách tối đa (VNĐ)
              <input
                type="number"
                min="0"
                className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
                disabled={!writable}
                value={retargetPrice}
                onChange={(e) => setRetargetPrice(e.target.value)}
                onBlur={() =>
                  retargetPrice !== String(retarget.max_price ?? '') &&
                  closePatch('retarget_hint', { max_price: retargetPrice ? Number(retargetPrice) : null })
                }
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-small">
            Loại căn phù hợp
            <input
              className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-body"
              disabled={!writable}
              value={retargetAptTypes}
              onChange={(e) => setRetargetAptTypes(e.target.value)}
              onBlur={() =>
                retargetAptTypes !== (retarget.apt_types || []).join(', ') &&
                closePatch('retarget_hint', {
                  apt_types: retargetAptTypes
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Cách nhau bằng dấu phẩy"
            />
          </label>
        </section>
      )}
    </section>
  );
}
