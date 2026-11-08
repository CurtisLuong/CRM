// biome-ignore-all lint/suspicious/noArrayIndexKey: Loan table columns and rate-tier positions have fixed semantic order; only the last tier can be removed.

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { toast as notify } from 'sonner';
import { type Column, EmptyState, DataTable as KitDataTable, TextField } from '@/components/crm';
import { FormGrid, FormSection, FormSubsection, LONG_FIELD, SHORT_FIELD } from '@/components/crm/form-section';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import type { Data } from '@/data/repositories/customers';
import type { RepositoryAccount } from '@/data/repositories/session';
import { type Customer, isQualified } from '@/domain/customer';
import { BANK_PRESETS, type BankPreset, type ComputeResult, calcPrice, compute, type Numeric } from '@/domain/loan';
import {
  applyCatalog,
  buildInput,
  customerUnit,
  initialState,
  type LoanPrefill,
  type LoanState,
  type LoanUnit,
  LTV_AUTO,
  LTV_MAX,
  ltvOf,
  money,
  presetParams,
  quoteSummary,
  restoreLoanState,
  validateState,
} from './model';
import { printLoan } from './print';
import { createLoanStore, type LoanQuote } from './store';

const WIDE = LONG_FIELD;
const FIELD =
  'h-11 w-full min-w-0 rounded-sm border border-input bg-surface-100 px-3 py-2 text-body text-ink focus:outline-2 focus:outline-ion';
