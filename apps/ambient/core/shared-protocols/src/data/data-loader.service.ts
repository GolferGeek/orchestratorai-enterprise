import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync, statSync, watch as fsWatch, FSWatcher } from 'fs';
import { join, resolve } from 'path';
import { DataRecord, DataFile, DataFilter, DataLoaderOptions } from './types';

export class DataLoaderService {
  private readonly baseDir: string;
  private readonly cache: Map<string, DataFile> = new Map();
  private watchers: FSWatcher[] = [];
  private readonly watchEnabled: boolean;

  constructor(options: DataLoaderOptions) {
    this.baseDir = resolve(options.baseDir);
    this.watchEnabled = options.watch ?? false;
  }

  /**
   * Build cache key from orgId and filename.
   */
  private cacheKey(orgId: string, filename: string): string {
    return `${orgId}/${filename}`;
  }

  /**
   * Resolve file path from orgId and filename.
   */
  private filePath(orgId: string, filename: string): string {
    const name = filename.endsWith('.json') ? filename : `${filename}.json`;
    return join(this.baseDir, orgId, name);
  }

  /**
   * Load a JSON file for an org. Returns the parsed records.
   * Caches the result. Use reload() to force re-read.
   */
  loadFile<T extends DataRecord = DataRecord>(orgId: string, filename: string): DataFile<T> {
    const key = this.cacheKey(orgId, filename);
    const cached = this.cache.get(key);
    if (cached) return cached as DataFile<T>;

    const path = this.filePath(orgId, filename);
    if (!existsSync(path)) {
      throw new Error(`Data file not found: ${path}`);
    }

    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;

    // Support both array format and object-with-records format
    const records: T[] = Array.isArray(parsed)
      ? (parsed as T[])
      : ((parsed as { records?: T[] }).records ?? [parsed as T]);

    const dataFile: DataFile<T> = {
      filename,
      orgId,
      records,
      loadedAt: new Date().toISOString(),
    };

    this.cache.set(key, dataFile as DataFile);

    if (this.watchEnabled) {
      this.watchFile(orgId, filename, path);
    }

    return dataFile;
  }

  /**
   * Query records from a file with a filter function.
   */
  query<T extends DataRecord = DataRecord>(
    orgId: string,
    filename: string,
    filter: DataFilter,
  ): T[] {
    const dataFile = this.loadFile<T>(orgId, filename);
    return dataFile.records.filter(filter as (r: T) => boolean);
  }

  /**
   * Get a single record by ID.
   */
  getById<T extends DataRecord = DataRecord>(
    orgId: string,
    filename: string,
    id: string,
  ): T | undefined {
    const dataFile = this.loadFile<T>(orgId, filename);
    return dataFile.records.find(r => r.id === id);
  }

  /**
   * Validate a record before write operations.
   * Throws if the record is missing an `id` field or if it is not a plain object.
   */
  private validateRecord(record: unknown): asserts record is DataRecord {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('Invalid record: must be a plain object');
    }
    const r = record as Record<string, unknown>;
    if (!r['id'] || typeof r['id'] !== 'string' || r['id'].trim() === '') {
      throw new Error('Invalid record: missing required string field "id"');
    }
  }

  /**
   * Append a record to the cached array and persist to disk atomically.
   * Returns the record.
   */
  appendRecord<T extends DataRecord>(orgId: string, filename: string, record: T): T {
    this.validateRecord(record);
    const dataFile = this.loadFile<T>(orgId, filename);
    dataFile.records.push(record);
    this.saveFileAtomic(orgId, filename);
    return record;
  }

  /**
   * Update a record in memory and persist to disk atomically.
   * Returns the updated record.
   */
  updateRecord<T extends DataRecord = DataRecord>(
    orgId: string,
    filename: string,
    id: string,
    patch: Partial<T>,
  ): T {
    const dataFile = this.loadFile<T>(orgId, filename);
    const index = dataFile.records.findIndex(r => r.id === id);
    if (index === -1) {
      throw new Error(`Record not found: ${orgId}/${filename}#${id}`);
    }

    const updated = { ...dataFile.records[index], ...patch } as T;
    dataFile.records[index] = updated;
    this.saveFileAtomic(orgId, filename);
    return updated;
  }

  /**
   * Remove a record by ID from the cache and persist to disk atomically.
   * Returns true if the record was found and removed, false otherwise.
   */
  deleteRecord(orgId: string, filename: string, id: string): boolean {
    const dataFile = this.loadFile(orgId, filename);
    const index = dataFile.records.findIndex(r => r.id === id);
    if (index === -1) return false;

    dataFile.records.splice(index, 1);
    this.saveFileAtomic(orgId, filename);
    return true;
  }

  /**
   * Write current cached records atomically using temp-file + rename strategy.
   * Writes to filename.json.tmp first, then renames to filename.json.
   * On POSIX this rename is atomic — the final file is never partially written.
   */
  saveFileAtomic(orgId: string, filename: string): void {
    const key = this.cacheKey(orgId, filename);
    const dataFile = this.cache.get(key);
    if (!dataFile) {
      throw new Error(`No cached data for ${orgId}/${filename} — load the file before saving`);
    }
    const finalPath = this.filePath(orgId, filename);
    const tmpPath = `${finalPath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(dataFile.records, null, 2), 'utf-8');
    renameSync(tmpPath, finalPath);
  }

  /**
   * Write current cached records to disk for the given file.
   * @deprecated Use saveFileAtomic() instead for crash-safe writes.
   */
  saveFile(orgId: string, filename: string): void {
    this.saveFileAtomic(orgId, filename);
  }

  /**
   * Ensure the JSON file exists. Creates the directory and an empty array file if not present.
   */
  ensureFile(orgId: string, filename: string): void {
    const path = this.filePath(orgId, filename);
    if (existsSync(path)) return;

    const dir = join(this.baseDir, orgId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(path, '[]', 'utf-8');
  }

  /**
   * Force reload a specific file from disk.
   */
  reload(orgId: string, filename: string): void {
    const key = this.cacheKey(orgId, filename);
    this.cache.delete(key);
    this.loadFile(orgId, filename);
  }

  /**
   * List all available data files for an org.
   */
  listFiles(orgId: string): string[] {
    const orgDir = join(this.baseDir, orgId);
    if (!existsSync(orgDir)) return [];
    return readdirSync(orgDir)
      .filter((f: string) => f.endsWith('.json'))
      .map((f: string) => f.replace('.json', ''));
  }

  /**
   * List all org directories.
   */
  listOrgs(): string[] {
    if (!existsSync(this.baseDir)) return [];
    return readdirSync(this.baseDir)
      .filter((f: string) => statSync(join(this.baseDir, f)).isDirectory());
  }

  /**
   * Set up file watching for hot-reload during dev.
   */
  private watchFile(orgId: string, filename: string, path: string): void {
    const watcher = fsWatch(path, () => {
      const key = this.cacheKey(orgId, filename);
      this.cache.delete(key);
    });
    this.watchers.push(watcher);
  }

  /**
   * Clean up file watchers.
   */
  destroy(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }
}
