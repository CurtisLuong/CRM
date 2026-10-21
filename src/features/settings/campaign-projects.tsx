import { useEffect, useMemo, useState } from 'react';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { Button } from '@/ui';
import { activeCampaignProject, type CampaignProjectRule, campaignFillCandidates, campaignProjectRows } from './model';

const FIELD = 'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-text';
const READ_ERROR =
  'Không tải được quy tắc dự án theo chiến dịch. Kiểm tra mạng hoặc quyền; chưa có dự án nào bị thay đổi.';
const OFFLINE_TEXT = 'Cần mạng để sửa dự án theo chiến dịch.';
const EMPTY_TEXT = 'Chưa có lead quảng cáo nào có tên chiến dịch.';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'offline';
type Busy = { campaign: string; kind: 'save' | 'unassign' | 'fill' };

/** Chỉ đọc cột của migration 009; giữ nguyên quy tắc đã lưu trữ nếu máy chủ trả về. */
function normalizeRules(value: unknown): CampaignProjectRule[] {
  if (!Array.isArray(value)) return [];
  const rules: CampaignProjectRule[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const campaign = typeof row.campaign === 'string' ? row.campaign.trim() : '';
    const project = typeof row.project === 'string' ? row.project.trim() : '';
    if (!campaign || !project) continue;
    rules.push({
      id: typeof row.id === 'string' ? row.id : undefined,
      campaign,
      project,
      updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
      archived_at: typeof row.archived_at === 'string' ? row.archived_at : null,
    });
  }
  return rules;
}

/** Tên dự án trong giỏ hàng (cache của account.catalog). Lỗi đọc cache ≠ có dự án. */
function catalogProjectNames(account: RepositoryAccount | null): string[] {
  try {
    const rows = account?.catalog?.projects?.() ?? [];
    const names: string[] = [];
    for (const row of rows) {
      const name = typeof (row as Record<string, unknown>)?.name === 'string' ? String(row.name).trim() : '';
      if (name && !names.includes(name)) names.push(name);
    }
    return names;
  } catch {
    return [];
  }
}

/**
 * ML-04: gán "chiến dịch quảng cáo → dự án" một lần; quy tắc chỉ lưu trên máy chủ (cần mạng).
 * Đọc lỗi phải báo lỗi, không được hiện "Chưa gán" như thể chưa có quy tắc.
 */
