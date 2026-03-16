import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DATABASE_SERVICE, DatabaseService } from '@/database';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  @Get('db')
  @ApiOperation({ summary: 'Check database connectivity' })
  @ApiResponse({
    status: 200,
    description: 'Database connection successful',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        message: { type: 'string', example: 'Database connection successful' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Database connection failed',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        message: { type: 'string', example: 'Connection error details' },
      },
    },
  })
  async checkDbConnection() {
    return await this.db.checkConnection();
  }

  @Get()
  @ApiOperation({ summary: 'General health check' })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        timestamp: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
        service: { type: 'string', example: 'NestJS A2A Agent Framework' },
      },
    },
  })
  healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'NestJS A2A Agent Framework',
    };
  }

  @Get('supabase')
  async checkSupabase() {
    try {
      const result = await this.db.checkConnection();
      return {
        status: 'ok',
        supabase: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        supabase: {
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('db/config')
  @ApiOperation({ summary: 'Get current database configuration' })
  @ApiResponse({
    status: 200,
    description: 'Current database configuration',
    schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', example: 'local' },
        environment: { type: 'string', example: 'sample' },
        url: { type: 'string', example: 'http://localhost:8001...' },
        database: { type: 'string', example: 'sample_environment' },
        clientsAvailable: {
          type: 'object',
          properties: {
            anon: { type: 'boolean', example: true },
            service: { type: 'boolean', example: true },
          },
        },
        timestamp: { type: 'string', example: '2025-08-11T22:00:00.000Z' },
      },
    },
  })
  getDbConfig() {
    return {
      ...this.db.getConfig(),
      timestamp: new Date().toISOString(),
    };
  }
}
