import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { MarksEntry } from '@/api/examination-queries';
import { PublishResultsDialog } from '@/components/examinations/publish-results-dialog';

// jsdom does not implement the native dialog methods the component drives.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

function entry(overrides: Partial<MarksEntry> = {}): MarksEntry {
  return {
    id: 'entry-1',
    studentId: { id: 'student-1', rollNumber: 'CS22B001', userId: { firstName: 'Meera', lastName: 'Iyer' } },
    letter: 'A',
    percentage: 79,
    isPass: true,
    history: [],
    ...overrides,
  } as unknown as MarksEntry;
}

const ENTRIES = [
  entry(),
  entry({
    id: 'entry-2',
    studentId: {
      id: 'student-2',
      rollNumber: 'CS22B002',
      userId: { firstName: 'Ravi', lastName: 'Kumar' },
    },
    letter: 'F',
    percentage: 31,
    isPass: false,
  } as Partial<MarksEntry>),
  entry({
    id: 'entry-3',
    studentId: {
      id: 'student-3',
      rollNumber: 'CS22B003',
      userId: { firstName: 'Asha', lastName: 'Rao' },
    },
    letter: 'O',
    percentage: 94,
  } as Partial<MarksEntry>),
];

function renderDialog(onConfirm = vi.fn()) {
  render(
    <PublishResultsDialog
      open
      entries={ENTRIES}
      isPending={false}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />,
  );
  return onConfirm;
}

describe('PublishResultsDialog', () => {
  it('offers to publish to everyone when nobody is withheld', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Publish to 3' })).toBeEnabled();
    expect(screen.getByText(/nobody withheld/i)).toBeInTheDocument();
  });

  it('drops the release count as candidates are withheld', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('checkbox', { name: /CS22B002/i }));

    expect(screen.getByRole('button', { name: 'Publish to 2' })).toBeInTheDocument();
    expect(screen.getByText('1 withheld')).toBeInTheDocument();
  });

  it('sends the withheld ids and the reason to the server', async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog();

    await user.click(screen.getByRole('checkbox', { name: /CS22B002/i }));
    await user.type(screen.getByRole('textbox', { name: /reason/i }), 'Disciplinary enquiry');
    await user.click(screen.getByRole('button', { name: 'Publish to 2' }));

    expect(onConfirm).toHaveBeenCalledWith({
      reason: 'Disciplinary enquiry',
      withholdStudentIds: ['student-2'],
    });
  });

  /** An empty reason must not travel as an empty string. */
  it('omits the reason entirely when none was typed', async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Publish to 3' }));

    expect(onConfirm).toHaveBeenCalledWith({ reason: undefined, withholdStudentIds: [] });
  });

  it('refuses to publish when every candidate has been withheld', async () => {
    const user = userEvent.setup();
    renderDialog();

    for (const roll of ['CS22B001', 'CS22B002', 'CS22B003']) {
      await user.click(screen.getByRole('checkbox', { name: new RegExp(roll) }));
    }

    expect(screen.getByRole('button', { name: 'Publish to 0' })).toBeDisabled();
  });

  it('says withheld marks survive, so it is not confused with deletion', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('checkbox', { name: /CS22B001/i }));

    expect(screen.getByText(/withheld candidates keep their marks/i)).toBeInTheDocument();
  });

  it('filters the list by roll number', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/withhold specific candidates/i), 'CS22B003');

    expect(screen.getByRole('checkbox', { name: /CS22B003/i })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /CS22B001/i })).not.toBeInTheDocument();
  });

  it('filters by name as well, since an examiner may not know the roll number', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/withhold specific candidates/i), 'ravi');

    expect(screen.getByRole('checkbox', { name: /CS22B002/i })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /CS22B001/i })).not.toBeInTheDocument();
  });

  it('keeps a withheld candidate withheld when the search hides them', async () => {
    const user = userEvent.setup();
    const onConfirm = renderDialog();

    await user.click(screen.getByRole('checkbox', { name: /CS22B002/i }));
    await user.type(screen.getByLabelText(/withhold specific candidates/i), 'CS22B003');

    // Filtering is a view concern; it must not silently un-withhold anyone.
    expect(screen.getByText('1 withheld')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Publish to 2' }));
    expect(onConfirm).toHaveBeenCalledWith({
      reason: undefined,
      withholdStudentIds: ['student-2'],
    });
  });

  it('reports an empty search rather than showing a blank list', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/withhold specific candidates/i), 'ZZZZ');

    expect(screen.getByText(/nobody matches that search/i)).toBeInTheDocument();
  });
});
