import { cn } from './cn';

/** Phím tắt (chỉ hiện trên desktop): <Kbd keys={['⌘', 'K']} />. */
export function Kbd({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={cn('hidden items-center gap-0.5 lg:inline-flex', className)}>
      {keys.map((k) => (
        <kbd
          key={k}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-border bg-surface-2 px-1 font-data text-label text-text-2"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
