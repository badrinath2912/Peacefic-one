import { cn } from '@/lib/utils';

export interface DescriptionItem {
  label: string;
  value: string | number | null | undefined;
  /** Spans both columns — for addresses and other long values. */
  full?: boolean;
}

/**
 * A real `<dl>` rather than a grid of divs, so the label/value relationship is
 * exposed to assistive tech instead of only being visual.
 */
export function DescriptionList({ items }: { items: DescriptionItem[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className={cn('min-w-0', item.full && 'sm:col-span-2')}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-0.5 break-words text-sm">
            {item.value === null || item.value === undefined || item.value === '' ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              String(item.value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
