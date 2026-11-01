import type { RepositoryAccount } from '@/data/repositories/session';
import { AiProposalPanel } from './AiProposalPanel';
import type { AiCoachResult } from './model';
export type AiAggregateMetric = {
  value: number | null;
  numerator?: number;
  denominator?: number;
  period: string;
  previous?: number | null;
  sample_threshold: number;
};
export function coachAggregates(metrics: Record<string, AiAggregateMetric>) {
  return Object.fromEntries(
    Object.entries(metrics).map(([key, value]) => [
      key,
      Object.fromEntries(
        ['value', 'numerator', 'denominator', 'period', 'previous', 'sample_threshold']
          .filter((field) => Object.hasOwn(value, field))
          .map((field) => [field, value[field as keyof AiAggregateMetric]]),
      ),
    ]),
  );
}
export function AiCoach({
  account,
  metrics,
  findings,
  links,
}: {
  account: RepositoryAccount;
  metrics: Record<string, AiAggregateMetric>;
  findings: Array<{ code: string; text: string; period: string }>;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <AiProposalPanel<AiCoachResult>
      account={account}
      task="coach"
      title="Diễn giải chỉ số AI"
      extra={{
        metrics: coachAggregates(metrics),
        findings: findings.map(({ code, text, period }) => ({ code, text, period })),
      }}
    >
      {(result) => (
        <>
          <p>{result.diem_tot}</p>
          <p className="mt-2">{result.can_cai_thien}</p>
          <ul className="mt-2 list-inside list-disc">
            {[...new Set(result.hanh_dong)].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {result.luu_y_du_lieu && <p className="mt-2 text-label text-soon-text">{result.luu_y_du_lieu}</p>}
          <div className="mt-2 flex flex-wrap gap-3">
            {links
              .filter((link) => link.href.startsWith('/') && !link.href.startsWith('//'))
              .map((link) => (
                <a key={link.href} className="text-link underline" href={link.href}>
                  {link.label}
                </a>
              ))}
          </div>
        </>
      )}
    </AiProposalPanel>
  );
}
