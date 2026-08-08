import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The last crumb is the current page and is never a link — marked with
 * `aria-current` so assistive tech announces it as the location rather than
 * another destination.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined} className={isLast ? 'text-foreground' : undefined}>
                  {item.label}
                </span>
              )}

              {!isLast ? <ChevronRight className="size-3.5" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
