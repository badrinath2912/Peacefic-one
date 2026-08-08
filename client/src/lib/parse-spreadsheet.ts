/**
 * Parses an uploaded roster into rows keyed by the template's column names.
 *
 * CSV is parsed here rather than server-side so the user sees a preview and
 * fixes obvious problems before anything is sent. The server re-validates
 * everything regardless — this is convenience, not trust.
 */

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
  /** Non-fatal problems worth showing before the dry run. */
  warnings: string[];
}

/** Splits one CSV line, honouring quotes and escaped quotes. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

export function parseCsv(text: string): ParsedSheet {
  const warnings: string[] = [];

  // Strip a BOM: Excel writes one and it corrupts the first header name.
  const clean = text.replace(/^﻿/, '');

  const lines = clean
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [], warnings: ['The file is empty.'] };
  }

  const headers = splitCsvLine(lines[0]!).map((header) => header.replace(/\s+/g, ''));

  if (new Set(headers).size !== headers.length) {
    warnings.push('The file has duplicate column headings; only the last of each is used.');
  }

  const rows: Record<string, string>[] = [];

  for (const [index, line] of lines.slice(1).entries()) {
    const cells = splitCsvLine(line);

    if (cells.length !== headers.length) {
      warnings.push(
        `Row ${index + 2} has ${cells.length} values but there are ${headers.length} columns.`,
      );
    }

    rows.push(
      Object.fromEntries(headers.map((header, position) => [header, cells[position] ?? ''])),
    );
  }

  return { headers, rows, warnings };
}

/** Columns the student import understands, in template order. */
export const STUDENT_IMPORT_COLUMNS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'rollNumber',
  'admissionNumber',
  'registerNumber',
  'departmentCode',
  'batchCode',
  'admissionDate',
  'currentSemester',
  'dateOfBirth',
  'gender',
  'tenthPercent',
  'twelfthPercent',
  'currentCgpa',
  'guardianName',
  'guardianPhone',
] as const;

export const STUDENT_REQUIRED_COLUMNS = [
  'firstName',
  'lastName',
  'email',
  'rollNumber',
  'departmentCode',
  'batchCode',
  'admissionDate',
] as const;

/** Builds the sample file, so the user never has to guess the column names. */
export function buildSampleCsv(): string {
  const example: Record<string, string> = {
    firstName: 'Meera',
    lastName: 'Iyer',
    email: 'meera.iyer@example.edu',
    phone: '+919812345678',
    rollNumber: 'CS22B001',
    admissionNumber: 'ADM2022001',
    registerNumber: '731122104001',
    departmentCode: 'CSE',
    batchCode: 'CSE-22-A',
    admissionDate: '2022-08-01',
    currentSemester: '5',
    dateOfBirth: '2004-03-14',
    gender: 'female',
    tenthPercent: '92.4',
    twelfthPercent: '89.1',
    currentCgpa: '8.6',
    guardianName: 'Lakshmi Iyer',
    guardianPhone: '+919812345600',
  };

  const header = STUDENT_IMPORT_COLUMNS.join(',');
  const row = STUDENT_IMPORT_COLUMNS.map((column) => example[column] ?? '').join(',');

  return `﻿${header}\n${row}\n`;
}

export function downloadText(content: string, fileName: string, mimeType = 'text/csv'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
