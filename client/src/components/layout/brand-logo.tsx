import { GraduationCap } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The single place the Peacefic brand is drawn.
 *
 * Before this existed the mark and wordmark were written out separately in the
 * sidebar and the auth layout, which is how two versions of a logo drift apart.
 * Every surface now renders this component instead.
 *
 * ---------------------------------------------------------------------------
 * REPLACING THE MARK WITH THE OFFICIAL ARTWORK
 *
 * No image asset ships with the repository today — there is no `client/public`
 * directory — so the mark below is the placeholder the product has been using.
 * To swap in the real logo, drop the file at `client/public/images/` and change
 * only the `<Mark>` function at the bottom of this file:
 *
 *   import Image from 'next/image';
 *
 *   <Image src="/images/peacefic-logo.svg" alt="" width={32} height={32}
 *          className={cn('object-contain', sizes.mark)} priority />
 *
 * Nothing else needs to change: every call site already sizes through `size`
 * and the alt text is supplied by the wordmark or `aria-label` here, so the
 * image itself stays decorative and no duplicate branding appears.
 * ---------------------------------------------------------------------------
 */

type BrandSize = 'sm' | 'md' | 'lg';

const SIZES: Record<BrandSize, { box: string; icon: string; text: string; gap: string }> = {
  sm: { box: 'size-7', icon: 'size-3.5', text: 'text-sm', gap: 'gap-2' },
  md: { box: 'size-8', icon: 'size-4', text: 'text-base', gap: 'gap-2' },
  lg: { box: 'size-11', icon: 'size-6', text: 'text-lg', gap: 'gap-2.5' },
};

interface BrandLogoProps {
  size?: BrandSize;
  /** Hidden when the rail is collapsed, or where the wordmark would crowd. */
  showWordmark?: boolean;
  /** Inverts the mark for the dark promotional panel. */
  tone?: 'brand' | 'inverse';
  className?: string;
}

export function BrandLogo({
  size = 'md',
  showWordmark = true,
  tone = 'brand',
  className,
}: BrandLogoProps) {
  const scale = SIZES[size];

  return (
    <span
      className={cn('flex items-center overflow-hidden', scale.gap, className)}
      // The wordmark carries the name for assistive tech; when it is hidden the
      // label below supplies it, so the brand is announced exactly once.
      aria-label={showWordmark ? undefined : 'Peacefic One'}
      role={showWordmark ? undefined : 'img'}
    >
      <Mark
        className={cn(
          'grid shrink-0 place-items-center rounded-md',
          scale.box,
          tone === 'inverse'
            ? 'bg-primary-foreground/15 text-primary-foreground'
            : 'bg-primary text-primary-foreground',
        )}
        iconClassName={scale.icon}
      />

      {showWordmark ? (
        <span
          className={cn(
            'truncate font-semibold tracking-tight',
            scale.text,
            tone === 'inverse' && 'text-primary-foreground',
          )}
        >
          Peacefic One
        </span>
      ) : null}
    </span>
  );
}

/** The mark alone. Replace this body with the official artwork — see above. */
function Mark({ className, iconClassName }: { className: string; iconClassName: string }) {
  return (
    <span className={className}>
      <GraduationCap className={iconClassName} aria-hidden />
    </span>
  );
}
