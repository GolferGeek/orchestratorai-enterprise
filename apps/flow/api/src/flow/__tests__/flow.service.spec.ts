import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FlowService } from '../flow.service';
import { DATABASE_SERVICE } from '../../database';
import { SharedTaskStatus } from '../flow.dto';

/**
 * Build a chainable mock Supabase query builder.
 * Each method returns `this`, and `.single()` / `.maybeSingle()` return
 * the configured terminal result. The builder itself is also thenable so
 * direct `await query` works.
 */

function buildQueryBuilder(
  terminalResult: unknown = { data: null, error: null },
): any {
  const builder: Record<string, jest.Mock> = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    eq: jest.fn(),
    in: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    filter: jest.fn(),
    single: jest.fn().mockResolvedValue(terminalResult),
    maybeSingle: jest.fn().mockResolvedValue(terminalResult),
    then: jest
      .fn()
      .mockImplementation((resolve: (v: unknown) => unknown) =>
        Promise.resolve(terminalResult).then(resolve),
      ),
  };
  // All chain methods return the same builder
  [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'in',
    'order',
    'limit',
    'filter',
  ].forEach((m) => {
    builder[m] = jest.fn().mockReturnValue(builder);
  });
  return builder;
}

describe('FlowService', () => {
  let service: FlowService;
  let mockDb: any;
  const TEAM_ID = 'team-uuid-001';
  const USER_ID = 'user-uuid-001';
  const TASK_ID = 'task-uuid-001';

  function buildMockDb(
    teamMemberResult: unknown = { data: { id: 'member-1' }, error: null },
  ) {
    // Public schema `.from(null, table)` — used for team_members check
    const publicFromMap: Record<
      string,
      ReturnType<typeof buildQueryBuilder>
    > = {
      team_members: buildQueryBuilder(teamMemberResult),
      channel_users: buildQueryBuilder({ data: null, error: null }),
    };

    // orch_flow schema queries
    const schemaFromBuilder = buildQueryBuilder();

    return {
      from: jest
        .fn()
        .mockImplementation((schema: string | null, table: string) => {
          if (schema === null || schema === undefined) {
            return publicFromMap[table] ?? buildQueryBuilder();
          }
          // orch_flow schema
          return schemaFromBuilder;
        }),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
  }

  beforeEach(async () => {
    mockDb = buildMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlowService,
        {
          provide: DATABASE_SERVICE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<FlowService>(FlowService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================================
  // Efforts
  // ==========================================================================

  describe('getEfforts', () => {
    it('should return mapped effort DTOs', async () => {
      const effortRows = [
        {
          id: 'eff-1',
          team_id: TEAM_ID,
          name: 'Phase 1',
          description: 'First phase',
          status: 'in_progress',
          order_index: 0,
          icon: null,
          color: null,
          estimated_days: 30,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-02T00:00:00Z',
        },
      ];

      const effortsQuery = buildQueryBuilder({ data: effortRows, error: null });
      mockDb.from = jest
        .fn()
        .mockImplementation((schema: string | null, _table: string) => {
          if (schema === null || schema === undefined) {
            return buildQueryBuilder({ data: { id: 'member-1' }, error: null });
          }
          return effortsQuery;
        });

      const result = await service.getEfforts(TEAM_ID, USER_ID);

      expect(result).toHaveLength(1);

      expect(result[0]!).toMatchObject({
        id: 'eff-1',
        teamId: TEAM_ID,
        name: 'Phase 1',
        description: 'First phase',
        status: 'in_progress',
        estimatedDays: 30,
      });

      expect(result[0]!.createdAt).toBeInstanceOf(Date);
    });

    it('should throw ForbiddenException when user is not a team member', async () => {
      // team_members returns no data
      mockDb = buildMockDb({
        data: null,
        error: { message: 'Not found' },
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FlowService,
          { provide: DATABASE_SERVICE, useValue: mockDb },
        ],
      }).compile();
      const svc = module.get<FlowService>(FlowService);

      await expect(svc.getEfforts(TEAM_ID, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException when DB query fails', async () => {
      const effortsQuery = buildQueryBuilder({
        data: null,
        error: { message: 'DB connection error' },
      });
      mockDb.from = jest
        .fn()
        .mockImplementation((schema: string | null, _table: string) => {
          if (schema === null || schema === undefined) {
            return buildQueryBuilder({ data: { id: 'member-1' }, error: null });
          }
          return effortsQuery;
        });

      await expect(service.getEfforts(TEAM_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return empty array when no efforts exist', async () => {
      const effortsQuery = buildQueryBuilder({ data: [], error: null });
      mockDb.from = jest
        .fn()
        .mockImplementation((schema: string | null, _table: string) => {
          if (schema === null || schema === undefined) {
            return buildQueryBuilder({ data: { id: 'member-1' }, error: null });
          }
          return effortsQuery;
        });

      const result = await service.getEfforts(TEAM_ID, USER_ID);
      expect(result).toEqual([]);
    });
  });

  describe('createEffort', () => {
    it('should insert and return a new effort', async () => {
      const createdRow = {
        id: 'eff-new',
        team_id: TEAM_ID,
        name: 'New Effort',
        description: 'Description',
        status: 'not_started',
        order_index: 1,
        icon: 'rocket',
        color: '#ff0000',
        estimated_days: 10,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const insertQuery = buildQueryBuilder({ data: createdRow, error: null });
      mockDb.from = jest
        .fn()
        .mockImplementation((schema: string | null, _table: string) => {
          if (schema === null || schema === undefined) {
            return buildQueryBuilder({ data: { id: 'member-1' }, error: null });
          }
          return insertQuery;
        });

      const dto = {
        name: 'New Effort',
        description: 'Description',
        status: 'not_started',
        orderIndex: 1,
        icon: 'rocket',
        color: '#ff0000',
        estimatedDays: 10,
      };

      const result = await service.createEffort(TEAM_ID, USER_ID, dto);

      expect(result).toMatchObject({
        id: 'eff-new',
        name: 'New Effort',
        icon: 'rocket',
        color: '#ff0000',
        estimatedDays: 10,
      });
    });

    it('should throw BadRequestException on insert error', async () => {
      const insertQuery = buildQueryBuilder({
        data: null,
        error: { message: 'Constraint violation' },
      });
      mockDb.from = jest
        .fn()
        .mockImplementation((schema: string | null, _table: string) => {
          if (schema === null || schema === undefined) {
            return buildQueryBuilder({ data: { id: 'member-1' }, error: null });
          }
          return insertQuery;
        });

      await expect(
        service.createEffort(TEAM_ID, USER_ID, { name: 'Bad' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateEffort', () => {
    it('should throw NotFoundException when effort does not exist', async () => {
      // First query (fetch effort) returns null
      const fetchQuery = buildQueryBuilder({
        data: null,
        error: { message: 'Not found' },
      });
      mockDb.from = jest
        .fn()
        .mockImplementation((schema: string | null, _table: string) => {
          if (schema === null || schema === undefined) {
            return buildQueryBuilder({ data: { id: 'member-1' }, error: null });
          }
          return fetchQuery;
        });

      await expect(
        service.updateEffort(TEAM_ID, 'eff-nonexistent', USER_ID, {
          name: 'Updated',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteEffort', () => {
    it('should throw NotFoundException when effort does not exist', async () => {
      const fetchQuery = buildQueryBuilder({
        data: null,
        error: { message: 'Not found' },
      });
      mockDb.from = jest
        .fn()
        .mockImplementation((schema: string | null, _table: string) => {
          if (schema === null || schema === undefined) {
            return buildQueryBuilder({ data: { id: 'member-1' }, error: null });
          }
          return fetchQuery;
        });

      await expect(
        service.deleteEffort(TEAM_ID, 'eff-nonexistent', USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================================================
  // Shared Tasks
  // ==========================================================================

  describe('getSharedTasks', () => {
    it('should return mapped shared task DTOs', async () => {
      const taskRows = [
        {
          id: TASK_ID,
          title: 'Fix bug',
          is_completed: false,
          assigned_to: 'Claude',
          user_id: USER_ID,
          status: 'in_progress',
          created_at: '2025-01-01T00:00:00Z',
          parent_task_id: null,
          pomodoro_count: 2,
          project_id: null,
          sprint_id: null,
          due_date: null,
          team_id: TEAM_ID,
          description: 'Fix the broken thing',
          channel_id: null,
          source_channel_user_id: null,
        },
      ];

      const tasksQuery = buildQueryBuilder({ data: taskRows, error: null });
      mockDb.from = jest
        .fn()
        .mockImplementation((schema: string | null, _table: string) => {
          if (schema === null || schema === undefined) {
            return buildQueryBuilder({ data: { id: 'member-1' }, error: null });
          }
          return tasksQuery;
        });

      const result = await service.getSharedTasks(
        TEAM_ID,
        USER_ID,
        undefined,
        false,
        null,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: TASK_ID,
        title: 'Fix bug',
        assignedTo: 'Claude',
        status: 'in_progress',
        pomodoroCount: 2,
      });
    });

    it('should return empty array when no tasks exist', async () => {
      const tasksQuery = buildQueryBuilder({ data: [], error: null });
      mockDb.from = jest
        .fn()
        .mockImplementation((schema: string | null, _table: string) => {
          if (schema === null || schema === undefined) {
            return buildQueryBuilder({ data: { id: 'member-1' }, error: null });
          }
          return tasksQuery;
        });

      const result = await service.getSharedTasks(
        TEAM_ID,
        USER_ID,
        undefined,
        false,
        null,
      );
      expect(result).toEqual([]);
    });

    it('should throw BadRequestException when query fails', async () => {
      const tasksQuery = buildQueryBuilder({
        data: null,
        error: { message: 'Query failed' },
      });
      mockDb.from = jest
        .fn()
        .mockImplementation((schema: string | null, _table: string) => {
          if (schema === null || schema === undefined) {
            return buildQueryBuilder({ data: { id: 'member-1' }, error: null });
          }
          return tasksQuery;
        });

      await expect(
        service.getSharedTasks(TEAM_ID, USER_ID, undefined, false, null),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createSharedTask', () => {
    it('should create and return a new shared task', async () => {
      const createdRow = {
        id: 'new-task-1',
        title: 'New shared task',
        is_completed: false,
        assigned_to: 'Claude',
        user_id: USER_ID,
        status: 'in_progress' as SharedTaskStatus,
        created_at: '2025-01-01T00:00:00Z',
        parent_task_id: null,
        pomodoro_count: 0,
        project_id: null,
        sprint_id: null,
        due_date: null,
        team_id: TEAM_ID,
        description: 'Task description',
        channel_id: null,
        source_channel_user_id: null,
      };

      const insertQuery = buildQueryBuilder({ data: createdRow, error: null });
      mockDb.from = jest
        .fn()
        .mockImplementation((schema: string | null, _table: string) => {
          if (schema === null || schema === undefined) {
            return buildQueryBuilder({ data: { id: 'member-1' }, error: null });
          }
          return insertQuery;
        });

      const result = await service.createSharedTask(TEAM_ID, USER_ID, {
        title: 'New shared task',
        description: 'Task description',
        status: SharedTaskStatus.IN_PROGRESS,
        assignedTo: 'Claude',
      });

      expect(result).toMatchObject({
        id: 'new-task-1',
        title: 'New shared task',
        isCompleted: false,
        assignedTo: 'Claude',
      });
    });

    it('should throw BadRequestException on insert error', async () => {
      const insertQuery = buildQueryBuilder({
        data: null,
        error: { message: 'Duplicate key violation' },
      });
      mockDb.from = jest
        .fn()
        .mockImplementation((schema: string | null, _table: string) => {
          if (schema === null || schema === undefined) {
            return buildQueryBuilder({ data: { id: 'member-1' }, error: null });
          }
          return insertQuery;
        });

      await expect(
        service.createSharedTask(TEAM_ID, USER_ID, { title: 'Conflict Task' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should skip team membership check when teamId is null', async () => {
      const createdRow = {
        id: 'personal-task',
        title: 'Personal task',
        is_completed: false,
        assigned_to: null,
        user_id: USER_ID,
        status: 'in_progress' as SharedTaskStatus,
        created_at: '2025-01-01T00:00:00Z',
        parent_task_id: null,
        pomodoro_count: 0,
        project_id: null,
        sprint_id: null,
        due_date: null,
        team_id: null,
        description: null,
        channel_id: null,
        source_channel_user_id: null,
      };

      const insertQuery = buildQueryBuilder({ data: createdRow, error: null });
      mockDb.from = jest
        .fn()
        .mockImplementation((schema: string | null, _table: string) => {
          if (schema === null || schema === undefined) {
            return buildQueryBuilder({ data: { id: 'member-1' }, error: null });
          }
          return insertQuery;
        });

      // Should not throw even without a team
      const result = await service.createSharedTask(null, USER_ID, {
        title: 'Personal task',
      });
      expect(result.teamId).toBeNull();
    });
  });

  // ==========================================================================
  // verifyTeamMember (tested indirectly)
  // ==========================================================================

  describe('team membership enforcement', () => {
    it('should throw ForbiddenException for non-member on createSharedTask', async () => {
      // team_members query returns no row (forbidden)
      mockDb.from = jest
        .fn()
        .mockImplementation((schema: string | null, _table: string) => {
          if (schema === null || schema === undefined) {
            return buildQueryBuilder({
              data: null,
              error: { message: 'Not found' },
            });
          }
          return buildQueryBuilder();
        });

      await expect(
        service.createSharedTask(TEAM_ID, USER_ID, { title: 'Task' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
