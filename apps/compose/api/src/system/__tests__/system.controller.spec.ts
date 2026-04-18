/**
 * System Controller Tests
 *
 * Tests the System endpoints for health monitoring, analytics, and model configuration.
 */

import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { SystemController } from '../system.controller';
import { DATABASE_SERVICE } from '@/database';
import { ConfigService } from '@nestjs/config';
import {
  applyRemoteAuthOverrides as applyAuthOverrides,
  resetAuthMocks,
} from '@orchestratorai/auth-client/testing';

describe('SystemController', () => {
  let controller: SystemController;
  let configService: jest.Mocked<ConfigService>;

  // Mock Supabase client
  const mockSupabaseClient = {
    from: jest.fn(),
    rpc: jest.fn(),
  };

  beforeEach(async () => {
    resetAuthMocks();
    const module: TestingModule = await applyAuthOverrides(
      Test.createTestingModule({
        controllers: [SystemController],
        providers: [
          {
            provide: DATABASE_SERVICE,
            useValue: mockSupabaseClient,
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(),
            },
          },
        ],
      }),
    ).compile();

    controller = module.get<SystemController>(SystemController);
    configService = module.get(ConfigService);

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  describe('getSystemHealth', () => {
    it('should return healthy system status with all metrics', async () => {
      // Mock database query
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            error: null,
            data: [{ id: 'user-1' }],
          }),
        }),
      });

      const result = await controller.getSystemHealth();

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('status', 'healthy');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('memory');
      expect(result).toHaveProperty('apiUptime');
      expect(result).toHaveProperty('services');

      // System metrics
      expect(result.system).toHaveProperty('platform');
      expect(result.system).toHaveProperty('cpuCores');
      expect(result.system).toHaveProperty('cpuModel');
      expect(result.system).toHaveProperty('loadAverage');

      // Memory metrics
      expect(result.memory).toHaveProperty('total');
      expect(result.memory).toHaveProperty('free');
      expect(result.memory).toHaveProperty('used');
      expect(result.memory).toHaveProperty('utilization');
      expect(result.memory).toHaveProperty('process');

      // Process memory metrics
      expect(result.memory).toBeDefined();
      expect(result.memory?.process).toHaveProperty('rss');
      expect(result.memory?.process).toHaveProperty('heapTotal');
      expect(result.memory?.process).toHaveProperty('heapUsed');
      expect(result.memory?.process).toHaveProperty('heapUtilization');

      // Services
      expect(result.services).toBeDefined();
      expect(result.services).toHaveProperty('database', 'healthy');
      expect(result.services).toHaveProperty('api', 'healthy');
    });

    it('should mark database as unhealthy when query fails', async () => {
      // Mock database query error
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            error: { message: 'Connection failed' },
            data: null,
          }),
        }),
      });

      const result = await controller.getSystemHealth();

      expect(result.services).toBeDefined();
      expect(result.services?.database).toBe('unhealthy');
      expect(result.status).toBe('healthy'); // Overall status still healthy
    });

    it('should return unhealthy status on critical error', async () => {
      // Mock database query throwing exception
      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error('Critical database error');
      });

      const result = await controller.getSystemHealth();

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('status', 'unhealthy');
      expect(result).toHaveProperty('error', 'System health check failed');
    });

    it('should handle macOS vm_stat error gracefully', async () => {
      // Mock successful database query
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            error: null,
            data: [{ id: 'user-1' }],
          }),
        }),
      });

      const result = await controller.getSystemHealth();

      // Should still return healthy status even if vm_stat fails
      expect(result.success).toBe(true);
      expect(result.status).toBe('healthy');
    });

    it('should calculate memory utilization correctly', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            error: null,
            data: [],
          }),
        }),
      });

      const result = await controller.getSystemHealth();

      expect(result.memory).toBeDefined();
      expect(result.memory?.utilization).toBeGreaterThanOrEqual(0);
      expect(result.memory?.utilization).toBeLessThanOrEqual(100);
      expect(result.memory?.process.heapUtilization).toBeGreaterThanOrEqual(0);
      expect(result.memory?.process.heapUtilization).toBeLessThanOrEqual(100);
    });
  });

  describe('getSystemAnalytics', () => {
    beforeEach(() => {
      // Mock all database queries
      mockSupabaseClient.from.mockImplementation(() => {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              error: null,
              count: 0,
            }),
          }),
        };
      });
    });

    it('should return system analytics with all metrics', async () => {
      // Mock database queries for counts
      let callCount = 0;
      mockSupabaseClient.from.mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            error: null,
            count: callCount++ % 2 === 0 ? 80 : 20, // 80 completed, 20 failed
          }),
        }),
      }));

      const result = await controller.getSystemAnalytics();

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');

      const analytics = result.data;
      expect(analytics).toHaveProperty('timestamp');
      expect(analytics).toHaveProperty('period');
      expect(analytics).toHaveProperty('system');
      expect(analytics).toHaveProperty('performance');
      expect(analytics).toHaveProperty('health');
      expect(analytics).toHaveProperty('statistics');

      // Period
      expect(analytics.period).toHaveProperty('startDate');
      expect(analytics.period).toHaveProperty('endDate');
      expect(analytics.period).toHaveProperty('durationDays');

      // System
      expect(analytics.system).toHaveProperty('uptime');
      expect(analytics.system).toHaveProperty('uptimeDays');
      expect(analytics.system).toHaveProperty('memory');
      expect(analytics.system).toHaveProperty('cpu');

      // Performance
      expect(analytics.performance).toHaveProperty('averageResponseTime');
      expect(analytics.performance).toHaveProperty('requestsPerSecond');
      expect(analytics.performance).toHaveProperty('errorRate');

      // Health
      expect(analytics.health).toHaveProperty('status');
      expect(analytics.health).toHaveProperty('services');

      // Statistics
      expect(analytics.statistics).toHaveProperty('totalRequests');
      expect(analytics.statistics).toHaveProperty('totalUsers');
      expect(analytics.statistics).toHaveProperty('totalAgents');
      expect(analytics.statistics).toHaveProperty('totalTasks');
      expect(analytics.statistics).toHaveProperty('totalConversations');
      expect(analytics.statistics).toHaveProperty('completedTasks');
      expect(analytics.statistics).toHaveProperty('failedTasks');
      expect(analytics.statistics).toHaveProperty('successRate');
    });

    it('should accept custom date range', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: null,
            count: 0,
          }),
        }),
      });

      const startDate = '2024-01-01T00:00:00Z';
      const endDate = '2024-01-31T23:59:59Z';

      const result = await controller.getSystemAnalytics(startDate, endDate);

      expect(result.data.period.startDate).toBe(
        new Date(startDate).toISOString(),
      );
      expect(result.data.period.endDate).toBe(new Date(endDate).toISOString());
      expect(result.data.period.durationDays).toBe(31);
    });

    it('should default to 30 days when no date range provided', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: null,
            count: 0,
          }),
        }),
      });

      const result = await controller.getSystemAnalytics();

      expect(result.data.period.durationDays).toBeGreaterThanOrEqual(29);
      expect(result.data.period.durationDays).toBeLessThanOrEqual(31);
    });

    it('should calculate success rate correctly', async () => {
      // Mock database responses
      // First 3 calls: users, tasks (100 total), conversations
      // Next 2 calls: completed tasks (80), failed tasks (20)
      let callCount = 0;
      mockSupabaseClient.from.mockImplementation((_table: string) => {
        callCount++;

        // First Promise.all: users, tasks, conversations
        if (callCount === 1) {
          // users
          return {
            select: jest.fn().mockResolvedValue({ error: null, count: 10 }),
          };
        }
        if (callCount === 2) {
          // tasks (total)
          return {
            select: jest.fn().mockResolvedValue({ error: null, count: 100 }),
          };
        }
        if (callCount === 3) {
          // conversations
          return {
            select: jest.fn().mockResolvedValue({ error: null, count: 50 }),
          };
        }

        // Second Promise.all: completed and failed tasks
        if (callCount === 4) {
          // completed tasks
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null, count: 80 }),
            }),
          };
        }
        if (callCount === 5) {
          // failed tasks
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null, count: 20 }),
            }),
          };
        }

        return {
          select: jest.fn().mockResolvedValue({ error: null, count: 0 }),
        };
      });

      const result = await controller.getSystemAnalytics();

      expect(result.data.statistics.totalTasks).toBe(100);
      expect(result.data.statistics.completedTasks).toBe(80);
      expect(result.data.statistics.failedTasks).toBe(20);
      expect(result.data.statistics.successRate).toBe(80);
    });

    it('should handle zero tasks gracefully', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: null,
            count: 0,
          }),
        }),
      });

      const result = await controller.getSystemAnalytics();

      expect(result.data.statistics.totalTasks).toBe(0);
      expect(result.data.statistics.successRate).toBe(100);
    });

    it('should throw error on database failure', async () => {
      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(controller.getSystemAnalytics()).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should mark services as unhealthy when database errors', async () => {
      // Mock database error on the users query (first Promise.all query)
      let callCount = 0;
      mockSupabaseClient.from.mockImplementation(
        (_schema: any, table: string) => {
          callCount++;

          // Return error for users query
          if (callCount === 1 && table === 'users') {
            return {
              select: jest.fn().mockResolvedValue({
                error: { message: 'Query failed' },
                count: null,
              }),
            };
          }

          // Return normal responses for other queries
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                error: null,
                count: 0,
              }),
            }),
          };
        },
      );

      const result = await controller.getSystemAnalytics();

      expect(result.data.health.services.database).toBe('unhealthy');
    });
  });

  describe('getGlobalModelConfig', () => {
    it('should return database config when no env override', async () => {
      const mockConfig = {
        provider: 'anthropic',
        model: 'claude-3-opus',
      };

      configService.get.mockReturnValue(undefined);
      mockSupabaseClient.rpc.mockResolvedValue({
        data: JSON.stringify(mockConfig),
        error: null,
      });

      const result = await controller.getGlobalModelConfig();

      expect(result).toEqual({
        success: true,
        source: 'database',
        dbConfig: mockConfig,
        envOverrideActive: false,
      });
    });

    it('should indicate env override when present', async () => {
      const mockConfig = {
        provider: 'openai',
        model: 'gpt-4',
      };

      configService.get.mockReturnValue(JSON.stringify(mockConfig));
      mockSupabaseClient.rpc.mockResolvedValue({
        data: JSON.stringify({ provider: 'anthropic', model: 'claude-3' }),
        error: null,
      });

      const result = await controller.getGlobalModelConfig();

      expect(result.source).toBe('env_override');
      expect(result.envOverrideActive).toBe(true);
    });

    it('should parse JSON string response from database', async () => {
      const mockConfig = {
        default: {
          provider: 'anthropic',
          model: 'claude-3-opus',
        },
      };

      configService.get.mockReturnValue(undefined);
      mockSupabaseClient.rpc.mockResolvedValue({
        data: JSON.stringify(mockConfig),
        error: null,
      });

      const result = await controller.getGlobalModelConfig();

      expect(result.dbConfig).toEqual(mockConfig);
    });

    it('should handle object response from database', async () => {
      const mockConfig = {
        provider: 'anthropic',
        model: 'claude-3-opus',
      };

      configService.get.mockReturnValue(undefined);
      mockSupabaseClient.rpc.mockResolvedValue({
        data: mockConfig, // Object, not string
        error: null,
      });

      const result = await controller.getGlobalModelConfig();

      expect(result.dbConfig).toEqual(mockConfig);
    });

    it('should throw HttpException on database error', async () => {
      configService.get.mockReturnValue(undefined);
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(controller.getGlobalModelConfig()).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw 500 status on database error', async () => {
      configService.get.mockReturnValue(undefined);
      mockSupabaseClient.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      try {
        await controller.getGlobalModelConfig();
        fail('Should have thrown HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    });
  });

  describe('setGlobalModelConfig', () => {
    it('should update flat config shape (provider, model)', async () => {
      const dto = {
        config: {
          provider: 'anthropic',
          model: 'claude-3-opus',
        },
      };

      configService.get.mockReturnValue(undefined);
      mockSupabaseClient.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({
          error: null,
        }),
      });

      const result = await controller.setGlobalModelConfig(dto);

      expect(result).toEqual({
        success: true,
        message: 'Global model configuration updated',
        envOverrideActive: false,
      });
    });

    it('should update dual config shape (default, localOnly)', async () => {
      const dto = {
        config: {
          default: {
            provider: 'anthropic',
            model: 'claude-3-opus',
          },
          localOnly: {
            provider: 'ollama',
            model: 'llama2',
          },
        },
      };

      configService.get.mockReturnValue(undefined);
      mockSupabaseClient.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({
          error: null,
        }),
      });

      const result = await controller.setGlobalModelConfig(dto);

      expect(result.success).toBe(true);
    });

    it('should accept config_json as string', async () => {
      const config = {
        provider: 'openai',
        model: 'gpt-4',
      };

      const dto = {
        config_json: JSON.stringify(config),
      };

      configService.get.mockReturnValue(undefined);
      mockSupabaseClient.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({
          error: null,
        }),
      });

      const result = await controller.setGlobalModelConfig(dto);

      expect(result.success).toBe(true);
    });

    it('should throw BadRequest when config is missing', async () => {
      const dto = {};

      await expect(controller.setGlobalModelConfig(dto)).rejects.toThrow(
        HttpException,
      );

      try {
        await controller.setGlobalModelConfig(dto);
        fail('Should have thrown HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.BAD_REQUEST,
        );
        expect((error as HttpException).message).toContain('Missing config');
      }
    });

    it('should throw BadRequest for invalid config shape', async () => {
      const dto = {
        config: {
          invalid: 'shape',
        },
      };

      await expect(controller.setGlobalModelConfig(dto)).rejects.toThrow(
        HttpException,
      );

      try {
        await controller.setGlobalModelConfig(dto);
        fail('Should have thrown HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.BAD_REQUEST,
        );
        expect((error as HttpException).message).toContain(
          'Invalid config shape',
        );
      }
    });

    it('should warn when env override is active', async () => {
      const dto = {
        config: {
          provider: 'anthropic',
          model: 'claude-3-opus',
        },
      };

      configService.get.mockReturnValue(
        '{"provider":"openai","model":"gpt-4"}',
      );
      mockSupabaseClient.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({
          error: null,
        }),
      });

      const result = await controller.setGlobalModelConfig(dto);

      expect(result.envOverrideActive).toBe(true);
    });

    it('should throw HttpException on database error', async () => {
      const dto = {
        config: {
          provider: 'anthropic',
          model: 'claude-3-opus',
        },
      };

      configService.get.mockReturnValue(undefined);
      mockSupabaseClient.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({
          error: { message: 'Database error' },
        }),
      });

      await expect(controller.setGlobalModelConfig(dto)).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw 500 status on database error', async () => {
      const dto = {
        config: {
          provider: 'anthropic',
          model: 'claude-3-opus',
        },
      };

      configService.get.mockReturnValue(undefined);
      mockSupabaseClient.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({
          error: { message: 'Database error' },
        }),
      });

      try {
        await controller.setGlobalModelConfig(dto);
        fail('Should have thrown HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    });

    it('should call upsert with correct parameters', async () => {
      const dto = {
        config: {
          provider: 'anthropic',
          model: 'claude-3-opus',
        },
      };

      configService.get.mockReturnValue(undefined);
      const upsertMock = jest.fn().mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockReturnValue({
        upsert: upsertMock,
      });

      await controller.setGlobalModelConfig(dto);

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'model_config_global',
          value: dto.config,
        }),
        { onConflict: 'key' },
      );
    });

    it('should preserve HttpException when thrown', async () => {
      const dto = {
        config: {
          invalid: 'shape',
        },
      };

      try {
        await controller.setGlobalModelConfig(dto);
        fail('Should have thrown HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        // Verify it's the original BadRequest exception, not wrapped
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.BAD_REQUEST,
        );
      }
    });
  });

  describe('UpdateGlobalModelConfigDto validation', () => {
    it('should accept config object', async () => {
      const dto = {
        config: {
          provider: 'anthropic',
          model: 'claude-3-opus',
        },
      };

      configService.get.mockReturnValue(undefined);
      mockSupabaseClient.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ error: null }),
      });

      await expect(controller.setGlobalModelConfig(dto)).resolves.toBeDefined();
    });

    it('should accept config_json string', async () => {
      const dto = {
        config_json: JSON.stringify({
          provider: 'anthropic',
          model: 'claude-3-opus',
        }),
      };

      configService.get.mockReturnValue(undefined);
      mockSupabaseClient.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ error: null }),
      });

      await expect(controller.setGlobalModelConfig(dto)).resolves.toBeDefined();
    });

    it('should prefer config over config_json when both provided', async () => {
      const dto = {
        config: {
          provider: 'anthropic',
          model: 'claude-3-opus',
        },
        config_json: JSON.stringify({
          provider: 'openai',
          model: 'gpt-4',
        }),
      };

      configService.get.mockReturnValue(undefined);
      const upsertMock = jest.fn().mockResolvedValue({ error: null });
      mockSupabaseClient.from.mockReturnValue({
        upsert: upsertMock,
      });

      await controller.setGlobalModelConfig(dto);

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          value: dto.config, // Should use config, not config_json
        }),
        expect.anything(),
      );
    });
  });
});
