import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("rounded-lg border border-line bg-surface-100 text-ink", className)} {...props} />
));
Card.displayName = "Card";
const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex flex-col gap-1 p-4 pb-2", className)} {...props} />;
const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className={cn("m-0 text-overline", className)} {...props} />;
const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("p-4 pt-0", className)} {...props} />;
const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center justify-between gap-2 border-t border-line px-4 py-2.5", className)} {...props} />
);

export { Card, CardHeader, CardTitle, CardContent, CardFooter };
