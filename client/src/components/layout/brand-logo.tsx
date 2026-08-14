import Image from 'next/image';

import { cn } from '@/lib/utils';

/**
 * The single place the Peacefic brand is drawn.
 *
 * The mark and wordmark used to be written out separately in the sidebar and
 * the auth layout, which is how two versions of a logo drift apart. Every
 * surface renders this component instead — sidebar, auth layout, and the
 * forced password change — so there is exactly one implementation and one
 * asset behind it.
 *
 * `client/public/images/peacefic-technology-logo.jpg` is that asset. It is a
 * 720×701 JPEG of the circular Peacefic Technology badge, supplied as-is: not
 * redrawn, recoloured or regenerated.
 */

const LOGO_SRC = '/images/peacefic-technology-logo.jpg';

/** Intrinsic size of the supplied artwork, so Next can reason about it. */
const LOGO_INTRINSIC = { width: 720, height: 701 } as const;

type BrandSize = 'sm' | 'md' | 'lg';

/** Rendered box in px, kept square so `rounded-full` stays a circle. */
const SIZES: Record<BrandSize, { px: number; box: string; text: string; gap: string }> = {
  sm: { px: 28, box: 'size-7', text: 'text-sm', gap: 'gap-2' },
  md: { px: 32, box: 'size-8', text: 'text-base', gap: 'gap-2' },
  lg: { px: 44, box: 'size-11', text: 'text-lg', gap: 'gap-2.5' },
};

interface BrandLogoProps {
  size?: BrandSize;
  /** Hidden when the rail is collapsed, or where the wordmark would crowd. */
  showWordmark?: boolean;
  /** Inverts the wordmark for the dark promotional panel. */
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
    <span className={cn('flex items-center overflow-hidden', scale.gap, className)}>
      {/**
       * `object-cover` in a square box, clipped to a circle.
       *
       * The artwork is 720×701, so the badge fills the height and carries a
       * ~9.5px white margin on each side. Covering a square box trims exactly
       * that margin — no part of the badge itself is lost — and `rounded-full`
       * keeps the circular identity rather than showing white corners against
       * a coloured sidebar. `object-contain` would letterbox instead, leaving
       * the corners visible.
       */}
      <span className={cn('relative shrink-0 overflow-hidden rounded-full', scale.box)}>
        <Image
          src={LOGO_SRC}
          alt="Peacefic Technology"
          width={LOGO_INTRINSIC.width}
          height={LOGO_INTRINSIC.height}
          sizes={`${scale.px}px`}
          className="size-full object-cover"
        />
      </span>

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
