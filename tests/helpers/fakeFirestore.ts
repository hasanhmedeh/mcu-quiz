import { randomUUID } from 'node:crypto';

/**
 * A small in-memory stand-in for Firestore.
 *
 * It exists to make the *concurrency* rules testable rather than assumed, so
 * it models the one behaviour that matters here: optimistic concurrency. Every
 * document carries a version; a transaction records the versions it read and
 * refuses to commit if any of them moved, at which point it re-runs — exactly
 * the contention-and-retry loop real Firestore performs.
 */

export type DocData = Record<string, unknown>;

interface StoredDoc {
  data: DocData;
  version: number;
}

/** Mirrors `FieldValue.increment` closely enough for the writes we perform. */
interface IncrementOp {
  readonly __fieldOp: 'increment';
  readonly by: number;
}

export const FakeFieldValue = {
  increment(by: number): IncrementOp {
    return { __fieldOp: 'increment', by };
  },
};

function isIncrement(value: unknown): value is IncrementOp {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as IncrementOp).__fieldOp === 'increment'
  );
}

export interface FakeDocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  data(): DocData | undefined;
}

export class FakeDocumentReference {
  constructor(
    readonly db: FakeFirestore,
    readonly collectionPath: string,
    readonly id: string,
  ) {}

  get path(): string {
    return `${this.collectionPath}/${this.id}`;
  }

  async get(): Promise<FakeDocumentSnapshot> {
    // Await a real tick so concurrent callers interleave the way they would
    // against a network round trip.
    await Promise.resolve();
    return this.db.snapshot(this.path);
  }

  async delete(): Promise<void> {
    await Promise.resolve();
    this.db.store.delete(this.path);
  }
}

type FilterOp = '==' | '<' | '<=' | '>' | '>=';

export interface FakeQuerySnapshot {
  readonly docs: ReadonlyArray<{ readonly id: string; data(): DocData }>;
  readonly size: number;
  readonly empty: boolean;
}

export class FakeQuery {
  constructor(
    private readonly db: FakeFirestore,
    private readonly collectionPath: string,
    private readonly orderByField: string | null = null,
    private readonly direction: 'asc' | 'desc' = 'asc',
    private readonly limitCount: number | null = null,
    private readonly filters: ReadonlyArray<{ field: string; op: FilterOp; value: unknown }> = [],
  ) {}

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): FakeQuery {
    return new FakeQuery(this.db, this.collectionPath, field, direction, this.limitCount, this.filters);
  }

  limit(count: number): FakeQuery {
    return new FakeQuery(this.db, this.collectionPath, this.orderByField, this.direction, count, this.filters);
  }

  /** Equality and range filters — the operators this project queries with. */
  where(field: string, op: FilterOp, value: unknown): FakeQuery {
    if (!['==', '<', '<=', '>', '>='].includes(op)) {
      throw new Error(`Fake Firestore: unsupported operator ${op}`);
    }
    return new FakeQuery(this.db, this.collectionPath, this.orderByField, this.direction, this.limitCount, [
      ...this.filters,
      { field, op, value },
    ]);
  }

  /** A projection; the fake returns whole documents, which callers must tolerate anyway. */
  select(): FakeQuery {
    return this;
  }

  async get(): Promise<FakeQuerySnapshot> {
    await Promise.resolve();

    const prefix = `${this.collectionPath}/`;
    const entries = [...this.db.store.entries()]
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, stored]) => ({
        id: path.slice(prefix.length),
        data: () => ({ ...stored.data }),
        raw: stored.data,
      }))
      .filter((entry) =>
        this.filters.every(({ field, op, value }) => {
          const actual = entry.raw[field] as string | number;
          const expected = value as string | number;
          switch (op) {
            case '==':
              return actual === expected;
            case '<':
              return actual < expected;
            case '<=':
              return actual <= expected;
            case '>':
              return actual > expected;
            default:
              return actual >= expected;
          }
        }),
      );

    const field = this.orderByField;
    if (field) {
      entries.sort((a, b) => {
        const left = String(a.raw[field] ?? '');
        const right = String(b.raw[field] ?? '');
        const comparison = left < right ? -1 : left > right ? 1 : 0;
        return this.direction === 'desc' ? -comparison : comparison;
      });
    }

    const docs = this.limitCount === null ? entries : entries.slice(0, this.limitCount);
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

export class FakeCollectionReference extends FakeQuery {
  constructor(
    private readonly database: FakeFirestore,
    private readonly name: string,
  ) {
    super(database, name);
  }

