import { type ReactNode, useEffect, useState } from 'react';
import { CollapsibleFormSection, FormGrid, FormSection, FormSubsection } from '@/components/crm/form-section';
import { MoneyField } from '@/components/crm/money-field';
import { Button } from '@/components/ui/button';
import { CLOSE_REASONS } from '@/config/reasons';
import type { Customer } from '@/domain/customer';
import { factFreshness, factPatch } from '@/domain/customer/facts';
import { formatMoney, moneyValue } from '@/ui/display';
import { LONG_FIELD, SHORT_FIELD } from './fields';

type Save = (patch: Record<string, unknown>, message?: string) => void;

type BaseProps = {
  customer: Customer;
  writable: boolean;
  onSave: Save;
  now: number;
};

/** Chia mục giữa tab Trí nhớ và tab Nhu cầu & căn; mặc định hiện đủ như form cũ. */
export type MemorySections = {
  contact?: boolean;
  interests?: boolean;
  household?: boolean;
  closure?: boolean;
};

type Props = {
  customer: Customer;
  writable: boolean;
  onSave: Save;
  now?: number;
  sections?: MemorySections;
  /** Ẩn ô chưa có giá trị (tab Trí nhớ). */
  hideEmpty?: boolean;
  /** Nút "Bổ sung" dùng chung cho Thông tin chính + Tuỳ chọn liên hệ. */
  supplement?: { open: boolean; count: number; onToggle: () => void };
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
    <FormSection title="Nguồn và độ mới của dữ kiện">
      {Object.entries(FACT_LABELS).map(([field, label]) => {
        const meta = customer.field_meta?.[field];
        const age = factFreshness(meta?.at, now);
        return (
          <p key={field} className={`${LONG_FIELD} text-caption text-ink-muted`}>
            {label}: {sourceName[meta?.by || ''] || 'Nguồn chưa ghi'} · {age.label}
          </p>
        );
      })}
      <p className={`${LONG_FIELD} text-caption text-ink-muted`}>Dữ kiện quá 90 ngày cần xác nhận lại.</p>
    </FormSection>
  );
}

const markFactOf = (customer: Customer, now: number) => (field: string, value: unknown) =>
  factPatch(customer, field, value, 'sale', new Date(now).toISOString());

/** Số ô Tuỳ chọn liên hệ đang trống (gộp vào nút "Bổ sung" của tab Trí nhớ). */
export function contactPrefsHiddenCount(customer: Customer): number {
  const prefs = customer.contact_prefs || {};
  let count = 0;
  if (!String(prefs.channel || '').trim()) count += 1;
  if (!String(prefs.slot || '').trim()) count += 1;
  if (prefs.do_not_contact) {
    if (!String(prefs.dnc_reason || '').trim()) count += 1;
  } else {
    // Hộp chọn "Không liên hệ" coi là trống khi chưa bật.
    count += 1;
  }
  return count;
}

/**
 * PF-11 (Curtis 08/11): số ô liên hệ CHƯA ĐIỀN để quyết định ẩn nút Mở rộng — hộp "Không liên hệ" chưa bật là
 * một lựa chọn hợp lệ, không tính là thiếu (nếu tính, nút không bao giờ biến mất với khách bình thường).
 */
export function contactPrefsMissingCount(customer: Customer): number {
  const prefs = customer.contact_prefs || {};
  return (
    Number(!String(prefs.channel || '').trim()) +
    Number(!String(prefs.slot || '').trim()) +
    Number(!!prefs.do_not_contact && !String(prefs.dnc_reason || '').trim())
  );
}

