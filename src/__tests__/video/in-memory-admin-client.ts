/**
 * videos 系テスト用の最小インメモリ Supabase admin クライアント（テストヘルパー、テストではない）。
 *
 * Server Action の内部ロジック（Zod / 1 本目判定 / 表示順 / 監査ログ）を実際に動かすため、
 * `from(table).select().eq().order().limit().maybeSingle()` /
 * `insert().select().single()` / `update().eq().select()` / `delete().eq().select()` /
 * `select(cols, { count: "exact", head: true })` を素朴に再現する。
 * 戻り値は常に `{ data, error }`（または count 付き）の形状にそろえる。
 */

export type Row = Record<string, unknown>;

export interface InMemoryDb {
  tables: Record<string, Row[]>;
  /** テーブルごとの強制エラー（例: { videos: { insert: { message } } }） */
  failures: Record<string, Partial<Record<"select" | "insert" | "update" | "delete", { message: string }>>>;
}

type Op = "select" | "insert" | "update" | "delete";

let idCounter = 0;
export function nextId(): string {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
}

export function createInMemoryDb(
  tables: Record<string, Row[]> = {},
): InMemoryDb {
  return { tables, failures: {} };
}

class QueryBuilder implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private filters: Array<[string, unknown]> = [];
  private orders: Array<[string, boolean]> = [];
  private limitN: number | null = null;
  private countMode = false;
  private headMode = false;
  private op: Op = "select";
  private payload: Row | null = null;
  private wantsSelect = false;

  constructor(
    private db: InMemoryDb,
    private table: string,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.countMode = opts?.count === "exact";
      this.headMode = opts?.head === true;
    } else {
      this.wantsSelect = true;
    }
    return this;
  }
  insert(payload: Row) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push([col, value]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push([col, opts?.ascending !== false]);
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  async maybeSingle() {
    const r = await this.run();
    if (r.error) return { data: null, error: r.error };
    const rows = r.data as Row[];
    return { data: rows[0] ?? null, error: null };
  }
  async single() {
    const r = await this.run();
    if (r.error) return { data: null, error: r.error };
    const rows = r.data as Row[];
    if (rows.length !== 1) {
      return { data: null, error: { message: "single() expected 1 row" } };
    }
    return { data: rows[0], error: null };
  }
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private matching(): Row[] {
    const rows = this.db.tables[this.table] ?? [];
    return rows.filter((r) => this.filters.every(([c, v]) => r[c] === v));
  }

  private async run(): Promise<{ data: unknown; error: unknown; count?: number | null }> {
    const failure = this.db.failures[this.table]?.[this.op];
    if (failure) return { data: null, error: failure };
    this.db.tables[this.table] ??= [];
    switch (this.op) {
      case "select": {
        let rows = this.matching();
        for (const [col, asc] of [...this.orders].reverse()) {
          rows = [...rows].sort((a, b) => {
            const x = a[col] as number | string;
            const y = b[col] as number | string;
            if (x === y) return 0;
            return (x < y ? -1 : 1) * (asc ? 1 : -1);
          });
        }
        if (this.limitN !== null) rows = rows.slice(0, this.limitN);
        // 呼び出し側が後続の update で元の行を書き換えても、取得済みの値が変わらないようコピーを返す
        const copies = rows.map((r) => ({ ...r }));
        if (this.countMode) {
          return { data: this.headMode ? null : copies, error: null, count: copies.length };
        }
        return { data: copies, error: null };
      }
      case "insert": {
        const row: Row = { id: nextId(), created_at: new Date().toISOString(), ...this.payload };
        this.db.tables[this.table].push(row);
        return { data: this.wantsSelect ? [{ ...row }] : null, error: null };
      }
      case "update": {
        const rows = this.matching();
        for (const r of rows) Object.assign(r, this.payload);
        return { data: this.wantsSelect ? rows : null, error: null };
      }
      case "delete": {
        const rows = this.matching();
        this.db.tables[this.table] = this.db.tables[this.table].filter(
          (r) => !rows.includes(r),
        );
        return { data: this.wantsSelect ? rows : null, error: null };
      }
    }
  }
}

export function createInMemoryAdminClient(db: InMemoryDb) {
  return {
    from: (table: string) => new QueryBuilder(db, table),
  };
}
