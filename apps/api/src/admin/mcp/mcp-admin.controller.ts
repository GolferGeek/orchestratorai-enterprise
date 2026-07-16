import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: unknown;
}

type JsonRpcResponse =
  | {
      jsonrpc: '2.0';
      id: string | number | null;
      result: unknown;
    }
  | {
      jsonrpc: '2.0';
      id: string | number | null;
      error: {
        code: number;
        message: string;
      };
    };

@ApiTags('mcp-admin')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('admin:settings')
@Controller('admin/mcp')
export class McpAdminController {
  @Post()
  handleJsonRpc(@Body() request: JsonRpcRequest): JsonRpcResponse {
    if (request.jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: -32600,
          message: 'Invalid JSON-RPC request.',
        },
      };
    }

    if (request.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2025-03-26',
          serverInfo: {
            name: 'orchestratorai-platform-admin-mcp',
            version: '0.0.1',
          },
          capabilities: {
            tools: {},
          },
        },
      };
    }

    if (request.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [],
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32601,
        message: `Unsupported MCP admin method: ${request.method}`,
      },
    };
  }
}
