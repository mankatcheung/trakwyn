import { getTableColumns, getTableName, is, sql, type Column } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import type { DrizzleDb, DrizzleTransaction } from './createDb.js';
import * as schema from './schema.js';

/**
 * One-off copy of every row from the pre-JEF-342 SQLite (Turso) database into
 * the Postgres schema. Driven by `src/copyFromTurso.ts`; delete both once
 * Turso has been retired.
 *
 * The source is read through `SourceReader` rather than a libSQL client so
 * this module stays testable with plain objects, and so the SQLite value
 * encoding it undoes is spelled out in one place: timestamps were epoch
 * milliseconds and booleans were 0/1, both stored as `integer`.
 */
export interface SourceReader {
  /** Every row of `table`, keyed by SQL column name, values as SQLite stores them. */
  readTable(table: string): Promise<Record<string, unknown>[]>;
}

export interface TableReport {
  table: string;
  sourceRows: number;
  targetRows: number;
}

type Row = Record<string, unknown>;

const INSERT_CHUNK_ROWS = 200;

interface TablePlan {
  table: PgTable;
  name: string;
  /** SQL column name → JS property name, for building drizzle insert values. */
  keyByColumn: Map<string, string>;
  columnsByName: Map<string, Column>;
  /**
   * Nullable foreign keys pointing at a table inserted later (or at this one).
   * Inserted as null, then set once every table exists — how the mutual
   * Document ↔ DocumentDraft link is copied without deferrable constraints.
   */
  deferredColumns: string[];
}

function allTables(): PgTable[] {
  return (Object.values(schema) as unknown[]).filter((value): value is PgTable =>
    is(value, PgTable),
  );
}

/** Tables ordered so every NOT NULL foreign key points at an earlier table. */
function insertionOrder(tables: PgTable[]): PgTable[] {
  const byName = new Map(tables.map((t) => [getTableName(t), t]));
  const placed = new Set<string>();
  const ordered: PgTable[] = [];

  const requiredParents = (table: PgTable): string[] =>
    getTableConfig(table)
      .foreignKeys.filter((fk) => fk.reference().columns.every((c) => c.notNull))
      .map((fk) => getTableName(fk.reference().foreignTable))
      .filter((parent) => parent !== getTableName(table));

  while (ordered.length < tables.length) {
    const next = [...byName.values()].find(
      (t) => !placed.has(getTableName(t)) && requiredParents(t).every((p) => placed.has(p)),
    );
    if (!next) throw new Error('Cannot order tables: a cycle of NOT NULL foreign keys');
    placed.add(getTableName(next));
    ordered.push(next);
  }
  return ordered;
}

function planTables(): TablePlan[] {
  const ordered = insertionOrder(allTables());
  const position = new Map(ordered.map((t, i) => [getTableName(t), i]));

  return ordered.map((table, index) => {
    const name = getTableName(table);
    const columns = Object.entries(getTableColumns(table));
    const deferredColumns = getTableConfig(table)
      .foreignKeys.map((fk) => fk.reference())
      .filter((ref) => (position.get(getTableName(ref.foreignTable)) ?? 0) >= index)
      .flatMap((ref) => ref.columns.map((c) => c.name));

    return {
      table,
      name,
      keyByColumn: new Map(columns.map(([key, column]) => [column.name, key])),
      columnsByName: new Map(columns.map(([, column]) => [column.name, column])),
      deferredColumns,
    };
  });
}

/** Undoes SQLite's storage of a value for the Postgres column it now lands in. */
export function convertValue(column: Column, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (column.columnType) {
    case 'PgTimestamp':
      return new Date(Number(value));
    case 'PgBoolean':
      return Number(value) !== 0;
    case 'PgInteger':
    case 'PgBigInt53':
      return Number(value);
    default:
      return value;
  }
}

function toInsertValues(plan: TablePlan, row: Row): Row {
  const values: Row = {};
  for (const [columnName, raw] of Object.entries(row)) {
    const key = plan.keyByColumn.get(columnName);
    const column = plan.columnsByName.get(columnName);
    if (!key || !column) {
      throw new Error(
        `${plan.name}.${columnName} exists in the source but not in the Postgres schema`,
      );
    }
    values[key] = plan.deferredColumns.includes(columnName) ? null : convertValue(column, raw);
  }
  return values;
}

async function countRows(tx: DrizzleTransaction, table: string): Promise<number> {
  const result = (await tx.execute(
    sql`SELECT count(*) AS n FROM ${sql.identifier(table)}`,
  )) as unknown as { rows: { n: number }[] };
  return Number(result.rows[0].n);
}

async function assertTargetEmpty(tx: DrizzleTransaction, plans: TablePlan[]): Promise<void> {
  for (const plan of plans) {
    if ((await countRows(tx, plan.name)) > 0) {
      throw new Error(
        `Target table "${plan.name}" already has rows. Copy into a freshly migrated, empty database.`,
      );
    }
  }
}

async function insertRows(tx: DrizzleTransaction, plan: TablePlan, rows: Row[]): Promise<void> {
  for (let start = 0; start < rows.length; start += INSERT_CHUNK_ROWS) {
    const chunk = rows
      .slice(start, start + INSERT_CHUNK_ROWS)
      .map((row) => toInsertValues(plan, row));
    await tx.insert(plan.table).values(chunk);
  }
}

/** Sets the deferred foreign keys. Raw SQL, so `$onUpdate` cannot rewrite `updatedAt`. */
async function fillDeferredColumns(
  tx: DrizzleTransaction,
  plan: TablePlan,
  rows: Row[],
): Promise<void> {
  for (const columnName of plan.deferredColumns) {
    for (const row of rows) {
      if (row[columnName] === null || row[columnName] === undefined) continue;
      await tx.execute(
        sql`UPDATE ${sql.identifier(plan.name)} SET ${sql.identifier(columnName)} = ${row[columnName]} WHERE "id" = ${row.id}`,
      );
    }
  }
}

/**
 * Copies every table in one transaction: any failure, including a row-count
 * mismatch found at the end, leaves the target exactly as empty as it began.
 */
export async function copyToPostgres(
  source: SourceReader,
  target: DrizzleDb,
): Promise<TableReport[]> {
  const plans = planTables();

  return target.transaction(async (tx) => {
    await assertTargetEmpty(tx, plans);

    const sourceRows = new Map<string, Row[]>();
    for (const plan of plans) {
      const rows = await source.readTable(plan.name);
      sourceRows.set(plan.name, rows);
      await insertRows(tx, plan, rows);
    }
    for (const plan of plans) {
      await fillDeferredColumns(tx, plan, sourceRows.get(plan.name) ?? []);
    }

    const report: TableReport[] = [];
    for (const plan of plans) {
      const expected = sourceRows.get(plan.name)?.length ?? 0;
      const actual = await countRows(tx, plan.name);
      report.push({ table: plan.name, sourceRows: expected, targetRows: actual });
    }
    const mismatched = report.filter((r) => r.sourceRows !== r.targetRows);
    if (mismatched.length > 0) {
      throw new Error(`Row counts differ, rolled back: ${JSON.stringify(mismatched)}`);
    }
    return report;
  });
}
