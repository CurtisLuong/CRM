import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-24 w-full rounded-sm border border-input bg-surface-100 px-3 py-2.5 text-body text-ink placeholder:text-ink-muted',
        'hover:border-ink focus-visible:border-ion focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ion aria-invalid:border-alert',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Textarea };
