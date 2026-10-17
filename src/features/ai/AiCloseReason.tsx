import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { Button } from '@/ui';
import { AiProposalPanel } from './AiProposalPanel';
import type { AiCloseReasonResult } from './model';
export function AiCloseReason({
  account,
  customer,
  reasons,
  onReview,
}: {
  account: RepositoryAccount;
  customer: Customer;
  reasons: Record<string, string>;
  onReview: (suggestion: { code: string; evidence: string; retarget: string }) => void;
}) {
  return (
    <AiProposalPanel<AiCloseReasonResult>
      account={account}
      customer={customer}
      task="close_reason"
      title="Gợi ý lý do kết thúc"
      extra={{ reasons }}
    >
      {(result, isCurrent) => (
        <>
          {!result.goi_y.length && <p>Chưa có bằng chứng rõ để đề xuất lý do.</p>}
          {result.goi_y
            .filter((item) => Object.hasOwn(reasons, item.ma))
            .map((item) => (
              <div key={item.ma} className="mb-3">
                <b>{reasons[item.ma]}</b>
                <p>{item.bang_chung}</p>
                <Button
                  className="mt-2"
                  onClick={() => {
                    const current = account.customers.getSnapshot().find((row) => row.id === customer.id);
                    if (
                      isCurrent() &&
                      current &&
                      !current.archived_at &&
                      current.owner_id === account.sync.local.userId
                    )
                      onReview({ code: item.ma, evidence: item.bang_chung, retarget: result.dieu_kien_retarget });
                  }}
                >
                  Chọn để kiểm tra trước khi lưu
                </Button>
              </div>
            ))}
          {result.dieu_kien_retarget && (
            <p className="text-small">Điều kiện liên hệ lại: {result.dieu_kien_retarget}</p>
          )}
        </>
      )}
    </AiProposalPanel>
  );
}
