import { ArrowRight, Building2, GraduationCap } from 'lucide-react';
import Link from 'next/link';

const OPTIONS = [
  {
    href: '/register/institution',
    icon: Building2,
    title: 'Register an institution',
    description:
      'For colleges joining Peacefic. Creates your institution and its first administrator account.',
    note: 'Reviewed by Peacefic before activation.',
  },
  {
    href: '/register/student',
    icon: GraduationCap,
    title: 'Register as a student',
    description:
      'For students whose college already uses Peacefic. You will need the join code from your institution.',
    note: 'Verified by email, then approved by your college.',
  },
] as const;

/**
 * The fork between the two sign-up paths.
 *
 * These are genuinely different acts — one creates a tenant, the other joins an
 * existing one — with different inputs, different approvers and different
 * waiting periods. Presenting them as one form with a toggle would blur that,
 * so each keeps its own route and this page only routes between them.
 *
 * Each card states who approves and that access is not immediate, because the
 * most common support question about both flows is "I registered, why can't I
 * sign in?".
 */
export default function RegisterChoicePage() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <header className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
        <p className="text-sm text-muted-foreground">
          Choose how you are joining Peacefic.
        </p>
      </header>

      <div className="space-y-3">
        {OPTIONS.map((option) => (
          <Link
            key={option.href}
            href={option.href}
            className="group flex items-start gap-4 rounded-lg border border-input bg-surface p-4 transition-colors hover:border-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-subtle text-primary">
              <option.icon className="size-5" aria-hidden />
            </span>

            <span className="min-w-0 flex-1 space-y-1">
              <span className="flex items-center gap-1.5 font-medium">
                {option.title}
                <ArrowRight
                  className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
              <span className="block text-sm text-muted-foreground">{option.description}</span>
              <span className="block text-xs text-muted-foreground">{option.note}</span>
            </span>
          </Link>
        ))}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