/** Tuỳ chọn liên hệ: kênh + khung giờ (ô ngắn nửa hàng) và "Không liên hệ". */
export function CustomerContactPrefs({
  customer,
  writable,
  onSave,
  now,
  hideEmpty = false,
}: BaseProps & {
  hideEmpty?: boolean;
}) {
  const [channel, setChannel] = useState(customer.contact_prefs?.channel || '');
  const [slot, setSlot] = useState(customer.contact_prefs?.slot || '');
  const [dncReason, setDncReason] = useState(customer.contact_prefs?.dnc_reason || '');
  const prefs = customer.contact_prefs || {};
  // Ô đã có giá trị lúc mở hồ sơ vẫn hiện dù bị xoá trắng trong phiên này (L2).
  const [initiallyFilled] = useState(() => ({
    channel: String(customer.contact_prefs?.channel || '').trim() !== '',
    slot: String(customer.contact_prefs?.slot || '').trim() !== '',
    dnc: !!customer.contact_prefs?.do_not_contact,
    reason: String(customer.contact_prefs?.dnc_reason || '').trim() !== '',
  }));
  const markFact = markFactOf(customer, now);
  const savePref = (key: string, value: unknown) => {
    onSave(markFact('contact_prefs', { ...prefs, [key]: value }));
  };
  const showChannel = !hideEmpty || initiallyFilled.channel;
  const showSlot = !hideEmpty || initiallyFilled.slot;
  const showDoNotContact = !hideEmpty || initiallyFilled.dnc || !!prefs.do_not_contact;
  const showDncReason = !!prefs.do_not_contact && (!hideEmpty || initiallyFilled.reason);
  // Mọi ô đều trống và đang ẩn → bỏ luôn tiêu đề, tránh một mục rỗng giữa trang (Curtis 2026-10-22: hồ sơ gọn).
  if (!showChannel && !showSlot && !showDoNotContact && !showDncReason) return null;

  return (
    <FormSection title="Tuỳ chọn liên hệ" data-jump="contact">
      {showChannel && (
        <label className={`flex flex-col gap-1 text-caption ${SHORT_FIELD}`}>
          Kênh ưu tiên
          <input
            aria-label="Kênh liên hệ ưu tiên"
            className="min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 text-body"
            disabled={!writable}
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            onBlur={() => channel !== (prefs.channel || '') && savePref('channel', channel.trim())}
          />
        </label>
      )}
      {showSlot && (
        <label className={`flex flex-col gap-1 text-caption ${SHORT_FIELD}`}>
          Khung giờ ưu tiên
          <input
            aria-label="Khung giờ liên hệ"
            className="min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 text-body"
            disabled={!writable}
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            onBlur={() => slot !== (prefs.slot || '') && savePref('slot', slot.trim())}
            placeholder="Ví dụ: 18:00–20:00"
          />
        </label>
      )}
      {showDoNotContact && (
        <label className={`flex min-h-11 items-center gap-2 text-body ${LONG_FIELD}`}>
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
      )}
      {showDncReason && (
        <label className={`flex flex-col gap-1 text-caption ${LONG_FIELD}`}>
          Lý do không liên hệ
          <input
            className="min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 text-body"
            disabled={!writable}
            value={dncReason}
            onChange={(e) => setDncReason(e.target.value)}
            onBlur={() => dncReason !== (prefs.dnc_reason || '') && savePref('dnc_reason', dncReason.trim())}
          />
        </label>
      )}
    </FormSection>
  );
}

/** Nguồn tên dự án cho đợt quan tâm mới; route truyền catalog, nơi dùng cũ bỏ trống để giữ ô gõ tay. */
export type InterestProjectCatalog = { projects: () => readonly { name?: unknown }[] };

/** Tên dự án đang hoạt động, bỏ tên rỗng/trùng để combobox không có lựa chọn giả. */
function catalogProjectNames(catalog: InterestProjectCatalog): string[] {
  const names = catalog.projects().map((row) => String(row?.name ?? '').trim());
  return [...new Set(names.filter(Boolean))];
}

