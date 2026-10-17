import { useEffect, useMemo, useState } from 'react';
import { SOURCES } from '@/config/sources';
import type { RepositoryAccount } from '@/data/repositories/session';
import type { Customer } from '@/domain/customer';
import { type CampaignCost, campaignCostMetrics } from '@/domain/metrics/marketing';
import { Button } from '@/ui';

const FIELD = 'min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-text';
const dateNow = () => new Date().toISOString().slice(0, 10);
const money = (n: number) => `${Math.round(n).toLocaleString('vi-VN')} ₫`;
type CostRow = CampaignCost & { owner_id?: string; archived_at?: string | null };

export function CampaignCostsSection({
  customers,
  account,
}: {
  customers: readonly Customer[];
  account: RepositoryAccount | null;
}) {
  const [rows, setRows] = useState<CostRow[]>([]);
  const [source, setSource] = useState('facebook_ads');
  const [campaign, setCampaign] = useState('');
  const [periodStart, setPeriodStart] = useState(dateNow);
  const [periodEnd, setPeriodEnd] = useState(dateNow);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!account) {
        setLoading(false);
        return;
      }
      if (!account.sync.isOnline()) {
        setError('Chi phí campaign cần mạng để tải và lưu.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const { data, error: queryError } = await account.sync.client
          .from('campaign_costs')
          .select('id,owner_id,source,campaign,period_start,period_end,amount,note,updated_at,archived_at')
          .eq('owner_id', account.sync.local.userId)
          .is('archived_at', null)
          .order('period_start', { ascending: false });
        if (queryError) throw queryError;
        if (active) setRows(Array.isArray(data) ? (data as CostRow[]) : []);
      } catch {
        if (active)
          setError(
            'Không tải được chi phí. Kiểm tra quyền hoặc migration campaign_costs; không có dữ liệu nào bị thay đổi.',
          );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [account]);

  const metrics = useMemo(() => campaignCostMetrics(customers, rows, now), [customers, rows, now]);
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!account || saving) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0 || !Number.isInteger(numericAmount)) {
      setError('Nhập chi phí là số nguyên VND từ 0 trở lên.');
      return;
    }
    if (!periodStart || (periodEnd && periodEnd < periodStart)) {
      setError('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.');
      return;
    }
    if (!account.sync.isOnline()) {
      setError('Đang ngoại tuyến; hãy thử lưu lại khi có mạng.');
      return;
    }
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const payload = {
        owner_id: account.sync.local.userId,
        source: source || null,
        campaign: campaign.trim() || null,
        period_start: periodStart,
        period_end: periodEnd || null,
        amount: numericAmount,
        note: note.trim() || null,
      };
      const { data, error: insertError } = await account.sync.client
        .from('campaign_costs')
        .insert(payload)
        .select('id,owner_id,source,campaign,period_start,period_end,amount,note,updated_at,archived_at')
        .single();
      if (insertError) throw insertError;
      setRows((current) => [data as CostRow, ...current]);
      setAmount('');
      setNote('');
      setStatus('Đã lưu chi phí lên tài khoản.');
    } catch {
      setError('Chưa lưu được chi phí. Bản nháp vẫn còn trong biểu mẫu; thử lại khi có mạng.');
    } finally {
      setSaving(false);
    }
  };
  const archive = async (id: string) => {
    if (!account?.sync.isOnline()) {
      setError('Cần mạng để ẩn dòng chi phí.');
      return;
    }
    setError('');
    try {
      const archivedAt = new Date().toISOString();
      const { error: updateError } = await account.sync.client
        .from('campaign_costs')
        .update({ archived_at: archivedAt })
        .eq('id', id)
        .eq('owner_id', account.sync.local.userId);
      if (updateError) throw updateError;
      setRows((current) => current.filter((row) => row.id !== id));
      setStatus('Đã ẩn dòng chi phí; bản ghi vẫn được giữ.');
    } catch {
      setError('Không ẩn được dòng chi phí.');
    }
  };

  return (
    <section aria-labelledby="campaign-costs-title" className="rounded-card border border-border bg-surface p-4">
      <h2 id="campaign-costs-title" className="text-section">
        Chi phí campaign
      </h2>
      <p className="mt-1 text-small text-text-2">
        Nhập theo kênh/campaign và khoảng ngày. Chỉ tài khoản của bạn; ẩn dòng là xoá mềm. Chi phí chỉ ghép với lead
        đăng ký trong kỳ đã nhập.
      </p>
      {!account ? (
        <p className="mt-3 text-small text-text-2">Đăng nhập để quản lý chi phí theo tài khoản.</p>
      ) : (
        <>
          <form className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
            <label className="flex flex-col gap-1 text-small">
              Kênh
              <select className={FIELD} value={source} onChange={(event) => setSource(event.target.value)}>
                <option value="">Mọi kênh</option>
                {Object.entries(SOURCES).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-small">
              Campaign (để trống = mọi campaign)
              <input
                className={FIELD}
                maxLength={160}
                value={campaign}
                onChange={(event) => setCampaign(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-small">
              Từ ngày
              <input
                className={FIELD}
                type="date"
                required
                value={periodStart}
                onChange={(event) => setPeriodStart(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-small">
              Đến ngày
              <input
                className={FIELD}
                type="date"
                value={periodEnd}
                onChange={(event) => setPeriodEnd(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-small">
              Chi phí (VND)
              <input
                className={FIELD}
                type="number"
                min="0"
                step="1"
                required
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-small">
              Ghi chú (tuỳ chọn)
              <input className={FIELD} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit" variant="primary" loading={saving} disabled={loading}>
                Lưu chi phí
              </Button>
              {status && (
                <p role="status" className="text-small text-text-2">
                  {status}
                </p>
              )}
              {error && (
                <p role="alert" className="text-small text-danger">
                  {error}
                </p>
              )}
            </div>
          </form>
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-body-strong">Chi phí đã nhập</h3>
            {loading ? (
              <p className="mt-2 text-small text-text-2">Đang tải…</p>
            ) : metrics.length ? (
              <div className="mt-2 flex flex-col gap-2">
                {metrics.map((row) => (
                  <article key={row.id} className="rounded-control border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h4 className="text-label">
                          {SOURCES[row.source || ''] || row.source || 'Mọi kênh'} · {row.campaign || 'Mọi campaign'}
                        </h4>
                        <p className="text-xs text-text-2">
                          {row.period_start} → {row.period_end || row.period_start}
                        </p>
                      </div>
                      <Button
                        aria-label={`Ẩn chi phí ${row.campaign || row.source || 'campaign'}`}
                        onClick={() => void archive(row.id)}
                      >
                        Ẩn
                      </Button>
                    </div>
                    <p className="mt-2 text-small">
                      Tổng chi phí: <strong>{money(row.amount)}</strong> · Lead {row.leadCount} · Đạt{' '}
                      {row.qualifiedCount} · Booking {row.bookingCount}
                    </p>
                    {row.leadCount > 0 && (
                      <p className="text-small text-text-2">
                        CPL {row.cpl == null ? '—' : money(row.cpl)} = chi phí / {row.leadCount} lead · Chi phí/Đạt{' '}
                        {row.costPerQualified == null ? '—' : money(row.costPerQualified)} = chi phí /{' '}
                        {row.qualifiedCount} · Chi phí/Booking{' '}
                        {row.costPerBooking == null ? '—' : money(row.costPerBooking)} = chi phí / {row.bookingCount}
                      </p>
                    )}
                    {!row.leadCount && (
                      <p className="text-small text-text-2">
                        Chưa có lead khớp kỳ; chưa hiển thị chi phí/lead, chi phí/Đạt hoặc chi phí/Booking.
                      </p>
                    )}
                    {row.note && <p className="mt-1 text-small text-text-3">{row.note}</p>}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-small text-text-2">Chưa nhập chi phí campaign.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
