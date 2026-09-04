declare module "better-sqlite3" {
  interface Statement {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): this;
    close(): void;
    pragma(pragma: string, options?: unknown): unknown;
    readonly open: boolean;
  }

  namespace Database {
    type Database = import("better-sqlite3").Database;
  }

  export default Database;
}
