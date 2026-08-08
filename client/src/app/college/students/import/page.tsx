'use client';

import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import { RouteGuard } from '@/components/auth/route-guard';
import { FileDropzone } from '@/components/form/file-dropzone';
import { PageHeader } from '@/components/layout/app-shell';
import { Alert } from '@/components/ui/alert';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import { apiPost, type ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  buildSampleCsv,
  downloadText,
  parseCsv,
  STUDENT_IMPORT_COLUMNS,
  STUDENT_REQUIRED_COLUMNS,
  type ParsedSheet,
} from '@/lib/parse-spreadsheet';

interface RowResult {
  index: number;
  success: boolean;
  identifier?: string;
  id?: string;
  code?: string;
  message?: string;
}

interface ImportReport {
  dryRun: boolean;
  totalSubmitted: number;
  successCount: number;
  failureCount: number;
  results: RowResult[];
}

type Step = 'upload' | 'preview' | 'review' | 'done';

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'upload', label: 'Upload' },
  { id: 'preview', label: 'Preview' },
  { id: 'review', label: 'Validate' },
  { id: 'done', label: 'Summary' },
];

export default function StudentImportPage() {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const missingColumns = useMemo(() => {
    if (!sheet) return [];
    return STUDENT_REQUIRED_COLUMNS.filter((column) => !sheet.headers.includes(column));
  }, [sheet]);

  const rowsPayload = useMemo(() => {
    if (!sheet) return [];
    // Only columns the API knows about are sent; extras in the file are ignored
    // rather than rejected, since colleges keep their own tracking columns.
    return sheet.rows.map((row) =>
      Object.fromEntries(
        STUDENT_IMPORT_COLUMNS.filter((column) => row[column] !== undefined && row[column] !== '')
          .map((column) => [column, row[column]]),
      ),
    );
  }, [sheet]);

  function handleFile(file: File): void {
    setServerError(null);
    setReport(null);

    const reader = new FileReader();

    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ''));

      if (parsed.rows.length === 0) {
        toast.error('That file contains no data rows.');
        return;
      }

      setFileName(file.name);
      setSheet(parsed);
      setStep('preview');
    };

    reader.onerror = () => toast.error('That file could not be read.');
    reader.readAsText(file, 'utf-8');
  }

  async function run(dryRun: boolean): Promise<void> {
    setIsRunning(true);
    setServerError(null);

    try {
      const result = await apiPost<ImportReport>(
        `/students/bulk/import?dryRun=${dryRun}`,
        { rows: rowsPayload },
      );

      setReport(result);
      setStep(dryRun ? 'review' : 'done');

      if (!dryRun && result.successCount > 0) {
        toast.success(`Imported ${result.successCount} student${result.successCount === 1 ? '' : 's'}.`);
      }
    } catch (error) {
      const apiError = error as ApiError;
      setServerError(apiError.message);
    } finally {
      setIsRunning(false);
    }
  }

  function downloadErrorReport(): void {
    if (!report) return;

    const failures = report.results.filter((result) => !result.success);
    const header = 'row,identifier,code,message';
    const lines = failures.map(
      (failure) =>
        `${failure.index + 2},"${failure.identifier ?? ''}","${failure.code ?? ''}","${(failure.message ?? '').replace(/"/g, '""')}"`,
    );

    downloadText([header, ...lines].join('\n'), 'import-errors.csv');
  }

  function reset(): void {
    setStep('upload');
    setSheet(null);
    setReport(null);
    setFileName(null);
    setServerError(null);
  }

  const failedRows = new Set(
    (report?.results ?? []).filter((result) => !result.success).map((result) => result.index),
  );

  const currentStepIndex = STEPS.findIndex((item) => item.id === step);

  return (
    <RouteGuard permissions={['student:import']}>
      <Breadcrumbs
        items={[{ label: 'Students', href: '/college/students' }, { label: 'Import' }]}
      />

      <PageHeader
        title="Import students"
        description="Upload a roster, check what will happen, then commit."
        actions={
          <Button variant="outline" onClick={() => downloadText(buildSampleCsv(), 'student-import-template.csv')}>
            <Download aria-hidden />
            Sample template
          </Button>
        }
      />

      {/* Progress indicator */}
      <ol className="mb-6 flex flex-wrap items-center gap-2" aria-label="Import progress">
        {STEPS.map((item, index) => {
          const state = index < currentStepIndex ? 'done' : index === currentStepIndex ? 'current' : 'todo';

          return (
            <li key={item.id} className="flex items-center gap-2">
              <span
                aria-current={state === 'current' ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-full px-3 py-1 text-sm',
                  state === 'current' && 'bg-primary text-primary-foreground',
                  state === 'done' && 'bg-success-subtle text-success',
                  state === 'todo' && 'bg-muted text-muted-foreground',
                )}
              >
                <span className="tabular text-xs">{index + 1}</span>
                {item.label}
              </span>
              {index < STEPS.length - 1 ? (
                <span className="h-px w-6 bg-border" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>

      {serverError ? (
        <Alert tone="danger" title="The import could not run" className="mb-4">
          {serverError}
        </Alert>
      ) : null}

      {step === 'upload' ? (
        <Card>
          <CardContent className="p-6">
            <FileDropzone
              accept=".csv,text/csv"
              maxBytes={10 * 1024 * 1024}
              onFile={handleFile}
              label="Drop a CSV file here, or browse"
              hint="Up to 500 rows. Download the sample template if you are unsure of the columns."
            />

            <div className="mt-4 rounded-md border border-border bg-surface-sunken p-4 text-sm">
              <p className="font-medium">Required columns</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {STUDENT_REQUIRED_COLUMNS.join(', ')}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Excel files should be saved as CSV first. Extra columns are ignored, so you can
                keep your own tracking fields in the file.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step !== 'upload' && sheet ? (
        <Card className="mb-4">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-4" aria-hidden />
              {fileName}
              <span className="text-sm font-normal text-muted-foreground">
                {sheet.rows.length} row{sheet.rows.length === 1 ? '' : 's'}
              </span>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw aria-hidden />
              Start over
            </Button>
          </CardHeader>

          <CardContent className="px-0">
            {missingColumns.length > 0 ? (
              <div className="px-5 pb-4">
                <Alert tone="danger" title="Required columns are missing">
                  The file has no <strong>{missingColumns.join(', ')}</strong> column
                  {missingColumns.length === 1 ? '' : 's'}. Add {missingColumns.length === 1 ? 'it' : 'them'} and upload again.
                </Alert>
              </div>
            ) : null}

            {sheet.warnings.length > 0 ? (
              <div className="px-5 pb-4">
                <Alert tone="warning" title="Check these before continuing">
                  <ul className="list-inside list-disc space-y-0.5">
                    {sheet.warnings.slice(0, 5).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </Alert>
              </div>
            ) : null}

            <TableWrapper>
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                    <TableHead className="w-12">Row</TableHead>
                    {sheet.headers.map((header) => (
                      <TableHead
                        key={header}
                        className={cn(
                          !STUDENT_IMPORT_COLUMNS.includes(header as never) && 'text-muted-foreground/60',
                        )}
                      >
                        {header}
                        {STUDENT_REQUIRED_COLUMNS.includes(header as never) ? (
                          <span className="ml-0.5 text-danger" aria-label="required">*</span>
                        ) : null}
                      </TableHead>
                    ))}
                    {report ? <TableHead>Result</TableHead> : null}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {sheet.rows.slice(0, 50).map((row, index) => {
                    const failure = report?.results.find(
                      (result) => result.index === index && !result.success,
                    );

                    return (
                      <TableRow
                        key={index}
                        className={cn(failedRows.has(index) && 'bg-danger-subtle hover:bg-danger-subtle')}
                      >
                        <TableCell className="tabular text-muted-foreground">{index + 2}</TableCell>

                        {sheet.headers.map((header) => (
                          <TableCell key={header} className="max-w-48 truncate">
                            {row[header] || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        ))}

                        {report ? (
                          <TableCell>
                            {failure ? (
                              <span className="text-xs text-danger">{failure.message}</span>
                            ) : (
                              <span className="text-xs text-success">Ready</span>
                            )}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableWrapper>

            {sheet.rows.length > 50 ? (
              <p className="px-5 pt-3 text-xs text-muted-foreground">
                Showing the first 50 rows. All {sheet.rows.length} will be processed.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {step === 'preview' ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={reset}>
            Cancel
          </Button>
          <Button
            onClick={() => void run(true)}
            isLoading={isRunning}
            loadingText="Validating"
            disabled={missingColumns.length > 0}
          >
            Validate {sheet?.rows.length} row{sheet?.rows.length === 1 ? '' : 's'}
          </Button>
        </div>
      ) : null}

      {step === 'review' && report ? (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Ready to import</p>
              <p className="tabular mt-1 text-2xl font-semibold text-success">
                {report.successCount}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Will be skipped</p>
              <p className="tabular mt-1 text-2xl font-semibold text-danger">
                {report.failureCount}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Total rows</p>
              <p className="tabular mt-1 text-2xl font-semibold">{report.totalSubmitted}</p>
            </Card>
          </div>

          {/* The dry run is the whole point: nothing was written yet. */}
          <Alert tone="info" title="Nothing has been imported yet" className="mb-4">
            This was a validation pass. Confirm below to import the{' '}
            {report.successCount} valid row{report.successCount === 1 ? '' : 's'}.
            {report.failureCount > 0
              ? ` The ${report.failureCount} row${report.failureCount === 1 ? '' : 's'} with errors will be skipped — fix and re-upload them separately.`
              : ''}
          </Alert>

          <div className="flex flex-wrap justify-end gap-2">
            {report.failureCount > 0 ? (
              <Button variant="outline" onClick={downloadErrorReport}>
                <Download aria-hidden />
                Error report
              </Button>
            ) : null}

            <Button variant="outline" onClick={reset}>
              Cancel
            </Button>

            <Button
              onClick={() => void run(false)}
              isLoading={isRunning}
              loadingText="Importing"
              disabled={report.successCount === 0}
            >
              <Upload aria-hidden />
              Import {report.successCount} student{report.successCount === 1 ? '' : 's'}
            </Button>
          </div>
        </>
      ) : null}

      {step === 'done' && report ? (
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <span
              className={cn(
                'mx-auto grid size-12 place-items-center rounded-full',
                report.failureCount === 0
                  ? 'bg-success-subtle text-success'
                  : 'bg-warning-subtle text-warning',
              )}
            >
              {report.failureCount === 0 ? (
                <CheckCircle2 className="size-6" aria-hidden />
              ) : (
                <AlertTriangle className="size-6" aria-hidden />
              )}
            </span>

            <div>
              <h2 className="text-lg font-semibold">
                Imported {report.successCount} of {report.totalSubmitted}
              </h2>
              {report.failureCount > 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {report.failureCount} row{report.failureCount === 1 ? '' : 's'} could not be
                  imported. Download the error report to see why.
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Every row was imported.</p>
              )}
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {report.failureCount > 0 ? (
                <Button variant="outline" onClick={downloadErrorReport}>
                  <Download aria-hidden />
                  Error report
                </Button>
              ) : null}

              <Button variant="outline" onClick={reset}>
                Import another file
              </Button>

              <Button asChild>
                <Link href="/college/students">View students</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </RouteGuard>
  );
}
