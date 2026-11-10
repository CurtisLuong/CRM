import { Button } from '@/components/ui/button';
import { INTEREST_TIERS } from '@/config/stages';

/** Dùng chung thứ tự từ cấu hình cho hồ sơ và tấm ghi cuộc gọi. */
export function InterestTierPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (tier: string) => void;
}) {
  return (
    <fieldset className="min-w-0 space-y-2" aria-label="Mức quan tâm">
      <legend className="text-caption text-ink-muted">Mức quan tâm</legend>
      <div className="grid grid-cols-2 gap-2">
        {INTEREST_TIERS.map((tier) => (
          <Button
            key={tier.key}
            type="button"
            variant={value === tier.key ? 'primary' : 'secondary'}
            aria-pressed={value === tier.key}
            disabled={disabled}
            className="min-h-11 min-w-0 px-2"
            onClick={() => onChange(tier.key)}
          >
            {tier.label}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}
