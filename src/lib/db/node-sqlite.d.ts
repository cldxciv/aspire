/**
 * Minimal type declarations for Node's built-in `node:sqlite` (Node >= 22.13; this
 * project runs on Node 25). The repo pins `@types/node@20`, which predates the module.
 * Only the subset used by `src/lib/db/**` is declared.
 *
 * If `@types/node` is upgraded to >= 22.13 it ships these types: delete this file then
 * (two declarations of `DatabaseSync` would conflict).
 */
declare module "node:sqlite" {
  export type SQLInputValue = null | number | bigint | string | Uint8Array;
  export type SQLOutputValue = null | number | bigint | string | Uint8Array;

  export interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    enableForeignKeyConstraints?: boolean;
    enableDoubleQuotedStringLiterals?: boolean;
    allowExtension?: boolean;
    /** Busy timeout in milliseconds. */
    timeout?: number;
  }

  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    private constructor();
    all(...anonymousParameters: SQLInputValue[]): Record<string, SQLOutputValue>[];
    get(...anonymousParameters: SQLInputValue[]): Record<string, SQLOutputValue> | undefined;
    run(...anonymousParameters: SQLInputValue[]): StatementResultingChanges;
    readonly sourceSQL: string;
  }

  export class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions);
    readonly isOpen: boolean;
    readonly isTransaction: boolean;
    open(): void;
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
