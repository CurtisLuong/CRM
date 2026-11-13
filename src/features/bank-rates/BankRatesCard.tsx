import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { BANKS, type BankCode } from '@/config/banks';
import type { RepositoryAccount } from '@/data/repositories/session';
import { LEVEL_CLASS } from '@/lib/crm';
import { Icon } from '@/ui/Icon';
import {
  bankRateRows,
  formatRate,
  formatRateDay,
  type OverrideDraft,
  parseOverride,
  type RateCache,
  type RateOverride,
  rateFreshness,
  rateSummary,
  rateWarnings,
  readOverrides,
  readRateCache,
  readRates,
  vietnamDay,
  writeRateCache,
} from './model';

const SOURCES = {
  bank: { label: 'Trang ngân hàng', dot: 'bg-ink-muted' },
  news: { label: 'AI đọc báo', dot: 'bg-chart-2' },
  manual: { label: 'Anh tự sửa', dot: 'bg-ion' },
};
function SourceDot({ kind }: { kind: keyof typeof SOURCES }) {
  return (
    <span
      role="img"
      aria-label={SOURCES[kind].label}
      className={`inline-block size-2 shrink-0 rounded-full ${SOURCES[kind].dot}`}
    />
  );
}

function OverrideForm({
  code,
  value,
  busy,
  error,
  onSave,
  onRemove,
  onCancel,
}: {
  code: BankCode;
  value: RateOverride | null | undefined;
  busy: boolean;
  error: string;
  onSave: (draft: OverrideDraft) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<OverrideDraft>({
    deposit_rate: value?.deposit_rate?.toString() ?? '',
    promo_rate: value?.promo_rate?.toString() ?? '',
    promo_months: value?.promo_months?.toString() ?? '',
    floating_rate: value?.floating_rate?.toString() ?? '',
    note: value?.note ?? '',
  });
  const fields = [
    ['deposit_rate', 'Gửi 12 tháng (%)'],
    ['promo_rate', 'Lãi ưu đãi (%)'],
    ['promo_months', 'Số tháng ưu đãi'],
    ['floating_rate', 'Lãi thả nổi (%)'],
    ['note', 'Ghi chú ngắn'],
  ] as const;
  return (
    <form
      className="mt-2 flex flex-col gap-3 rounded-md bg-surface-200 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <p className="text-hint">Ô để trống dùng số cập nhật cho riêng trường đó.</p>
      {fields.map(([field, label]) => (
        <label key={field} htmlFor={`${code}-${field}`} className="flex min-w-0 flex-col gap-1 text-label">
          {label}
          <Input
            id={`${code}-${field}`}
            inputMode={field === 'note' ? 'text' : field === 'promo_months' ? 'numeric' : 'decimal'}
            value={draft[field]}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
          />
        </label>
      ))}
      {error && (
        <p role="alert" className="text-label text-alert-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </Button>
        <Button disabled={busy} onClick={onCancel}>
          Huỷ
        </Button>
        {value && (
          <Button variant="ghost" disabled={busy} onClick={onRemove}>
            Xoá số tự sửa
          </Button>
        )}
      </div>
    </form>
  );
}

export function BankRatesCard({
  account,
  now,
  compact,
}: {
  account: RepositoryAccount;
  now: number;
  compact: boolean;
}) {
  const id = account.sync.local.userId;
  const [cache, setCache] = useState<RateCache>(() => readRateCache(id));
  const latest = useRef(cache);
  const revision = useRef(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BankCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const update = (patch: Partial<RateCache>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    writeRateCache(id, next);
    setCache(next);
  };
  useEffect(() => {
    alive.current = true;
    const load = () => {
      const request = ++revision.current;
      void account.remote
        .listBankRates()
        .then((rates) => {
          if (alive.current && request === revision.current && !account.sync.local.isClosed && rates !== undefined) {
            const next = { ...latest.current, rates: readRates(rates) };
            latest.current = next;
            setCache(next);
            writeRateCache(id, next);
          }
        })
        .catch(() => {});
      void account.remote
        .getUiStateRemote()
        .then((raw: unknown) => {
          if (alive.current && request === revision.current && !account.sync.local.isClosed && raw !== undefined) {
            const next = { ...latest.current, overrides: readOverrides(raw) };
            latest.current = next;
            setCache(next);
            writeRateCache(id, next);
          }
        })
        .catch(() => {});
    };
    load();
    window.addEventListener('online', load);
    return () => {
      alive.current = false;
      revision.current++;
      window.removeEventListener('online', load);
    };
  }, [account, id]);

  const save = async (code: BankCode, value: RateOverride | null) => {
    setBusy(true);
    setError('');
    revision.current++;
    try {
      const saved = await account.remote.saveUiStateRemote({ bank_rate_overrides: { [code]: value } });
      if (!alive.current || account.sync.local.isClosed) return;
      if (!saved) {
        setError('Chưa lưu được. Cần có mạng; số đang nhập vẫn được giữ để thử lại.');
        return;
      }
      update({ overrides: { ...latest.current.overrides, [code]: value } });
      setEditing(null);
    } catch {
      if (alive.current) setError('Chưa lưu được. Kiểm tra kết nối rồi thử lại; số đang nhập vẫn được giữ.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const rows = bankRateRows(cache.rates, cache.overrides);
  const big4 = rows.filter((bank) => bank.big4);
  const average = rateSummary(big4);
  const summary = rateSummary(rows);
  const warnings = rateWarnings(rows, now);
  const big4Warnings = rateWarnings(big4, now);
  const showCardWarning = warnings.hasRates && (big4Warnings.staleBanks > 0 || big4Warnings.missingBanks > 0);
  const warningText = [
    ...(warnings.staleBanks ? [`${warnings.staleBanks} ngân hàng có số cũ hơn 14 ngày`] : []),
    ...(warnings.missingBanks ? [`${warnings.missingBanks} ngân hàng còn thiếu số`] : []),
  ].join(' · ');
  const newest = summary.updatedOn;
  const noRates = average.deposit === null && average.promo === null && average.floating === null;
  // Chưa có số nào → thẻ 1 dòng như dạng thu gọn, không chiếm màn đầu bằng 3 ô trống.
  const slim = compact || noRates;
  const today = vietnamDay(new Date(now).toISOString());
  const metrics = [
    { key: 'deposit', label: 'Gửi TB', hint: '12 tháng', value: average.deposit },
    { key: 'promo', label: 'Vay ưu đãi TB', hint: 'cố định', value: average.promo },
    { key: 'floating', label: 'Thả nổi TB', hint: 'sau ưu đãi', value: average.floating },
  ] as const;
  return (
    <>
      <section aria-label="Lãi suất ngân hàng" className="mt-2 rounded-md border border-line bg-surface-100 px-3 py-2">
        {slim ? (
          <Button
            variant="ghost"
            aria-label="Xem 10 ngân hàng ›"
            className="min-h-11 h-auto w-full flex-col items-stretch gap-1 whitespace-normal px-0 text-left text-ink"
            onClick={() => setOpen(true)}
          >
            <span className="text-caption font-semibold">Lãi suất ngân hàng · TB Big 4</span>
            <span className="flex flex-wrap justify-between gap-2 text-caption">
              {metrics.map((metric) => (
                <span key={metric.key}>
                  <span className="sr-only">{metric.label} </span>
                  <strong data-testid={`big4-${metric.key}`}>
                    {metric.key === 'floating' && metric.value !== null ? '≈ ' : ''}
                    {formatRate(metric.value)}
                  </strong>
                </span>
              ))}
              <span aria-hidden="true">›</span>
            </span>
          </Button>
        ) : (
          <>
            <h2 className="text-label font-semibold">Lãi suất ngân hàng · TB Big 4</h2>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {metrics.map((metric) => (
                <div key={metric.key} className="min-w-0 rounded-md bg-surface-200 px-2 py-2">
                  <p className="text-caption text-ink-muted">{metric.label}</p>
                  <strong className="block text-numeric text-ink" data-testid={`big4-${metric.key}`}>
                    {metric.key === 'floating' && metric.value !== null ? '≈ ' : ''}
                    {formatRate(metric.value)}
                  </strong>
                  <p className="text-caption text-ink-muted">{metric.hint}</p>
                </div>
              ))}
            </div>
          </>
        )}
        {noRates && <p className="text-hint">Chưa có số lãi suất</p>}
        {/* Ngày + nút chung một hàng: thẻ thấp để màn đầu 360px vẫn thấy thẻ việc (D-023 L1). */}
        {(average.updatedOn || !slim) && (
          <div className="flex items-center justify-between gap-2">
            {average.updatedOn ? (
              <p className="text-caption text-ink-muted">Cập nhật cuối: {formatRateDay(average.updatedOn)}</p>
            ) : (
              <span />
            )}
            {!slim && (
              <Button variant="ghost" className="min-h-11 shrink-0 px-0" onClick={() => setOpen(true)}>
                Xem 10 ngân hàng ›
              </Button>
            )}
          </div>
        )}
        {showCardWarning && (
          <p className={`whitespace-nowrap text-caption ${LEVEL_CLASS.soon.text}`}>
            Có số cũ / thiếu — xem 10 ngân hàng
          </p>
        )}
      </section>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <SheetContent mobileHeight="90dvh" width={520}>
          <SheetHeader>
            <SheetTitle>Lãi suất ngân hàng</SheetTitle>
            {newest && <SheetDescription>Cập nhật cuối: {formatRateDay(newest)}</SheetDescription>}
            <div className="flex flex-wrap gap-x-3 gap-y-2 text-caption text-ink-muted">
              {(Object.keys(SOURCES) as (keyof typeof SOURCES)[]).map((kind) => (
                <span key={kind} className="flex items-center gap-2">
                  <SourceDot kind={kind} />
                  {SOURCES[kind].label}
                </span>
              ))}
            </div>
          </SheetHeader>
          <SheetBody className="px-3">
            {warnings.warning && (
              <p
                role="status"
                className={`mb-3 rounded-md p-2 text-label ${LEVEL_CLASS.soon.tint} ${LEVEL_CLASS.soon.text}`}
              >
                {warningText} — nên kiểm lại trên internet và tự sửa.
              </p>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_3.25rem_3.5rem_2.75rem] items-center gap-1 text-caption text-ink-muted">
              <span>Ngân hàng</span>
              <span className="text-right">Gửi 12T</span>
              <span className="text-right">Vay ƯĐ</span>
              <span className="text-right">Thả nổi</span>
            </div>
            {summary.deposit === null && summary.promo === null && summary.floating === null && (
              <p className="text-hint">Chưa có số</p>
            )}
            {rows.map((bank, index) => {
              const override = bank.override;
              const freshness = rateFreshness(bank, now);
              const fetched = vietnamDay(bank.source?.fetched_at);
              const stale = fetched && today && fetched < today;
              return (
                <div key={bank.code}>
                  {(index === 0 || (BANKS[index - 1]?.big4 && !bank.big4)) && (
                    <h3 className="mb-2 text-section-head">{bank.big4 ? 'Big 4' : 'Ngân hàng TMCP khác'}</h3>
                  )}
                  <section aria-label={bank.name} className="border-b border-line pb-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_3.25rem_3.25rem_3.5rem_2.75rem] items-center gap-1">
                      <div className="min-w-0 break-words">
                        <h4 className="text-label font-semibold">{bank.name}</h4>
                        <div className="text-caption text-ink-muted">
                          <div className="flex items-center gap-1">
                            {(override || bank.source) && (
                              <SourceDot
                                kind={override ? 'manual' : bank.source?.source_kind === 'bank' ? 'bank' : 'news'}
                              />
                            )}
                            {override ? (
                              <span>Anh sửa</span>
                            ) : bank.promo_months ? (
                              <span>{bank.promo_months.toLocaleString('vi-VN')} tháng đầu</span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-1">
                            {bank.detailDay && (
                              <span>
                                {formatRateDay(bank.detailDay, false)}
                                {override?.note || (!override && bank.url) ? ' ·' : ''}
                              </span>
                            )}
                            {override
                              ? override.note
                              : bank.url && (
                                  <a
                                    className="inline-flex min-h-11 items-center text-ion underline"
                                    href={bank.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Nguồn
                                  </a>
                                )}
                          </div>
                          {stale && <p className="text-hint">Chưa lấy được hôm nay</p>}
                        </div>
                      </div>
                      <span
                        className={`text-right text-numeric ${freshness.cells[0]?.stale ? LEVEL_CLASS.soon.text : ''}`}
                      >
                        <span className="sr-only">Gửi 12T </span>
                        {formatRate(bank.deposit_rate)}
                      </span>
                      <span
                        className={`text-right text-numeric ${freshness.cells[1]?.stale ? LEVEL_CLASS.soon.text : ''}`}
                      >
                        <span className="sr-only">Vay ƯĐ </span>
                        {formatRate(bank.promo_rate)}
                      </span>
                      <span
                        className={`text-right text-numeric ${freshness.cells[2]?.stale ? LEVEL_CLASS.soon.text : ''}`}
                      >
                        <span className="sr-only">Thả nổi </span>
                        {bank.floating_rate === null ? '—' : `≈${formatRate(bank.floating_rate)}`}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Tự sửa ${bank.name}`}
                        onClick={() => {
                          setEditing(bank.code);
                          setError('');
                        }}
                        disabled={busy}
                      >
                        <Icon name="note" />
                      </Button>
                    </div>
                    {freshness.staleCells.map((cell) => (
                      <p key={cell.key} className={`text-caption ${LEVEL_CLASS.soon.text}`}>
                        {cell.label}: {cell.day && formatRateDay(cell.day, false)} · {cell.age} ngày trước
                      </p>
                    ))}
                    {warnings.hasRates && freshness.missing.length > 0 && (
                      <p className={`text-caption ${LEVEL_CLASS.soon.text}`}>
                        Còn thiếu: {freshness.missing.join(' · ')}
                      </p>
                    )}
                    {editing === bank.code && (
                      <OverrideForm
                        key={bank.code}
                        code={bank.code}
                        value={override}
                        busy={busy}
                        error={error}
                        onCancel={() => setEditing(null)}
                        onRemove={() => void save(bank.code, null)}
                        onSave={(draft) => {
                          const value = parseOverride(draft, now);
                          if (typeof value === 'string') setError(value);
                          else void save(bank.code, value);
                        }}
                      />
                    )}
                  </section>
                </div>
              );
            })}
            <p className="text-hint">
              Thả nổi ≈ lãi tham chiếu + biên độ; biên độ tuỳ hợp đồng. Số gần đúng, kiểm lại trước khi tư vấn.
            </p>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
