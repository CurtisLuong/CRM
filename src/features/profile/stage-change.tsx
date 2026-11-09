import { useRef, useState } from 'react';
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
import { CARE_STAGE_BRANCH, CARE_STAGE_DISPLAY, CARE_STAGE_DROPPED, CARE_STAGE_PICKER_ORDER } from '@/config/stages';
import type { Customer } from '@/domain/customer';
import { normStage } from '@/domain/customer/normalize';
import { canMoveStage } from '@/domain/customer/stageMoves';
import { forStage, type ScheduleSuggestion } from '@/domain/followup';
import { cn } from '@/lib/utils';

const label = (stage: string) => CARE_STAGE_DISPLAY[stage] || stage;

type Props = {
  customer: Customer;
  busy: boolean;
  onClose: () => void;
  onConfirm: (stage: string, note: string, suggestion: ScheduleSuggestion | null) => Promise<boolean>;
};

/**
 * Một tấm 2 bước dùng chung cho chip bậc cạnh tên và nút "Đổi bậc" ở nhóm bậc hiện tại.
 * Bước 1 chỉ chọn; bước 2 mới ghi — đóng/Huỷ ở bất kỳ bước nào không ghi gì.
 */
export function StageChangeSheet({ customer, busy, onClose, onConfirm }: Props) {
  const current = normStage(customer.care_stage) || '';
  const [selected, setSelected] = useState(current);
  const [step, setStep] = useState(1);
  const [note, setNote] = useState('');
  const [schedule, setSchedule] = useState(true);
  const [now] = useState(Date.now);
  const saving = useRef(false);
  const suggestion = selected ? forStage(customer, selected, now) : null;
  const allowed = canMoveStage(current, selected);

  const confirm = async () => {
    if (busy || saving.current || !allowed) return;
    saving.current = true;
    try {
      if (await onConfirm(selected, note.trim(), schedule ? suggestion : null)) onClose();
    } finally {
      saving.current = false;
    }
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !saving.current) onClose();
      }}
    >
      <SheetContent aria-describedby="stage-description">
        <SheetHeader>
          <SheetTitle>Đổi bậc khách</SheetTitle>
          <SheetDescription id="stage-description">
            Bước {step}/2 · {step === 1 ? 'Chọn bậc chăm sóc mới' : 'Xác nhận đổi bậc'}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {step === 1 ? (
            <fieldset className="space-y-1">
              <legend className="sr-only">Bậc chăm sóc</legend>
              {CARE_STAGE_PICKER_ORDER.filter((stage) => stage !== CARE_STAGE_DROPPED).map((stage) => {
                const active = stage === current;
                const blocked = !active && !canMoveStage(current, stage);
                const branch = CARE_STAGE_BRANCH[stage];
                const text = label(stage);
                return (
                  <label
                    key={stage}
                    data-stage-option={stage}
                    className={cn(
                      'flex min-h-12 items-center gap-3 rounded-md px-2',
                      active && 'bg-ion-tint text-ion',
                      blocked ? 'opacity-40' : 'cursor-pointer hover:bg-surface-200',
                      branch && 'ml-4 border-l-2 border-line pl-3',
                    )}
                  >
                    <input
                      type="radio"
                      name="profile-care-stage"
                      value={stage}
                      aria-label={text}
                      checked={stage === selected}
                      disabled={busy || blocked || active}
                      onChange={() => setSelected(stage)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {branch && <span aria-hidden>↳ </span>}
                        {text}
                      </span>
                      {active && <span className="block text-caption">Bậc hiện tại</span>}
                      {blocked ? (
                        <span className="block text-caption">Không lùi bậc</span>
                      ) : (
                        branch && <span className="block text-caption text-ink-muted">{branch.hint}</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ) : (
            <div className="space-y-4">
              <p className="break-words text-sm font-semibold">
                {label(current)} → {label(selected)}
              </p>
              <label className="block space-y-2 text-sm font-medium">
                <span>Ghi chú (tuỳ chọn)</span>
                <textarea
                  aria-label="Ghi chú đổi bậc"
                  value={note}
                  disabled={busy}
                  onChange={(event) => setNote(event.target.value)}
                  className="min-h-24 w-full rounded-md border border-line bg-surface-100 p-3 text-ink"
                />
              </label>
              {suggestion && (
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={schedule}
                    disabled={busy}
                    onChange={(event) => setSchedule(event.target.checked)}
                  />
                  <span>Hẹn {suggestion.label}</span>
                </label>
              )}
            </div>
          )}
        </SheetBody>
        <SheetFooter>
          <Button disabled={busy} onClick={step === 1 ? onClose : () => setStep(1)}>
            {step === 1 ? 'Huỷ' : 'Quay lại'}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !allowed}
            onClick={step === 1 ? () => setStep(2) : () => void confirm()}
          >
            {step === 1 ? 'Tiếp tục' : 'Xác nhận đổi bậc'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
