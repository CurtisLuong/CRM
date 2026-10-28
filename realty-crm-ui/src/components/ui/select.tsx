import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex h-11 w-full items-center justify-between gap-2 rounded-sm border border-input bg-surface-100 px-3 text-body text-ink cursor-pointer",
        "data-[placeholder]:text-ink-muted hover:border-ink focus-visible:border-ion focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ion",
        "aria-invalid:border-alert disabled:opacity-50 [&>span]:truncate",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-[18px] shrink-0 text-ink-muted" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  ),
);
SelectTrigger.displayName = "SelectTrigger";

const SelectContent = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Content>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>>(
  ({ className, children, position = "popper", ...props }, ref) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        className={cn(
          "relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-md border border-line bg-surface-100 text-ink shadow-overlay animate-pop",
          position === "popper" && "w-[var(--radix-select-trigger-width)] translate-y-1",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  ),
);
SelectContent.displayName = "SelectContent";

const SelectItem = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Item>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex h-10 w-full cursor-pointer select-none items-center rounded-sm pl-3 pr-8 text-sm outline-none",
        "data-[highlighted]:bg-surface-200 data-[state=checked]:font-semibold data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2.5">
        <Check className="size-4 text-ion" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  ),
);
SelectItem.displayName = "SelectItem";

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem };
