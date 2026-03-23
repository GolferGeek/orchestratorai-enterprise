/**
 * TestAppModule — NestJS module for E2E tests.
 *
 * Compiles the real Bridge module graph but replaces the two infrastructure
 * planes (DATABASE_SERVICE and OBSERVABILITY_SERVICE) with in-memory
 * implementations so tests run without a live Supabase instance.
 *
 * All other services are real compiled code — controllers, guards, validators,
 * rate limiters, registry, dispatch logic — so the tests exercise genuine
 * application behaviour.
 */

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DATABASE_SERVICE } from '@orchestratorai/planes/database';
import { OBSERVABILITY_SERVICE } from '@orchestratorai/planes/observability';
import { Observable, Subject } from 'rxjs';
import { randomUUID } from 'crypto';

import { HealthModule } from '../src/health/health.module';
import { BridgeDatabaseModule } from '../src/database/bridge-database.module';
import { ProtocolModule } from '../src/protocol/protocol.module';
import { InboundModule } from '../src/inbound/inbound.module';
import { RegistryModule } from '../src/registry/registry.module';
import { BridgeInvokeModule } from '../src/invoke/invoke.module';
import { SecurityModule } from '../src/security/security.module';

// ---------------------------------------------------------------------------
// In-memory QueryBuilder — implements full chainable interface
// ---------------------------------------------------------------------------

class InMemoryQueryBuilder implements PromiseLike<{ data: unknown; error: null }> {
  private _table: string = '';
  private _schema: string = '';
  private _operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private _insertData: unknown = null;
  private _updateData: unknown = null;
  private _filters: Array<{ column: string; value: unknown }> = [];
  private _limitSingle = false;
  private _limitMaybe = false;
  private _limitCount: number | null = null;
  private _orderCol: string | null = null;
  private _orderAsc = true;
  private _store: Map<string, Record<string, unknown>[]>;
  private _conflictKeys: string[] = [];

  constructor(
    store: Map<string, Record<string, unknown>[]>,
    schema: string,
    table: string,
  ) {
    this._store = store;
    this._schema = schema;
    this._table = table;
  }

  private get _key() {
    return `${this._schema}.${this._table}`;
  }

  private get _rows(): Record<string, unknown>[] {
    if (!this._store.has(this._key)) {
      this._store.set(this._key, []);
    }
    return this._store.get(this._key)!;
  }

  select(_columns?: string): this { return this; }

  insert(data: unknown): this {
    this._operation = 'insert';
    this._insertData = data;
    return this;
  }

  update(data: unknown): this {
    this._operation = 'update';
    this._updateData = data;
    return this;
  }

  upsert(data: unknown, options?: { onConflict?: string }): this {
    this._operation = 'upsert';
    this._insertData = data;
    if (options?.onConflict) {
      this._conflictKeys = options.onConflict.split(',').map((k) => k.trim());
    }
    return this;
  }

  delete(): this {
    this._operation = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this._filters.push({ column, value });
    return this;
  }

  neq(_column: string, _value: unknown): this { return this; }
  gt(_column: string, _value: unknown): this { return this; }
  gte(_column: string, _value: unknown): this { return this; }
  lt(_column: string, _value: unknown): this { return this; }
  lte(_column: string, _value: unknown): this { return this; }
  in(_column: string, _values: unknown[]): this { return this; }
  is(_column: string, _value: null | boolean): this { return this; }
  not(_column: string, _operator: string, _value: unknown): this { return this; }
  contains(_column: string, _value: unknown): this { return this; }
  overlaps(_column: string, _value: unknown[]): this { return this; }
  ilike(_column: string, _pattern: string): this { return this; }
  or(_filters: string): this { return this; }
  like(_column: string, _pattern: string): this { return this; }
  filter(_column: string, _operator: string, _value: unknown): this { return this; }
  match(_query: Record<string, unknown>): this { return this; }
  textSearch(_column: string, _query: string): this { return this; }

  order(column: string, options?: { ascending?: boolean }): this {
    this._orderCol = column;
    this._orderAsc = options?.ascending !== false;
    return this;
  }

  limit(count: number): this {
    this._limitCount = count;
    return this;
  }

  range(_from: number, _to: number): this { return this; }

  single(): this {
    this._limitSingle = true;
    return this;
  }

  maybeSingle(): this {
    this._limitMaybe = true;
    return this;
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const result = this._execute();
    return Promise.resolve(result as { data: unknown; error: null }).then(onfulfilled, onrejected);
  }

  private _execute(): { data: unknown; error: null } {
    if (this._operation === 'insert') {
      const row = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(this._insertData as Record<string, unknown>) };
      this._rows.push(row);
      if (this._limitSingle || this._limitMaybe) {
        return { data: row, error: null };
      }
      return { data: [row], error: null };
    }

