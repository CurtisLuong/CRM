import { useState } from 'react';
import type { FeatureRoute } from '@/app/routes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/ui/Toast';
import { proceduresContent } from './content';
import {
  documentsForGroup,
  formatMillions,
  hanoiPortIncomeMillions,
  incomeCopyLines,
  mainConditionLines,
  sectionCopy,
} from './model';

const sectionIds = ['dieu-kien', 'ho-so', 'doi-tuong', 'nha-o', 'thu-nhap'] as const;

function ProceduresPage() {
  const [selectedGroup, setSelectedGroup] = useState('K6');
  const toast = useToast();

  const copy = async (title: string, lines: readonly string[]) => {
    try {
      await navigator.clipboard.writeText(sectionCopy(title, lines));
      toast({ title: 'Đã chép' });
    } catch {
      toast({ title: 'Không chép được', description: 'Hãy kiểm tra quyền truy cập bộ nhớ tạm.', tone: 'error' });
    }
  };

  const documentLines = documentsForGroup(selectedGroup as (typeof proceduresContent.groups)[number]['code']);
  const selectedGroupName = proceduresContent.groups.find((group) => group.code === selectedGroup)?.name ?? '';
  const incomeLines = incomeCopyLines();
  const mainConditions = mainConditionLines();
  const housingLines = proceduresContent.housingConditions.map(({ status, condition }) => `${status} · ${condition}`);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-10 pt-5 text-ink sm:px-6">
      <header className="mb-4">
        <p className="text-overline text-ink-muted">TIỆN ÍCH</p>
        <h1 className="m-0 text-title">Thủ tục</h1>
        <p className="mb-0 mt-1 text-body text-ink-muted">Điều kiện mua NOXH Hải Phòng và hồ sơ theo đối tượng.</p>
      </header>

      <nav
        aria-label="Mục lục Thủ tục"
        className="sticky top-0 z-10 -mx-4 mb-4 flex gap-2 overflow-x-auto border-b border-line bg-surface-0 px-4 py-2 sm:static sm:mx-0 sm:flex-wrap sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
      >
        {sectionIds.map((id, index) => (
          <a
            key={id}
            href={`#${id}`}
            className="flex h-11 shrink-0 items-center rounded-md border border-line bg-surface-100 px-3 text-label text-ink hover:bg-surface-200"
          >
            {String.fromCharCode(65 + index)}
          </a>
        ))}
      </nav>

      <div className="space-y-4">
        <Card id="dieu-kien">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>A. Ba điều kiện chính mua NOXH Hải Phòng</CardTitle>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Chép mục A"
              onClick={() => void copy('A. Ba điều kiện chính mua NOXH Hải Phòng', mainConditions)}
            >
              Chép
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="my-0 space-y-2 pl-5 text-body">
              {mainConditions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card id="ho-so">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>B. Hồ sơ theo đối tượng</CardTitle>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Chép mục B"
              onClick={() =>
                void copy(`B. Hồ sơ – ${selectedGroup} · ${selectedGroupName}`, [
                  ...documentLines,
                  ...(selectedGroup === 'K6' ? [`Lưu ý: ${proceduresContent.groupSixNote}`] : []),
                ])
              }
            >
              Chép
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="block space-y-1 text-label text-ink-muted">
              <span id="procedure-group-label">Đối tượng</span>
              <Select value={selectedGroup} onValueChange={(value) => value && setSelectedGroup(value)}>
                <SelectTrigger aria-labelledby="procedure-group-label" aria-label="Chọn đối tượng">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {proceduresContent.groups.map((group) => (
                    <SelectItem key={group.code} value={group.code}>
                      {group.code} · {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {documentLines.length ? (
              <>
                <ul className="my-0 space-y-2 pl-5 text-body">
                  {documentLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="mb-0 rounded-md bg-surface-200 p-3 text-body">
                  <strong>Lưu ý:</strong> {proceduresContent.groupSixNote}
                </p>
              </>
            ) : (
              <p className="mb-0 text-body">Chưa có danh sách hồ sơ cho đối tượng này.</p>
            )}
          </CardContent>
        </Card>

        <Card id="doi-tuong">
          <CardHeader>
            <CardTitle>C. Danh sách đối tượng</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="my-0 space-y-2 pl-5 text-body">
              {proceduresContent.groups.map((group) => (
                <li key={group.code}>
                  <button
                    type="button"
                    className="min-h-11 rounded-sm px-1 text-left hover:bg-surface-200 focus-visible:outline-2 focus-visible:outline-ion"
                    onClick={() => {
                      setSelectedGroup(group.code);
                      document.getElementById('ho-so')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    {group.name} <span className="text-ink-muted">({group.code})</span>
                  </button>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card id="nha-o">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>D. Điều kiện nhà ở</CardTitle>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Chép mục D"
              onClick={() => void copy('D. Điều kiện nhà ở', housingLines)}
            >
              Chép
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {proceduresContent.housingConditions.map(({ status, condition }) => (
              <div key={status} className="rounded-md border border-line bg-surface-0 p-3">
                <h3 className="m-0 mb-1 text-label">{status}</h3>
                <p className="m-0 text-body">{condition}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card id="thu-nhap">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>E. Mức thu nhập yêu cầu</CardTitle>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Chép mục E"
              onClick={() => void copy('E. Mức thu nhập yêu cầu', incomeLines)}
            >
              Chép
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {proceduresContent.incomeRequirements.map((item) => (
              <div
                key={item.status}
                className="grid gap-1 rounded-md border border-line bg-surface-0 p-3 sm:grid-cols-[1fr_1fr_1fr] sm:gap-3"
              >
                <h3 className="m-0 text-label">{item.status}</h3>
                <p className="m-0 text-body">
                  Mức chung: <strong>{formatMillions(item.generalMonthlyMillions)} triệu đồng/tháng</strong>
                  {'marriedTotal' in item && item.marriedTotal ? ' (tổng hai vợ chồng)' : ''}
                </p>
                <p className="m-0 text-body">
                  Hải Phòng (×1,16):{' '}
                  <strong>{formatMillions(hanoiPortIncomeMillions(item.generalMonthlyMillions))} triệu</strong>
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export const route: FeatureRoute = {
  path: '/thu-tuc',
  element: <ProceduresPage />,
  handle: { title: 'Thủ tục' },
};
