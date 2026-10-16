import { useRef, useState } from 'react';
import type { FeatureRoute } from '@/app/routes';
import { useCustomers, useRepositoryAccount } from '@/data/hooks';
import { normalizePhoneVN } from '@/domain/customer/phone';
import { Button, EmptyState } from '@/ui';
import {
  formatExportCell,
  guessColumn,
  type ImportColumn,
  IO_FIELDS,
  makeImportRecord,
  readImportTemplate,
  uniqueOwnedCustomers,
} from './model';

type CellRows = unknown[][];
const FIELD = 'min-h-11 rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-text';
const templateKey = (userId: string) => `crm_import_template:${userId}`;

function ImportExportPage() {
  const account = useRepositoryAccount();
  const allCustomers = useCustomers();
  const userId = account?.sync.local.userId || '';
  const owned = uniqueOwnedCustomers(allCustomers, userId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string[]>(IO_FIELDS.filter((field) => field.def).map((field) => field.key));
  const [rows, setRows] = useState<CellRows>([]);
  const [mapping, setMapping] = useState<ImportColumn[]>([]);
  const [headerRow, setHeaderRow] = useState(true);
  const [filename, setFilename] = useState('');
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('');

  const exportExcel = async () => {
    if (!selected.length) {
      setStatus('Chọn ít nhất một cột để xuất.');
      return;
    }
    setWorking(true);
    try {
      const XLSX = await import('xlsx');
      const keys = selected as (typeof IO_FIELDS)[number]['key'][];
      const values = [
        keys.map((key) => IO_FIELDS.find((field) => field.key === key)?.label || key),
        ...owned.map((customer) => keys.map((key) => formatExportCell(customer, key))),
      ];
      const sheet = XLSX.utils.aoa_to_sheet(values);
      sheet['!cols'] = keys.map((key) => ({ wch: key === 'full_name' || key === 'residence' ? 22 : 16 }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'Khách hàng');
      const date = new Date();
      const pad = (value: number) => String(value).padStart(2, '0');
      XLSX.writeFile(book, `khach-hang-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}.xlsx`);
      setStatus(`Đã xuất ${owned.length} khách do bạn phụ trách.`);
    } catch {
      setStatus('Không tạo được file Excel.');
    } finally {
      setWorking(false);
    }
  };

  const readFile = async (file?: File) => {
    if (!file) return;
    setWorking(true);
    setStatus('Đang đọc file…');
    try {
      const XLSX = await import('xlsx');
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const first = book.SheetNames[0];
      if (!first) throw new Error('File không có trang tính.');
      const worksheet = book.Sheets[first];
      if (!worksheet) throw new Error('Không đọc được trang tính.');
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' }) as CellRows;
      const compact = data.filter((row) => row.some((cell) => String(cell ?? '').trim()));
      if (!compact.length) throw new Error('File trống.');
      setRows(compact);
      setFilename(file.name);
      const saved = readImportTemplate(localStorage, templateKey(userId));
      const useSaved = saved && saved.mapping.length === Math.max(...compact.map((row) => row.length));
      setHeaderRow(useSaved ? saved.headerRow : true);
      const headers = compact[0] || [];
      setMapping(
        useSaved
          ? saved.mapping
          : Array.from({ length: Math.max(...compact.map((row) => row.length)) }, (_, i) => guessColumn(headers[i])),
      );
      setStatus('');
    } catch (error) {
      setRows([]);
      setStatus(error instanceof Error ? error.message : 'Không đọc được file Excel.');
    } finally {
      setWorking(false);
    }
  };

  const importCustomers = async () => {
    if (!account || !rows.length || working) return;
    if (!mapping.includes('phone') || !mapping.includes('full_name')) {
      setStatus('Cần ghép cột “Họ tên” và “Số điện thoại”.');
      return;
    }
    setWorking(true);
    setStatus('Đang nhập khách vào kho trên thiết bị…');
    let added = 0,
      duplicate = 0,
      incomplete = 0,
      failed = 0;
    const seen = new Set(owned.map((customer) => normalizePhoneVN(customer.phone)));
    const data = headerRow ? rows.slice(1) : rows;
    try {
      localStorage.setItem(templateKey(userId), JSON.stringify({ mapping, headerRow }));
      for (const row of data) {
        const { payload, notes } = makeImportRecord(row, mapping);
        if (!payload) {
          incomplete++;
          continue;
        }
        const phone = String(payload.phone);
        if (seen.has(phone)) {
          duplicate++;
          continue;
        }
        try {
          const customer = await account.customers.create(payload);
          if (!customer) {
            failed++;
            continue;
          }
          for (const note of notes) await account.customers.addNote(customer.id, note);
          seen.add(phone);
          added++;
        } catch {
          failed++;
        }
      }
      setStatus(
        `Xong: thêm ${added}, trùng bỏ qua ${duplicate}, thiếu tên/SĐT ${incomplete}${failed ? `, lỗi ${failed}` : ''}. Dữ liệu mới được lưu local và đồng bộ theo hàng đợi.`,
      );
      if (!failed) setRows([]);
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-5 p-4 pb-10">
      <header>
        <h1 className="text-title">Nhập / Xuất dữ liệu</h1>
        <p className="text-small text-text-2">
          Excel khách hàng dùng đúng danh sách cột v1. Bản xuất chỉ gồm khách bạn phụ trách.
        </p>
      </header>
      {!account && <EmptyState title="Chưa đăng nhập" hint="Đăng nhập để nhập hoặc xuất dữ liệu khách." />}
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-section">Xuất Excel</h2>
        <p className="mt-1 text-small text-text-2">{owned.length} khách do bạn phụ trách trên thiết bị.</p>
        <fieldset className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <legend className="mb-2 text-label">Chọn cột xuất</legend>
          {IO_FIELDS.map((field) => (
            <label key={field.key} className="flex min-h-11 items-center gap-2 text-small">
              <input
                type="checkbox"
                checked={selected.includes(field.key)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked ? [...current, field.key] : current.filter((key) => key !== field.key),
                  )
                }
              />
              {field.label}
            </label>
          ))}
        </fieldset>
        <Button
          className="mt-3"
          variant="primary"
          disabled={!account || working || owned.length === 0}
          loading={working}
          onClick={() => void exportExcel()}
        >
          Xuất {owned.length} khách
        </Button>
      </section>
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-section">Nhập Excel / CSV</h2>
        <p className="mt-1 text-small text-text-2">
          Nhập chỉ thêm khách mới; SĐT trùng được bỏ qua, không ghi đè hồ sơ hiện có. Có thể nhập offline.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="sr-only"
          onChange={(event) => void readFile(event.target.files?.[0])}
        />
        <Button className="mt-3" disabled={!account || working} onClick={() => fileRef.current?.click()}>
          Chọn file
        </Button>
        {filename && rows.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-small text-text-2">
              {filename} · {rows.length} dòng
            </p>
            <label className="flex min-h-11 items-center gap-2 text-small">
              <input type="checkbox" checked={headerRow} onChange={(event) => setHeaderRow(event.target.checked)} />{' '}
              Dòng đầu là tiêu đề cột
            </label>
            <div className="flex flex-col gap-2">
              <h3 className="text-label">Ghép cột</h3>
              {mapping.map((key, index) => (
                <label
                  className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,1fr)] items-center gap-2 text-small"
                  // biome-ignore lint/suspicious/noArrayIndexKey: Spreadsheet column position is its stable identity.
                  key={index}
                >
                  <span className="truncate">
                    {headerRow ? String(rows[0]?.[index] ?? `Cột ${index + 1}`) : `Cột ${index + 1}`}
                  </span>
                  <select
                    className={FIELD}
                    aria-label={`Ghép cột ${index + 1}`}
                    value={key}
                    onChange={(event) =>
                      setMapping((current) =>
                        current.map((value, i) => (i === index ? (event.target.value as ImportColumn) : value)),
                      )
                    }
                  >
                    <option value="">Bỏ qua</option>
                    {IO_FIELDS.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                    <option value="__note">Ghi chú</option>
                  </select>
                </label>
              ))}
            </div>
            <div className="overflow-x-auto rounded-control border border-border">
              <table className="min-w-full text-left text-small">
                <caption className="p-2 text-left text-text-2">Xem trước tối đa 3 dòng</caption>
                <thead>
                  <tr>
                    {mapping.map((key, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: Spreadsheet column position is its stable identity.
                      <th className="px-2 py-1" key={index}>
                        {key
                          ? key === '__note'
                            ? 'Ghi chú'
                            : IO_FIELDS.find((field) => field.key === key)?.label
                          : 'Bỏ qua'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(headerRow ? 1 : 0, (headerRow ? 1 : 0) + 3).map((row) => (
                    <tr key={JSON.stringify(row)}>
                      {mapping.map((_, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: Spreadsheet column position is its stable identity.
                        <td className="max-w-48 truncate px-2 py-1" key={index}>
                          {String(row[index] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-small text-text-2">
              Các khách nhập được lưu local trước, sau đó đồng bộ theo hàng đợi hiện có. Rà soát ghép cột trước khi
              nhập.
            </p>
            <Button variant="primary" loading={working} onClick={() => void importCustomers()}>
              Nhập khách
            </Button>
          </div>
        )}
      </section>
      {status && (
        <p role="status" className="rounded-control bg-surface-2 p-3 text-small text-text-2">
          {status}
        </p>
      )}
    </main>
  );
}

export const route: FeatureRoute = {
  path: '/nhap-xuat',
  element: <ImportExportPage />,
  handle: { title: 'Nhập / Xuất' },
};
