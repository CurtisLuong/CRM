import * as React from "react";
import { cn } from "@/lib/utils";

/** Bare input. For a labeled field with hint/error/affixes use <TextField> from components/crm/form-fields. */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full min-w-0 rounded-sm border border-input bg-surface-100 px-3 text-body text-ink placeholder:text-ink-muted",
      "hover:border-ink focus-visible:border-ion focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ion",
      "disabled:cursor-not-allowed disabled:bg-surface-200 disabled:opacity-50 aria-invalid:border-alert",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
