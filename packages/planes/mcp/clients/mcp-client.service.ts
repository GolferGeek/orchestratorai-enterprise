import { Injectable } from '@nestjs/common';

export interface GenerateSqlParams {
  natural_language_query: string;
  schema_tables: string[];
  max_rows?: number;
}

/**
 * SQL generation via MCP — host must register a real implementation via
 * {@link setMCPClientService} in database utilities, or inject via Nest.
 */
@Injectable()
export class MCPClientService {
  async generateSQL(_params: GenerateSqlParams): Promise<unknown> {
    throw new Error(
      'MCPClientService.generateSQL must be provided by the host application',
    );
  }
}
