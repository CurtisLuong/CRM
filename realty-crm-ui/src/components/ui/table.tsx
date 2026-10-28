import * as React from "react";
import { cn } from "@/lib/utils";

/** Compact by default (40px rows). Sticky mono header. Hover surface-200; selected rows: data-state="selected". */
const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement> & { density?: "compact" | "comfortable" }>(
  ({ className, density = "compact", ...props }, ref) => (
    <table
      ref={ref}
      data-density={density}
      className={cn("group/table w-full border-separate border-spacing-0 text-[13px] leading-[18px] text-ink", className)}
      {...props}
    />
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>((props, ref) => <thead ref={ref} {...props} />);
TableHeader.displayName = "TableHeader";
const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>((props, ref) => <tbody ref={ref} {...props} />);
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "group/row [&:last-child>td]:border-b-0 [&:hover>td]:bg-surface-200",
      "data-[state=selected]:[&>td]:bg-ion-tint data-[state=selected]:[&>td:first-child]:shadow-[inset_2px_0_0_var(--ion)]",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn("sticky top-0 z-[1] h-8 whitespace-nowrap border-b border-line bg-surface-200 px-3 text-left text-overline", className)}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "max-w-80 overflow-hidden text-ellipsis whitespace-nowrap border-b border-line px-3",
      "group-data-[density=compact]/table:h-10 group-data-[density=comfortable]/table:h-[52px] group-data-[density=comfortable]/table:text-sm",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
