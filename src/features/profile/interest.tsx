import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Customer } from '@/domain/customer';
import { interestLevelForTier, interestTierOf } from '@/domain/customer/interest';
import { InterestTierPicker } from '@/features/quick-actions/interest-picker';

export function ProfileInterest({
  customer,
  writable,
  busy,
  onSave,
}: {
  customer: Customer;
  writable: boolean;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const tier = interestTierOf(customer.interest_level);
  if (!writable) return <>{tier.label}</>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Lề âm: chữ thẳng hàng giá trị các ô khác mà vùng bấm vẫn 44px. */}
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="-mx-2 -my-2.5 h-auto min-h-11 justify-start px-2 text-sm font-medium"
          disabled={busy}
          aria-label={`Mức quan tâm: ${tier.label}`}
        >
          {tier.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 max-w-[calc(100vw-2rem)]">
        <InterestTierPicker
          value={tier.key}
          disabled={busy}
          onChange={async (key) => {
            const next = interestLevelForTier(customer.interest_level, key);
            if (next != null && next !== Number(customer.interest_level)) await onSave({ interest_level: next });
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
