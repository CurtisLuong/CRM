import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * primary = the ONE main action of a view (ion). alert = act on an overdue item ("Làm ngay") — not for deleting.
 * secondary = everything else. ghost = inline / toolbar. destructive = delete, always behind a confirm.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent font-medium transition-[background,border-color,filter] cursor-pointer disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ion",
  {
    variants: {
      variant: {
        primary: "bg-ion text-on-ion hover:brightness-110",
        secondary: "bg-surface-100 text-ink border-line hover:bg-surface-200",
        ghost: "bg-transparent text-ion hover:bg-ion-tint hover:text-ink",
        alert: "bg-alert text-on-alert font-semibold shadow-glow-alert hover:brightness-105",
        destructive: "bg-surface-100 text-alert-text border-line hover:bg-alert-tint",
        link: "h-auto px-0 text-ion underline-offset-4 hover:underline",
      },
      size: {
        md: "h-11 px-4 text-sm [&_svg]:size-5",
        sm: "h-8 px-3 text-[13px] [&_svg]:size-4",
        icon: "size-11 [&_svg]:size-5",
        "icon-sm": "size-8 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, type, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} type={asChild ? undefined : (type ?? "button")} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
