import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CallResult } from '@/config/callResults';
import type { CallSlotKey, ZaloTemplate } from '@/config/followup';
import { type CallSource, installCallSource } from '@/data/callSource';
import { useRepositoryAccount } from '@/data/hooks';
import type { RepositoryAccount } from '@/data/repositories/session';
import { type CallAttempt, type Customer, callAttemptsOf } from '@/domain/customer';
import { appendInteractionPatch, createInteraction } from '@/domain/customer/interactions';
import type { ScheduleSuggestion } from '@/domain/followup';
import { AiNoteReview } from '@/features/ai/AiNoteReview';
import { AiZaloDraft } from '@/features/ai/AiZaloDraft';
import { Button, IconButton, OutcomePicker, Sheet, SlotPicker, useToast } from '@/ui';
import { InteractionRecorder } from './interactions';
import {
  type CallDraft,
  callDuration,
  callSuggestion,
  initialSchedule,
  localDay,
  type NextMode,
  saveCall,
  scheduleFor,
  schedulePatch,
  slotFor,
} from './model';
import { actionStore, clearQuickAction, openQuickAction, type QuickAction } from './store';
import { contactPhones, copyAndOpenZalo, defaultTemplates } from './zalo';

const FIELD =
  'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-text focus:outline-2 focus:outline-accent';

