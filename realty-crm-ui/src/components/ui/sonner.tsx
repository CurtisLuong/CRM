import { Toaster as Sonner, toast } from "sonner";
import { CircleCheck, Info, TriangleAlert, WifiOff } from "lucide-react";

/**
 * Mount once at the app root. Then: toast.success("Đã lưu ghi chú", { action: { label: "Hoàn tác", onClick } }),
 * toast.error("Lỗi kết nối", { duration: Infinity }). Success/info 4s; errors stay until closed.
 */
export function Toaster(props: React.ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      position="bottom-right"
      visibleToasts={4}
      closeButton
      icons={{
        success: <CircleCheck className="size-[18px] text-ok-text" />,
        info: <Info className="size-[18px] text-ion" />,
        error: <TriangleAlert className="size-[18px] text-alert-text" />,
        warning: <WifiOff className="size-[18px] text-alert-text" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "flex w-[360px] max-w-[calc(100vw-32px)] items-start gap-2.5 rounded-md border border-line bg-surface-200 p-3 pl-3.5 text-ink shadow-overlay font-sans",
          error: "border-alert",
          warning: "border-alert",
          title: "text-sm font-semibold",
          description: "text-[13px] text-ink-muted",
          actionButton: "ml-auto h-7 rounded-sm border border-line bg-surface-100 px-2.5 text-[13px] font-semibold text-ion cursor-pointer",
          closeButton: "!left-auto !right-1 !top-1 !border-0 !bg-transparent text-ink-muted",
        },
      }}
      {...props}
    />
  );
}

export { toast };
