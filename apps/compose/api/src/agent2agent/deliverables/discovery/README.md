# Deliverable Discovery System

## Overview

The Deliverable Discovery System allows the application to find deliverables from custom/external systems that don't store deliverables in the standard `deliverables` table. This is particularly useful for agents like Marketing Swarm and CAD Agent that manage their own deliverable storage.

## Architecture

### Core Components

1. **`IDeliverableDiscovery` Interface** (`deliverable-discovery.interface.ts`)
   - Defines the contract for discovery services
   - Each discovery service implements this interface for a specific agent

2. **`DeliverableDiscoveryRegistry`** (`deliverable-discovery-registry.service.ts`)
   - Central registry for all discovery services
   - Auto-registers discovery services on module initialization
   - Provides methods to discover deliverables by agent slug, agent type, or all agents

3. **Discovery Services**
   - **`MarketingSwarmDiscoveryService`**: Queries `marketing.swarm_tasks` table and LangGraph state
   - **`CadAgentDiscoveryService`**: Queries `tasks.response` field for CAD data
   - **`LegalDepartmentDiscoveryService`**: Queries `law.document_extractions` table for processed documents

### How It Works

1. **Registration**: Discovery services are automatically registered when the `DeliverablesModule` initializes
2. **Discovery**: When `findAll` is called in `DeliverablesService`, it:
   - Queries standard deliverables from the `deliverables` table
   - Queries all conversations with `agent_type = 'api'` (complex agents)
   - For each conversation, calls the discovery registry to find external deliverables
   - Merges discovered deliverables with standard deliverables
   - Returns unified list sorted by creation date

3. **Format Conversion**: Discovered deliverables are converted to `DeliverableSearchResult` format so they appear identical to standard deliverables in the UI

## Adding New Discovery Services

To add discovery for a new agent:

1. **Create a discovery service** implementing `IDeliverableDiscovery`:
```typescript
@Injectable()
export class MyAgentDiscoveryService implements IDeliverableDiscovery {
  readonly agentSlug = 'my-agent';
  readonly agentTypes = ['api']; // or ['media'], ['context'], etc.

  async discoverDeliverables(
    conversationId: string,
    userId: string,
  ): Promise<DiscoveredDeliverable[]> {
    // Query your custom storage system
    // Return deliverables in DiscoveredDeliverable format
  }
}
```

2. **Register it** in `DeliverablesModule`:
```typescript
providers: [
  // ... existing providers
  MyAgentDiscoveryService,
],
```

3. **Inject it** in `DeliverableDiscoveryRegistry`:
```typescript
constructor(
  // ... existing injections
  @Optional() private readonly myAgentDiscovery?: MyAgentDiscoveryService,
) {}

onModuleInit() {
  // ... existing registrations
  if (this.myAgentDiscovery) {
    this.register(this.myAgentDiscovery);
  }
}
```

## Current Discovery Methods

### Marketing Swarm
- **Source**: `marketing.swarm_tasks` table
- **Query**: Completed tasks for the conversation
- **Content**: Loaded on-demand from LangGraph state API

### CAD Agent
- **Source**: `tasks.response` field
- **Query**: Completed tasks with CAD data in response
- **Content**: Extracted from nested response structure

### Legal Department
- **Source**: `law.document_extractions` table and standard `deliverables` table
- **Query**: Document extractions linked to tasks in the conversation
- **Content**: Document metadata, extracted text, and analysis results
- **Note**: Analysis deliverables are stored in the standard table, but document extractions are discovered separately

## Future Enhancements

- **LangGraph API Integration**: Query LangGraph state API directly for Marketing Swarm deliverables
- **Caching**: Cache discovered deliverables to reduce database queries
- **Lazy Loading**: Only load full content when deliverable is viewed (not in list)
- **Agent Type Detection**: Automatically detect which discovery methods to use based on conversation metadata
