'use client';

import { LogOut, Menu, Moon, Settings, Sun, User } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { initials } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useAppDispatch } from '@/store';
import { setMobileNavOpen } from '@/store/ui-slice';

import { Button } from '../ui/button';

export function Topbar({ settingsHref }: { settingsHref: string }) {
  const { user, logout } = useAuth();
  const dispatch = useAppDispatch();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // The theme is unknown until hydration; rendering an icon before then
  // guarantees a mismatch between server and client markup.
  useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => dispatch(setMobileNavOpen(true))}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>

      <div className="min-w-0 flex-1">
        {user?.collegeName ? (
          <p className="truncate text-sm font-medium">{user.collegeName}</p>
        ) : null}
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {mounted ? resolvedTheme === 'dark' ? <Sun /> : <Moon /> : <span className="size-4" />}
      </Button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex items-center gap-2 rounded-md p-1 pr-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="grid size-7 place-items-center rounded-full bg-primary-subtle text-xs font-semibold text-primary">
            {initials(user?.firstName, user?.lastName)}
          </span>
          <span className="hidden max-w-32 truncate font-medium sm:inline">{user?.fullName}</span>
        </button>

        {menuOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setMenuOpen(false)}
              aria-hidden
              tabIndex={-1}
            />
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-md border border-border bg-popover shadow-overlay"
            >
              <div className="border-b border-border px-3 py-2.5">
                <p className="truncate text-sm font-medium">{user?.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">{user?.roleName}</p>
              </div>

              <div className="p-1">
                <Link
                  href={`${settingsHref}/profile`}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <User className="size-4" aria-hidden />
                  Profile
                </Link>
                <Link
                  href={settingsHref}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Settings className="size-4" aria-hidden />
                  Settings
                </Link>
              </div>

              <div className="border-t border-border p-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void logout()}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-danger hover:bg-danger-subtle"
                >
                  <LogOut className="size-4" aria-hidden />
                  Sign out
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}
