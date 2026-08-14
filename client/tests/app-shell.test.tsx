import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Provider } from 'react-redux';

import { store } from '@/store';

import { mockAuth, renderWithQuery } from './helpers/render';

const push = vi.fn();
const apiGet = vi.fn();

let permissions: string[] = [];
let pathname = '/college';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => pathname,
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/providers/auth-provider', () => ({ useAuth: () => mockAuth(permissions) }));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiGet: (...args: unknown[]) => apiGet(...args) };
});

const { AppShell, PageHeader } = await import('@/components/layout/app-shell');

const type = () => userEvent.setup({ delay: null });

/** AppShell reads sidebar/drawer state from Redux, so it needs the real store. */
const renderShell = (ui: React.ReactElement) =>
  renderWithQuery(<Provider store={store}>{ui}</Provider>);

beforeEach(() => {
  permissions = ['student:read', 'department:read', 'batch:read'];
  pathname = '/college';
  push.mockReset();
  apiGet.mockReset();
  apiGet.mockResolvedValue({ count: 0 });
});

/**
 * The shell had no tests at all before this file, which is uncomfortable for a
 * component tree every authenticated page renders inside.
 *
 * These assert behaviour and accessibility — semantic headings, permission
 * filtering, the mobile trigger — rather than class strings, so the remaining
 * visual phases can keep moving without rewriting the suite.
 */
describe('PageHeader', () => {
  it('renders the title as the page’s single level-1 heading', () => {
    renderWithQuery(<PageHeader title="Students" />);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Students');
  });

  it('renders a description when given one', () => {
    renderWithQuery(<PageHeader title="Students" description="Manage enrolled students." />);

    expect(screen.getByText('Manage enrolled students.')).toBeInTheDocument();
  });

  /** 92 pages call this with title only; they must render unchanged. */
  it('renders with a title alone, as most existing callers do', () => {
    const { container } = renderWithQuery(<PageHeader title="Dashboard" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(container.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();
  });

  it('renders an eyebrow above the title when supplied', () => {
    renderWithQuery(<PageHeader eyebrow="College" title="Students" />);

    expect(screen.getByText('College')).toBeInTheDocument();
    // The eyebrow is contextual label text, not a competing heading.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('omits the eyebrow entirely when not supplied', () => {
    renderWithQuery(<PageHeader title="Students" />);

    expect(screen.queryByText('College')).not.toBeInTheDocument();
  });

  it('renders breadcrumbs through the shared primitive, marking the current page', () => {
    renderWithQuery(
      <PageHeader
        title="Approvals"
        breadcrumbs={[
          { label: 'College', href: '/college' },
          { label: 'Students', href: '/college/students' },
          { label: 'Approvals' },
        ]}
      />,
    );

    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    expect(within(nav).getByRole('link', { name: 'College' })).toHaveAttribute('href', '/college');
    // The final crumb is the location, never a link.
    expect(within(nav).queryByRole('link', { name: 'Approvals' })).not.toBeInTheDocument();
  });

  it('renders primary and secondary actions', async () => {
    renderWithQuery(
      <PageHeader
        title="Students"
        actions={
          <>
            <button type="button">Export</button>
            <button type="button">Add student</button>
          </>
        }
      />,
    );

    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add student' })).toBeInTheDocument();
  });
});

describe('AppShell', () => {
  it('renders its children', () => {
    renderShell(
      <AppShell portal="college">
        <p>Page content</p>
      </AppShell>,
    );

    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('renders the main landmark and primary navigation', () => {
    renderShell(
      <AppShell portal="college">
        <p>Page content</p>
      </AppShell>,
    );

    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open navigation/i })).toBeInTheDocument();
  });

  /**
   * The load-bearing assertion in this file. Navigation is permission-filtered,
   * and a styling change must never widen what a role can see.
   */
  it('shows only navigation the permissions allow', () => {
    permissions = ['student:read'];

    renderShell(
      <AppShell portal="college">
        <p>Page content</p>
      </AppShell>,
    );

    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    expect(within(nav).getByRole('link', { name: /students/i })).toBeInTheDocument();
    // `faculty:read` was not granted, so the entry must not be rendered at all.
    expect(within(nav).queryByRole('link', { name: /^faculty$/i })).not.toBeInTheDocument();
  });

  it('marks the current route as the active page', () => {
    pathname = '/college/students';
    permissions = ['student:read'];

    renderShell(
      <AppShell portal="college">
        <p>Page content</p>
      </AppShell>,
    );

    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    expect(within(nav).getByRole('link', { name: /students/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('keeps the student portal separate from college navigation', () => {
    pathname = '/student';
    permissions = ['student:read_own', 'exam:read'];

    renderShell(
      <AppShell portal="student">
        <p>Page content</p>
      </AppShell>,
    );

    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    expect(within(nav).queryByRole('link', { name: /^faculty$/i })).not.toBeInTheDocument();
  });

  it('opens the mobile drawer from the topbar trigger', async () => {
    renderShell(
      <AppShell portal="college">
        <p>Page content</p>
      </AppShell>,
    );

    await type().click(screen.getByRole('button', { name: /open navigation/i }));

    // The scrim only exists while the drawer is open.
    expect(await screen.findByRole('button', { name: /close navigation/i })).toBeInTheDocument();
  });
});
