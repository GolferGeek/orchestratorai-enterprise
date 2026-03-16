import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DataLoaderService } from './data-loader.service';
import { DataRecord } from './types';

interface TestRecord extends DataRecord {
  id: string;
  name: string;
  value: number;
}

describe('DataLoaderService', () => {
  let tmpBase: string;
  let loader: DataLoaderService;

  const org1 = 'org-one';
  const org2 = 'org-two';
  const filename = 'test-records';

  const sampleRecords: TestRecord[] = [
    { id: 'r1', name: 'Alpha', value: 10 },
    { id: 'r2', name: 'Beta', value: 20 },
    { id: 'r3', name: 'Gamma', value: 30 },
  ];

  beforeAll(() => {
    tmpBase = join(tmpdir(), `data-loader-spec-${Date.now()}`);

    // Create org directories and test files
    mkdirSync(join(tmpBase, org1), { recursive: true });
    mkdirSync(join(tmpBase, org2), { recursive: true });

    // Array format JSON
    writeFileSync(
      join(tmpBase, org1, `${filename}.json`),
      JSON.stringify(sampleRecords),
      'utf-8',
    );

    // Object-with-records format JSON
    writeFileSync(
      join(tmpBase, org2, 'wrapped-records.json'),
      JSON.stringify({ records: sampleRecords }),
      'utf-8',
    );

    // A second file in org1 for listFiles test
    writeFileSync(
      join(tmpBase, org1, 'other-file.json'),
      JSON.stringify([{ id: 'x1', name: 'Extra', value: 99 }]),
      'utf-8',
    );
  });

  beforeEach(() => {
    loader = new DataLoaderService({ baseDir: tmpBase, watch: false });
  });

  afterEach(() => {
    loader.destroy();
  });

  afterAll(() => {
    rmSync(tmpBase, { recursive: true, force: true });
  });

  describe('loadFile()', () => {
    it('reads and parses a JSON array file, returns DataFile', () => {
      const result = loader.loadFile<TestRecord>(org1, filename);

      expect(result.orgId).toBe(org1);
      expect(result.filename).toBe(filename);
      expect(result.records).toHaveLength(3);
      expect(result.records[0]).toEqual({ id: 'r1', name: 'Alpha', value: 10 });
      expect(result.loadedAt).toBeTruthy();
    });

    it('reads a JSON object-with-records format file', () => {
      const result = loader.loadFile<TestRecord>(org2, 'wrapped-records');

      expect(result.records).toHaveLength(3);
      expect(result.records[1]).toEqual({ id: 'r2', name: 'Beta', value: 20 });
    });

    it('appends .json extension automatically when not provided', () => {
      const withExt = loader.loadFile<TestRecord>(org1, `${filename}.json`);
      const withoutExt = loader.loadFile<TestRecord>(org1, filename);

      expect(withExt.records).toHaveLength(withoutExt.records.length);
    });

    it('returns cached result on second call without re-reading', () => {
      const first = loader.loadFile<TestRecord>(org1, filename);
      // Mutate the in-memory records to prove cache is returned
      first.records.push({ id: 'injected', name: 'Cached', value: 0 });

      const second = loader.loadFile<TestRecord>(org1, filename);
      expect(second.records).toHaveLength(4); // Includes the injected record
    });

    it('throws when file does not exist', () => {
      expect(() => loader.loadFile(org1, 'nonexistent-file')).toThrow(
        /Data file not found/,
      );
    });
  });

  describe('query()', () => {
    it('filters records by the provided filter function', () => {
      const results = loader.query<TestRecord>(
        org1,
        filename,
        (r) => (r as TestRecord).value > 15,
      );

      expect(results).toHaveLength(2);
      expect(results.map(r => r.id)).toEqual(['r2', 'r3']);
    });

    it('returns empty array when no records match', () => {
      const results = loader.query(org1, filename, (r) => (r as TestRecord).value > 1000);
      expect(results).toEqual([]);
    });
  });

  describe('getById()', () => {
    it('returns the record matching the given id', () => {
      const record = loader.getById<TestRecord>(org1, filename, 'r2');
      expect(record).toBeDefined();
      expect(record?.name).toBe('Beta');
    });

    it('returns undefined when id does not exist', () => {
      const record = loader.getById(org1, filename, 'not-a-real-id');
      expect(record).toBeUndefined();
    });
  });

  describe('updateRecord()', () => {
    it('patches a record in memory and returns the updated record', () => {
      const updated = loader.updateRecord<TestRecord>(org1, filename, 'r1', {
        value: 999,
      });

      expect(updated.id).toBe('r1');
      expect(updated.name).toBe('Alpha');
      expect(updated.value).toBe(999);
    });

    it('persists the patch in the cached data', () => {
      loader.updateRecord<TestRecord>(org1, filename, 'r1', { name: 'Alpha Updated' });
      const retrieved = loader.getById<TestRecord>(org1, filename, 'r1');
      expect(retrieved?.name).toBe('Alpha Updated');
    });

    it('throws when the record id does not exist', () => {
      expect(() =>
        loader.updateRecord(org1, filename, 'nonexistent-id', { value: 1 }),
      ).toThrow(/Record not found/);
    });
  });

  describe('reload()', () => {
    it('clears the cache so subsequent loadFile reads from disk', () => {
      // Load and mutate the cached data
      const first = loader.loadFile<TestRecord>(org1, filename);
      const originalLength = first.records.length;
      first.records.push({ id: 'temp', name: 'Temp', value: -1 });
      expect(loader.loadFile<TestRecord>(org1, filename).records).toHaveLength(originalLength + 1);

      // Reload clears cache — next load re-reads disk
      loader.reload(org1, filename);
      const reloaded = loader.loadFile<TestRecord>(org1, filename);
      expect(reloaded.records).toHaveLength(originalLength);
    });
  });

  describe('listFiles()', () => {
    it('returns filenames (without .json) for all JSON files in the org directory', () => {
      const files = loader.listFiles(org1);
      expect(files).toContain(filename);
      expect(files).toContain('other-file');
      expect(files.every(f => !f.endsWith('.json'))).toBe(true);
    });

    it('returns empty array when org directory does not exist', () => {
      const files = loader.listFiles('nonexistent-org');
      expect(files).toEqual([]);
    });
  });

  describe('listOrgs()', () => {
    it('returns all org directory names under baseDir', () => {
      const orgs = loader.listOrgs();
      expect(orgs).toContain(org1);
      expect(orgs).toContain(org2);
    });

    it('returns empty array when baseDir does not exist', () => {
      const missingLoader = new DataLoaderService({
        baseDir: join(tmpdir(), 'data-loader-spec-missing-dir'),
        watch: false,
      });
      const orgs = missingLoader.listOrgs();
      expect(orgs).toEqual([]);
      missingLoader.destroy();
    });
  });
});