/** Nhu cầu theo đợt: thêm/sửa từng đợt, giữ nguyên thuộc tính lạ của mỗi phần tử. */
export function CustomerInterests({
  customer,
  writable,
  onSave,
  now,
  projectCatalog,
  nested = false,
}: BaseProps & { projectCatalog?: InterestProjectCatalog | null; nested?: boolean }) {
  const [project, setProject] = useState('');
  const [interestType, setInterestType] = useState('');
  const [interestBudget, setInterestBudget] = useState<number | null>(null);
  const [budgetValid, setBudgetValid] = useState(true);
  const [interestPurpose, setInterestPurpose] = useState('');
  const [interestTimeline, setInterestTimeline] = useState('');
  const markFact = markFactOf(customer, now);
  const addInterest = () => {
    const name = project.trim();
    if (!name) return;
    const interests = (customer.interests || []).slice();
    interests.push({
      id: crypto.randomUUID(),
      project: name,
      apt_type: interestType.trim() || null,
      budget_max: interestBudget,
      purpose: interestPurpose.trim() || null,
      timeline: interestTimeline.trim() || null,
      status: 'open',
      source: 'sale',
      at: new Date(now).toISOString(),
    });
    onSave(markFact('interests', interests), 'Đã thêm đợt quan tâm');
    setProject('');
    setInterestType('');
    setInterestBudget(null);
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

  const Section = nested ? FormSubsection : FormSection;
  return (
    <Section title="Nhu cầu theo đợt">
      {(customer.interests || []).map((interest, index) => {
        if (!interest) return null;
        const age = factFreshness(interest.at, now);
        return (
          <article
            key={interest?.id || index}
            className={`${LONG_FIELD} space-y-2 rounded-sm border border-line p-3 [overflow-wrap:anywhere]`}
          >
            <p className="text-body font-semibold">
              {interest.project || 'Chưa rõ dự án'} · {interest.apt_type || 'Chưa rõ loại căn'}
            </p>
            <p className="text-caption text-ink-muted">
              {interest.status || 'Chưa rõ trạng thái'} · nguồn{' '}
              {sourceName[interest.source || ''] || interest.source || 'chưa ghi'} · {age.label}
            </p>
            {interest.purpose && <p className="text-caption text-ink-muted">Mục đích: {interest.purpose}</p>}
            {interest.timeline && <p className="text-caption text-ink-muted">Thời điểm: {interest.timeline}</p>}
            {interest.budget_max != null && (
              <p className="text-caption text-ink-muted">Ngân sách tối đa: {formatMoney(interest.budget_max)}</p>
            )}
            <label className="mt-2 flex flex-col gap-1 text-caption">
              Trạng thái đợt
              <select
                aria-label={`Trạng thái đợt ${interest.project || index + 1}`}
                className="min-h-11 rounded-sm border border-line bg-surface-100 px-3 text-body"
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
              <label className="mt-2 flex flex-col gap-1 text-caption">
                Lý do kết thúc đợt
                <input
                  aria-label={`Lý do đợt ${interest.project || index + 1}`}
                  className="min-h-11 rounded-sm border border-line bg-surface-100 px-3 text-body"
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
      <FormGrid className={LONG_FIELD}>
        <div className={SHORT_FIELD}>
          {projectCatalog ? (
            <select
              aria-label="Dự án quan tâm mới"
              className="min-h-11 w-full min-w-0 rounded-sm border border-line bg-surface-100 px-3 text-body"
              disabled={!writable}
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">— Chọn dự án —</option>
              {catalogProjectNames(projectCatalog).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label="Dự án quan tâm mới"
              className="min-h-11 w-full min-w-0 rounded-sm border border-line bg-surface-100 px-3 text-body"
              disabled={!writable}
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="Dự án mới — tạo đợt riêng"
            />
          )}
        </div>
        <input
          aria-label="Loại căn đợt mới"
          className={`${SHORT_FIELD} min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 text-body`}
          disabled={!writable}
          value={interestType}
          onChange={(e) => setInterestType(e.target.value)}
          placeholder="Loại căn"
        />
        <MoneyField
          label="Ngân sách đợt mới"
          className={SHORT_FIELD}
          disabled={!writable}
          value={interestBudget}
          onChange={setInterestBudget}
          onValidityChange={setBudgetValid}
        />
        <input
          aria-label="Mục đích đợt mới"
          className={`${SHORT_FIELD} min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 text-body`}
          disabled={!writable}
          value={interestPurpose}
          onChange={(e) => setInterestPurpose(e.target.value)}
          placeholder="Mục đích mua"
        />
        <input
          aria-label="Thời điểm đợt mới"
          className={`${SHORT_FIELD} min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 text-body`}
          disabled={!writable}
          value={interestTimeline}
          onChange={(e) => setInterestTimeline(e.target.value)}
          placeholder="Thời điểm dự kiến"
        />
        <div className={`${LONG_FIELD} flex justify-start`}>
          <Button disabled={!writable || !project.trim() || !budgetValid} onClick={addInterest}>
            Thêm đợt
          </Button>
        </div>
      </FormGrid>
    </Section>
  );
}

/** Người cùng quyết định: thêm người, giữ nguyên thuộc tính lạ của mỗi phần tử. */
export function CustomerHousehold({
  customer,
  writable,
  onSave,
  now,
  nested = false,
}: BaseProps & { nested?: boolean }) {
  const [member, setMember] = useState('');
  const [memberRole, setMemberRole] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberNote, setMemberNote] = useState('');
  const markFact = markFactOf(customer, now);
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

  const Section = nested ? FormSubsection : FormSection;
  return (
    <Section title="Người cùng quyết định" data-jump="household">
      {(customer.household || []).filter(Boolean).map((person, index) => (
        <p key={person?.id || index} className={`${LONG_FIELD} text-body [overflow-wrap:anywhere]`}>
          {person?.name || 'Chưa có tên'}
          {person?.role ? ` · ${person.role}` : ''}
          {person?.phone ? ` · ${person.phone}` : ''}
        </p>
      ))}
      <FormGrid className={LONG_FIELD}>
        <input
          aria-label="Tên người cùng quyết định"
          className={`${SHORT_FIELD} min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 text-body`}
          disabled={!writable}
          value={member}
          onChange={(e) => setMember(e.target.value)}
          placeholder="Tên"
        />
        <input
          aria-label="Vai trò người cùng quyết định"
          className={`${SHORT_FIELD} min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 text-body`}
          disabled={!writable}
          value={memberRole}
          onChange={(e) => setMemberRole(e.target.value)}
          placeholder="Vai trò"
        />
        <input
          aria-label="Số điện thoại người cùng quyết định"
          className={`${SHORT_FIELD} min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 text-body`}
          disabled={!writable}
          value={memberPhone}
          onChange={(e) => setMemberPhone(e.target.value)}
          placeholder="Số điện thoại (tuỳ chọn)"
        />
        <input
          aria-label="Ghi chú người cùng quyết định"
          className={`${LONG_FIELD} min-h-11 w-full rounded-sm border border-line bg-surface-100 px-3 text-body`}
          disabled={!writable}
          value={memberNote}
          onChange={(e) => setMemberNote(e.target.value)}
          placeholder="Ghi chú (tuỳ chọn)"
        />
        <div className={`${LONG_FIELD} flex justify-start`}>
          <Button disabled={!writable || !member.trim()} onClick={addHousehold}>
            Thêm người
          </Button>
        </div>
      </FormGrid>
    </Section>
  );
}

/** Lý do kết thúc + điều kiện retarget (chỉ khách đã kết thúc). */
export function CustomerClosure({ customer, writable, onSave, now }: BaseProps) {
  const [closeNote, setCloseNote] = useState(customer.close_note || '');
  const [retargetAfter, setRetargetAfter] = useState(customer.retarget_hint?.after || '');
  const [retargetAptTypes, setRetargetAptTypes] = useState((customer.retarget_hint?.apt_types || []).join(', '));
  const markFact = markFactOf(customer, now);
  const retarget = customer.retarget_hint || {};
  const closePatch = (key: string, value: unknown) =>
    onSave(
      key === 'retarget_hint' ? markFact('retarget_hint', { ...retarget, ...(value as object) }) : markFact(key, value),
    );

  return (
    <FormSection title="Lý do kết thúc và điều kiện retarget">
      <label className={`${LONG_FIELD} flex flex-col gap-1 text-caption`}>
        Lý do
        <select
          aria-label="Lý do kết thúc"
          className="min-h-11 rounded-sm border border-line bg-surface-100 px-3 text-body"
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
      <label className={`${LONG_FIELD} flex flex-col gap-1 text-caption`}>
        Ghi chú kết thúc
        <input
          className="min-h-11 rounded-sm border border-line bg-surface-100 px-3 text-body"
          disabled={!writable}
          value={closeNote}
          onChange={(e) => setCloseNote(e.target.value)}
          onBlur={() => closeNote !== (customer.close_note || '') && closePatch('close_note', closeNote.trim())}
        />
      </label>
      <FormGrid className={LONG_FIELD}>
        <label
          className={`${SHORT_FIELD} flex flex-col gap-1 text-caption [&>input]:min-w-0 [&>input]:w-full [&>input]:max-w-full [&>input]:shrink`}
        >
          Liên hệ lại sau ngày
          <input
            type="date"
            className="min-h-11 rounded-sm border border-line bg-surface-100 px-3 text-body"
            disabled={!writable}
            value={retargetAfter}
            onChange={(e) => setRetargetAfter(e.target.value)}
            onBlur={() =>
              retargetAfter !== (retarget.after || '') && closePatch('retarget_hint', { after: retargetAfter || null })
            }
          />
        </label>
        <MoneyField
          label="Ngân sách tối đa"
          className={SHORT_FIELD}
          disabled={!writable}
          value={moneyValue(retarget.max_price)}
          onCommit={(value) => closePatch('retarget_hint', { max_price: value })}
        />
      </FormGrid>
      <label className={`${LONG_FIELD} flex flex-col gap-1 text-caption`}>
        Loại căn phù hợp
        <input
          className="min-h-11 rounded-sm border border-line bg-surface-100 px-3 text-body"
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
    </FormSection>
  );
}

/**
 * Tab Trí nhớ (mặc định đủ mục như form cũ). Route truyền `sections` để chỉ giữ Tuỳ chọn liên hệ
 * + Lý do kết thúc; Nhu cầu theo đợt/Người cùng quyết định chuyển sang tab Nhu cầu & căn.
 */
export function CustomerMemory({
  customer,
  writable,
  onSave,
  now = Date.now(),
  sections,
  hideEmpty = false,
  supplement,
}: Props) {
  const show = { contact: true, interests: true, household: true, closure: true, ...sections };
  const terminated = customer.care_stage === 'Loại' || customer.care_stage === 'Nuôi dài hạn';
  return (
    <section aria-label="Trí nhớ khách" className="space-y-5">
      {show.contact && (
        <CustomerContactPrefs customer={customer} writable={writable} onSave={onSave} now={now} hideEmpty={hideEmpty} />
      )}
      {supplement && (supplement.count > 0 || supplement.open) && writable && (
        <Button variant="secondary" className="w-full" aria-expanded={supplement.open} onClick={supplement.onToggle}>
          {supplement.open ? 'Thu gọn' : `Mở rộng (${supplement.count})`}
        </Button>
      )}
      {show.interests && <CustomerInterests customer={customer} writable={writable} onSave={onSave} now={now} />}
      {show.household && <CustomerHousehold customer={customer} writable={writable} onSave={onSave} now={now} />}
      {show.closure && terminated && (
        <CustomerClosure customer={customer} writable={writable} onSave={onSave} now={now} />
      )}
    </section>
  );
}

/**
 * Khu "Nâng cao" duy nhất của tab Nhu cầu & căn: Sở thích BĐS + Nhu cầu theo đợt + Người cùng quyết định,
 * mặc định đóng mỗi lần mở tab (CL-03 L5, CP-01).
 */
export function CustomerNeedsAdvanced({
  customer,
  writable,
  onSave,
  now = Date.now(),
  projectCatalog,
  children,
  openSignal,
}: BaseProps & {
  projectCatalog?: InterestProjectCatalog | null;
  children?: ReactNode;
  /** Đổi số = mở khối (bấm "Còn thiếu: Người quyết định" ở thẻ Đã biết). */
  openSignal?: number;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);
  return (
    <CollapsibleFormSection title="Nâng cao" aria-label="Nhu cầu nâng cao" open={open} onOpenChange={setOpen}>
      {children}
      <CustomerInterests
        customer={customer}
        writable={writable}
        onSave={onSave}
        now={now}
        projectCatalog={projectCatalog}
        nested
      />
      <CustomerHousehold customer={customer} writable={writable} onSave={onSave} now={now} nested />
    </CollapsibleFormSection>
  );
}
