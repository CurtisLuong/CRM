import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export function CatalogDrawer({
  open,
  title,
  children,
  error,
  saving,
  onClose,
  onSave,
  saveLabel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  error: string;
  saving: boolean;
  onClose: () => void;
  onSave?: () => void;
  saveLabel: string;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent aria-describedby={undefined}>
        <SheetHeader className="[&_button]:min-h-11 [&_button]:min-w-11">
          <SheetTitle className="break-words">{title}</SheetTitle>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (!saving) onSave?.();
          }}
        >
          <SheetBody>
            {error && (
              <p
                role="alert"
                className="rounded-md border border-alert/40 bg-alert-tint p-3 text-caption text-alert-text"
              >
                {error}
              </p>
            )}
            {children}
          </SheetBody>
          {onSave && (
            <SheetFooter>
              <Button type="submit" disabled={saving}>
                {saving ? 'Đang lưu…' : saveLabel}
              </Button>
              <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
                Huỷ
              </Button>
            </SheetFooter>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}
