import { type ComponentProps, type ReactNode, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Icon } from '@/ui/Icon';

// Cùng nhịp với thẻ Nhu cầu hiện tại; ô lẻ giãn kín phần hàng còn lại.
export const SHORT_FIELD =
  'min-w-0 flex-1 basis-[calc(50%_-_0.375rem)] sm:basis-[calc(33.333%_-_0.5rem)] xl:basis-[calc(25%_-_0.5625rem)]';
export const LONG_FIELD = 'min-w-0 basis-full';

/** Lưới ô: dùng SHORT_FIELD cho ô ngắn, LONG_FIELD cho ô dài và hàng hành động. */
export function FormGrid({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex min-w-0 flex-wrap gap-3', className)} {...props} />;
}

type SectionProps = Omit<ComponentProps<'section'>, 'title'> & { title: string };

/** Khu thông tin có tiêu đề ngoài thẻ, các ô bên trong dùng chung lưới thích ứng. */
export function FormSection({ title, children, className, ...props }: SectionProps) {
  return (
    <section className={cn('min-w-0 space-y-3', className)} {...props}>
      <h2 className="text-title">{title}</h2>
      <Card data-form-card className="min-w-0 p-4">
        <FormGrid>{children}</FormGrid>
      </Card>
    </section>
  );
}

/** Mục con trong thẻ: chỉ thụt một bậc, không tạo thêm thẻ. */
export function FormSubsection({ title, children, className, ...props }: SectionProps) {
  return (
    <section data-form-subsection className={cn('min-w-0 space-y-3 pl-3 sm:pl-4', className)} {...props}>
      <h2 className="text-section-head">{title}</h2>
      <FormGrid>{children}</FormGrid>
    </section>
  );
}

/** Khu thu gọn có đầu khu và nội dung luôn nằm trong cùng một thẻ. */
export function CollapsibleFormSection({
  title,
  open,
  onOpenChange,
  children,
  className,
  ...props
}: SectionProps & { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  const panelId = useId();
  return (
    <section className={cn('min-w-0', className)} {...props}>
      <Card data-form-card className="min-w-0 p-4">
        <Button
          variant="secondary"
          className="w-full min-w-0"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onOpenChange(!open)}
        >
          <span className="flex-1 text-left">{title}</span>
          <Icon name={open ? 'up' : 'expand'} size={20} className="shrink-0 text-ink-muted" />
        </Button>
        {open && (
          <div id={panelId} className="min-w-0 space-y-5 pt-4">
            {children}
          </div>
        )}
      </Card>
    </section>
  );
}
