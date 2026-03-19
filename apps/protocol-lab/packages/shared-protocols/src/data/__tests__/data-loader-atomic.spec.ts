import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DataLoaderService } from '../data-loader.service';
import { ReconciliationService } from '../reconciliation.service';
import { DataRecord } from '../types';

interface TestRecord extends DataRecord {
  id: string;
  name: string;
  value: number;
}

describe('DataLoaderService — atomic writes', () => {
  let tmpBase: string;
  let loader: DataLoaderService;
  const org = 'atomic-org';
  const filename = 'records';

  const seed: TestRecord[] = [
    { id: 'a1', name: 'Alpha', value: 1 },
    { id: 'a2', name: 'Beta', value: 2 },
  ];

  function resetFile(records: TestRecord[] = seed) {
    writeFileSync(join(tmpBase, org, `${filename}.json`), JSON.stringify(records), 'utf-8');
  }

  beforeAll(() => {
    tmpBase = join(tmpdir(), `atomic-spec-${Date.now()}`);
    mkdirSync(join(tmpBase, org), { recursive: true });
    resetFile();
  });

  beforeEach(() => {
    resetFile();
    loader = new DataLoaderService({ baseDir: tmpBase, watch: false });
  });

  afterEach(() => {
    loader.destroy();
  });

  afterAll(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  describe('atomic write strategy', () => {
    it('single write followed by read returns identical data', () => {
      loader.loadFile<TestRecord>(org, filename);
      loader.updateRecord<TestRecord>(org, filename, 'a1', { value: 999 });

      // Re-instantiate to bypass in-memory cache and read from disk
      const fresh = new DataLoaderService({ baseDir: tmpBase, watch: false });
      const result = fresh.loadFile<TestRecord>(org, filename);
      fresh.destroy();

      const updated = result.records.find(r => r.id === 'a1');
      expect(updated?.value).toBe(999);
    });

    it('uses temp-file + rename strategy (no leftover .tmp files after success)', () => {
      loader.loadFile<TestRecord>(org, filename);
      loader.appendRecord<TestRecord>(org, filename, { id: 'a3', name: 'Gamma', value: 3 });

      const tmpFile = join(tmpBase, org, `${filename}.json.tmp`);
      expect(existsSync(tmpFile)).toBe(false);
    });

    it('partial write failure does not corrupt existing file', () => {
      // Record the content before any write
      const before = readFileSync(join(tmpBase, org, `${filename}.json`), 'utf-8');

      // Create a loader that has NO cached data — saveFileAtomic should throw
      const freshLoader = new DataLoaderService({ baseDir: tmpBase, watch: false });
      // Do NOT call loadFile — cache is empty
      expect(() => freshLoader.saveFileAtomic(org, filename)).toThrow(
        /No cached data for/,
      );
      freshLoader.destroy();

      // Original file untouched
      const after = readFileSync(join(tmpBase, org, `${filename}.json`), 'utf-8');
      expect(after).toBe(before);
    });
  });

  describe('record validation', () => {
    it('accepts a valid record with an id field', () => {
      const record: TestRecord = { id: 'v1', name: 'Valid', value: 42 };
      expect(() => loader.appendRecord<TestRecord>(org, filename, record)).not.toThrow();
    });

    it('rejects a record missing the id field', () => {
      const bad = { name: 'NoId', value: 0 } as unknown as TestRecord;
      expect(() => loader.appendRecord<TestRecord>(org, filename, bad)).toThrow(
        /missing required string field "id"/,
      );
    });

    it('rejects a record with an empty id string', () => {
      const bad: TestRecord = { id: '   ', name: 'EmptyId', value: 0 };
      expect(() => loader.appendRecord<TestRecord>(org, filename, bad)).toThrow(
        /missing required string field "id"/,
      );
    });

    it('rejects a null value instead of a record object', () => {
      expect(() => loader.appendRecord<TestRecord>(org, filename, null as unknown as TestRecord)).toThrow(
        /must be a plain object/,
      );
    });

    it('rejects an array instead of a record object', () => {
      expect(() => loader.appendRecord<TestRecord>(org, filename, [] as unknown as TestRecord)).toThrow(
        /must be a plain object/,
      );
    });
  });

  describe('appendRecord()', () => {
    it('adds a record to an existing file and persists to disk', () => {
      const newRecord: TestRecord = { id: 'new1', name: 'New', value: 100 };
      loader.appendRecord<TestRecord>(org, filename, newRecord);

      const fresh = new DataLoaderService({ baseDir: tmpBase, watch: false });
      const result = fresh.loadFile<TestRecord>(org, filename);
      fresh.destroy();

      expect(result.records.find(r => r.id === 'new1')).toBeDefined();
      expect(result.records).toHaveLength(seed.length + 1);
    });

    it('returns the appended record', () => {
      const newRecord: TestRecord = { id: 'ret1', name: 'Returned', value: 77 };
      const returned = loader.appendRecord<TestRecord>(org, filename, newRecord);
      expect(returned).toEqual(newRecord);
    });
  });

  describe('updateRecord()', () => {
    it('updates a specific record by id and persists to disk', () => {
      loader.updateRecord<TestRecord>(org, filename, 'a2', { name: 'Beta Updated', value: 200 });

      const fresh = new DataLoaderService({ baseDir: tmpBase, watch: false });
      const result = fresh.loadFile<TestRecord>(org, filename);
      fresh.destroy();

      const updated = result.records.find(r => r.id === 'a2');
      expect(updated?.name).toBe('Beta Updated');
      expect(updated?.value).toBe(200);
    });

    it('throws when the id does not exist', () => {
      expect(() =>
        loader.updateRecord<TestRecord>(org, filename, 'nonexistent', { value: 1 }),
      ).toThrow(/Record not found/);
    });

    it('does not affect other records', () => {
      loader.updateRecord<TestRecord>(org, filename, 'a1', { value: 555 });
      const r2 = loader.getById<TestRecord>(org, filename, 'a2');
      expect(r2?.value).toBe(2);
    });
  });

  describe('deleteRecord()', () => {
    it('removes a record by id and persists to disk', () => {
      loader.deleteRecord(org, filename, 'a1');

      const fresh = new DataLoaderService({ baseDir: tmpBase, watch: false });
      const result = fresh.loadFile<TestRecord>(org, filename);
      fresh.destroy();

      expect(result.records.find(r => r.id === 'a1')).toBeUndefined();
      expect(result.records).toHaveLength(seed.length - 1);
    });

    it('returns true when the record is found and deleted', () => {
      const result = loader.deleteRecord(org, filename, 'a2');
      expect(result).toBe(true);
    });

    it('returns false when the id does not exist', () => {
      const result = loader.deleteRecord(org, filename, 'no-such-id');
      expect(result).toBe(false);
    });
  });
});

describe('ReconciliationService', () => {
  let tmpBase: string;
  let loader: DataLoaderService;
  let svc: ReconciliationService;

  const company = 'test-company';
  const refOrg = 'ref-org';
  const refFile = 'source-records';

  const sourceRecords: TestRecord[] = [
    { id: 'src-1', name: 'Source One', value: 10 },
    { id: 'src-2', name: 'Source Two', value: 20 },
  ];

  function writeTransactions(records: object[]) {
    writeFileSync(
      join(tmpBase, company, 'transactions.json'),
      JSON.stringify(records),
      'utf-8',
    );
  }

  beforeAll(() => {
    tmpBase = join(tmpdir(), `reconcile-spec-${Date.now()}`);
    mkdirSync(join(tmpBase, company), { recursive: true });
    mkdirSync(join(tmpBase, refOrg), { recursive: true });

    writeFileSync(
      join(tmpBase, refOrg, `${refFile}.json`),
      JSON.stringify(sourceRecords),
      'utf-8',
    );
  });

  beforeEach(() => {
    loader = new DataLoaderService({ baseDir: tmpBase, watch: false });
    svc = new ReconciliationService(loader);
  });

  afterEach(() => {
    loader.destroy();
  });

  afterAll(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('returns consistent=true when all referenced records exist', () => {
    writeTransactions([
      {
        id: 'txn-001',
        timestamp: new Date().toISOString(),
        messageId: 'msg-1',
        type: 'purchase-order',
        sourceAgent: 'a',
        targetAgent: 'b',
        method: 'po.submit',
        amount: null,
        currency: null,
        paymentProvider: null,
        paymentStatus: null,
        transactionHash: null,
        status: 'success',
        summary: 'test',
        sourceData: { file: `${refOrg}/${refFile}`, recordId: 'src-1', recordType: 'TestRecord' },
      },
      {
        id: 'txn-002',
        timestamp: new Date().toISOString(),
        messageId: 'msg-2',
        type: 'purchase-order',
        sourceAgent: 'a',
        targetAgent: 'b',
        method: 'po.submit',
        amount: null,
        currency: null,
        paymentProvider: null,
        paymentStatus: null,
        transactionHash: null,
        status: 'success',
        summary: 'test',
        sourceData: { file: `${refOrg}/${refFile}`, recordId: 'src-2', recordType: 'TestRecord' },
      },
    ]);

    const report = svc.reconcile(company);

    expect(report.consistent).toBe(true);
    expect(report.total).toBe(2);
    expect(report.matched).toBe(2);
    expect(report.mismatched).toBe(0);
    expect(report.missing).toBe(0);
  });

  it('returns consistent=false and flags missing record when referenced id does not exist', () => {
    writeTransactions([
      {
        id: 'txn-003',
        timestamp: new Date().toISOString(),
        messageId: 'msg-3',
        type: 'purchase-order',
        sourceAgent: 'a',
        targetAgent: 'b',
        method: 'po.submit',
        amount: null,
        currency: null,
        paymentProvider: null,
        paymentStatus: null,
        transactionHash: null,
        status: 'success',
        summary: 'test',
        sourceData: { file: `${refOrg}/${refFile}`, recordId: 'does-not-exist', recordType: 'TestRecord' },
      },
    ]);

    const report = svc.reconcile(company);

    expect(report.consistent).toBe(false);
    expect(report.missing).toBe(1);
    expect(report.matched).toBe(0);
    expect(report.details[0].status).toBe('missing');
    expect(report.details[0].message).toMatch(/does-not-exist/);
  });

  it('returns consistent=false and flags missing when referenced file does not exist', () => {
    writeTransactions([
      {
        id: 'txn-004',
        timestamp: new Date().toISOString(),
        messageId: 'msg-4',
        type: 'purchase-order',
        sourceAgent: 'a',
        targetAgent: 'b',
        method: 'po.submit',
        amount: null,
        currency: null,
        paymentProvider: null,
        paymentStatus: null,
        transactionHash: null,
        status: 'success',
        summary: 'test',
        sourceData: { file: `${refOrg}/nonexistent-file`, recordId: 'src-1', recordType: 'TestRecord' },
      },
    ]);

    const report = svc.reconcile(company);

    expect(report.consistent).toBe(false);
    expect(report.missing).toBe(1);
    expect(report.details[0].status).toBe('missing');
  });

  it('returns consistent=false and flags mismatched when sourceData.file format is invalid', () => {
    writeTransactions([
      {
        id: 'txn-005',
        timestamp: new Date().toISOString(),
        messageId: 'msg-5',
        type: 'purchase-order',
        sourceAgent: 'a',
        targetAgent: 'b',
        method: 'po.submit',
        amount: null,
        currency: null,
        paymentProvider: null,
        paymentStatus: null,
        transactionHash: null,
        status: 'success',
        summary: 'test',
        sourceData: { file: 'bad-format-no-slash', recordId: 'src-1', recordType: 'TestRecord' },
      },
    ]);

    const report = svc.reconcile(company);

    expect(report.consistent).toBe(false);
    expect(report.mismatched).toBe(1);
    expect(report.details[0].status).toBe('mismatched');
    expect(report.details[0].message).toMatch(/unexpected format/);
  });

  it('skips transactions without a sourceData reference', () => {
    writeTransactions([
      {
        id: 'txn-006',
        timestamp: new Date().toISOString(),
        messageId: 'msg-6',
        type: 'onboarding',
        sourceAgent: 'a',
        targetAgent: 'b',
        method: 'onboard',
        amount: null,
        currency: null,
        paymentProvider: null,
        paymentStatus: null,
        transactionHash: null,
        status: 'success',
        summary: 'no source data',
        sourceData: null,
      },
    ]);

    const report = svc.reconcile(company);

    expect(report.total).toBe(0);
    expect(report.consistent).toBe(true);
    expect(report.details).toHaveLength(0);
  });

  it('includes company and reconciledAt in the report', () => {
    writeTransactions([]);
    const report = svc.reconcile(company);
    expect(report.company).toBe(company);
    expect(report.reconciledAt).toBeTruthy();
  });
});
