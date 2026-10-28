import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Khối hiển thị nguồn và nội dung AI cần người dùng tự kiểm tra. */
export function AiSurface({
  source,
  children,
  className = '',
}: {
  source: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`border-ion/30 bg-ion-tint ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-ion">Đề xuất AI · cần kiểm tra</CardTitle>
        <p className="m-0 text-caption text-ink-muted">{source}</p>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}
