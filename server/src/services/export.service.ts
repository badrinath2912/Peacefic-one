import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';

export interface ExportColumn<T> {
  key: string;
  header: string;
  width?: number;
  value: (row: T) => string | number | Date | null | undefined;
}

export type ExportFormat = 'csv' | 'xlsx';

export interface ExportResult {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

/**
 * Formula injection guard. A cell beginning `=`, `+`, `-` or `@` is executed
 * by Excel and Sheets when the file is opened, so a student whose name is
 * `=HYPERLINK(...)` becomes an attack on whoever opens the export. Prefixing
 * with an apostrophe forces the cell to be read as text.
 */
function neutralise(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function toCellValue(raw: string | number | Date | null | undefined): string | number {
  if (raw === null || raw === undefined) return '';
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === 'number') return raw;
  return neutralise(String(raw));
}

export class ExportService {
  async toCsv<T>(rows: T[], columns: ExportColumn<T>[]): Promise<ExportResult> {
    const records = rows.map((row) =>
      columns.map((column) => toCellValue(column.value(row))),
    );

    const csv = stringify([columns.map((column) => column.header), ...records], {
      quoted_string: true,
    });

    return {
      // The BOM makes Excel open UTF-8 correctly; without it Indian names with
      // diacritics render as mojibake.
      buffer: Buffer.concat([Buffer.from('﻿', 'utf8'), Buffer.from(csv, 'utf8')]),
      contentType: 'text/csv; charset=utf-8',
      extension: 'csv',
    };
  }

  async toExcel<T>(
    rows: T[],
    columns: ExportColumn<T>[],
    sheetName = 'Export',
  ): Promise<ExportResult> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Peacefic One';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? 18,
    }));

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    headerRow.alignment = { vertical: 'middle' };

    for (const row of rows) {
      sheet.addRow(
        Object.fromEntries(columns.map((column) => [column.key, toCellValue(column.value(row))])),
      );
    }

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };

    const buffer = await workbook.xlsx.writeBuffer();

    return {
      buffer: Buffer.from(buffer),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    };
  }

  async build<T>(
    format: ExportFormat,
    rows: T[],
    columns: ExportColumn<T>[],
    sheetName?: string,
  ): Promise<ExportResult> {
    return format === 'xlsx'
      ? this.toExcel(rows, columns, sheetName)
      : this.toCsv(rows, columns);
  }

  /** Safe, timestamped, and free of anything a filesystem would object to. */
  fileName(prefix: string, extension: string): string {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const safe = prefix.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    return `${safe}-${stamp}.${extension}`;
  }
}
