import "server-only";

import { readSheet } from "read-excel-file/node";

import { TABULAR_MAX_ROWS } from "./config";
import { unescapeCell } from "./csv";
import { checkZip, type ZipCheck } from "./zipguard";

/**
 * Excel (.xlsx) bank files (docs/question-bank-plan.md §B8.8): the first sheet, read as text cells
 * with `read-excel-file`, only after the zip guard passed. No formulas are evaluated (the library
 * reads stored values); numbers are written back as plain decimal text.
 */

export type XlsxRead =
  | { ok: true; rows: string[][] }
  | { ok: false; reason: Exclude<ZipCheck, { ok: true }>["reason"] | "xlsx_unreadable" | "xlsx_too_many_rows" };

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return unescapeCell(String(value));
}

export async function readXlsxRows(bytes: Uint8Array, maxRows: number = TABULAR_MAX_ROWS + 1): Promise<XlsxRead> {
  const zip = checkZip(bytes);
  if (!zip.ok) return { ok: false, reason: zip.reason };
  let data: unknown[][];
  try {
    data = (await readSheet(Buffer.from(bytes))) as unknown[][];
  } catch {
    return { ok: false, reason: "xlsx_unreadable" };
  }
  const rows = data
    .map((row) => row.map(cellText))
    .filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length > maxRows) return { ok: false, reason: "xlsx_too_many_rows" };
  return { ok: true, rows };
}
