/**
 * Helper for reading and writing transaction JSON files in tests.
 *
 * Path resolution is relative to the agent-communication root directory,
 * matching the on-disk layout used by each NestJS app's DataLoaderService.
 *
 * Supported apps:    'prairie-ridge-app' | 'buildwell-app'
 * Supported companies vary by app — see each app's data/ directory.
 *
 * File path pattern: apps/<appName>/data/<company>/transactions.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const AGENT_COMM_ROOT = join(__dirname, '..', '..');

function resolveTransactionPath(appName: string, company: string): string {
  return join(AGENT_COMM_ROOT, 'apps', appName, 'data', company, 'transactions.json');
}

/**
 * Reads the transactions.json for the given app and company.
 * Throws if the file does not exist, ensuring test failures are visible.
 */
export function readTransactions(appName: string, company: string): unknown[] {
  const filePath = resolveTransactionPath(appName, company);
  const raw = readFileSync(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Expected transactions.json to contain an array, got ${typeof parsed}: ${filePath}`,
    );
  }
  return parsed;
}

/**
 * Writes an array of records to the transactions.json for the given app and company.
 * Overwrites the file completely — no merging.
 */
export function writeTransactions(appName: string, company: string, records: unknown[]): void {
  const filePath = resolveTransactionPath(appName, company);
  writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
}

/**
 * Resets the transactions.json for the given app and company to an empty array.
 * Useful in afterEach/afterAll cleanup blocks.
 */
export function resetTransactions(appName: string, company: string): void {
  writeTransactions(appName, company, []);
}
