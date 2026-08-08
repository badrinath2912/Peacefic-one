'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-muted',
        outline: 'border border-input bg-surface hover:bg-muted hover:text-foreground',
        ghost: 'hover:bg-muted hover:text-foreground',
        // Destructive actions are visually distinct, never a default-styled
        // button with an alarming label.
        danger: 'bg-danger text-danger-foreground shadow-xs hover:bg-danger/90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-xs',
        md: 'h-9 px-4',
        lg: 'h-10 px-6',
        icon: 'size-9',
      },
      block: {
        true: 'w-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  loadingText?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild = false, isLoading = false, loadingText, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      // A loading button must also be disabled, or a double-click submits twice.
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {loadingText ?? children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
});

export { buttonVariants };