  /** Converters are a typing device in this project; the fake ignores them. */
  withConverter(): FakeCollectionReference {
    return this;
  }

  doc(id?: string): FakeDocumentReference {
    return new FakeDocumentReference(this.database, this.name, id ?? randomUUID().replace(/-/g, ''));
  }
}

type PendingWrite =
  | { kind: 'set'; path: string; data: DocData }
  | { kind: 'update'; path: string; data: DocData }
  | { kind: 'delete'; path: string };

export class FakeTransaction {
  private readonly reads = new Map<string, number>();
  private readonly writes: PendingWrite[] = [];

  constructor(private readonly db: FakeFirestore) {}

  async get(ref: FakeDocumentReference): Promise<FakeDocumentSnapshot> {
    await Promise.resolve();
    const stored = this.db.store.get(ref.path);
    // Version 0 records "was absent when read", so a doc created by a racing
    // transaction still counts as a conflict.
    this.reads.set(ref.path, stored?.version ?? 0);
    return this.db.snapshot(ref.path);
  }

  set(ref: FakeDocumentReference, data: DocData): void {
    this.writes.push({ kind: 'set', path: ref.path, data: { ...data } });
  }

  update(ref: FakeDocumentReference, data: DocData): void {
    this.writes.push({ kind: 'update', path: ref.path, data: { ...data } });
  }

  delete(ref: FakeDocumentReference): void {
    this.writes.push({ kind: 'delete', path: ref.path });
  }

  /** Returns false when a read moved underneath us and the body must re-run. */
  commit(): boolean {
    for (const [path, version] of this.reads) {
      const current = this.db.store.get(path)?.version ?? 0;
      if (current !== version) return false;
    }

    for (const write of this.writes) {
      const existing = this.db.store.get(write.path);

      if (write.kind === 'delete') {
        this.db.store.delete(write.path);
        continue;
      }

      if (write.kind === 'set') {
        this.db.store.set(write.path, {
          data: { ...write.data },
          version: (existing?.version ?? 0) + 1,
        });
        continue;
      }

      const merged: DocData = { ...(existing?.data ?? {}) };
      for (const [key, value] of Object.entries(write.data)) {
        merged[key] = isIncrement(value)
          ? (typeof merged[key] === 'number' ? (merged[key] as number) : 0) + value.by
          : value;
      }

      this.db.store.set(write.path, { data: merged, version: (existing?.version ?? 0) + 1 });
    }

    return true;
  }
}

export class FakeFirestore {
  readonly store = new Map<string, StoredDoc>();
  /** Counts transaction *bodies* executed, so retries are observable in tests. */
  transactionRuns = 0;

  settings(): void {
    // The real driver takes options here; nothing to do in the fake.
  }

  collection(name: string): FakeCollectionReference {
    return new FakeCollectionReference(this, name);
  }

  snapshot(path: string): FakeDocumentSnapshot {
    const stored = this.store.get(path);
    const id = path.slice(path.lastIndexOf('/') + 1);
    return {
      id,
      exists: stored !== undefined,
      data: () => (stored ? { ...stored.data } : undefined),
    };
  }

  async runTransaction<T>(body: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      this.transactionRuns += 1;
      const transaction = new FakeTransaction(this);
      const result = await body(transaction);
      if (transaction.commit()) return result;
    }
    throw new Error('Fake Firestore: transaction exceeded its retry budget');
  }

  /** Convenience for arranging state directly in a test. */
  seed(path: string, data: DocData): void {
    const existing = this.store.get(path);
    this.store.set(path, { data: { ...data }, version: (existing?.version ?? 0) + 1 });
  }

  read(path: string): DocData | undefined {
    const stored = this.store.get(path);
    return stored ? { ...stored.data } : undefined;
  }

  pathsIn(collection: string): string[] {
    return [...this.store.keys()].filter((path) => path.startsWith(`${collection}/`));
  }

  docsIn(collection: string): DocData[] {
    return this.pathsIn(collection)
      .map((path) => this.read(path))
      .filter((data): data is DocData => data !== undefined);
  }
}

/**
 * A single instance shared between the `@/lib/firebase/admin` mock factory and
 * the test body, since a `vi.mock` factory cannot close over test-local state.
 */
let current = new FakeFirestore();

export function fakeDb(): FakeFirestore {
  return current;
}

export function resetFakeDb(): FakeFirestore {
  current = new FakeFirestore();
  return current;
}
