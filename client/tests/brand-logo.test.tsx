import { render, screen } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BrandLogo } from '@/components/layout/brand-logo';

const ASSET = resolve(process.cwd(), 'public/images/peacefic-technology-logo.jpg');

describe('Brand logo', () => {
  it('renders the official artwork', () => {
    render(<BrandLogo />);

    const logo = screen.getByRole('img', { name: 'Peacefic Technology' });
    expect(logo).toBeInTheDocument();
  });

  /** The alt text names the organisation, not the file. */
  it('is announced as Peacefic Technology', () => {
    render(<BrandLogo />);

    expect(screen.getByAltText('Peacefic Technology')).toBeInTheDocument();
  });

  it('points at the single canonical asset', () => {
    render(<BrandLogo />);

    const src = screen.getByAltText('Peacefic Technology').getAttribute('src') ?? '';
    // next/image rewrites the src, so assert the underlying path is referenced.
    expect(decodeURIComponent(src)).toContain('/images/peacefic-technology-logo.jpg');
  });

  /** A referenced asset that is not on disk is a broken image in production. */
  it('resolves to a file that actually exists', () => {
    expect(existsSync(ASSET)).toBe(true);
  });

  /** Guards against the file being replaced by something that is not an image. */
  it('is a real JPEG of the expected dimensions', () => {
    const bytes = readFileSync(ASSET);

    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    expect(bytes[2]).toBe(0xff);

    // Read the first start-of-frame marker for the intrinsic size.
    let index = 2;
    let dimensions: { width: number; height: number } | null = null;

    while (index < bytes.length) {
      if (bytes[index] !== 0xff) {
        index += 1;
        continue;
      }

      const marker = bytes[index + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        dimensions = {
          height: bytes.readUInt16BE(index + 5),
          width: bytes.readUInt16BE(index + 7),
        };
        break;
      }

      index += 2 + bytes.readUInt16BE(index + 2);
    }

    expect(dimensions).toEqual({ width: 720, height: 701 });
  });

  /* --------------------------------- layout --------------------------------- */

  it('shows the wordmark by default', () => {
    render(<BrandLogo />);

    expect(screen.getByText('Peacefic One')).toBeInTheDocument();
  });

  /** The collapsed rail has no room for it; the mark still carries the name. */
  it('hides the wordmark when asked, keeping the logo accessible', () => {
    render(<BrandLogo showWordmark={false} />);

    expect(screen.queryByText('Peacefic One')).not.toBeInTheDocument();
    expect(screen.getByAltText('Peacefic Technology')).toBeInTheDocument();
  });

  it('renders at each size without distorting the artwork', () => {
    for (const size of ['sm', 'md', 'lg'] as const) {
      const { unmount, container } = render(<BrandLogo size={size} />);

      const image = screen.getByAltText('Peacefic Technology');
      // Square box plus a circular clip preserves the badge's shape.
      expect(image.className).toContain('object-cover');
      expect(container.querySelector('.rounded-full')).not.toBeNull();

      unmount();
    }
  });

  it('inverts only the wordmark for the dark panel', () => {
    render(<BrandLogo tone="inverse" />);

    expect(screen.getByText('Peacefic One').className).toContain('text-primary-foreground');
    // The artwork itself is never recoloured.
    expect(screen.getByAltText('Peacefic Technology').className).not.toContain('invert');
  });
});
