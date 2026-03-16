# Supabase Tool Agent - BUILD Mode Examples

This document provides example payloads for executing the Supabase Tool Agent in BUILD mode.

## Overview

The Supabase Tool Agent wraps 4 MCP tools for database operations:
- `supabase/get-schema` - Inspect database schema
- `supabase/generate-sql` - Generate SQL queries
- `supabase/execute-sql` - Execute read-only SQL
- `supabase/analyze-results` - Analyze query results

## Basic BUILD Request

### Sequential Execution (Default)

```json
{
  "mode": "build",
  "conversationId": "conv-123",
  "payload": {
    "userMessage": "Analyze agent_conversations table and show top 5 most recent conversations"
  }
}
```

This uses the default configuration from the agent definition:
- Sequential execution (`toolExecutionMode: "sequential"`)
- Stops on first error (`stopOnError: true`)
- Default parameters for all tools

## Custom Tool Parameters

### Override Specific Tool Parameters

```json
{
  "mode": "build",
  "conversationId": "conv-456",
  "payload": {
    "userMessage": "Get detailed schema for agent_conversations and users tables",
    "toolParams": {
      "supabase/get-schema": {
        "tables": ["agent_conversations", "users"],
        "domain": "core"
      },
      "supabase/execute-sql": {
        "max_rows": 50
      }
    }
  }
}
```

### Custom Analysis Prompt

```json
{
  "mode": "build",
  "conversationId": "conv-789",
  "payload": {
    "userMessage": "Run KPI analysis on kpi_metrics table",
    "toolParams": {
      "supabase/get-schema": {
        "tables": ["kpi_metrics", "kpi_data"],
        "domain": "analytics"
      },
      "supabase/generate-sql": {
        "query": "Calculate average metric values by category",
        "tables": ["kpi_metrics", "kpi_data"],
        "max_rows": 100
      },
      "supabase/analyze-results": {
        "analysis_prompt": "Identify trends and anomalies for executive summary"
      }
    }
  }
}
```

## Execution Control

### Stop on Error (Fail-Fast)

```json
{
  "mode": "build",
  "conversationId": "conv-101",
  "payload": {
    "userMessage": "Validate data integrity across all tables",
    "toolExecutionMode": "sequential",
    "stopOnError": true
  }
}
```

### Continue on Error

```json
{
  "mode": "build",
  "conversationId": "conv-102",
  "payload": {
    "userMessage": "Best-effort data collection from multiple sources",
    "toolExecutionMode": "sequential",
    "stopOnError": false
  }
}
```

## Complete Example with All Options

```json
{
  "mode": "build",
  "conversationId": "conv-complete",
  "payload": {
    "userMessage": "Comprehensive analysis of user activity and conversations",
    "toolParams": {
      "supabase/get-schema": {
        "tables": ["users", "agent_conversations"],
        "domain": "analytics"
      },
      "supabase/generate-sql": {
        "query": "Join users with conversations to analyze activity patterns",
        "tables": ["users", "agent_conversations"],
        "max_rows": 200
      },
      "supabase/execute-sql": {
        "max_rows": 500
      },
      "supabase/analyze-results": {
        "analysis_prompt": "Provide detailed breakdown of user engagement patterns with actionable insights"
      }
    },
    "toolExecutionMode": "sequential",
    "stopOnError": true
  }
}
```

## Expected Response Structure

### Success Response

```json
{
  "success": true,
  "mode": "build",
  "payload": {
    "result": {
      "schema": { ... },
      "sql": "SELECT ...",
      "results": [ ... ],
      "analysis": "..."
    },
    "metadata": {
      "toolsExecuted": 4,
      "successfulTools": 4,
      "failedTools": 0,
      "executionMode": "sequential",
      "stopOnError": true,
      "toolsUsed": [
        "supabase/get-schema",
        "supabase/generate-sql",
        "supabase/execute-sql",
        "supabase/analyze-results"
      ]
    }
  }
}
```

### Error Response (Validation Failure)

```json
{
  "success": false,
  "mode": "build",
  "error": "Tool 'get-schema' must include namespace: expected 'namespace/tool'"
}
```

### Error Response (Security Violation)

```json
{
  "success": false,
  "mode": "build",
  "error": "Security violation: Operation 'DROP' is not allowed in read-only mode"
}
```

## Security Constraints

The Supabase Tool Agent enforces the following security restrictions:

### Denied SQL Operations
- `DROP` - Cannot drop tables or databases
- `TRUNCATE` - Cannot truncate tables
- `ALTER` - Cannot alter table structure
- `DELETE` - Cannot delete rows
- `UPDATE` - Cannot update rows

### Allowed Tables (Whitelist)
Only the following tables can be queried:
- `agent_conversations`
- `kpi_data`
- `kpi_metrics`
- `users`

Attempting to query other tables or use denied operations will result in an error.

## Tool Parameter Reference

### supabase/get-schema

```typescript
{
  tables?: string[];     // Tables to inspect (default: all allowed tables)
  domain?: string;       // Schema domain/category
}
```

### supabase/generate-sql

```typescript
{
  query: string;         // Natural language query description
  tables: string[];      // Tables to query against
  max_rows?: number;     // Maximum rows to return (default: 100)
}
```

### supabase/execute-sql

```typescript
{
  sql?: string;          // SQL to execute (usually from generate-sql)
  max_rows?: number;     // Maximum rows to return (default: 1000)
}
```

### supabase/analyze-results

```typescript
{
  results?: any[];       // Query results to analyze (from execute-sql)
  analysis_prompt?: string;  // Custom analysis prompt (default: "Summarize for stakeholders")
}
```

## Testing

Run the smoke test to verify the tool agent is working:

```bash
cd apps/api/testing
./run-supabase-orchestration-test.sh
```

Or run just the tool agent smoke test:

```bash
cd apps/api/testing
node test-supabase-tool-agent.js
```

## cURL Examples

### Basic Request

```bash
curl -X POST http://localhost:3001/agent-to-agent/demo/supabase-agent/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "mode": "build",
    "conversationId": "test-123",
    "payload": {
      "userMessage": "Analyze agent_conversations table"
    }
  }'
```

### Request with Custom Parameters

```bash
curl -X POST http://localhost:3001/agent-to-agent/demo/supabase-agent/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "mode": "build",
    "conversationId": "test-456",
    "payload": {
      "userMessage": "Get top 10 users by conversation count",
      "toolParams": {
        "supabase/generate-sql": {
          "query": "Count conversations per user, show top 10",
          "tables": ["users", "agent_conversations"],
          "max_rows": 10
        },
        "supabase/execute-sql": {
          "max_rows": 10
        }
      }
    }
  }'
```

## Notes

- All tools must be namespaced with `supabase/` prefix
- Tool execution is sequential by default
- Security enforcement happens at the MCP layer
- Metadata validation ensures PRD §8 compliance
- Parameter interpolation supports `{{payload.*}}` and `{{metadata.*}}` syntax
