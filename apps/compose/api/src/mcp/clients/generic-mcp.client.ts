import { Injectable, Logger } from '@nestjs/common';
import { MCPService } from '../mcp.service';

/**
 * Generic MCP Client
 *
 * Provides a clean, simple interface for agents to use MCP tools
 * without needing to know about JSON-RPC protocol details, tool names, or response parsing.
 *
 * This client abstracts away all MCP protocol complexity and provides intuitive method names.
 */
@Injectable()
export class GenericMCPClient {
  private readonly logger = new Logger(GenericMCPClient.name);

  constructor(private readonly mcpService: MCPService) {}

  /**
   * Check if MCP service is healthy and available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const pingResult = await this.mcpService.ping();
      return pingResult.status === 'healthy';
    } catch (error) {
      this.logger.warn('MCP health check failed:', error);
      return false;
    }
  }

  /**
   * Generate SQL from natural language query
   */
  async generateSQL(options: {
    query: string;
    tables?: string[];
    maxRows?: number;
  }): Promise<{
    success: boolean;
    sql?: string;
    explanation?: string;
    tablesUsed?: string[];
    error?: string;
  }> {
    try {
      const response = await this.mcpService.callTool({
        name: 'supabase/generate-sql',
        arguments: {
          query: options.query,
          tables: options.tables || [],
          max_rows: options.maxRows || 100,
        },
      });

      if (response.isError) {
        return {
          success: false,
          error:
            (response.content[0]?.text as string) || 'SQL generation failed',
        };
      }

      const result = JSON.parse(
        (response.content[0]?.text as string) || '{}',
      ) as {
        sql: string;
        explanation: string;
        tables_used: string[];
      };
      return {
        success: true,
        sql: result.sql,
        explanation: result.explanation,
        tablesUsed: result.tables_used,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute SQL query
   */
  async executeSQL(options: { sql: string; maxRows?: number }): Promise<{
    success: boolean;
    data?: Array<Record<string, unknown>>;
    rowCount?: number;
    executionTimeMs?: number;
    columns?: string[];
    error?: string;
  }> {
    try {
      const response = await this.mcpService.callTool({
        name: 'supabase/execute-sql',
        arguments: {
          sql: options.sql,
          max_rows: options.maxRows || 1000,
        },
      });

      if (response.isError) {
        return {
          success: false,
          error:
            (response.content[0]?.text as string) || 'SQL execution failed',
        };
      }

      const result = JSON.parse(
        (response.content[0]?.text as string) || '{}',
      ) as {
        data: Array<Record<string, unknown>>;
        row_count: number;
        execution_time_ms: number;
        columns: string[];
      };
      return {
        success: true,
        data: result.data || [],
        rowCount: result.row_count || 0,
        executionTimeMs: result.execution_time_ms || 0,
        columns: result.columns || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Analyze query results and generate insights
   */
  async analyzeResults(options: {
    data: Array<Record<string, unknown>>;
    prompt: string;
    provider?: string;
    model?: string;
  }): Promise<{
    success: boolean;
    analysis?: string;
    insights?: string[];
    recommendations?: string[];
    error?: string;
  }> {
    try {
      const response = await this.mcpService.callTool({
        name: 'supabase/analyze-results',
        arguments: {
          data: options.data,
          analysis_prompt: options.prompt,
          provider: options.provider || 'anthropic',
          model: options.model || 'claude-3-5-sonnet-20241022',
        },
      });

      if (response.isError) {
        return {
          success: false,
          error: (response.content[0]?.text as string) || 'Analysis failed',
        };
      }

      const result = JSON.parse(
        (response.content[0]?.text as string) || '{}',
      ) as {
        analysis: string;
        insights: string[];
        recommendations: string[];
      };
      return {
        success: true,
        analysis: result.analysis,
        insights: result.insights || [],
        recommendations: result.recommendations || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get database schema information
   */
  async getSchema(options: { domain?: string }): Promise<{
    success: boolean;
    schema?: Record<string, unknown>;
    error?: string;
  }> {
    try {
      const response = await this.mcpService.callTool({
        name: 'supabase/get-schema',
        arguments: {
          domain: options.domain || 'core',
        },
      });

      if (response.isError) {
        return {
          success: false,
          error:
            (response.content[0]?.text as string) || 'Schema retrieval failed',
        };
      }

      const result = JSON.parse(
        (response.content[0]?.text as string) || '{}',
      ) as Record<string, unknown>;
      return {
        success: true,
        schema: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Complete workflow: Generate SQL, Execute, and Analyze
   */
  async queryAndAnalyze(options: {
    query: string;
    tables?: string[];
    analysisPrompt?: string;
    maxRows?: number;
  }): Promise<{
    success: boolean;
    sql?: string;
    data?: Array<Record<string, unknown>>;
    analysis?: string;
    insights?: string[];
    recommendations?: string[];
    metadata?: {
      rowCount?: number;
      executionTimeMs?: number;
      tablesUsed?: string[];
    };
    error?: string;
  }> {
    // Step 1: Generate SQL
    const sqlResult = await this.generateSQL({
      query: options.query,
      tables: options.tables,
      maxRows: options.maxRows,
    });

    if (!sqlResult.success) {
      return {
        success: false,
        error: `SQL Generation failed: ${sqlResult.error}`,
      };
    }

    // Step 2: Execute SQL
    const executeResult = await this.executeSQL({
      sql: sqlResult.sql!,
      maxRows: options.maxRows,
    });

    if (!executeResult.success) {
      return {
        success: false,
        sql: sqlResult.sql,
        error: `SQL Execution failed: ${executeResult.error}`,
      };
    }

    // Step 3: Analyze Results (if prompt provided)
    let analysisResult = null;
    if (
      options.analysisPrompt &&
      executeResult.data &&
      executeResult.data.length > 0
    ) {
      analysisResult = await this.analyzeResults({
        data: executeResult.data,
        prompt: options.analysisPrompt,
      });
    }

    return {
      success: true,
      sql: sqlResult.sql,
      data: executeResult.data,
      analysis: analysisResult?.analysis,
      insights: analysisResult?.insights,
      recommendations: analysisResult?.recommendations,
      metadata: {
        rowCount: executeResult.rowCount,
        executionTimeMs: executeResult.executionTimeMs,
        tablesUsed: sqlResult.tablesUsed,
      },
    };
  }
}
