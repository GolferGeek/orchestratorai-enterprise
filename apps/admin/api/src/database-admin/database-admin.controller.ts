import { Controller, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  DatabaseAdminService,
  DatabaseHealthResponse,
  DatabaseConfigResponse,
  DatabaseTablesResponse,
  DatabaseMigrationsResponse,
} from './database-admin.service';

@ApiTags('database-admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin/database')
export class DatabaseAdminController {
  constructor(private readonly databaseAdminService: DatabaseAdminService) {}

  @Get('health')
  @ApiOperation({
    summary: 'Database health check',
    description: 'Returns the current database connection status.',
  })
  @ApiResponse({ status: 200, description: 'Database health status' })
  async getHealth(): Promise<DatabaseHealthResponse> {
    return this.databaseAdminService.getHealth();
  }

  @Get('config')
  @ApiOperation({
    summary: 'Database configuration',
    description: 'Returns the active database provider configuration.',
  })
  @ApiResponse({ status: 200, description: 'Database configuration' })
  async getConfig(): Promise<DatabaseConfigResponse> {
    return this.databaseAdminService.getConfig();
  }

  @Get('tables')
  @ApiOperation({
    summary: 'List database tables',
    description:
      'Returns all user-defined tables across non-system schemas with live row counts.',
  })
  @ApiResponse({ status: 200, description: 'Table listing with row counts' })
  async getTables(): Promise<DatabaseTablesResponse> {
    return this.databaseAdminService.getTables();
  }

  @Get('migrations')
  @ApiOperation({
    summary: 'Migration history',
    description: 'Returns the 50 most recent Supabase schema migrations.',
  })
  @ApiResponse({ status: 200, description: 'Migration history' })
  async getMigrations(): Promise<DatabaseMigrationsResponse> {
    return this.databaseAdminService.getMigrations();
  }
}
