'use client';

import { FileText, Plus, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { useCreateExamPaper, useExamPapers, useExamProfile } from '@/api/examination-queries';
import { RouteGuard } from '@/components/auth/route-guard';
import { ExamTabs } from '@/components/examinations/exam-tabs';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FullPageSpinner } from '@/components/ui/spinner';
import { can } from '@/lib/permissions';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';

interface SectionDraft {
  name: string;
  questionCount: string;
  marksPerQuestion: string;
  isOptional: boolean;
  instructions: string;
}

const EMPTY_SECTION: SectionDraft = {
  name: '',
  questionCount: '5',
  marksPerQuestion: '2',
  isOptional: false,
  instructions: '',
};

export default function ExamPapersPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const profile = useExamProfile(params.id);
  const papers = useExamPapers(params.id);
  const createPaper = useCreateExamPaper(params.id);

  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [release, setRelease] = useState(false);
  const [sections, setSections] = useState<SectionDraft[]>([{ ...EMPTY_SECTION }]);

  if (profile.isLoading) return <FullPageSpinner label="Loading exam" />;

  if (profile.isError) {
    return (
      <ErrorState
        title="Could not load this exam"
        message={profile.error.message}
        requestId={profile.error.requestId}
        onRetry={() => void profile.refetch()}
      />
    );
  }

  if (!profile.data) return <FullPageSpinner label="Loading" />;

  const { exam } = profile.data;
  const mayEdit = can(user?.permissions, 'exam:update') && exam.status !== 'archived';

  // Optional sections are excluded, matching the server: a paper offering a
  // choice would otherwise never add up.
  const compulsoryTotal = sections
    .filter((section) => !section.isOptional)
    .reduce(
      (sum, section) =>
        sum + (Number(section.questionCount) || 0) * (Number(section.marksPerQuestion) || 0),
      0,
    );

  const totalsMatch = sections.length === 0 || compulsoryTotal === exam.totalMarks;

  function updateSection(index: number, patch: Partial<SectionDraft>): void {
    setSections((current) =>
      current.map((section, position) =>
        position === index ? { ...section, ...patch } : section,
      ),
    );
  }

  function submit(): void {
    createPaper.mutate(
      {
        title: title.trim(),
        totalMarks: exam.totalMarks,
        instructions: instructions.trim() || null,
        isReleased: release,
        sections: sections
          .filter((section) => section.name.trim())
          .map((section) => ({
            name: section.name.trim(),
            questionCount: Number(section.questionCount) || 1,
            marksPerQuestion: Number(section.marksPerQuestion) || 0,
            isOptional: section.isOptional,
            instructions: section.instructions.trim() || null,
          })),
      },
      {
        onSuccess: () => {
          setComposing(false);
          setTitle('');
          setInstructions('');
          setRelease(false);
          setSections([{ ...EMPTY_SECTION }]);
        },
      },
    );
  }

  return (
    <RouteGuard permissions={['exam:read']}>
      <Breadcrumbs
        items={[
          { label: 'Examinations', href: '/college/examinations' },
          { label: 'Exams', href: '/college/examinations/exams' },
          { label: exam.code, href: `/college/examinations/exams/${exam.id}` },
          { label: 'Papers' },
        ]}
      />

      <PageHeader
        title="Question papers"
        description="Papers are versioned, never edited in place. A released paper is what candidates sat, so a correction becomes a new revision."
        actions={
          mayEdit && !composing ? (
            <Button onClick={() => setComposing(true)}>
              <Plus aria-hidden />
              New revision
            </Button>
          ) : null
        }
      />

      <ExamTabs examId={exam.id} />

      {composing ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>New revision</CardTitle>
            <p className="text-sm text-muted-foreground">
              Revision {(papers.data?.[0]?.revision ?? 0) + 1} · must total {exam.totalMarks} marks.
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Paper title" required>
                {({ id }) => (
                  <Input
                    id={id}
                    value={title}
                    placeholder="Data Structures — Semester Examination"
                    onChange={(event) => setTitle(event.target.value)}
                  />
                )}
              </Field>

              <Field label="Total marks" hint="Fixed by the exam.">
                {({ id }) => (
                  <Input
                    id={id}
                    readOnly
                    value={exam.totalMarks}
                    className="tabular bg-surface-sunken"
                  />
                )}
              </Field>
            </div>

            <Field label="Instructions">
              {({ id }) => (
                <textarea
                  id={id}
                  rows={3}
                  value={instructions}
                  placeholder="Answer any five questions. Scientific calculators are permitted."
                  onChange={(event) => setInstructions(event.target.value)}
                  className="flex w-full rounded-md border border-input bg-surface px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              )}
            </Field>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Sections</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSections((current) => [...current, { ...EMPTY_SECTION }])}
                >
                  <Plus aria-hidden />
                  Add section
                </Button>
              </div>

              {sections.map((section, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-5"
                >
                  <Field label="Name">
                    {({ id }) => (
                      <Input
                        id={id}
                        value={section.name}
                        placeholder="Part A"
                        onChange={(event) => updateSection(index, { name: event.target.value })}
                      />
                    )}
                  </Field>

                  <Field label="Questions">
                    {({ id }) => (
                      <Input
                        id={id}
                        type="number"
                        min={1}
                        value={section.questionCount}
                        onChange={(event) =>
                          updateSection(index, { questionCount: event.target.value })
                        }
                      />
                    )}
                  </Field>

                  <Field label="Marks each">
                    {({ id }) => (
                      <Input
                        id={id}
                        type="number"
                        min={0}
                        value={section.marksPerQuestion}
                        onChange={(event) =>
                          updateSection(index, { marksPerQuestion: event.target.value })
                        }
                      />
                    )}
                  </Field>

                  <div className="flex items-end gap-3">
                    <label className="flex items-center gap-2 pb-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                        checked={section.isOptional}
                        onChange={(event) =>
                          updateSection(index, { isOptional: event.target.checked })
                        }
                      />
                      Optional
                    </label>
                  </div>

                  <div className="flex items-end justify-end">
                    {sections.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setSections((current) =>
                            current.filter((_, position) => position !== index),
                          )
                        }
                        aria-label={`Remove section ${index + 1}`}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}

              <p
                className={`tabular text-sm ${totalsMatch ? 'text-muted-foreground' : 'text-danger'}`}
                aria-live="polite"
              >
                Compulsory sections total {compulsoryTotal} of {exam.totalMarks}
                {totalsMatch ? '.' : ' — these must match before the paper can be saved.'}
              </p>
            </div>

            <label className="flex items-start gap-2 border-t border-border pt-4">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                checked={release}
                onChange={(event) => setRelease(event.target.checked)}
              />
              <span className="text-sm">
                Release this revision
                <span className="block text-xs text-muted-foreground">
                  Supersedes whichever revision is currently live. Only one is released at a time.
                </span>
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setComposing(false)}>
                Cancel
              </Button>
              <Button
                onClick={submit}
                disabled={!title.trim() || !totalsMatch}
                isLoading={createPaper.isPending}
                loadingText="Saving"
              >
                Save revision
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {papers.isLoading ? (
        <FullPageSpinner label="Loading papers" />
      ) : papers.isError ? (
        <ErrorState
          title="Could not load papers"
          message={papers.error.message}
          onRetry={() => void papers.refetch()}
        />
      ) : (papers.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={FileText}
              title="No paper yet"
              description="Compose the question paper so its structure is on record alongside the marks."
              action={
                mayEdit && !composing ? (
                  <Button size="sm" onClick={() => setComposing(true)}>
                    New revision
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {papers.data?.map((paper) => (
            <Card key={paper.id}>
              <CardHeader className="flex-row items-start justify-between">
                <div className="min-w-0">
                  <CardTitle className="truncate">{paper.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Revision {paper.revision} · {paper.totalMarks} marks ·{' '}
                    {formatDateTime(paper.createdAt)}
                  </p>
                </div>

                {paper.isReleased ? (
                  <Badge tone="success">Released {formatDateTime(paper.releasedAt)}</Badge>
                ) : (
                  <Badge tone="neutral">Draft</Badge>
                )}
              </CardHeader>

              <CardContent className="space-y-3">
                {paper.instructions ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {paper.instructions}
                  </p>
                ) : null}

                {paper.sections.length > 0 ? (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {paper.sections.map((section, index) => (
                      <li key={index} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {section.name}
                            {section.isOptional ? (
                              <Badge tone="neutral" className="ml-2">
                                Optional
                              </Badge>
                            ) : null}
                          </p>
                          {section.instructions ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {section.instructions}
                            </p>
                          ) : null}
                        </div>

                        <span className="tabular shrink-0 text-sm text-muted-foreground">
                          {section.questionCount} × {section.marksPerQuestion} ={' '}
                          <strong className="text-foreground">
                            {section.questionCount * section.marksPerQuestion}
                          </strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No section breakdown was recorded for this revision.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!mayEdit && exam.status === 'archived' ? (
        <Alert tone="info" title="This exam is archived" className="mt-4">
          Its papers stay readable, but no further revision can be added.
        </Alert>
      ) : null}
    </RouteGuard>
  );
}
