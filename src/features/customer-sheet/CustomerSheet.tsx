import { useEffect, useMemo, useState } from 'react';
import { ActionButton, SignalBadge, SlaMeter, StageChip, Timeline } from '@/components/crm';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { Customer } from '@/domain/customer';
import { normStage } from '@/domain/customer/normalize';
import { canEditTeamInfo } from '@/domain/customer/teamEdit';
import { openQuickAction } from '@/features/quick-actions/store';
import { fmtPhone, slaMeterFor, stageDef } from '@/lib/crm';
import { customerJourney, customerQuickSignal } from './model';

type Props = {
  customer: Customer | null;
  userId: string;
  canAssign?: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenProfile: (customer: Customer) => void;
  onAssign?: (customer: Customer) => void;
};

export function CustomerSheet({ customer, userId, canAssign = false, onOpenChange, onOpenProfile, onAssign }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const journey = useMemo(
    () => (customer ? customerJourney(customer, now) : { stages: [], count: 0 }),
    [customer, now],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!customer) return null;

  const stage = normStage(customer.care_stage) || '';
  const meter = slaMeterFor(customer, now);
  const signal = customerQuickSignal(customer, now);
  const writable = customer.owner_id === userId && !customer.archived_at;
  const noteWritable = writable || canEditTeamInfo(customer, userId);
  const runAction = (action: 'call' | 'zalo' | 'note' | 'schedule') => {
    onOpenChange(false);
    openQuickAction(customer.id, action);
  };

  return (
    <Sheet open={!!customer} onOpenChange={onOpenChange}>
      <SheetContent width={480} aria-label={customer.full_name} aria-describedby={undefined}>
        <SheetHeader>
          <span className="text-overline">Khách hàng</span>
          <SheetTitle>
            <button
              type="button"
              onClick={() => onOpenProfile(customer)}
              className="break-words text-left hover:text-ion"
            >
              {customer.full_name}
            </button>
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-body text-ink-muted">{fmtPhone(customer.phone)}</span>
              <StageChip stage={stage} />
              <SignalBadge level={signal.level} size="sm">
                {signal.text}
              </SignalBadge>
            </div>
          </SheetDescription>
        </SheetHeader>

        <nav aria-label="Hành động nhanh" className="flex min-w-0 justify-between gap-2 border-b border-line px-5 py-3">
          <ActionButton
            action="call"
            label="Gọi"
            display="stacked"
            disabled={!writable}
            aria-label={`Gọi ${customer.full_name}`}
            className="md:w-auto md:flex-row md:px-4"
            onClick={() => runAction('call')}
          />
          <ActionButton
            action="message"
            label="Zalo"
            display="stacked"
            disabled={!writable}
            aria-label={`Zalo ${customer.full_name}`}
            className="md:w-auto md:flex-row md:px-4"
            onClick={() => runAction('zalo')}
          />
          <ActionButton
            action="note"
            label="Ghi chú"
            display="stacked"
            disabled={!noteWritable}
            aria-label={`Ghi chú ${customer.full_name}`}
            className="md:w-auto md:flex-row md:px-4"
            onClick={() => runAction('note')}
          />
          <ActionButton
            action="call_sched"
            label="Hẹn"
            display="stacked"
            disabled={!writable}
            aria-label={`Hẹn ${customer.full_name}`}
            className="md:w-auto md:flex-row md:px-4"
            onClick={() => runAction('schedule')}
          />
        </nav>

        <SheetBody>
          {meter && stageDef(meter.stage).sla && (
            <div className="rounded-md border border-line bg-surface-0 p-3">
              <SlaMeter {...meter} />
            </div>
          )}
          <section aria-label="Hành trình khách hàng" className="space-y-2">
            <h3 className="m-0 text-overline">Hành trình · {journey.count.toLocaleString('vi-VN')} việc</h3>
            {journey.stages.length > 0 ? (
              <Timeline stages={journey.stages} now={new Date(now)} collapsePast />
            ) : (
              <p className="m-0 text-body text-ink-muted">Chưa có hoạt động để hiển thị.</p>
            )}
          </section>
        </SheetBody>

        {canAssign && onAssign && (
          <div className="border-t border-line px-5 py-3">
            <Button className="w-full" onClick={() => onAssign(customer)}>
              Giao khách
            </Button>
          </div>
        )}
        <SheetFooter>
          <Button variant="primary" className="w-full" onClick={() => onOpenProfile(customer)}>
            Mở hồ sơ đầy đủ
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