    if (this._operation === 'upsert') {
      const incoming = this._insertData as Record<string, unknown>;
      if (this._conflictKeys.length > 0) {
        const existingIndex = this._rows.findIndex((r) =>
          this._conflictKeys.every((k) => r[k] === incoming[k]),
        );
        if (existingIndex >= 0) {
          this._rows[existingIndex] = { ...this._rows[existingIndex], ...incoming, updated_at: new Date().toISOString() };
          const updated = this._rows[existingIndex];
          return { data: this._limitSingle || this._limitMaybe ? updated : [updated], error: null };
        }
      }
      const row = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...incoming };
      this._rows.push(row);
      return { data: this._limitSingle || this._limitMaybe ? row : [row], error: null };
    }

    // Apply filters to get matching rows
    const filtered = this._rows.filter((row) =>
      this._filters.every(({ column, value }) => row[column] === value),
    );

    if (this._operation === 'update') {
      const updateData = this._updateData as Record<string, unknown>;
      filtered.forEach((row) => {
        Object.assign(row, updateData, { updated_at: new Date().toISOString() });
      });
      return { data: null, error: null };
    }

    if (this._operation === 'delete') {
      const filteredIds = new Set(filtered.map((r) => r['id']));
      const remaining = this._rows.filter((r) => !filteredIds.has(r['id']));
      this._store.set(this._key, remaining);
      return { data: null, error: null };
    }

    // select
    let results = [...filtered];

    if (this._orderCol) {
      const col = this._orderCol;
      const asc = this._orderAsc;
      results.sort((a, b) => {
        const av = a[col] as string | number;
        const bv = b[col] as string | number;
        return asc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
      });
    }

    if (this._limitCount !== null) {
      results = results.slice(0, this._limitCount);
    }

    if (this._limitSingle) {
      return { data: results[0] ?? null, error: null };
    }

    if (this._limitMaybe) {
      return { data: results[0] ?? null, error: null };
    }

    return { data: results, error: null };
  }
}

// ---------------------------------------------------------------------------
// In-memory DatabaseService implementation
// ---------------------------------------------------------------------------

class InMemoryDatabaseService {
  private readonly store: Map<string, Record<string, unknown>[]> = new Map();

  from(schema: string | null, table: string): InMemoryQueryBuilder {
    return new InMemoryQueryBuilder(this.store, schema ?? 'public', table);
  }

  async rpc(_functionName: string, _args?: Record<string, unknown>): Promise<{ data: null; error: null }> {
    return { data: null, error: null };
  }

  async rawQuery(_sql: string, _params?: unknown[]): Promise<{ data: null; error: null }> {
    return { data: null, error: null };
  }

  async checkConnection(): Promise<{ status: string; message: string }> {
    return { status: 'ok', message: 'In-memory database (test mode)' };
  }

  getConfig() {
    return {
      provider: 'in-memory',
      url: 'memory://',
      schemas: ['ambient', 'public'],
      clientsAvailable: { service: true, anon: false },
    };
  }
}

// ---------------------------------------------------------------------------
// In-memory ObservabilityService implementation
// ---------------------------------------------------------------------------

class InMemoryObservabilityService {
  private readonly events: unknown[] = [];
  private readonly subject = new Subject<unknown>();

  async emitInvocationEvent(_context: unknown, _event: unknown): Promise<void> {
    this.events.push({ context: _context, event: _event, ts: Date.now() });
    this.subject.next({ context: _context, event: _event, ts: Date.now() });
  }

  async recordLLMUsage(_context: unknown, _usage: unknown): Promise<void> {}

  async registerStream(_context: unknown, _correlation: unknown): Promise<void> {}

  async emitStreamEvent(_context: unknown, _requestId: unknown, _eventType: string, _data?: unknown): Promise<void> {}

  getRecentEvents(limit = 100): unknown[] {
    return this.events.slice(-limit);
  }

  getEventStream(): Observable<unknown> {
    return this.subject.asObservable();
  }

  async getHistoricalEvents(_since: number, _limit?: number): Promise<unknown[]> {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Global module providing in-memory implementations
// ---------------------------------------------------------------------------

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_SERVICE,
      useClass: InMemoryDatabaseService,
    },
    {
      provide: OBSERVABILITY_SERVICE,
      useClass: InMemoryObservabilityService,
    },
  ],
  exports: [DATABASE_SERVICE, OBSERVABILITY_SERVICE],
})
class InfrastructureMockModule {}

// ---------------------------------------------------------------------------
// Test application module
// ---------------------------------------------------------------------------

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    InfrastructureMockModule,
    BridgeDatabaseModule,
    ProtocolModule,
    HealthModule,
    SecurityModule,
    RegistryModule,
    InboundModule,
    BridgeInvokeModule,
  ],
})
export class TestAppModule {}
