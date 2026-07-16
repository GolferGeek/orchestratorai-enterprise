import { Module } from '@nestjs/common';
import { McpAdminController } from './mcp-admin.controller';

@Module({
  controllers: [McpAdminController],
})
export class McpAdminModule {}
