import { cn } from "@/lib/utils";

/** Shimmering placeholder shaped like the coming content. Show for loads over ~300ms. */
export function Skeleton({ className, circle, ...props }: React.HTMLAttributes<HTMLSpanElement> & { circle?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block h-3 animate-shimmer rounded-[4px] bg-[linear-gradient(90deg,var(--surface-200)_0%,var(--line)_50%,var(--surface-200)_100%)] bg-[length:200%_100%]",
        circle && "shrink-0 rounded-full",
        className,
      )}
      {...props}
    />
  );
}
