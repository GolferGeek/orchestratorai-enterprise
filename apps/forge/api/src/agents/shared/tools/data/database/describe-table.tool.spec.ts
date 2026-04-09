import { Test, TestingModule } from '@nestjs/testing';
import { DescribeTableTool } from './describe-table.tool';
import { DATABASE_SERVICE } from '@orchestratorai/planes/database';

/**
 * Unit tests for DescribeTableTool
 *
 * Tests the tool that describes database table schemas.
 * Uses DATABASE_SERVICE.rawQuery() for database access.
 */
describe('DescribeTableTool', () => {
  let tool: DescribeTableTool;
  let mockDb: {
    rawQuery: jest.Mock;
  };

  beforeEach(async () => {
    mockDb = {
      rawQuery: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DescribeTableTool,
        {
          provide: DATABASE_SERVICE,
          useValue: mockDb,
        },
      ],
    }).compile();

    tool = module.get<DescribeTableTool>(DescribeTableTool);
  });

  it('should be defined', () => {
    expect(tool).toBeDefined();
  });

  describe('createTool', () => {
    it('should create a LangGraph tool instance', () => {
      const langGraphTool = tool.createTool() as { name: string };

      expect(langGraphTool).toBeDefined();
      expect(langGraphTool.name).toBe('describe_table');
    });
  });

  describe('execute', () => {
    it('should return table schema with columns', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [
          {
            column_name: 'id',
            data_type: 'integer',
            character_maximum_length: null,
            is_nullable: 'NO',
            column_default: "nextval('users_id_seq'::regclass)",
            key_type: 'PRIMARY KEY',
          },
          {
            column_name: 'email',
            data_type: 'character varying',
            character_maximum_length: 255,
            is_nullable: 'NO',
            column_default: null,
            key_type: '',
          },
          {
            column_name: 'name',
            data_type: 'character varying',
            character_maximum_length: 100,
            is_nullable: 'YES',
            column_default: null,
            key_type: '',
          },
        ],
        error: null,
        count: 3,
      });

      const result = await tool.execute('users');

      expect(result).toContain('Table: public.users');
      expect(result).toContain('id: integer NOT NULL');
      expect(result).toContain('[PRIMARY KEY]');
      expect(result).toContain('email: character varying(255) NOT NULL');
      expect(result).toContain('name: character varying(100) NULL');
    });

    it('should use specified schema', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [
          {
            column_name: 'id',
            data_type: 'uuid',
            character_maximum_length: null,
            is_nullable: 'NO',
            column_default: 'gen_random_uuid()',
            key_type: 'PRIMARY KEY',
          },
        ],
        error: null,
        count: 1,
      });

      const result = await tool.execute('documents', 'rag_data');

      expect(result).toContain('Table: rag_data.documents');
      expect(mockDb.rawQuery).toHaveBeenCalledWith(expect.any(String), [
        'rag_data',
        'documents',
      ]);
    });

    it('should include column defaults', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [
          {
            column_name: 'created_at',
            data_type: 'timestamp with time zone',
            character_maximum_length: null,
            is_nullable: 'NO',
            column_default: 'CURRENT_TIMESTAMP',
            key_type: '',
          },
        ],
        error: null,
        count: 1,
      });

      const result = await tool.execute('events');

      expect(result).toContain('DEFAULT CURRENT_TIMESTAMP');
    });

    it('should return message when table not found', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      const result = await tool.execute('nonexistent_table');

      expect(result).toContain("Table 'public.nonexistent_table' not found");
    });

    it('should handle rawQuery error response', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: null,
        error: { message: 'Permission denied' },
        count: null,
      });

      const result = await tool.execute('restricted_table');

      expect(result).toContain('Error describing table');
      expect(result).toContain('Permission denied');
    });

    it('should handle database errors gracefully', async () => {
      mockDb.rawQuery.mockRejectedValue(new Error('Permission denied'));

      const result = await tool.execute('restricted_table');

      expect(result).toContain('Error describing table');
      expect(result).toContain('Permission denied');
    });

    it('should handle character_maximum_length for varchar columns', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [
          {
            column_name: 'description',
            data_type: 'character varying',
            character_maximum_length: 500,
            is_nullable: 'YES',
            column_default: null,
            key_type: '',
          },
        ],
        error: null,
        count: 1,
      });

      const result = await tool.execute('products');

      expect(result).toContain('character varying(500)');
    });

    it('should not show length for types without max length', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [
          {
            column_name: 'amount',
            data_type: 'numeric',
            character_maximum_length: null,
            is_nullable: 'NO',
            column_default: '0',
            key_type: '',
          },
        ],
        error: null,
        count: 1,
      });

      const result = await tool.execute('transactions');

      expect(result).toContain('amount: numeric NOT NULL');
      expect(result).not.toContain('numeric(');
    });

    it('should default to public schema', async () => {
      mockDb.rawQuery.mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      });

      await tool.execute('some_table');

      expect(mockDb.rawQuery).toHaveBeenCalledWith(expect.any(String), [
        'public',
        'some_table',
      ]);
    });
  });
});