export { openQuickAction } from './store';
/** Reusable on rows, detail action bars and calling sessions. Does not require navigation. */
export function useCall(c: Customer) {
  return () => openQuickAction(c.id, 'call');
}
export function QuickActionButtons({ customer }: { customer: Customer }) {
  const account = useRepositoryAccount();
  const writable = !!account && customer.owner_id === account.sync.local.userId && !customer.archived_at;
  return (
    <fieldset className="flex flex-wrap gap-2" aria-label={`Hành động cho ${customer.full_name}`}>
      <legend className="sr-only">Hành động cho {customer.full_name}</legend>
      {(
        [
          ['call', 'call', 'Gọi'],
          ['zalo', 'message', 'Zalo'],
          ['note', 'note', 'Ghi chú'],
          ['schedule', 'call_sched', 'Hẹn'],
        ] as const
      ).map(([kind, icon, label]) => (
        <IconButton
          key={kind}
          icon={icon}
          label={label}
          disabled={!writable}
          onClick={() => openQuickAction(customer.id, kind)}
        />
      ))}
      {account && <InteractionRecorder account={account} customer={customer} trigger />}
    </fieldset>
  );
}
type Active = {
  customerId: string;
  kind: QuickAction | 'phone';
  intent?: 'call' | 'zalo';
  draft?: CallDraft;
  serial: number;
};
/** Mounted once within the app ToastProvider; owns bridge lifetime, dialogs and account isolation. */
export function QuickActionsHost({
  onZaloSent,
}: {
  onZaloSent?: (customer: Customer, text: string, templateId: string) => void;
}) {
  const account = useRepositoryAccount();
  const request = useSyncExternalStore(actionStore.subscribe, actionStore.get, actionStore.get);
  const [active, setActive] = useState<Active | null>(null);
  const source = useRef<CallSource | null>(null);
  const serial = useRef(0);
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [zaloReturn, setZaloReturn] = useState(false);
  const waitingZalo = useRef(false);
  useEffect(() => {
    clearQuickAction();
    setActive(null);
    waitingZalo.current = false;
    setZaloReturn(false);
    if (!account) return;
    const onPending = (id: string, attempt?: CallAttempt, estimateSec?: number) => {
      if (account.sync.local.isClosed) return;
      // Never replace an open draft. Pending device calls remain available on the route.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      openQuickAction(id, 'outcome', {
        at: attempt?.at ?? new Date().toISOString(),
        duration: attempt?.duration,
        origin: attempt?.origin ?? 'manual',
        device_id: attempt?.device_id ?? undefined,
        direction: attempt?.direction ?? undefined,
        editAt: attempt?.at ?? undefined,
        estimateSec,
      });
    };
    const bridge = installCallSource(account, onPending);
    source.current = bridge;
    return () => {
      bridge.dispose();
      source.current = null;
      clearQuickAction();
    };
  }, [account]);
  useEffect(() => {
    if (!request || !account || account.sync.local.isClosed) return;
    const c = account.customers.getSnapshot().find((c) => c.id === request.customerId);
    if (!c || c.archived_at || c.owner_id !== account.sync.local.userId) {
      toast({ title: 'Khách này chỉ được xem.' });
      clearQuickAction();
      return;
    }
    const numbers = contactPhones(c);
    serial.current++;
    if (request.kind === 'call' || request.kind === 'zalo') {
      if (c.contact_prefs?.do_not_contact) {
        toast({ title: 'Khách yêu cầu không liên hệ', description: c.contact_prefs.dnc_reason || undefined });
        clearQuickAction();
        return;
      }
      if (!numbers.length) {
        toast({ title: 'Khách chưa có số điện thoại dùng được.' });
        clearQuickAction();
        return;
      }
      setPhone(numbers[0] ?? '');
      if (numbers.length > 1) {
        setActive({ ...request, kind: 'phone', intent: request.kind, serial: serial.current });
        return;
      }
      if (request.kind === 'call') {
        void source.current
          ?.dial(c, numbers[0])
          .catch((error) => toast({ title: 'Chưa mở được cuộc gọi', description: String(error), tone: 'error' }));
        setActive(null);
        return;
      }
    }
    setActive({ ...request, serial: serial.current });
    setZaloReturn(false);
  }, [request, account, toast]);
  useEffect(() => {
    const back = () => {
      if (waitingZalo.current) {
        waitingZalo.current = false;
        setZaloReturn(true);
      }
    };
    const visibility = () => {
      if (!document.hidden) back();
    };
    window.addEventListener('crm:resume', back);
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('crm:resume', back);
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  if (!account || !active) return null;
  const c = account.customers.getSnapshot().find((c) => c.id === active.customerId);
  if (!c || c.archived_at || c.owner_id !== account.sync.local.userId) return null;
  const close = () => {
    setActive(null);
    waitingZalo.current = false;
    clearQuickAction();
  };
  if (active.kind === 'phone')
    return (
      <Sheet open onOpenChange={(o) => !o && close()} title={`Chọn số · ${c.full_name}`}>
        <div className="flex flex-col gap-2">
          {contactPhones(c).map((number) => (
            <Button
              key={number}
              onClick={() => {
                setPhone(number);
                if (active.intent === 'call') {
                  void source.current
                    ?.dial(c, number)
                    .catch((e) => toast({ title: 'Chưa gọi được', description: String(e), tone: 'error' }));
                  close();
                } else setActive({ ...active, kind: 'zalo' });
              }}
            >
              {number}
            </Button>
          ))}
        </div>
      </Sheet>
    );
  return (
    <ActionSheet
      key={`${active.serial}:${active.kind}`}
      account={account}
      customer={c}
      kind={active.kind}
      draft={active.draft}
      phone={phone}
      onClose={close}
      zaloReturn={zaloReturn}
      onZaloOpen={() => {
        waitingZalo.current = true;
      }}
      onZaloSent={onZaloSent}
    />
  );
}

function ScheduleFields({
  schedule,
  onChange,
}: {
  schedule: ScheduleSuggestion;
  onChange: (s: ScheduleSuggestion) => void;
}) {
  const day = localDay(schedule.start),
    slot = slotFor(schedule.start);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return {
      value: localDay(d),
      label:
        i === 0
          ? 'Hôm nay'
          : i === 1
            ? 'Mai'
            : d.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' }),
    };
  });
  if (!days.some((d) => d.value === day)) days.push({ value: day, label: schedule.start.toLocaleDateString('vi-VN') });
  return (
    <div className="flex flex-col gap-3">
      <SlotPicker
        days={days}
        day={day}
        slot={slot}
        suggested={slot}
        onDayChange={(d) => onChange(scheduleFor(d, slot, schedule.reason))}
        onSlotChange={(s: CallSlotKey) => onChange(scheduleFor(day, s, schedule.reason))}
      />
      <label className="flex flex-col gap-1 text-small">
        Ngày khác
        <input
          aria-label="Ngày hẹn khác"
          type="date"
          className={FIELD}
          value={day}
          min={localDay(today)}
          onChange={(e) => {
            if (e.target.value) onChange(scheduleFor(e.target.value, slot, schedule.reason));
          }}
        />
      </label>
    </div>
  );
}

