import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { Button } from '@/ui';
import { AiProposalPanel } from './AiProposalPanel';
import { type AiRetarget, validDay } from './model';
export type VerifiedAiProduct = {
  verified_at: string;
  project?: string;
  apt_type?: string;
  area_m2?: number;
  direction?: string;
  floor?: number;
  price?: number;
  policy?: string;
};
export function verifiedProductDate(value: string) {
  if (validDay(value)) return true;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  return (
    !!match &&
    validDay(match[1]) &&
    Number(match[2]) < 24 &&
    Number(match[3]) < 60 &&
    Number(match[4]) < 60 &&
    Number.isFinite(Date.parse(value))
  );
}
export function AiRetargetDraft({
  account,
  customer,
  product,
  match,
  history,
  onDraft,
}: {
  account: RepositoryAccount;
  customer: Customer;
  product: VerifiedAiProduct | null;
  match: { matched: string[]; blocked: string[] };
  history: { reason?: string; condition?: string };
  onDraft: (text: string) => void;
}) {
  const verified = !!product && verifiedProductDate(product.verified_at);
  // Copy only approved product facts; imported catalog metadata is not a verification date.
  const facts = product
    ? Object.fromEntries(
        ['verified_at', 'project', 'apt_type', 'area_m2', 'direction', 'floor', 'price', 'policy']
          .filter((key) => Object.hasOwn(product, key))
          .map((key) => [key, product[key as keyof VerifiedAiProduct]]),
      )
    : null;
  return (
    <AiProposalPanel<AiRetarget>
      account={account}
      customer={customer}
      task="retarget_msg"
      title="Tin retarget AI"
      extra={{ product: facts, match, history }}
      disabledReason={
        customer.contact_prefs?.do_not_contact
          ? 'Khách yêu cầu không liên hệ.'
          : !verified
            ? 'Cần sản phẩm và ngày xác minh giá/tồn từ nguồn đã được duyệt.'
            : undefined
      }
    >
      {(result, isCurrent) => (
        <>
          <p>{result.tin_nhan}</p>
          <ul className="mt-2 list-inside list-disc">
            {[...new Set(result.diem_khop_da_dung)].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Button
            className="mt-2"
            onClick={() => {
              const current = account.customers.getSnapshot().find((item) => item.id === customer.id);
              if (isCurrent() && current && !current.archived_at && !current.contact_prefs?.do_not_contact)
                onDraft(result.tin_nhan);
            }}
          >
            Dùng làm bản nháp để sửa
          </Button>
        </>
      )}
    </AiProposalPanel>
  );
}
