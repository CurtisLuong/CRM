import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { BANKS, type BankCode } from '@/config/banks';
import type { RepositoryAccount } from '@/data/repositories/session';
import { Icon } from '@/ui/Icon';
import {
  big4Average,
  fetchedLabel,
  formatRate,
  type OverrideDraft,
  parseOverride,
  type RateCache,
  type RateOverride,
  rateFor,
  readOverrides,
  readRateCache,
  readRates,
  sourceUrl,
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
    promo_rate: value?.promo_rate?.toString() ?? '',
    promo_months: value?.promo_months?.toString() ?? '',
    floating_rate: value?.floating_rate?.toString() ?? '',
    note: value?.note ?? '',
  });
  const fields = [
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
  const average = big4Average(cache.rates, cache.overrides);
  const noRates = average.promo === null && average.floating === null;
  const newest = cache.rates
    .map((row) => row.fetched_at)
    .filter((at): at is string => !!at && Number.isFinite(Date.parse(at)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  return (
    <>
      <section aria-label="Lãi vay mua nhà" className="mt-2 rounded-md border border-line bg-surface-100 px-3 py-1">
        {compact ? (
          <>
            <Button
              variant="ghost"
              aria-label="Xem 10 ngân hàng ›"
              className="min-h-11 h-auto w-full justify-between gap-1 whitespace-normal px-0 text-left text-ink"
              onClick={() => setOpen(true)}
            >
              <span className="text-caption font-semibold">Lãi vay mua nhà · TB Big 4</span>
              <span className="shrink-0 text-caption">
                <span className="sr-only">Ưu đãi trung bình </span>
                <strong data-testid="big4-promo">{formatRate(average.promo)}</strong>
                {' · '}
                <span className="sr-only">Thả nổi trung bình </span>
                <strong data-testid="big4-floating">
                  {average.floating === null ? '—' : `≈ ${formatRate(average.floating)}`}
                </strong>
                {' ›'}
              </span>
            </Button>
            {noRates && <p className="text-hint">Chưa có số lãi suất</p>}
            {newest && <p className="text-caption text-ink-muted">{fetchedLabel(newest, now)}</p>}
          </>
        ) : (
          <>
            <h2 className="text-label font-semibold">Lãi vay mua nhà · TB Big 4</h2>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <p className="text-caption text-ink-muted">
                Ưu đãi trung bình{' '}
                <strong className="text-numeric text-ink" data-testid="big4-promo">
                  {formatRate(average.promo)}
                </strong>
              </p>
              <p className="text-caption text-ink-muted">
                Thả nổi trung bình{' '}
                <strong className="text-numeric text-ink" data-testid="big4-floating">
                  {average.floating === null ? '—' : `≈ ${formatRate(average.floating)}`}
                </strong>
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              <div>
                {noRates && <p className="text-hint">Chưa có số lãi suất</p>}
                {newest && <p className="text-caption text-ink-muted">{fetchedLabel(newest, now)}</p>}
              </div>
              <Button variant="ghost" className="min-h-11 px-0" onClick={() => setOpen(true)}>
                Xem 10 ngân hàng ›
              </Button>
            </div>
          </>
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
            <SheetTitle>Lãi vay mua nhà</SheetTitle>
            <SheetDescription>10 ngân hàng · %/năm</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-caption text-ink-muted">
              {(Object.keys(SOURCES) as (keyof typeof SOURCES)[]).map((kind) => (
                <span key={kind} className="flex items-center gap-2">
                  <SourceDot kind={kind} />
                  {SOURCES[kind].label}
                </span>
              ))}
            </div>
            {cache.rates.length === 0 && <p className="text-hint">Chưa có số</p>}
            {BANKS.map((bank, index) => {
              const row = cache.rates.find((rate) => rate.bank_code === bank.code);
              const override = cache.overrides[bank.code];
              const effective = rateFor(row, override);
              const url = sourceUrl(row?.source_url);
              return (
                <div key={bank.code}>
                  {(index === 0 || (BANKS[index - 1]?.big4 && !bank.big4)) && (
                    <h3 className="mb-2 text-section-head">{bank.big4 ? 'Big 4' : 'Ngân hàng TMCP khác'}</h3>
                  )}
                  <section aria-label={bank.name} className="border-b border-line pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-body font-semibold">{bank.name}</h4>
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
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-label">
                      <span>
                        Ưu đãi {formatRate(effective.promo_rate)}
                        {effective.promo_months ? ` · ${effective.promo_months.toLocaleString('vi-VN')} tháng đầu` : ''}
                      </span>
                      <span>
                        Thả nổi {effective.floating_rate === null ? '—' : `≈ ${formatRate(effective.floating_rate)}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-caption text-ink-muted">
                      {override && (
                        <>
                          <SourceDot kind="manual" />
                          <span>Anh tự sửa</span>
                        </>
                      )}
                      {row && <SourceDot kind={row.source_kind === 'bank' ? 'bank' : 'news'} />}
                      {url && (
                        <a
                          className="inline-flex min-h-11 items-center text-ion underline"
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Nguồn
                        </a>
                      )}
                    </div>
                    {fetchedLabel(row?.fetched_at, now, true) && (
                      <p className="text-hint">{fetchedLabel(row?.fetched_at, now, true)}</p>
                    )}
                    {effective.note && <p className="break-words text-hint">{effective.note}</p>}
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
