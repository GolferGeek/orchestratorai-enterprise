import 'reflect-metadata';

/**
 * Mock the shared-protocols package entirely so Jest does not attempt to
 * load the full dist/index.js (which pulls in ESM-only dependencies such as
 * @coinbase/cdp-sdk that cannot be require()'d in a CommonJS test environment).
 *
 * We only need DataLoaderService and ReconciliationService for this controller.
 */
jest.mock('@agent-communication/shared-protocols', () => {
  const mockLoad = jest.fn();
  const mockGetById = jest.fn();

  class DataLoaderService {
    loadFile = mockLoad;
    getById = mockGetById;
  }

  class ReconciliationService {
    reconcile = jest.fn().mockResolvedValue({ consistent: true, total: 0 });
  }

  return { DataLoaderService, ReconciliationService, __mockLoad: mockLoad, __mockGetById: mockGetById };
});

import { DataController } from '../data.controller';
import { NotFoundException } from '@nestjs/common';

// Pull the mock fns out after the import so we can configure them per-test
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __mockLoad, __mockGetById } = require('@agent-communication/shared-protocols') as {
  __mockLoad: jest.Mock;
  __mockGetById: jest.Mock;
};

/**
 * Unit tests for DataController (Prairie Ridge Credit app).
 *
 * These tests verify:
 * 1. The transactions endpoint resolves and returns data (not a silent empty fallback)
 * 2. The transactions endpoint is declared before the /:company/:file catch-all
 *    so it cannot be shadowed by it
 * 3. Errors propagate — missing files throw NotFoundException, not empty records
 */

describe('DataController (prairieRidge)', () => {
  let controller: DataController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DataController();
  });

  describe('route declaration order', () => {
    it('GET transactions/:company is declared before GET :company/:file', () => {
      /**
       * In NestJS, route metadata is registered in the order decorators are applied
       * (top-to-bottom in the class body). We verify that getTransactions appears
       * before getFile in the prototype property list, ensuring Express will match
       * /transactions/foo against the explicit handler rather than treating
       * "transactions" as a :company param.
       */
      const proto = Object.getOwnPropertyNames(DataController.prototype);
      const txnIndex = proto.indexOf('getTransactions');
      const fileIndex = proto.indexOf('getFile');

      expect(txnIndex).toBeGreaterThan(-1);
      expect(fileIndex).toBeGreaterThan(-1);
      expect(txnIndex).toBeLessThan(fileIndex);
    });

    it('reconcile/:company is declared before :company/:file', () => {
      const proto = Object.getOwnPropertyNames(DataController.prototype);
      const reconcileIndex = proto.indexOf('reconcile');
      const fileIndex = proto.indexOf('getFile');

      expect(reconcileIndex).toBeGreaterThan(-1);
      expect(fileIndex).toBeGreaterThan(-1);
      expect(reconcileIndex).toBeLessThan(fileIndex);
    });

    it('GET route path for getTransactions is "transactions/:company"', () => {
      const metadata: string = Reflect.getMetadata('path', DataController.prototype.getTransactions);
      expect(metadata).toBe('transactions/:company');
    });

    it('GET route path for getFile is ":company/:file"', () => {
      const metadata: string = Reflect.getMetadata('path', DataController.prototype.getFile);
      expect(metadata).toBe(':company/:file');
    });
  });

  describe('error propagation', () => {
    it('getTransactions throws when the transactions file does not exist', () => {
      /**
       * The controller must NOT silently return {records: []} when the file is missing.
       * DataLoaderService.loadFile throws and that error must propagate up.
       */
      __mockLoad.mockImplementation(() => {
        throw new Error('Data file not found: /data/nonexistent-company/transactions.json');
      });

      expect(() => controller.getTransactions('nonexistent-company-xyz')).toThrow(
        /Data file not found/,
      );
    });

    it('getFile throws when the file does not exist', () => {
      __mockLoad.mockImplementation(() => {
        throw new Error('Data file not found: /data/nonexistent-company/some-file.json');
      });

      // The error from DataLoaderService propagates — no silent swallow.
      expect(() => controller.getFile('nonexistent-company-xyz', 'some-file')).toThrow(
        /Data file not found/,
      );
    });

    it('getRecord throws NotFoundException when the record does not exist', () => {
      __mockLoad.mockReturnValue({ records: [], filename: 'some-file', orgId: 'org', loadedAt: '' });
      __mockGetById.mockReturnValue(undefined);

      expect(() =>
        controller.getRecord('org', 'some-file', 'rec-001'),
      ).toThrow(NotFoundException);
    });
  });

  describe('no silent fallback on getTransactions', () => {
    it('does not return empty records array when the underlying service throws', () => {
      __mockLoad.mockImplementation(() => {
        throw new Error('Data file not found');
      });

      let result: unknown;
      let error: unknown;

      try {
        result = controller.getTransactions('no-such-company-at-all');
      } catch (e) {
        error = e;
      }

      // The old code swallowed the error and returned {records: []}.
      // The new code must throw — result must remain undefined.
      expect(error).toBeDefined();
      expect(result).toBeUndefined();
    });
  });

  describe('successful responses', () => {
    it('getTransactions returns the DataFile from the loader', () => {
      const mockData = { filename: 'transactions', orgId: 'prairie-ridge', records: [{ id: 't1' }], loadedAt: '2026-01-01' };
      __mockLoad.mockReturnValue(mockData);

      const result = controller.getTransactions('prairie-ridge');
      expect(result).toBe(mockData);
      expect(__mockLoad).toHaveBeenCalledWith('prairie-ridge', 'transactions');
    });

    it('getFile returns the DataFile from the loader', () => {
      const mockData = { filename: 'loans', orgId: 'agriserv', records: [], loadedAt: '2026-01-01' };
      __mockLoad.mockReturnValue(mockData);

      const result = controller.getFile('agriserv', 'loans');
      expect(result).toBe(mockData);
    });

    it('getRecord returns the record when found', () => {
      __mockLoad.mockReturnValue({ records: [], filename: 'loans', orgId: 'org', loadedAt: '' });
      const mockRecord = { id: 'r1', name: 'Test' };
      __mockGetById.mockReturnValue(mockRecord);

      const result = controller.getRecord('org', 'loans', 'r1');
      expect(result).toBe(mockRecord);
    });
  });
});
