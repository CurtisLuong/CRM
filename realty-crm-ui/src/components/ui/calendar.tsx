import * as React from "react";
import { DayPicker } from "react-day-picker";
import { vi } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Calendar: weeks start Monday (T2…CN), Vietnamese, year dropdown for birthdays. Sundays red, today ringed ion, selected filled ion. */
export function Calendar({ className, classNames, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={vi}
      weekStartsOn={1}
      showOutsideDays
      captionLayout="dropdown"
      className={cn("p-1 text-ink", className)}
      classNames={{
        months: "relative",
        month: "flex flex-col gap-2",
        month_caption: "flex h-8 items-center px-1 text-sm font-semibold",
        caption_label: "hidden",
        dropdowns: "flex items-center gap-1.5",
        dropdown_root: "relative",
        dropdown: "h-8 rounded-sm border border-line bg-surface-200 px-2 font-mono text-[13px] text-ink",
        nav: "absolute right-0 top-0 flex gap-1",
        button_previous: "grid size-8 place-items-center rounded-sm border border-line hover:bg-surface-200 cursor-pointer",
        button_next: "grid size-8 place-items-center rounded-sm border border-line hover:bg-surface-200 cursor-pointer",
        month_grid: "w-full border-collapse",
        weekdays: "",
        weekday: "h-6 font-mono text-[11px] font-semibold text-ink-muted",
        week: "",
        day: "p-0.5 text-center [&:last-child]:text-alert-text",
        day_button:
          "size-9 rounded-sm font-mono text-[13px] font-medium cursor-pointer hover:bg-surface-200 focus-visible:outline-2 focus-visible:outline-ion",
        today: "[&>button]:shadow-[inset_0_0_0_1px_var(--ion)]",
        selected: "[&>button]:bg-ion [&>button]:text-on-ion [&>button:hover]:bg-ion",
        outside: "opacity-40",
        disabled: "opacity-30",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => (orientation === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />),
      }}
      {...props}
    />
  );
}