function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: The children always include the input or select, nested inside this label.
    <label className={`flex min-w-0 flex-col gap-1.5 text-label text-ink ${className || SHORT_FIELD}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 'any',
  suffix,
  scale = 1,
  auto,
  hint,
  className = '',
}: {
  label: string;
  value: Numeric | null | undefined;
  onChange: (n: number | null) => void;
  min?: number;
  max?: number;
  step?: string;
  suffix?: string;
  /** Hiện/nhập theo đơn vị lớn hơn (1e6 = triệu), lưu vẫn theo đồng (Curtis 06/11: bớt số 0). */
  scale?: number;
  /** Số tự tính hiện khi chưa nhập tay; xoá trống rồi rời ô thì về lại số này (Curtis 06/11). */
  auto?: number;
  hint?: string;
  className?: string;
}) {
  // Ô tự điền: giữ chữ đang gõ (kể cả rỗng) tới khi rời ô, không bật lại số tự tính dưới tay.
  const [draft, setDraft] = useState<string | null>(null);
  const current = value == null || value === '' ? auto : Number(value);
  const shown =
    auto !== undefined && draft !== null
      ? draft
      : current == null
        ? ''
        : auto !== undefined
          ? Math.round((current / scale) * 1000) / 1000
          : current / scale;
  return (
    <TextField
      className={className || SHORT_FIELD}
      label={label}
      hint={hint}
      type="number"
      inputMode="decimal"
      numeric
      suffix={suffix}
      min={min}
      max={max}
      step={step}
      value={shown}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        if (auto !== undefined) setDraft(e.target.value);
        onChange(e.target.value === '' ? null : Math.round(Number(e.target.value) * scale * 1e6) / 1e6);
      }}
    />
  );
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <FormSection title={title}>
      <div className={`${LONG_FIELD} space-y-3`}>{children}</div>
    </FormSection>
  );
}
function ErrorState({ title, detail, onRetry }: { title: string; detail: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-alert/40 bg-alert-tint p-4 text-alert-text">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-caption">{detail}</p>
      {onRetry && (
        <Button className="mt-3" onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}
function DataTable({ label, head, rows }: { label: string; head: string[]; rows: (string | number)[][] }) {
  type TableRow = { id: number } & Record<string, string | number>;
  const data: TableRow[] = rows.map((row, index) => ({
    id: index,
    ...Object.fromEntries(row.map((v, i) => [`c${i}`, v])),
  }));
  const columns: Column<TableRow>[] = head.map((title, i) => ({
    key: `c${i}`,
    label: title,
    numeric: i > 0,
    render: (row) => row[`c${i}`] as string | number,
  }));
  return (
    <div className="max-w-full overflow-x-auto" data-slot="loan-table-scroll">
      <KitDataTable caption={label} columns={columns} rows={data} className="min-w-[640px]" />
    </div>
  );
}

export function LoanCalculator({ prefill = {} }: { prefill?: LoanPrefill }) {
  const account = useRepositoryAccount();
  const customers = useCustomers();
  const [selected, setSelected] = useState(prefill.customerId ?? '');
  const customer = customers.find((c) => c.id === selected);
  const owner = account?.sync.local.userId ?? '';
  const choices = customers.filter(
    (c) => c.owner_id === owner && isQualified(c) && !['Đã mua', 'Loại'].includes(c.care_stage ?? ''),
  );
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <h1 className="text-title">Tính khoản vay</h1>
      <p className="text-caption text-ink-muted">
        Số liệu tạm tính để tham khảo. Lãi suất và phí là giả định; xác nhận với ngân hàng trước khi tư vấn.
      </p>
      <FormSection title="Khách hàng (không bắt buộc)">
        <Field className={LONG_FIELD} label="Khách hàng (không bắt buộc)">
          <select className={FIELD} value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Bảng tính độc lập</option>
            {customer && !choices.some((c) => c.id === customer.id) && (
              <option value={customer.id}>{customer.full_name}</option>
            )}
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name} · {c.phone}
              </option>
            ))}
          </select>
        </Field>
      </FormSection>
      {selected && !customer && (
        <p role="status" className="text-caption text-ink-muted">
          Đang tìm khách trong dữ liệu tài khoản. Chưa thể lưu phương án cho khách này.
        </p>
      )}
      <CalculatorForm
        key={`${owner}:${selected}:${customer?.id ?? ''}`}
        account={account}
        customer={customer}
        selectedId={selected}
        prefill={{ ...customerUnitSafe(customer), ...prefill }}
      />
    </main>
  );
}
/** Áp Giỏ hàng nhưng diện tích + giá net mang từ hồ sơ khách (anh nhập tay) thắng số Giỏ hàng (Curtis 06/11). */
function applyCatalogKeeping(
  s: LoanState,
  catalog: RepositoryAccount['catalog'],
  keep: Pick<LoanPrefill, 'area' | 'netOverride'>,
): LoanState {
  const applied = applyCatalog(s, catalog);
  return {
    ...applied,
    unit: {
      ...applied.unit,
      ...(keep.area ? { area: keep.area } : {}),
      ...(keep.netOverride ? { netOverride: keep.netOverride } : {}),
    },
  };
}
function customerUnitSafe(c?: Customer) {
  return c ? customerUnit(c) : {};
}
function CalculatorForm({
  account,
  customer,
  selectedId,
  prefill,
}: {
  account: RepositoryAccount | null;
  customer?: Customer;
  selectedId: string;
  prefill: LoanPrefill;
}) {
  const store = useMemo(() => (account ? createLoanStore(account) : null), [account]);
  // Số mang từ hồ sơ khách giữ qua mỗi lần áp Giỏ hàng (ref: không làm effect tải Giỏ hàng chạy lại).
  const keep = useRef({ area: prefill.area, netOverride: prefill.netOverride });
  const [state, setState] = useState<LoanState>(() => {
    const s = initialState(prefill);
    const saved = store?.readSettings();
    if (saved?.loan && Array.isArray(saved.loan.rateTiers) && Array.isArray(saved.loan.prepayFees))
      s.loan = {
        ...s.loan,
        ...saved.loan,
        loanOverride: null,
        ltv: Math.min(Number(saved.loan.ltv) || LTV_AUTO, LTV_MAX),
      };
    return account ? applyCatalogKeeping(s, account.catalog, keep.current) : s;
  });
  const touched = useRef(false);
  const [consultant, setConsultant] = useState(() => store?.readSettings()?.consultant ?? { name: '', phone: '' });
  const [presets, setPresets] = useState<BankPreset[]>(structuredClone(BANK_PRESETS));
  const [quotes, setQuotes] = useState<LoanQuote[]>(() => store?.cachedQuotes(selectedId || null) ?? []);
  const [quoteError, setQuoteError] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [monthly, setMonthly] = useState(false);
  const catalog = account?.catalog;
  const project = catalog?.projectByName(state.unit.projectName);
  const building = project ? catalog?.buildingByCode(project.id, state.unit.building) : null;
  useEffect(() => {
    if (!account || !store) return;
    let alive = true;
    void account.catalog
      .load()
      .then(() => {
        if (alive && !account.sync.local.isClosed) {
          setCatalogVersion((v) => v + 1);
          if (!touched.current) setState((s) => applyCatalogKeeping(s, account.catalog, keep.current));
        }
      })
      .catch(() => {});
    void store
      .listQuotes(selectedId || null)
      .then((rows) => {
        if (alive) setQuotes(rows);
      })
      .catch((e) => {
        if (alive) setQuoteError(e instanceof Error ? e.message : 'Không tải được phương án đã lưu.');
      });
    void store
      .loadBankPresets()
      .then((remote) => {
        if (alive && remote.length)
          setPresets(
            BANK_PRESETS.map((p) => ({ ...p, ...remote.find((r) => r.key === p.key), name: p.name, key: p.key })),
          );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [account, store, selectedId]);
  // Catalog refresh only changes choices and policy. Never overwrite fields the sale is editing.
  void catalogVersion;
  const unit = (patch: Partial<LoanUnit>) => {
    touched.current = true;
    setState((s) => ({ ...s, unit: { ...s.unit, ...patch } }));
  };
  const loan = (patch: Partial<LoanState['loan']>) => {
    touched.current = true;
    setState((s) => ({ ...s, loan: { ...s.loan, ...patch } }));
  };
  const dates = (patch: Partial<LoanState['dates']>) => {
    touched.current = true;
    setState((s) => ({ ...s, dates: { ...s.dates, ...patch } }));
  };
  // Giá thuần / số tiền vay tự điền theo công thức; nhập tay thì ghi đè, xoá trống thì về tự tính.
  const priceInput = buildInput(state, project).unit ?? {};
  const autoNet = calcPrice({ ...priceInput, netPriceOverride: null }).net;
  const gross = calcPrice(priceInput).gross;
  const maxLoan = Math.round((gross * LTV_MAX) / 100);
  const manualLoan = state.loan.loanOverride ? Math.min(Number(state.loan.loanOverride), maxLoan) : null;
  const shownLtv = manualLoan != null ? ltvOf(manualLoan, gross) : Math.min(Number(state.loan.ltv) || 0, LTV_MAX);
  const validation = validateState(state);
  let result: ComputeResult | null = null,
    computeError = validation;
  if (!validation)
    try {
      result = compute(buildInput(state, project));
    } catch (e) {
      computeError = e instanceof Error ? e.message : 'Không tính được khoản vay.';
    }
  const writable =
    !!account &&
    (!selectedId || (!!customer && customer.owner_id === account.sync.local.userId && !customer.archived_at));
  const applyProject = (name: string) => {
    touched.current = true;
    const p = catalog?.projectByName(name);
    setState((s) => ({
      ...s,
      unit: {
        ...s.unit,
        projectName: name,
        building: '',
        code: '',
        pricePerM2: Number(p?.typical_price_per_m2) || s.unit.pricePerM2,
        netOverride: null,
        fee: p ? (catalog?.projectFee(p) ?? null) : s.unit.fee,
      },
      dates: {
        ...s.dates,
        handoverDate: p?.handover_date || s.dates.handoverDate,
        titleAfterMonths: p?.title_after_months == null ? 1.5 : Number(p.title_after_months),
      },
    }));
  };
  const applyBuilding = (code: string) => {
    const b = project ? catalog?.buildingByCode(project.id, code) : null;
    unit({
      building: code,
      code: '',
      pricePerM2: Number(b?.approved_price_per_m2) || Number(project?.typical_price_per_m2) || state.unit.pricePerM2,
      netOverride: null,
      fee: b ? (catalog?.buildingFee(b) ?? null) : project ? (catalog?.projectFee(project) ?? null) : state.unit.fee,
    });
    if (b?.handover_date) dates({ handoverDate: b.handover_date });
  };
  const applyUnit = (code: string) => {
    const u = building ? catalog?.unitByCode(building.id, code) : null;
    unit({
      code,
      ...(u
        ? {
            area: Number(u.area_m2) || state.unit.area,
            aptType: String(u.apt_type || '') || state.unit.aptType,
            pricePerM2:
              Number(u.price_per_m2_override) || Number(building?.approved_price_per_m2) || state.unit.pricePerM2,
            netOverride: u.net_price_override ? Number(u.net_price_override) : null,
            fee: catalog?.unitFee(u) ?? null,
          }
        : {}),
    });
  };
  const save = async () => {
    if (!store || !result || busy) return;
    setBusy(true);
    setError('');
    try {
      await store.saveQuote({
        customerId: selectedId,
        projectId: project?.id ?? null,
        unitCode: state.unit.code,
        inputs: state,
        summary: quoteSummary(result),
      });
      if (account?.sync.local.isClosed) return;
      setQuotes(await store.listQuotes(selectedId || null));
      notify.success('Đã lưu phương án lên máy chủ');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được phương án.');
    } finally {
      setBusy(false);
    }
  };
  const remember = () => {
    store?.saveLocalSettings({ loan: state.loan, consultant });
    notify.success('Đã nhớ thông số trên máy cho tài khoản này');
  };
  return (
    <div className="flex flex-col gap-6">
      {/* Curtis 06/11: tư vấn viên trên phiếu đưa lên đầu form. */}
      <Group title="Tư vấn viên trên phiếu">
        <FormGrid>
          <Field label="Tên tư vấn viên">
            <input
              className={FIELD}
              aria-label="Tên tư vấn viên"
              value={consultant.name}
              onChange={(e) => setConsultant((c) => ({ ...c, name: e.target.value }))}
            />
          </Field>
          <Field label="Điện thoại">
            <input
              className={FIELD}
              aria-label="Số điện thoại tư vấn viên"
              value={consultant.phone}
              onChange={(e) => setConsultant((c) => ({ ...c, phone: e.target.value }))}
            />
          </Field>
        </FormGrid>
      </Group>
      <Group title="Căn hộ và tiến độ">
        {/* Ô ngắn 2 ô/hàng (4 ở desktop), ô dài chiếm cả hàng — Curtis 06/11: trang tính vay dài quá. */}
        <FormGrid>
          <Field label="Dự án" className={WIDE}>
            <input
              aria-label="Dự án"
              className={FIELD}
              list="loan-projects"
              value={state.unit.projectName}
              onChange={(e) => applyProject(e.target.value)}
            />
            <datalist id="loan-projects">
              {catalog?.projects().map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Toà">
            <input
              aria-label="Toà"
              className={FIELD}
              list="loan-buildings"
              value={state.unit.building}
              onChange={(e) => applyBuilding(e.target.value)}
            />
            <datalist id="loan-buildings">
              {project && catalog?.buildingsOf(project.id).map((b) => <option key={b.id} value={b.code} />)}
            </datalist>
          </Field>
          <Field label="Mã căn">
            <input
              aria-label="Mã căn"
              className={FIELD}
              list="loan-units"
              value={state.unit.code}
              onChange={(e) => applyUnit(e.target.value)}
            />
            <datalist id="loan-units">
              {building && catalog?.unitsOf(building.id).map((u: Data) => <option key={u.id} value={u.code} />)}
            </datalist>
          </Field>
          <Field label="Loại căn">
            <input
              aria-label="Loại căn"
              className={FIELD}
              value={state.unit.aptType}
              onChange={(e) => unit({ aptType: e.target.value })}
            />
          </Field>
          <NumberInput label="Diện tích" suffix="m²" value={state.unit.area} onChange={(n) => unit({ area: n ?? 0 })} />
          <NumberInput
            label="Đơn giá"
            suffix="tr/m²"
            scale={1_000_000}
            value={state.unit.pricePerM2}
            onChange={(n) => unit({ pricePerM2: n ?? 0 })}
          />
          <NumberInput
            label="Phí"
            suffix="tr/căn"
            scale={1_000_000}
            value={state.unit.fee ?? null}
            onChange={(n) => unit({ fee: n })}
          />
          <NumberInput
            label="Giá thuần"
            suffix="tr"
            scale={1_000_000}
            value={state.unit.netOverride}
            auto={autoNet}
            hint={state.unit.netOverride ? 'Đã nhập tay · xoá trống để tự tính lại' : 'Tự tính = diện tích × đơn giá'}
            onChange={(n) => unit({ netOverride: n })}
          />
        </FormGrid>
        <FormSubsection
          title="Tiến độ"
          className="[&_label>span:first-child]:min-h-10 sm:[&_label>span:first-child]:min-h-5"
        >
          <Field label="Ngày ký hợp đồng">
            <input
              type="date"
              aria-label="Ngày ký hợp đồng"
              className={FIELD}
              value={state.dates.contractDate}
              onChange={(e) => dates({ contractDate: e.target.value })}
            />
          </Field>
          <Field label="Ngày bàn giao">
            <input
              type="date"
              aria-label="Ngày bàn giao"
              className={FIELD}
              value={state.dates.handoverDate}
              onChange={(e) => dates({ handoverDate: e.target.value })}
            />
          </Field>
          <NumberInput
            label="Nhận sổ sau bàn giao"
            suffix="tháng"
            value={state.dates.titleAfterMonths}
            onChange={(n) => dates({ titleAfterMonths: n ?? 0 })}
          />
        </FormSubsection>
        <p className="text-caption text-ink-muted">
          VAT {project?.vat_rate ?? 5}% · KPBT {project?.kpbt_rate ?? 2}%.{' '}
          {project
            ? 'Chính sách theo dự án trong giỏ hàng.'
            : 'Chưa chọn dự án trong giỏ hàng: đang dùng tiến độ mẫu 7 đợt.'}
        </p>
        {project && (
          <Button
            disabled={!writable || busy}
            onClick={async () => {
              try {
                if (!account) return;
                await account.catalog.updateProject(project.id, {
                  handover_date: state.dates.handoverDate,
                  title_after_months: state.dates.titleAfterMonths,
                });
                notify.success('Đã cập nhật ngày bàn giao và nhận sổ của dự án');
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Cập nhật ngày bàn giao vào dự án
          </Button>
        )}
      </Group>
      <Group title="Thông số vay">
        <FormGrid>
          <Field label="Gói vay" className={WIDE}>
            <select
              aria-label="Gói vay"
              className={FIELD}
              value={state.loan.presetKey}
              onChange={(e) => {
                const p = presets.find((p) => p.key === e.target.value);
                loan({
                  ...presetParams(e.target.value),
                  ...(p
                    ? {
                        ltv: p.ltv,
                        termYears: p.termYears,
                        rateTiers: p.rateTiers,
                        floatingRate: p.floatingRate,
                        prepayFees: p.prepayFees,
                      }
                    : {}),
                });
              }}
            >
              {presets.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <NumberInput
            label="Tỷ lệ vay"
            suffix="%"
            value={shownLtv}
            auto={LTV_AUTO}
            max={LTV_MAX}
            hint={`Tối đa ${LTV_MAX}%`}
            onChange={(n) =>
              loan({ ltv: n == null ? LTV_AUTO : Math.min(Math.max(n, 0), LTV_MAX), loanOverride: null })
            }
          />
          <NumberInput
            label="Thời hạn vay"
            suffix="năm"
            value={state.loan.termYears}
            min={1}
            max={50}
            step="1"
            onChange={(n) => loan({ termYears: n ?? 0 })}
          />
          <NumberInput
            label="Số tiền vay"
            suffix="tr"
            scale={1_000_000}
            value={manualLoan}
            auto={Math.round((gross * shownLtv) / 100)}
            hint={
              manualLoan != null
                ? `Đã nhập tay · tối đa ${LTV_MAX}% = ${money(maxLoan)}đ · xoá trống về ${LTV_AUTO}%`
                : `Theo tỷ lệ vay · tối đa ${LTV_MAX}% = ${money(maxLoan)}đ`
            }
            onChange={(n) => {
              if (n == null) return loan({ loanOverride: null, ltv: LTV_AUTO });
              const amount = Math.min(Math.max(Math.round(n), 0), maxLoan);
              loan({ loanOverride: amount, ltv: ltvOf(amount, gross) });
            }}
          />
          <NumberInput
            label="Lãi thả nổi giả định"
            suffix="%/năm"
            value={state.loan.floatingRate}
            max={100}
            onChange={(n) => loan({ floatingRate: n ?? 0 })}
          />
          <NumberInput
            label="Tất toán sau"
            suffix="tháng"
            value={state.loan.payoffMonth}
            min={1}
            max={Number(state.loan.termYears) * 12}
            step="1"
            onChange={(n) => loan({ payoffMonth: n ?? 0 })}
          />
          <Field label="Tính lãi" className={WIDE}>
            <select
              aria-label="Tính lãi"
              className={FIELD}
              value={state.loan.dayCount}
              onChange={(e) => loan({ dayCount: e.target.value === 'monthly' ? 'monthly' : 'actual365' })}
            >
              <option value="actual365">Ngày thực tế / 365</option>
              <option value="monthly">Lãi năm / 12</option>
            </select>
          </Field>
          <Field label="Bắt đầu giải ngân từ đợt" className={WIDE}>
            <select
              className={FIELD}
              value={state.loan.firstBankMilestone ?? 1}
              onChange={(e) => loan({ firstBankMilestone: Number(e.target.value) })}
            >
              {(buildInput(state, project).schedule ?? []).map((m, i) => (
                <option key={m.label} value={i}>
                  Đợt {i + 1} · {m.label}
                </option>
              ))}
            </select>
          </Field>
        </FormGrid>
        <p className="text-caption text-ink-muted">Tỷ lệ vay tính trên giá thuần + VAT (không gồm phí và KPBT).</p>
        <FormSubsection title="Bậc lãi suất ưu đãi">
          {state.loan.rateTiers.map((tier, i) => (
            <FormGrid className={LONG_FIELD} key={`tier-${i}`}>
              <NumberInput
                label={`Bậc ${i + 1}: số tháng`}
                suffix="tháng"
                value={tier.months}
                min={1}
                step="1"
                onChange={(n) =>
                  loan({ rateTiers: state.loan.rateTiers.map((t, j) => (j === i ? { ...t, months: n ?? 0 } : t)) })
                }
              />
              <NumberInput
                label={`Bậc ${i + 1}: lãi suất`}
                suffix="%/năm"
                value={tier.rate}
                max={100}
                onChange={(n) =>
                  loan({ rateTiers: state.loan.rateTiers.map((t, j) => (j === i ? { ...t, rate: n ?? 0 } : t)) })
                }
              />
            </FormGrid>
          ))}
          <div className={`${LONG_FIELD} flex gap-2`}>
            <Button onClick={() => loan({ rateTiers: [...state.loan.rateTiers, { months: 12, rate: 6.5 }] })}>
              Thêm bậc lãi
            </Button>
            {state.loan.rateTiers.length > 1 && (
              <Button onClick={() => loan({ rateTiers: state.loan.rateTiers.slice(0, -1) })}>Bỏ bậc cuối</Button>
            )}
          </div>
        </FormSubsection>
        <label className="flex min-h-11 items-center gap-2 text-caption">
          <input
            type="checkbox"
            checked={state.loan.graceEnabled}
            onChange={(e) => loan({ graceEnabled: e.target.checked })}
          />
          Ân hạn gốc
        </label>
        {state.loan.graceEnabled && (
          <FormGrid>
            <NumberInput
              label="Ân hạn gốc"
              suffix="tháng"
              value={state.loan.graceMonths}
              onChange={(n) => loan({ graceMonths: n ?? 0 })}
            />
            <Field label="Tính ân hạn từ giải ngân">
              <select
                aria-label="Tính ân hạn từ giải ngân"
                className={FIELD}
                value={state.loan.principalStart}
                onChange={(e) => loan({ principalStart: e.target.value === 'last' ? 'last' : 'first' })}
              >
                <option value="first">Lần đầu</option>
                <option value="last">Lần cuối</option>
              </select>
            </Field>
          </FormGrid>
        )}
        <Field label="Phí tất toán theo năm vay (%; phân cách dấu phẩy)">
          <input
            aria-label="Phí tất toán theo năm vay"
            className={FIELD}
            value={state.loan.prepayFees.join(',')}
            onChange={(e) => loan({ prepayFees: e.target.value.split(',').map((n) => Number(n.trim())) })}
          />
        </Field>
      </Group>
      {computeError ? (
        <ErrorState title="Chưa đủ thông tin để tính" detail={computeError} />
      ) : (
        result && (
          <>
            <LoanResults result={result} monthly={monthly} onMonthly={setMonthly} />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={!result.schedule}
                onClick={() => {
                  try {
                    if (result)
                      printLoan(result, {
                        projectName: state.unit.projectName,
                        building: state.unit.building,
                        unitCode: state.unit.code,
                        aptType: state.unit.aptType,
                        customer: customer ? { name: customer.full_name } : null,
                        consultant,
                      });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                In / Lưu PDF A4
              </Button>
              <Button disabled={!writable || !store || !result.schedule || busy} onClick={save}>
                {busy ? 'Đang lưu…' : 'Lưu phương án'}
              </Button>
              {store && <Button onClick={remember}>Nhớ thông số trên máy</Button>}
            </div>
          </>
        )
      )}
      {!account && (
        <p className="text-caption text-ink-muted">
          Bảng tính và PDF dùng được ngoại tuyến. Đăng nhập trong Thao tác nhanh để lưu/đọc phương án.
        </p>
      )}
      {error && (
        <p role="alert" className="text-caption text-alert-text">
          {error}
        </p>
      )}
      <Group title="Phương án đã lưu">
        {quoteError && (
          <ErrorState
            title="Chưa tải được phương án"
            detail={quoteError}
            onRetry={() => {
              if (store)
                void store
                  .listQuotes(selectedId || null)
                  .then((q) => {
                    setQuotes(q);
                    setQuoteError('');
                  })
                  .catch((e) => setQuoteError(String(e)));
            }}
          />
        )}
        {quotes.length === 0 ? (
          <EmptyState title="Chưa có phương án đã lưu" text="Tính và lưu một phương án để mở lại sau." />
        ) : (
          <ul className="divide-y divide-border">
            {quotes.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 py-3">
                <span className="text-caption">
                  {q.unit_code || 'Chưa có mã căn'} · {new Date(q.created_at).toLocaleString('vi-VN')}
                </span>
                <Button
                  onClick={() => {
                    try {
                      touched.current = true;
                      setState(restoreLoanState(q.inputs));
                      setError('');
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  Mở
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Group>
    </div>
  );
}

function LoanResults({
  result: r,
  monthly,
  onMonthly,
}: {
  result: ComputeResult;
  monthly: boolean;
  onMonthly: (monthly: boolean) => void;
}) {
  const s = r.schedule;
  return (
    <Group title="Kết quả tạm tính">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Giá dự kiến', r.price.full],
          ['Khoản vay', r.loan.amount],
          ['Khách tự trả', r.loan.customerTotal],
          ['Trả cao nhất / tháng', r.maxPayment],
        ].map(([label, n]) => (
          <div key={label}>
            <dt className="text-caption text-ink-muted">{label}</dt>
            <dd className="break-words font-data text-body-strong">{money(Number(n))} đ</dd>
          </div>
        ))}
      </dl>
      {r.warnings.map((w, i) => (
        <p key={`${w}-${i}`} className="text-caption text-soon-text">
          {w}
        </p>
      ))}
      <DataTable
        label="Phiếu giá"
        head={['Hạng mục', 'Số tiền (đ)']}
        rows={[
          [`Giá thuần`, money(r.price.net)],
          [`VAT ${r.price.vatRate}%`, money(r.price.vat)],
          [`Giá gồm VAT`, money(r.price.gross)],
          [`KPBT ${r.price.kpbtRate}%`, money(r.price.kpbt)],
          // Phí: khách tự trả ở đợt 1, ngân hàng không cho vay (LF-01).
          ...(r.price.fee ? [[`Phí (đóng đợt 1)`, money(r.price.fee)]] : []),
          [`Giá dự kiến`, money(r.price.full)],
        ]}
      />
      <DataTable
        label="Tiến độ thanh toán"
        head={['Đợt', 'Ngày', 'Tỷ lệ', 'Số tiền (đ)', 'Khách trả (đ)', 'NH giải ngân (đ)']}
        rows={r.milestones.map((m, i) => [
          `${i + 1}. ${m.label}`,
          m.date,
          `${m.pct}%`,
          money(m.amount),
          money(m.customer),
          money(m.bank),
        ])}
      />
      {s && (
        <>
          <p className="text-caption">
            Tổng lãi: {money(s.totalInterest)} đ · Tổng trả ngân hàng: {money(s.totalPaid)} đ
          </p>
          <DataTable
            label="Giai đoạn trả nợ"
            head={['Giai đoạn', 'Tháng', 'Lãi suất', 'Trả đầu kỳ (đ)', 'Trả cuối kỳ (đ)']}
            rows={s.phases.map((p) => [
              p.type === 'interestOnly' ? 'Chỉ trả lãi' : 'Gốc + lãi',
              `${p.fromMonth}–${p.toMonth}`,
              `${p.rate}%`,
              money(p.firstPayment),
              money(p.lastPayment),
            ])}
          />
          {/* Curtis 06/11: lịch trả theo năm / theo tháng là 2 tab — mở tab này thì tab kia thu gọn. */}
          <Tabs value={monthly ? 'month' : 'year'} onValueChange={(v) => onMonthly(v === 'month')}>
            <TabsList aria-label="Lịch trả nợ">
              <TabsTrigger value="year">Theo năm</TabsTrigger>
              <TabsTrigger value="month">Theo tháng</TabsTrigger>
            </TabsList>
            <TabsContent value="year" className="mt-3">
              <DataTable
                label="Trả nợ theo năm"
                head={['Năm', 'TB/tháng (đ)', 'Gốc (đ)', 'Lãi (đ)', 'Tổng trả (đ)', 'Dư nợ (đ)']}
                rows={s.years.map((y) => [
                  y.year,
                  money(y.avgPayment),
                  money(y.principal),
                  money(y.interest),
                  money(y.payment),
                  money(y.balance),
                ])}
              />
            </TabsContent>
            <TabsContent value="month" className="mt-3">
              <DataTable
                label="Trả nợ từng tháng"
                head={['Tháng', 'Ngày', 'Lãi suất', 'Gốc (đ)', 'Lãi (đ)', 'Tổng trả (đ)', 'Dư nợ (đ)']}
                rows={s.rows.map((m) => [
                  m.k,
                  m.date,
                  `${m.rate}%`,
                  money(m.principal),
                  money(m.interest),
                  money(m.payment),
                  money(m.balance),
                ])}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
      {r.payoff && (
        <>
          <h3 className="text-body-strong">Tất toán sau {r.payoff.month} tháng</h3>
          <p className="text-caption">
            Dư nợ {money(r.payoff.balance)} đ · Phí {r.payoff.feePct}%: {money(r.payoff.fee)} đ · Cần chuẩn bị{' '}
            {money(r.payoff.totalToPay)} đ · Lãi tránh được sau phí {money(r.payoff.netSaving)} đ
          </p>
          {r.payoff.warning && <p className="text-caption text-soon-text">{r.payoff.warning}</p>}
        </>
      )}
    </Group>
  );
}
