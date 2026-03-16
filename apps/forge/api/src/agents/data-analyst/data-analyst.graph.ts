import { StateGraph, END, CompiledStateGraph } from '@langchain/langgraph';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import {
  DataAnalystStateAnnotation,
  DataAnalystState,
} from './data-analyst.state';
import {
  ListTablesTool,
  DescribeTableTool,
  SqlQueryTool,
} from '../shared/tools/data/database';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

const AGENT_SLUG = 'data-analyst';

/**
 * Create the Data Analyst graph
 *
 * Flow:
 * 1. Start → Discover tables
 * 2. Discover → Describe relevant tables
 * 3. Describe → Generate and execute SQL
 * 4. Execute → Summarize results
 * 5. Summarize → End
 */
// Using CompiledStateGraph with broad generics to avoid TS2589 type
// instantiation depth limit caused by deeply nested LangGraph generic types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataAnalystGraph = CompiledStateGraph<any, any, any>;

export async function createDataAnalystGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
  listTablesTool: ListTablesTool,
  describeTableTool: DescribeTableTool,
  sqlQueryTool: SqlQueryTool,
): Promise<DataAnalystGraph> {
  // Note: Tools are called directly via their execute methods rather than
  // through ToolNode, as this provides better control over the workflow.

  // Node: Start analysis
  async function startNode(
    state: DataAnalystState,
  ): Promise<Partial<DataAnalystState>> {
    const ctx = state.executionContext;

    await observability.emitStarted(
      ctx,
      ctx.taskId,
      `Starting data analysis for question: ${state.userMessage}`,
    );

    return {
      status: 'discovering',
      startedAt: Date.now(),
      messages: [new HumanMessage(state.userMessage)],
    };
  }

  // Node: Discover available tables
  async function discoverTablesNode(
    state: DataAnalystState,
  ): Promise<Partial<DataAnalystState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.taskId,
      'Discovering available database tables',
      { step: 'discover_tables', progress: 20 },
    );

    try {
      const tablesResult = await listTablesTool.execute('public');

      // Parse table names from result
      const tableNames = tablesResult
        .split('\n')
        .filter((line) => line.startsWith('- '))
        .map((line) => line.replace('- public.', '').trim());

      return {
        availableTables: tableNames,
        toolResults: [
          {
            toolName: 'list_tables',
            result: tablesResult,
            success: true,
          },
        ],
      };
    } catch (error) {
      return {
        error: `Failed to discover tables: ${error instanceof Error ? error.message : String(error)}`,
        status: 'failed',
      };
    }
  }

  // Node: Use LLM to decide which tables to describe
  async function planSchemaNode(
    state: DataAnalystState,
  ): Promise<Partial<DataAnalystState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.taskId,
      'Planning which tables to examine',
      { step: 'plan_schema', progress: 30 },
    );

    const prompt = `You are a data analyst. Based on the user's question and available tables, decide which tables need to be examined.

User's Question: ${state.userMessage}

Available Tables:
${state.availableTables.map((t) => `- ${t}`).join('\n')}

Return ONLY a JSON array of table names that are relevant to answering the question. Example: ["users", "orders"]
If no tables seem relevant, return an empty array: []`;

    try {
      const response = await llmClient.callLLM({
        context: ctx,
        userMessage: prompt,
        callerName: AGENT_SLUG,
      });

      // Parse the JSON array from response
      const jsonMatch = response.text.match(/\[[\s\S]*?\]/);
      const relevantTables: string[] = jsonMatch
        ? (JSON.parse(jsonMatch[0]) as string[])
        : [];

      // Filter to only include tables that actually exist
      const validTables = relevantTables.filter((table) =>
        state.availableTables.includes(table),
      );

      // If no valid tables selected, use all available tables (up to 5)
      const tablesToUse =
        validTables.length > 0
          ? validTables.slice(0, 5)
          : state.availableTables.slice(0, 5);

      return {
        selectedTables: tablesToUse,
        messages: [
          ...state.messages,
          new AIMessage(`I'll examine these tables: ${tablesToUse.join(', ')}`),
        ],
        status: 'querying',
      };
    } catch {
      // If LLM fails, use all available tables (up to 5)
      return {
        selectedTables: state.availableTables.slice(0, 5),
        status: 'querying',
      };
    }
  }

  // Node: Describe relevant tables
  async function describeTablesNode(
    state: DataAnalystState,
  ): Promise<Partial<DataAnalystState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.taskId,
      'Examining table schemas',
      { step: 'describe_tables', progress: 40 },
    );

    const schemas: Record<string, string> = {};
    const toolResults: Array<{
      toolName: string;
      result: string;
      success: boolean;
    }> = [];

    // Use selected tables if available, otherwise fall back to first 5 available tables
    const tablesToDescribe =
      state.selectedTables.length > 0
        ? state.selectedTables
        : state.availableTables.slice(0, 5);

    for (const tableName of tablesToDescribe) {
      try {
        const schema = await describeTableTool.execute(tableName);
        schemas[tableName] = schema;
        toolResults.push({
          toolName: 'describe_table',
          result: schema,
          success: true,
        });
      } catch (error) {
        toolResults.push({
          toolName: 'describe_table',
          result: `Error: ${error instanceof Error ? error.message : String(error)}`,
          success: false,
        });
      }
    }

    return {
      tableSchemas: schemas,
      toolResults,
    };
  }

  // Node: Generate and execute SQL
  async function executeQueryNode(
    state: DataAnalystState,
  ): Promise<Partial<DataAnalystState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.taskId,
      'Generating and executing SQL query',
      { step: 'execute_query', progress: 60 },
    );

    // Build schema context for SQL generation
    const schemaContext = Object.entries(state.tableSchemas)
      .map(([_table, schema]) => `${schema}`)
      .join('\n\n');

    // Add available tables list to schema context if not already included
    const tablesListHeader = `\n\n--- Available Tables ---\nThe following tables exist in the database:\n${state.availableTables.map((t) => `- ${t}`).join('\n')}\nOnly use tables from this list.\n`;

    // Include available tables list in the question for better SQL generation
    const enhancedQuestion = `${state.userMessage}

Available tables in the database: ${state.availableTables.join(', ')}
Please use only tables that exist in this list.`;

    // Use the natural language tool to generate and execute SQL
    const result = await sqlQueryTool.generateAndExecuteSql(
      enhancedQuestion,
      schemaContext + tablesListHeader,
      ctx, // Pass full ExecutionContext capsule
    );

    // Extract SQL from result
    const sqlMatch = result.match(/```sql\n([\s\S]*?)\n```/);
    const generatedSql = sqlMatch ? sqlMatch[1] : undefined;

    return {
      generatedSql,
      sqlResults: result,
      toolResults: [
        {
          toolName: 'execute_sql',
          result,
          success: !result.includes('Error:'),
        },
      ],
      status: 'summarizing',
    };
  }

  // Node: Summarize results
  async function summarizeNode(
    state: DataAnalystState,
  ): Promise<Partial<DataAnalystState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(ctx, ctx.taskId, 'Formatting results', {
      step: 'summarize',
      progress: 80,
    });

    // Prepare structured data for the LLM to format
    const dataToFormat = {
      userQuestion: state.userMessage,
      generatedSql: state.generatedSql,
      sqlResults: state.sqlResults,
      availableTables: state.availableTables,
    };

    const prompt = `You are a data analyst. Format the following SQL query results into a clear, user-friendly Markdown response.

User's Question: ${dataToFormat.userQuestion}

Generated SQL Query:
\`\`\`sql
${dataToFormat.generatedSql || 'N/A'}
\`\`\`

SQL Query Results:
${dataToFormat.sqlResults || 'No results'}

Available Tables: ${dataToFormat.availableTables.join(', ')}

Please create a well-formatted Markdown response that includes:

1. **A clear summary** that directly answers the user's question based on the query results
2. **The SQL query** in a collapsible details section (use HTML <details> tag)
3. **The query results** formatted as a clean Markdown table

Formatting guidelines:
- Use proper Markdown syntax
- Format the SQL query in a collapsible section: <details><summary>📊 View SQL Query</summary>...code block...</details>
- Convert the pipe-delimited results into a proper Markdown table
- Make the summary concise but informative
- If there was an error, explain it clearly and suggest alternatives

Return ONLY the formatted Markdown - no explanations or meta-commentary.`;

    try {
      const response = await llmClient.callLLM({
        context: ctx,
        userMessage: prompt,
        callerName: AGENT_SLUG,
      });

      const formattedResponse = response.text.trim();

      await observability.emitCompleted(
        ctx,
        ctx.taskId,
        { summary: formattedResponse },
        Date.now() - state.startedAt,
      );

      return {
        summary: formattedResponse,
        status: 'completed',
        completedAt: Date.now(),
        messages: [...state.messages, new AIMessage(formattedResponse)],
      };
    } catch (error) {
      await observability.emitFailed(
        ctx,
        ctx.taskId,
        error instanceof Error ? error.message : String(error),
        Date.now() - state.startedAt,
      );

      return {
        error: error instanceof Error ? error.message : String(error),
        status: 'failed',
        completedAt: Date.now(),
      };
    }
  }

  // Node: Handle errors (named 'handle_error' to avoid conflict with 'error' state channel)
  async function handleErrorNode(
    state: DataAnalystState,
  ): Promise<Partial<DataAnalystState>> {
    const ctx = state.executionContext;

    await observability.emitFailed(
      ctx,
      ctx.taskId,
      state.error || 'Unknown error',
      Date.now() - state.startedAt,
    );

    return {
      status: 'failed',
      completedAt: Date.now(),
    };
  }

  // Build the graph
  const graph = new StateGraph(DataAnalystStateAnnotation)
    .addNode('start', startNode)
    .addNode('discover_tables', discoverTablesNode)
    .addNode('plan_schema', planSchemaNode)
    .addNode('describe_tables', describeTablesNode)
    .addNode('execute_query', executeQueryNode)
    .addNode('summarize', summarizeNode)
    .addNode('handle_error', handleErrorNode)
    // Edges
    .addEdge('__start__', 'start')
    .addEdge('start', 'discover_tables')
    .addConditionalEdges('discover_tables', (state) => {
      if (state.error) return 'handle_error';
      if (state.availableTables.length === 0) return 'handle_error';
      return 'plan_schema';
    })
    .addEdge('plan_schema', 'describe_tables')
    .addEdge('describe_tables', 'execute_query')
    .addConditionalEdges('execute_query', (state) => {
      if (state.error) return 'handle_error';
      return 'summarize';
    })
    .addEdge('summarize', END)
    .addEdge('handle_error', END);

  // Compile with checkpointer.
  // Cast to DataAnalystGraph to avoid TS2589 type depth limit.
  const compiled = graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as DataAnalystGraph;
  return compiled;
}
