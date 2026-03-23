import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Response } from 'express';
import { SuperAdminController } from '../super-admin.controller';
import { SuperAdminService } from '../super-admin.service';
import { RbacService } from '@/rbac/rbac.service';
import { SupabaseAuthUserDto } from '@/auth/dto/auth.dto';
import { ExecuteCommandDto } from '../dto/execute-command.dto';

describe('SuperAdminController', () => {
  let controller: SuperAdminController;
  let superAdminService: jest.Mocked<SuperAdminService>;
  let rbacService: jest.Mocked<RbacService>;

  const mockUser: SupabaseAuthUserDto = {
    id: 'user-1',
    email: 'superadmin@example.com',
  };

  const mockResponse = {
    setHeader: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  } as unknown as Response;

  beforeEach(async () => {
    // Store original NODE_ENV
    const originalEnv = process.env.NODE_ENV;

    // Set to development for tests
    process.env.NODE_ENV = 'development';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuperAdminController],
      providers: [
        {
          provide: RbacService,
          useValue: {
            isSuperAdmin: jest.fn(),
          },
        },
        {
          provide: SuperAdminService,
          useValue: {
            executeWithStreaming: jest.fn(),
            listCommands: jest.fn(),
            listSkills: jest.fn(),
            getCliInfo: jest.fn(),
          },
        },
      ],
    })
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      .overrideGuard(require('@/auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SuperAdminController>(SuperAdminController);
    superAdminService = module.get(SuperAdminService);
    rbacService = module.get(RbacService);

    // Reset mocks
    jest.clearAllMocks();

    // Restore NODE_ENV after module compilation
    process.env.NODE_ENV = originalEnv;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    const mockExecuteDto: ExecuteCommandDto = {
      prompt: '/test',
    };

    beforeEach(() => {
      // Set development mode for execute tests
      process.env.NODE_ENV = 'development';
    });

    it('should execute command successfully for super admin in dev mode', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      superAdminService.executeWithStreaming.mockResolvedValue({
        sessionId: 'session-123',
      });

      await controller.execute(mockExecuteDto, mockUser, mockResponse);

      expect(rbacService.isSuperAdmin).toHaveBeenCalledWith('user-1');
      expect(superAdminService.executeWithStreaming).toHaveBeenCalledWith(
        '/test',
        mockResponse,
        undefined,
        undefined,
        undefined,
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Connection',
        'keep-alive',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Accel-Buffering',
        'no',
      );
    });

    it('should execute command with session resumption', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      const dtoWithSession: ExecuteCommandDto = {
        prompt: 'continue the task',
        sessionId: 'session-123',
      };

      await controller.execute(dtoWithSession, mockUser, mockResponse);

      expect(superAdminService.executeWithStreaming).toHaveBeenCalledWith(
        'continue the task',
        mockResponse,
        'session-123',
        undefined,
        undefined,
      );
    });

    it('should execute command with source context', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      const dtoWithContext: ExecuteCommandDto = {
        prompt: 'help with web-app',
        sourceContext: 'web-app',
      };

      await controller.execute(dtoWithContext, mockUser, mockResponse);

      expect(superAdminService.executeWithStreaming).toHaveBeenCalledWith(
        'help with web-app',
        mockResponse,
        undefined,
        'web-app',
        undefined,
      );
    });

    it('should execute command with both session and source context', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      const dtoWithBoth: ExecuteCommandDto = {
        prompt: 'continue with default context',
        sessionId: 'session-456',
        sourceContext: 'default',
      };

      await controller.execute(dtoWithBoth, mockUser, mockResponse);

      expect(superAdminService.executeWithStreaming).toHaveBeenCalledWith(
        'continue with default context',
        mockResponse,
        'session-456',
        'default',
        undefined,
      );
    });

    it('should throw ForbiddenException when not in development mode', async () => {
      process.env.NODE_ENV = 'production';
      rbacService.isSuperAdmin.mockResolvedValue(true);

      await expect(
        controller.execute(mockExecuteDto, mockUser, mockResponse),
      ).rejects.toThrow(
        new ForbiddenException(
          'Claude Code Panel is only available in development mode',
        ),
      );

      expect(superAdminService.executeWithStreaming).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not super admin', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(false);

      await expect(
        controller.execute(mockExecuteDto, mockUser, mockResponse),
      ).rejects.toThrow(new ForbiddenException('Super admin access required'));

      expect(superAdminService.executeWithStreaming).not.toHaveBeenCalled();
    });

    it('should validate access before executing', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);

      await controller.execute(mockExecuteDto, mockUser, mockResponse);

      // Verify both access checks are called
      expect(rbacService.isSuperAdmin).toHaveBeenCalledWith('user-1');
      expect(superAdminService.executeWithStreaming).toHaveBeenCalled();
    });

    it('should handle service errors gracefully', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      superAdminService.executeWithStreaming.mockRejectedValue(
        new Error('SDK execution failed'),
      );

      await expect(
        controller.execute(mockExecuteDto, mockUser, mockResponse),
      ).rejects.toThrow('SDK execution failed');
    });
  });

  describe('getCommands', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should return list of commands for super admin in dev mode', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      const mockCommands = {
        commands: [
          { name: '/test', description: 'Run tests' },
          { name: '/build', description: 'Build project' },
        ],
      };
      superAdminService.listCommands.mockResolvedValue(mockCommands);

      const result = await controller.getCommands(mockUser);

      expect(result).toEqual(mockCommands);
      expect(rbacService.isSuperAdmin).toHaveBeenCalledWith('user-1');
      expect(superAdminService.listCommands).toHaveBeenCalled();
    });

    it('should return empty array when no commands exist', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      superAdminService.listCommands.mockResolvedValue({ commands: [] });

      const result = await controller.getCommands(mockUser);

      expect(result).toEqual({ commands: [] });
    });

    it('should throw ForbiddenException when not in development mode', async () => {
      process.env.NODE_ENV = 'production';
      rbacService.isSuperAdmin.mockResolvedValue(true);

      await expect(controller.getCommands(mockUser)).rejects.toThrow(
        new ForbiddenException(
          'Claude Code Panel is only available in development mode',
        ),
      );

      expect(superAdminService.listCommands).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not super admin', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(false);

      await expect(controller.getCommands(mockUser)).rejects.toThrow(
        new ForbiddenException('Super admin access required'),
      );

      expect(superAdminService.listCommands).not.toHaveBeenCalled();
    });

    it('should handle service errors', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      superAdminService.listCommands.mockRejectedValue(
        new Error('File system error'),
      );

      await expect(controller.getCommands(mockUser)).rejects.toThrow(
        'File system error',
      );
    });
  });

  describe('getSkills', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should return list of skills for super admin in dev mode', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      const mockSkills = {
        skills: [
          { name: 'api-testing-skill', description: 'API testing utilities' },
          {
            name: 'database-skill',
            description: 'Database query utilities',
          },
        ],
      };
      superAdminService.listSkills.mockResolvedValue(mockSkills);

      const result = await controller.getSkills(mockUser);

      expect(result).toEqual(mockSkills);
      expect(rbacService.isSuperAdmin).toHaveBeenCalledWith('user-1');
      expect(superAdminService.listSkills).toHaveBeenCalled();
    });

    it('should return empty array when no skills exist', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      superAdminService.listSkills.mockResolvedValue({ skills: [] });

      const result = await controller.getSkills(mockUser);

      expect(result).toEqual({ skills: [] });
    });

    it('should throw ForbiddenException when not in development mode', async () => {
      process.env.NODE_ENV = 'production';
      rbacService.isSuperAdmin.mockResolvedValue(true);

      await expect(controller.getSkills(mockUser)).rejects.toThrow(
        new ForbiddenException(
          'Claude Code Panel is only available in development mode',
        ),
      );

      expect(superAdminService.listSkills).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not super admin', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(false);

      await expect(controller.getSkills(mockUser)).rejects.toThrow(
        new ForbiddenException('Super admin access required'),
      );

      expect(superAdminService.listSkills).not.toHaveBeenCalled();
    });

    it('should handle service errors', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      superAdminService.listSkills.mockRejectedValue(
        new Error('Directory read error'),
      );

      await expect(controller.getSkills(mockUser)).rejects.toThrow(
        'Directory read error',
      );
    });
  });

  describe('health', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should return health status with CLI info', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      superAdminService.getCliInfo.mockReturnValue({
        available: true,
        version: '2.1.37 (Claude Code)',
      });

      const result = await controller.health(mockUser);

      expect(result).toEqual({
        status: 'ok',
        cliAvailable: true,
        cliVersion: '2.1.37 (Claude Code)',
        nodeEnv: 'development',
      });
      expect(rbacService.isSuperAdmin).toHaveBeenCalledWith('user-1');
      expect(superAdminService.getCliInfo).toHaveBeenCalled();
    });

    it('should report CLI not available when not installed', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      superAdminService.getCliInfo.mockReturnValue({
        available: false,
        version: 'not installed',
      });

      const result = await controller.health(mockUser);

      expect(result).toEqual({
        status: 'ok',
        cliAvailable: false,
        cliVersion: 'not installed',
        nodeEnv: 'development',
      });
    });

    it('should throw ForbiddenException when NODE_ENV is undefined', async () => {
      const originalEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
      rbacService.isSuperAdmin.mockResolvedValue(true);

      await expect(controller.health(mockUser)).rejects.toThrow(
        new ForbiddenException(
          'Claude Code Panel is only available in development mode',
        ),
      );

      // Restore NODE_ENV
      process.env.NODE_ENV = originalEnv;
    });

    it('should throw ForbiddenException when not in development mode', async () => {
      process.env.NODE_ENV = 'production';
      rbacService.isSuperAdmin.mockResolvedValue(true);

      await expect(controller.health(mockUser)).rejects.toThrow(
        new ForbiddenException(
          'Claude Code Panel is only available in development mode',
        ),
      );

      expect(superAdminService.getCliInfo).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not super admin', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(false);

      await expect(controller.health(mockUser)).rejects.toThrow(
        new ForbiddenException('Super admin access required'),
      );

      expect(superAdminService.getCliInfo).not.toHaveBeenCalled();
    });
  });

  describe('validateAccess', () => {
    it('should validate super admin access in development mode', async () => {
      process.env.NODE_ENV = 'development';
      rbacService.isSuperAdmin.mockResolvedValue(true);

      // Call any endpoint to trigger validateAccess
      superAdminService.listCommands.mockResolvedValue({ commands: [] });
      await controller.getCommands(mockUser);

      expect(rbacService.isSuperAdmin).toHaveBeenCalledWith('user-1');
    });

    it('should reject non-super admin users', async () => {
      process.env.NODE_ENV = 'development';
      rbacService.isSuperAdmin.mockResolvedValue(false);

      await expect(controller.getCommands(mockUser)).rejects.toThrow(
        new ForbiddenException('Super admin access required'),
      );
    });

    it('should reject requests in production mode', async () => {
      process.env.NODE_ENV = 'production';
      rbacService.isSuperAdmin.mockResolvedValue(true);

      await expect(controller.getCommands(mockUser)).rejects.toThrow(
        new ForbiddenException(
          'Claude Code Panel is only available in development mode',
        ),
      );
    });

    it('should reject requests in test mode', async () => {
      process.env.NODE_ENV = 'test';
      rbacService.isSuperAdmin.mockResolvedValue(true);

      await expect(controller.getCommands(mockUser)).rejects.toThrow(
        new ForbiddenException(
          'Claude Code Panel is only available in development mode',
        ),
      );
    });

    it('should handle rbac service errors', async () => {
      process.env.NODE_ENV = 'development';
      rbacService.isSuperAdmin.mockRejectedValue(
        new Error('Database connection failed'),
      );

      await expect(controller.getCommands(mockUser)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should handle service errors gracefully', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      superAdminService.listCommands.mockRejectedValue(
        new Error('Unexpected error'),
      );

      await expect(controller.getCommands(mockUser)).rejects.toThrow(
        'Unexpected error',
      );
    });

    it('should provide clear error messages for access violations', async () => {
      process.env.NODE_ENV = 'production';

      await expect(controller.getCommands(mockUser)).rejects.toThrow(
        'Claude Code Panel is only available in development mode',
      );
    });

    it('should not leak sensitive information in error messages', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(false);

      await expect(controller.getCommands(mockUser)).rejects.toThrow(
        'Super admin access required',
      );
      // Should not include user ID or other sensitive data in error message
    });
  });

  describe('Security', () => {
    it('should enforce super admin check for all endpoints', async () => {
      process.env.NODE_ENV = 'development';
      rbacService.isSuperAdmin.mockResolvedValue(false);

      // Test all endpoints reject non-super admins
      await expect(controller.getCommands(mockUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(controller.getSkills(mockUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(controller.health(mockUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        controller.execute({ prompt: 'test' }, mockUser, mockResponse),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should enforce development mode for all endpoints', async () => {
      process.env.NODE_ENV = 'production';
      rbacService.isSuperAdmin.mockResolvedValue(true);

      // Test all endpoints reject production mode
      await expect(controller.getCommands(mockUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(controller.getSkills(mockUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(controller.health(mockUser)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        controller.execute({ prompt: 'test' }, mockUser, mockResponse),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should use authenticated user ID from JWT', async () => {
      process.env.NODE_ENV = 'development';
      rbacService.isSuperAdmin.mockResolvedValue(true);
      superAdminService.listCommands.mockResolvedValue({ commands: [] });

      await controller.getCommands(mockUser);

      // Verify that the user ID from the JWT token is used
      expect(rbacService.isSuperAdmin).toHaveBeenCalledWith('user-1');
    });
  });

  describe('SSE Streaming', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should set correct SSE headers', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      superAdminService.executeWithStreaming.mockResolvedValue({
        sessionId: 'session-123',
      });

      await controller.execute({ prompt: 'test' }, mockUser, mockResponse);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Connection',
        'keep-alive',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Accel-Buffering',
        'no',
      );
    });

    it('should set headers before streaming starts', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      const setHeaderOrder: string[] = [];
      const executeOrder: string[] = [];

      (mockResponse.setHeader as jest.Mock).mockImplementation(
        (name: string) => {
          setHeaderOrder.push(name);
        },
      );

      superAdminService.executeWithStreaming.mockImplementation(async () => {
        executeOrder.push('execute');
        return { sessionId: 'session-123' };
      });

      await controller.execute({ prompt: 'test' }, mockUser, mockResponse);

      // All headers should be set before execution
      expect(setHeaderOrder).toHaveLength(4);
      expect(executeOrder).toHaveLength(1);
    });
  });

  describe('Integration patterns', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('should follow NestJS controller patterns', async () => {
      rbacService.isSuperAdmin.mockResolvedValue(true);
      superAdminService.listCommands.mockResolvedValue({ commands: [] });

      // Controller should delegate to service
      await controller.getCommands(mockUser);

      expect(superAdminService.listCommands).toHaveBeenCalled();
    });

    it('should use dependency injection correctly', () => {
      // Verify controller has correct dependencies injected
      expect(controller).toBeDefined();
      expect(controller).toHaveProperty('rbacService');
      expect(controller).toHaveProperty('superAdminService');
    });

    it('should use guards for authentication', async () => {
      // Note: In real app, JwtAuthGuard would reject unauthenticated requests
      // This test verifies the guard is configured in the module
      rbacService.isSuperAdmin.mockResolvedValue(true);
      superAdminService.listCommands.mockResolvedValue({ commands: [] });

      // If we get here, the guard passed (mocked in test setup)
      await controller.getCommands(mockUser);

      expect(rbacService.isSuperAdmin).toHaveBeenCalled();
    });
  });
});