export function CampaignProjectsSection({
  customers,
  account,
}: {
  customers: readonly Customer[];
  account: RepositoryAccount | null;
}) {
  const client = account?.sync?.client ?? null;
  const userId = account?.sync?.local?.userId ?? '';
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [rules, setRules] = useState<CampaignProjectRule[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Busy | null>(null);
  const [status, setStatus] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!account || !client || !userId) {
      setLoadState('idle');
      setRules([]);
      return;
    }
    if (!online) {
      setLoadState('offline');
      return;
    }
    setLoadState('loading');
    const query = client
      .from('lead_campaign_projects')
      .select('campaign,project,archived_at,updated_at')
      .eq('owner_id', userId)
      .is('archived_at', null);
    void Promise.resolve(query)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setRules([]);
          setLoadState('error');
          return;
        }
        setRules(normalizeRules(data));
        setLoadState('ready');
      })
      .catch(() => {
        if (!active) return;
        setRules([]);
        setLoadState('error');
      });
    return () => {
      active = false;
    };
  }, [account, client, userId, online]);

  const rows = useMemo(() => campaignProjectRows(customers, rules), [customers, rules]);
  const projectNames = catalogProjectNames(account);
  const ready = loadState === 'ready';
  const canEdit = ready && online && !!account && !!client;
  const someBusy = busy !== null;

  const assign = async (campaign: string) => {
    if (!client || !canEdit || someBusy) return;
    const project = (draft[campaign] ?? activeCampaignProject(rules, campaign) ?? '').trim();
    if (!project) return;
    setBusy({ campaign, kind: 'save' });
    setStatus('');
    setActionError('');
    try {
      const now = new Date().toISOString();
      // Chỉ ghi 4 cột của hợp đồng; owner_id để mặc định auth.uid() của bảng.
      const { error } = await client
        .from('lead_campaign_projects')
        .upsert({ campaign, project, archived_at: null, updated_at: now }, { onConflict: 'owner_id,campaign' });
      if (error) throw error;
      setRules((current) => [
        ...current.filter((rule) => rule.campaign !== campaign),
        { campaign, project, archived_at: null, updated_at: now },
      ]);
      setDraft((current) => {
        const next = { ...current };
        delete next[campaign];
        return next;
      });
      setStatus(`Đã gán dự án ${project} cho chiến dịch.`);
    } catch {
      setActionError('Chưa lưu được dự án cho chiến dịch. Thử lại khi có mạng.');
    } finally {
      setBusy(null);
    }
  };

  const unassign = async (campaign: string) => {
    if (!client || !canEdit || someBusy) return;
    setBusy({ campaign, kind: 'unassign' });
    setStatus('');
    setActionError('');
    try {
      const now = new Date().toISOString();
      // Bỏ gán = xoá mềm; không xoá dòng quy tắc.
      const { error } = await client
        .from('lead_campaign_projects')
        .update({ archived_at: now, updated_at: now })
        .eq('owner_id', userId)
        .eq('campaign', campaign);
      if (error) throw error;
      setRules((current) => current.filter((rule) => rule.campaign !== campaign));
      setDraft((current) => {
        const next = { ...current };
        delete next[campaign];
        return next;
      });
      setStatus('Đã bỏ gán dự án cho chiến dịch.');
    } catch {
      setActionError('Chưa bỏ gán được dự án cho chiến dịch. Thử lại khi có mạng.');
    } finally {
      setBusy(null);
    }
  };

  const fill = async (campaign: string, project: string) => {
    if (!account || !canEdit || someBusy) return;
    const targets = campaignFillCandidates(customers, campaign);
    if (!targets.length) return;
    setBusy({ campaign, kind: 'fill' });
    setStatus('');
    setActionError('');
    let done = 0;
    let failed = 0;
    for (const customer of targets) {
      try {
        // Chỉ ghi trường projects của khách đang trống; không đụng khách đã có dự án.
        await account.customers.update(customer.id, { projects: [project] });
        done++;
      } catch {
        failed++;
      }
    }
    if (done) setStatus(`Đã điền dự án ${project} cho ${done} khách.`);
    if (failed) setActionError(`Chưa điền được dự án cho ${failed} khách. Thử lại khi có mạng.`);
    setBusy(null);
  };

  return (
    <section aria-labelledby="campaign-projects-title" className="rounded-card border border-border bg-surface p-4">
      <h2 id="campaign-projects-title" className="text-section">
        Dự án theo chiến dịch quảng cáo
      </h2>
      <p className="mt-1 text-small text-text-2">
        Gán một lần để lead mới của chiến dịch tự có dự án. Quy tắc lưu trên tài khoản và cần mạng khi sửa.
      </p>
      {!account || !client ? (
        <p className="mt-3 text-small text-text-2">Đăng nhập để gán dự án theo chiến dịch quảng cáo.</p>
      ) : (
        <>
          {loadState === 'loading' && <p className="mt-3 text-small text-text-2">Đang tải quy tắc…</p>}
          {loadState === 'offline' && (
            <p role="status" className="mt-3 rounded-control bg-surface-2 px-3 py-2 text-small text-text-2">
              {OFFLINE_TEXT}
            </p>
          )}
          {loadState === 'error' && (
            <p role="alert" className="mt-3 text-small text-danger">
              {READ_ERROR}
            </p>
          )}
          {ready && rows.length === 0 && <p className="mt-3 text-small text-text-2">{EMPTY_TEXT}</p>}
          {ready && rows.length > 0 && !projectNames.length && (
            <p className="mt-3 text-small text-text-2">
              Chưa có dự án trong giỏ hàng. Thêm dự án ở Giỏ hàng rồi quay lại để gán theo chiến dịch.
            </p>
          )}
          {rows.length > 0 && (
            <div className="mt-3 flex flex-col gap-3">
              {rows.map((row) => {
                const assigned = ready ? row.project : null;
                const selected = draft[row.campaign] ?? assigned ?? '';
                const options =
                  assigned && !projectNames.includes(assigned) ? [...projectNames, assigned] : projectNames;
                const fillCount = ready && assigned ? campaignFillCandidates(customers, row.campaign).length : 0;
                const rowBusy = busy?.campaign === row.campaign;
                return (
                  <article key={row.campaign} className="min-w-0 rounded-control border border-border p-3">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <h3 className="min-w-0 text-body-strong [overflow-wrap:anywhere]">{row.campaign}</h3>
                      <span className="shrink-0 text-small text-text-2">{row.customerCount} khách</span>
                    </div>
                    {ready ? (
                      <p className="mt-1 text-small text-text-2">
                        {assigned ? `Dự án đang gán: ${assigned}` : 'Chưa gán'}
                      </p>
                    ) : loadState === 'loading' ? (
                      <p className="mt-1 text-small text-text-2">Đang tải dự án đã gán…</p>
                    ) : null}
                    <div className="mt-3 flex min-w-0 flex-col gap-2">
                      <label className="flex min-w-0 flex-col gap-1 text-small text-text-2">
                        Dự án cho chiến dịch này
                        <select
                          className={FIELD}
                          aria-label={`Dự án cho chiến dịch ${row.campaign}`}
                          value={selected}
                          disabled={!canEdit || someBusy}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, [row.campaign]: event.target.value }))
                          }
                        >
                          <option value="">Chọn dự án</option>
                          {options.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="primary"
                          disabled={!canEdit || someBusy || !selected || selected === (assigned ?? '')}
                          loading={rowBusy && busy?.kind === 'save'}
                          onClick={() => void assign(row.campaign)}
                        >
                          Lưu dự án
                        </Button>
                        {assigned && (
                          <Button
                            disabled={!canEdit || someBusy}
                            loading={rowBusy && busy?.kind === 'unassign'}
                            onClick={() => void unassign(row.campaign)}
                          >
                            Bỏ gán
                          </Button>
                        )}
                      </div>
                      {assigned && fillCount > 0 && (
                        <Button
                          disabled={!canEdit || someBusy}
                          loading={rowBusy && busy?.kind === 'fill'}
                          onClick={() => void fill(row.campaign, assigned)}
                        >
                          Điền dự án cho {fillCount} khách đang trống
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {actionError && (
            <p role="alert" className="mt-3 text-small text-danger">
              {actionError}
            </p>
          )}
          {status && (
            <p role="status" className="mt-3 text-small text-success">
              {status}
            </p>
          )}
        </>
      )}
    </section>
  );
}
