import { Test, TestingModule } from '@nestjs/testing';
import { ListTablesTool } from './list-tables.tool';
import { DATABASE_SERVICE } from '../../../../../planes/database/database.interface';

/**
 * Unit tests for ListTablesTool
 *
 * Tests the tool that lists available database tables.
 * Uses DATABASE_SERVICE.rawQuery() for database access.
 */
describe('ListTablesTool', () => {
  let tool: ListTablesTool;
  let mockDb: {
    rawQuery: jest.Mock;
  };

  beforeEach(async () => {
    mockDb = {
      rawQuery: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListTablesTool,
        {
          provide: DATABASE_SERVICE,
          useValue: mockDb,
        },
      ],
    }).compile();

    tool = module.get<ListTablesTool>(ListTablesTool);
  });

  it('should be defined', () => {
    expect(tool).toBeDefined();
  });

  describe('createTool', () => {
    it('should create a LangGraph tool instance', () => {
      const langGraphTool = tool.createTool();

      expect(langGraphTool).toBeDefined();
      expect(langGraphTool.name).toBe('list_tables');
    });
  });

  describe('execute', () => {
    it('should return list of tables in public schema by default', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [
          { table_schema: 'public', table_name: 'users' },
          { table_schema: 'public', table_name: 'orders' },
          { table_schema: 'public', table_name: 'products' },
        ],
        error: null,
        count: 3,
      });

      const result = await tool.execute();

      expect(result).toContain("Available tables in 'public' schema:");
      expect(result).toContain('public.users');
      expect(result).toContain('public.orders');
      expect(result).toContain('public.products');

      expect(mockDb.rawQuery).toHaveBeenCalledWith(
        expect.stringContaining('information_schema.tables'),
        ['public'],
      );
    });

    it('should filter by specified schema', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [
          { table_schema: 'rag_data', table_name: 'documents' },
          { table_schema: 'rag_data', table_name: 'embeddings' },
        ],
        error: null,
        count: 2,
      });

      const result = await tool.execute('rag_data');

      expect(result).toContain("Available tables in 'rag_data' schema:");
      expect(result).toContain('rag_data.documents');
      expect(result).toContain('rag_data.embeddings');

      expect(mockDb.rawQuery).toHaveBeenCalledWith(expect.any(String), [
        'rag_data',
      ]);
    });

    it('should return message when no tables found', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      const result = await tool.execute('empty_schema');

      expect(result).toBe("No tables found in schema 'empty_schema'.");
    });

    it('should handle rawQuery error response', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: null,
        error: { message: 'Permission denied' },
        count: null,
      });

      const result = await tool.execute();

      expect(result).toContain('Error listing tables');
      expect(result).toContain('Permission denied');
    });

    it('should handle database errors gracefully', async () => {
      mockDb.rawQuery.mockRejectedValue(new Error('Connection refused'));

      const result = await tool.execute();

      expect(result).toContain('Error listing tables');
      expect(result).toContain('Connection refused');
    });

    it('should only query BASE TABLE types', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      await tool.execute();

      expect(mockDb.rawQuery).toHaveBeenCalledWith(
        expect.stringContaining("table_type = 'BASE TABLE'"),
        expect.any(Array),
      );
    });

    it('should order results by table name', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      await tool.execute();

      expect(mockDb.rawQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY table_name'),
        expect.any(Array),
      );
    });
  });
});
