// Minimal local typings for Node's built-in SQLite module. @types/node 20 predates
// node:sqlite, and we only use a handful of read-only calls, so declaring the surface
// here beats dragging a newer @types/node into the build.
declare module "node:sqlite" {
  export type Row = Record<string, unknown>;

  export class StatementSync {
    all(...params: unknown[]): Row[];
    get(...params: unknown[]): Row | undefined;
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    iterate(...params: unknown[]): IterableIterator<Row>;
  }

  export class DatabaseSync {
    constructor(
      path: string,
      options?: {
        open?: boolean;
        readOnly?: boolean;
        enableForeignKeyConstraints?: boolean;
        allowExtension?: boolean;
        timeout?: number;
      },
    );
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }
}