function ActionSheet({
  account,
  customer: c,
  kind,
  draft: given,
  phone,
  onClose,
  zaloReturn,
  onZaloOpen,
  onZaloSent,
}: {
  account: RepositoryAccount;
  customer: Customer;
  kind: QuickAction;
  draft?: CallDraft;
  phone: string;
  onClose: () => void;
  zaloReturn: boolean;
  onZaloOpen: () => void;
  onZaloSent?: (c: Customer, text: string, id: string) => void;
}) {
  const toast = useToast();
  const [now] = useState(Date.now);
  const [draft] = useState<CallDraft>(() => given ?? { at: new Date(now).toISOString(), origin: 'manual' });
  const existing = draft.editAt ? callAttemptsOf(c).find((a) => a.at === draft.editAt) : null;
  const [result, setResult] = useState<CallResult | null>((existing?.result as CallResult) ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [mode, setMode] = useState<NextMode>('suggested');
  const [schedule, setSchedule] = useState(() => initialSchedule(c, now));
  const [customTime, setCustomTime] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [templates, setTemplates] = useState(() => defaultTemplates(c, now));
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [text, setText] = useState(templates[0]?.text ?? '');
  const textEdited = useRef(false);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const [launched, setLaunched] = useState(false);
  const [editSchedule, setEditSchedule] = useState(kind === 'schedule');
  const suggestion = callSuggestion(c, draft, result, now, account.customers.getSnapshot());
  const suggested =
    suggestion?.kind === 'schedule' ? suggestion : suggestion?.kind === 'drop' ? suggestion.fallback : null;
  useEffect(() => {
    if (kind === 'outcome' && result === 'talked') noteInput.current?.focus();
  }, [kind, result]);
  useEffect(() => {
    if (kind !== 'zalo') return;
    let alive = true;
    void account.remote
      .getZaloTemplatesRemote()
      .then((list) => {
        if (!alive || account.sync.local.isClosed || !Array.isArray(list) || textEdited.current) return;
        const valid = list.filter(
          (t): t is ZaloTemplate =>
            !!t && typeof t.id === 'string' && typeof t.name === 'string' && typeof t.text === 'string',
        );
        const next = defaultTemplates(c, now, valid);
        setTemplates(next);
        setTemplateId(next[0]?.id ?? '');
        setText(next[0]?.text ?? '');
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [account, c, kind, now]);
  const setOutcome = (value: CallResult) => {
    setResult(value);
    setError('');
    const sug = callSuggestion(c, draft, value, now, account.customers.getSnapshot());
    setMode(sug?.kind === 'ask' ? 'custom' : sug?.kind === 'drop' && sug.auto ? 'drop' : 'suggested');
    setEditSchedule(false);
  };
  const run = async (fn: () => Promise<unknown>, close = true, successTitle = 'Đã lưu trên máy') => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      if (account.sync.local.isClosed) return;
      if (close) {
        toast({
          title: successTitle,
          description: account.sync.isOnline() ? 'Đang đồng bộ.' : 'Ngoại tuyến · Chờ đồng bộ.',
        });
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa lưu được. Thử lại.');
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      if (kind === 'note') {
        if (!note.trim()) throw new Error('Nhập ghi chú trước khi lưu.');
        return account.customers.addNote(c.id, note);
      }
      if (kind === 'schedule') {
        if (+schedule.start <= Date.now()) throw new Error('Chọn lịch gọi trong tương lai.');
        return account.customers.update(c.id, schedulePatch(schedule));
      }
      if (!result) throw new Error('Chọn kết quả cuộc gọi.');
      let custom = mode === 'custom' ? schedule : null;
      if (suggestion?.kind === 'ask' && mode !== 'none') {
        if (!customTime) throw new Error('Xác nhận đúng giờ khách hẹn.');
        const start = new Date(customTime);
        custom = {
          kind: 'schedule',
          start,
          end: new Date(start),
          reason: 'Khách hẹn gọi lại',
          label: start.toLocaleString('vi-VN'),
        };
      }
      return saveCall(
        account.customers,
        c.id,
        draft,
        result,
        note,
        mode,
        custom,
        Date.now(),
        account.customers.getSnapshot(),
      );
    });
  const title =
    kind === 'outcome'
      ? 'Kết quả cuộc gọi'
      : kind === 'note'
        ? 'Ghi chú nhanh'
        : kind === 'schedule'
          ? 'Hẹn gọi lại'
          : 'Nhắn Zalo';
  const dirty = !!note || (kind === 'outcome' && !!result) || textEdited.current || editSchedule;
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${title} · ${c.full_name}`}
      description={
        kind === 'outcome'
          ? draft.duration != null
            ? `Thời lượng máy: ${callDuration(draft.duration)}`
            : draft.estimateSec != null
              ? `Rời app khoảng ${callDuration(draft.estimateSec)} · ước lượng, gồm cả đổ chuông`
              : undefined
          : undefined
      }
      dirty={dirty && !busy}
      footer={
        kind === 'zalo' ? (
          <Button
            variant="primary"
            block
            loading={busy}
            disabled={!text.trim() || !phone}
            onClick={() =>
              run(async () => {
                if (c.contact_prefs?.do_not_contact) throw new Error('Khách yêu cầu không liên hệ.');
                await copyAndOpenZalo(text, phone);
                setLaunched(true);
                onZaloOpen();
              }, false)
            }
          >
            Sao chép & mở Zalo
          </Button>
        ) : (
          <Button variant="primary" block loading={busy} onClick={save}>
            Lưu
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {kind === 'outcome' && (
          <>
            <OutcomePicker value={result} onValueChange={setOutcome} />
            <label className="flex flex-col gap-1 text-small">
              Ghi chú cuộc gọi
              <textarea
                ref={noteInput}
                className={FIELD}
                aria-label="Ghi chú cuộc gọi"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {result && note.trim() && <AiNoteReview account={account} customer={c} note={note} />}
            {result && (
              <section className="flex flex-col gap-2">
                <h3 className="text-body-strong">Bước tiếp theo</h3>
                {suggested && mode === 'suggested' && (
                  <p className="text-small text-text-2">
                    {suggested.label} · {suggested.reason}
                  </p>
                )}
                {suggestion?.kind === 'drop' && (
                  <>
                    <p className="text-small">{suggestion.text}</p>
                    {!suggestion.auto && (
                      <label className="flex min-h-11 items-center gap-2 text-small">
                        <input
                          type="checkbox"
                          checked={mode === 'drop'}
                          onChange={(e) => setMode(e.target.checked ? 'drop' : 'none')}
                        />
                        Loại khách: Số sai
                      </label>
                    )}
                  </>
                )}
                {suggestion?.kind === 'ask' && mode !== 'none' ? (
                  <label className="flex flex-col gap-1 text-small">
                    Đúng giờ khách hẹn
                    <input
                      className={FIELD}
                      aria-label="Giờ khách hẹn"
                      type="datetime-local"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                    />
                  </label>
                ) : (
                  <>
                    {editSchedule && (
                      <ScheduleFields
                        schedule={schedule}
                        onChange={(s) => {
                          setSchedule(s);
                          setMode('custom');
                        }}
                      />
                    )}
                    <Button
                      onClick={() => {
                        setMode('custom');
                        setEditSchedule(true);
                      }}
                    >
                      Đổi lịch gọi
                    </Button>
                  </>
                )}
                <label className="flex min-h-11 items-center gap-2 text-small">
                  <input
                    type="checkbox"
                    checked={mode === 'none'}
                    onChange={(e) =>
                      setMode(
                        e.target.checked
                          ? 'none'
                          : suggestion?.kind === 'ask'
                            ? 'custom'
                            : suggestion?.kind === 'drop' && suggestion.auto
                              ? 'drop'
                              : 'suggested',
                      )
                    }
                  />
                  Không hẹn gọi tiếp
                </label>
              </section>
            )}
          </>
        )}
        {kind === 'note' && (
          <label className="flex flex-col gap-1 text-small">
            Nội dung
            <textarea
              className={FIELD}
              aria-label="Nội dung ghi chú"
              rows={5}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        )}
        {kind === 'schedule' && <ScheduleFields schedule={schedule} onChange={setSchedule} />}
        {kind === 'zalo' && (
          <>
            <p className="text-small text-text-2">{phone} · Dán nội dung vào Zalo rồi tự bấm gửi.</p>
            <AiZaloDraft
              account={account}
              customer={c}
              onDraft={(draftText) => {
                setText(draftText);
                textEdited.current = true;
              }}
            />
            <label className="flex flex-col gap-1 text-small">
              Mẫu tin
              <select
                aria-label="Mẫu tin"
                className={FIELD}
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  setText(templates.find((t) => t.id === e.target.value)?.text ?? '');
                  textEdited.current = true;
                }}
              >
                {templates.map((t, i) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {i === 0 ? ' · Gợi ý' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-small">
              Nội dung tin nhắn
              <textarea
                className={FIELD}
                aria-label="Nội dung tin nhắn"
                rows={7}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  textEdited.current = true;
                }}
              />
            </label>
            {launched && zaloReturn && (
              <section className="flex flex-col gap-2" aria-label="Xác nhận Zalo">
                <p className="text-body-strong">Đã gửi tin trong Zalo?</p>
                <div className="flex gap-2">
                  <Button
                    loading={busy}
                    onClick={() =>
                      void run(
                        async () => {
                          await account.customers.update(
                            c.id,
                            appendInteractionPatch(
                              c,
                              createInteraction(
                                'sent',
                                account.sync.local.userId,
                                new Date().toISOString(),
                                templateId,
                              ),
                            ),
                          );
                          onZaloSent?.(c, text, templateId);
                        },
                        true,
                        'Đã ghi tương tác Zalo',
                      )
                    }
                  >
                    Đã gửi
                  </Button>
                  <Button onClick={onClose}>Chưa gửi</Button>
                </div>
              </section>
            )}
          </>
        )}
        {kind !== 'zalo' && <InteractionRecorder account={account} customer={c} />}
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}
        {!account.sync.isOnline() && (
          <p className="text-small text-text-2">Ngoại tuyến · Thay đổi được lưu trên máy.</p>
        )}
      </div>
    </Sheet>
  );
}
