import {
  Controller,
  Get,
  Put,
  Body,
  Query,
  Logger,
  HttpException,
  HttpStatus,
  Inject,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import {
  InProcessJwtAuthGuard as JwtAuthGuard,
  InProcessRbacGuard as RbacGuard,
  RequirePermission,
} from '@orchestratorai/auth-client';
import { IsOptional, IsObject, IsString } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import {
  cpus,
  totalmem,
  freemem,
  uptime as osUptime,
  loadavg,
  platform,
} from 'os';

class UpdateGlobalModelConfigDto {
  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  config_json?: string; // alternative: raw JSON string
}

@ApiTags('System')
@Controller('system')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
export class SystemController {
  private readonly logger = new Logger(SystemController.name);

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get basic system health status (system-wide resources)
   */
  @Get('health')
  @ApiOperation({ summary: 'Get system health status' })
  @ApiResponse({ status: 200, description: 'System health data' })
  async getSystemHealth() {
    try {
      // System-wide resources
      const totalMemory = totalmem();
      const freeMemory = freemem();
      const currentPlatform = platform();

      let usedMemory = totalMemory - freeMemory;
      let memoryUtilization = Math.round((usedMemory / totalMemory) * 100);

      // On macOS, get more accurate memory from vm_stat
      if (currentPlatform === 'darwin') {
        try {
          const { execSync } = await import('child_process');
          const vmStat = execSync('vm_stat').toString();
          const lines = vmStat.split('\n');

          // Parse page size from first line (16KB on Apple Silicon, 4KB on Intel)
          const pageSizeMatch = lines[0]?.match(/page size of (\d+) bytes/);
          const pageSize =
            pageSizeMatch && pageSizeMatch[1]
              ? parseInt(pageSizeMatch[1], 10)
              : 4096;

          let pagesAnonymous = 0; // App Memory
          let pagesWired = 0; // Wired Memory
          let pagesCompressed = 0; // Compressed Memory

          for (const line of lines) {
            // Match: "Pages anonymous:                        1384784."
            if (line.includes('Anonymous pages:')) {
              const match = line.match(/:\s+(\d+)\./);
              if (match && match[1]) {
                pagesAnonymous = parseInt(match[1], 10);
              }
            }
            // Match: "Pages wired down:                        323104."
            else if (line.includes('Pages wired down:')) {
              const match = line.match(/:\s+(\d+)\./);
              if (match && match[1]) {
                pagesWired = parseInt(match[1], 10);
              }
            }
            // Match: "Pages occupied by compressor:           1073198."
            else if (line.includes('Pages occupied by compressor:')) {
              const match = line.match(/:\s+(\d+)\./);
              if (match && match[1]) {
                pagesCompressed = parseInt(match[1], 10);
              }
            }
          }

          // Calculate actual used memory (anonymous + wired + compressed)
          // This matches Activity Monitor's "Memory Used" calculation
          const usedPages = pagesAnonymous + pagesWired + pagesCompressed;
          usedMemory = usedPages * pageSize;
          memoryUtilization = Math.round((usedMemory / totalMemory) * 100);
        } catch (error) {
          // Fall back to basic calculation if vm_stat fails
          this.logger.warn(
            'Failed to get accurate macOS memory, using basic calculation',
            error,
          );
        }
      }

      const systemUptime = osUptime() * 1000; // Convert to milliseconds
      const cpuInfo = cpus();

      // Load average (Unix-like systems only - returns [0,0,0] on Windows)
      const load = loadavg();

      // API process resources (for debugging)
      const processUptime = process.uptime() * 1000;
      const memoryUsage = process.memoryUsage();

      // Test database connectivity
      const { error: dbError } = (await this.db
        .from('authz', 'users')
        .select('id', { count: 'exact', head: true })
        .limit(1)) as QueryResult<unknown>;

      return {
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),

        // System-wide resources
        uptime: systemUptime,
        system: {
          platform: currentPlatform,
          cpuCores: cpuInfo.length,
          cpuModel: cpuInfo[0]?.model || 'Unknown',
          loadAverage: load, // [1min, 5min, 15min] - Unix only
        },
        memory: {
          // System-wide memory
          total: Math.round(totalMemory / 1024 / 1024),
          free: Math.round(freeMemory / 1024 / 1024),
          used: Math.round(usedMemory / 1024 / 1024),
          utilization: memoryUtilization,

          // API process memory (for debugging)
          process: {
            rss: Math.round(memoryUsage.rss / 1024 / 1024),
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapUtilization: Math.round(
              (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
            ),
          },
        },

        // API process uptime (for comparison)
        apiUptime: processUptime,

        services: {
          database: dbError ? 'unhealthy' : 'healthy',
          api: 'healthy',
        },
      };
    } catch (error) {
      this.logger.error('Failed to get system health:', error);
      return {
        success: false,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'System health check failed',
      };
    }
  }

  /**
   * Get system analytics overview
   */
  @Get('analytics')
  @ApiOperation({ summary: 'Get system analytics overview' })
  @ApiResponse({ status: 200, description: 'System analytics data' })
  async getSystemAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      // Get current timestamp
      const now = new Date();
      const start = startDate
        ? new Date(startDate)
        : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const end = endDate ? new Date(endDate) : now;

      // System metrics
      const uptime = process.uptime() * 1000; // milliseconds
      const memoryUsage = process.memoryUsage();

      // Get real data from database - use service client for admin analytics
      const [usersResult, tasksResult, conversationsResult] =
        (await Promise.all([
          this.db.from('authz', 'users').select('id', {
            count: 'exact',
            head: true,
          }),
          this.db.from(null, 'tasks').select('id', {
            count: 'exact',
            head: true,
          }),
          this.db.from(null, 'conversations').select('id', {
            count: 'exact',
            head: true,
          }),
        ])) as [
          QueryResult<unknown>,
          QueryResult<unknown>,
          QueryResult<unknown>,
        ];

      // Get task completion stats
      const [completedTasks, failedTasks] = (await Promise.all([
        this.db
          .from(null, 'tasks')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'completed'),
        this.db
          .from(null, 'tasks')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'failed'),
      ])) as [QueryResult<unknown>, QueryResult<unknown>];

      const totalUsers = usersResult.count ?? 0;
      const totalTasks = tasksResult.count ?? 0;
      const totalConversations = conversationsResult.count ?? 0;
      const completedTasksCount = completedTasks.count ?? 0;
      const failedTasksCount = failedTasks.count ?? 0;

      // Calculate success rate
      const successRate =
        totalTasks > 0 ? (completedTasksCount / totalTasks) * 100 : 100;

      const analytics = {
        timestamp: now.toISOString(),
        period: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          durationDays: Math.ceil(
            (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
          ),
        },
        system: {
          uptime: uptime,
          uptimeDays: Math.floor(uptime / (24 * 60 * 60 * 1000)),
          memory: {
            rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
            external: Math.round(memoryUsage.external / 1024 / 1024), // MB
            heapUtilization: Math.round(
              (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
            ),
          },
          cpu: {
            usage: Math.round(process.cpuUsage().user / 1000), // Convert microseconds to milliseconds
            cores: cpus().length,
          },
        },
        performance: {
          averageResponseTime: Math.round(uptime / (totalTasks || 1)), // Rough estimate based on uptime/tasks
          requestsPerSecond: Math.round(totalTasks / (uptime / 1000) || 0), // Tasks per second since startup
          errorRate: Math.round(successRate * 100) / 100, // Success rate as error rate inverse
        },
        health: {
          status: 'healthy',
          services: {
            database: usersResult.error ? 'unhealthy' : 'healthy',
            llm: 'healthy', // TODO: Add real LLM health check
            monitoring: 'healthy',
            authentication: 'healthy',
          },
        },
        statistics: {
          totalRequests: totalTasks, // Use tasks as proxy for requests
          totalUsers: totalUsers,
          totalAgents: 37, // TODO: Get from agent discovery service
          totalTasks: totalTasks,
          totalConversations: totalConversations,
          completedTasks: completedTasksCount,
          failedTasks: failedTasksCount,
          successRate: Math.round(successRate * 100) / 100,
        },
      };

      return {
        success: true,
        data: analytics,
      };
    } catch (error) {
      this.logger.error('Failed to get system analytics', error);
      throw error;
    }
  }

  // ==============================
  // Global Model Config Management
  // ==============================

  @Get('model-config/global')
  @ApiOperation({ summary: 'Get global model configuration (DB-backed)' })
  @ApiResponse({
    status: 200,
    description: 'Returns DB value and env override presence',
  })
  async getGlobalModelConfig() {
    try {
      const envOverride = this.configService.get<string>(
        'MODEL_CONFIG_GLOBAL_JSON',
      );
      const { data: rawData, error } = (await this.db.rpc(
        'get_global_model_config',
      )) as {
        data: unknown;
        error: unknown;
      };
      if (error) {
        throw new Error(
          (error as unknown as Record<string, unknown>).message as string,
        );
      }
      // SQL Server rpc returns recordset array; Supabase returns scalar directly
      let configValue: unknown = rawData;
      if (Array.isArray(rawData) && rawData.length > 0) {
        const firstRow = rawData[0] as Record<string, unknown>;
        const values = Object.values(firstRow);
        if (values.length === 1) configValue = values[0];
      }
      const dbConfig =
        typeof configValue === 'string'
          ? (JSON.parse(configValue) as Record<string, unknown>)
          : (configValue as Record<string, unknown>);
      return {
        success: true,
        source: envOverride ? 'env_override' : 'database',
        dbConfig: dbConfig,
        envOverrideActive: Boolean(envOverride),
      };
    } catch (error) {
      this.logger.error('Failed to get global model config', error);
      throw new HttpException(
        'Failed to fetch model config',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ==============================
  // Provider Planes Configuration
  // ==============================

  @Get('planes')
  @ApiOperation({
    summary: 'Get current provider plane selections (read-only)',
  })
  @ApiResponse({ status: 200, description: 'Provider plane configuration' })
  getProviderPlanes() {
    const data: Record<string, string | undefined> = {
      DB_PROVIDER: process.env.DB_PROVIDER || 'supabase_pg',
      STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || 'supabase_storage',
      AUTH_PROVIDER: process.env.AUTH_PROVIDER || 'supabase',
      CONFIG_PROVIDER: process.env.CONFIG_PROVIDER || 'local',
      WORK_PROVIDER: process.env.WORK_PROVIDER || 'slack',
      RAG_PROVIDER: process.env.RAG_PROVIDER || 'supabase_pg',
      LLM_PROVIDER: process.env.LLM_PROVIDER || 'fine_control',
      KNOWLEDGE_PROVIDER: process.env.KNOWLEDGE_PROVIDER || 'none',
    };

    // Include simplified LLM sub-providers when applicable
    if (process.env.LLM_PROVIDER === 'simplified') {
      data.COMMERCIAL_LLM_PROVIDER =
        process.env.COMMERCIAL_LLM_PROVIDER || 'openrouter';
      data.OPENSOURCE_LLM_PROVIDER =
        process.env.OPENSOURCE_LLM_PROVIDER || 'ollama_cloud';
    }

    // Always include Ollama Cloud URL if set (helps distinguish local vs cloud)
    if (process.env.OLLAMA_CLOUD_BASE_URL) {
      data.OLLAMA_CLOUD_BASE_URL = process.env.OLLAMA_CLOUD_BASE_URL;
    }

    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Put('model-config/global')
  @ApiOperation({ summary: 'Update global model configuration (writes to DB)' })
  @ApiResponse({ status: 200, description: 'Stored configuration' })
  async setGlobalModelConfig(@Body() dto: UpdateGlobalModelConfigDto) {
    try {
      const envOverride = this.configService.get<string>(
        'MODEL_CONFIG_GLOBAL_JSON',
      );
      if (envOverride) {
        // Warn that env override takes precedence
        this.logger.warn(
          'MODEL_CONFIG_GLOBAL_JSON is set; DB updates will not take effect until env override is removed',
        );
      }

      // Determine payload
      let payload: Record<string, unknown> | undefined = dto.config;
      if (!payload && dto.config_json) {
        payload = JSON.parse(dto.config_json) as Record<string, unknown>;
      }
      if (!payload || typeof payload !== 'object') {
        throw new HttpException(
          'Missing config object or config_json',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Basic shape check: either flat {provider, model} or dual {default, localOnly?}
      const isFlat = 'provider' in payload && 'model' in payload;
      const isDual =
        'default' in payload && typeof payload.default === 'object';
      if (!isFlat && !isDual) {
        throw new HttpException(
          'Invalid config shape: expected {provider, model} or {default, localOnly?}',
          HttpStatus.BAD_REQUEST,
        );
      }

      const { error } = await this.db.from(null, 'system_settings').upsert(
        {
          key: 'model_config_global',
          value: payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );
      if (error) {
        throw new Error(
          (error as unknown as Record<string, unknown>).message as string,
        );
      }
      return {
        success: true,
        message: 'Global model configuration updated',
        envOverrideActive: Boolean(envOverride),
      };
    } catch (error) {
      this.logger.error('Failed to update global model config', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to update model config',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
