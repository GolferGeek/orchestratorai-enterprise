# Gold Standard Baseline Migration

**Created:** 2025-10-14
**File:** `202510140100_gold_standard_baseline.sql`
**Status:** Production-ready baseline through Phase 7

## Purpose

This is a comprehensive baseline migration that replaces all previous migrations. It contains the complete database schema and seed data in one file, making it easy to set up a fresh database or reset to a known-good state.

## What's Included

### ✅ Schemas
- **public** - Core orchestration tables, agents, plans, deliverables
- **n8n** - n8n workflow engine tables and data
- **company** - Company, departments, KPI metrics and goals
- **auth.users** - User authentication data

### ✅ Users (3)
- demo.user@orchestratorai.io
- golfergeek@orchestratorai.io
- admin@orchestratorai.io

### ✅ Agents (17)
All baseline agents plus:
- finance-manager (orchestrator)
- summarizer (context)
- supabase-agent (tool)
- marketing-swarm (api)
- blog_post_writer (context)
- image orchestrators and generators
- requirements-specialist

### ✅ Orchestrations (2)
- **kpi-tracking** (Phase 5) - KPI data aggregation and reporting
- **finance-quarterly-review** (Phase 6) - Quarterly finance review with sub-orchestration

### ✅ N8N Workflows (3)
- Helper: LLM Task
- Marketing Swarm - Flexible LLM (active)
- Marketing Swarm - Major Announcement (active)

### ✅ Data Included
- 17 agents
- 3 users
- 6 company departments
- 2 n8n credentials
- 3 n8n workflows
- 2 orchestration definitions
- Company KPI metrics and goals

## Features Included

### Phase 1-3: Core Infrastructure
- Orchestration schema (runs, steps, definitions)
- Plan system
- Deliverables
- Human approvals and checkpoints

### Phase 4: Core Agents
- Finance manager orchestrator
- Supabase database agent
- Data summarizer

### Phase 5: Deliverable Mapping
- OrchestrationOutputMapper service
- OrchestrationStepExecutorService
- KPI tracking orchestration
- JSONPath output mapping

### Phase 6: Sub-Orchestration Support
- OrchestrationRunFactoryService
- Parent-child orchestration runs
- Parameter interpolation
- Conversation inheritance
- Finance quarterly review orchestration

### Phase 7: Dashboard APIs
- OrchestrationDashboardService
- List/detail/replay/approval endpoints
- Lifecycle filtering
- Search and pagination

## Usage

### Fresh Install
```bash
# Start Supabase
cd apps/api
npx supabase start

# Apply gold standard baseline
PGPASSWORD=postgres psql -h 127.0.0.1 -p 6012 -U postgres -d postgres -f supabase/migrations/202510140100_gold_standard_baseline.sql
```

### Reset to Baseline
```bash
# Drop existing schemas (will ask for confirmation)
PGPASSWORD=postgres psql -h 127.0.0.1 -p 6012 -U postgres -d postgres -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS n8n CASCADE; DROP SCHEMA IF EXISTS company CASCADE;"

# Recreate schemas
PGPASSWORD=postgres psql -h 127.0.0.1 -p 6012 -U postgres -d postgres -c "CREATE SCHEMA IF NOT EXISTS public; CREATE SCHEMA IF NOT EXISTS n8n; CREATE SCHEMA IF NOT EXISTS company;"

# Apply gold standard
PGPASSWORD=postgres psql -h 127.0.0.1 -p 6012 -U postgres -d postgres -f supabase/migrations/202510140100_gold_standard_baseline.sql
```

## Deprecated Migrations

The following migrations are **NO LONGER NEEDED** and can be deleted:

```
202510010001_assets.sql
202510010002_assets_external.sql
202510010004_seed_image_function_agent.sql
202510010006_seed_image_orchestrator_agent.sql
202510020101_pseudonym_dictionaries_org_scope.sql
202510020102_add_function_code_column.sql
202510030001_create_pseudonym_mappings.sql
202510040001_create_plans_tables.sql
20251005000001_add_organization_slug_to_conversations.sql
20251005000002_add_total_cost_to_llm_usage.sql
20251005000003_seed_blog_post_writer_agent.sql
202510060001_update_conversations_with_stats_add_org_slug.sql
20251007190433_add_n8n_marketing_swarm_major_announcement.sql
20251008114500_add_total_cost_column.sql
20251009153536_create_n8n_schema.sql
202510120001_drop_projects_and_conversation_plans_add_plans.sql
202510120010_drop_legacy_projects_and_jokes.sql
202510120200_orchestration_phase1_schema.sql
202510130010_seed_phase4_core_agents.sql
202510140010_seed_phase5_kpi_tracking_orchestration.sql
202510140020_seed_phase6_finance_quarterly_review_orchestration.sql
```

All of these are consolidated into `202510140100_gold_standard_baseline.sql`.

## File Stats
- **Lines:** 7,322
- **Size:** 4.2MB
- **Schemas:** 3 (public, n8n, company)
- **Tables:** 60+
- **Data rows:** ~100+

## Next Migrations

Future migrations (Phase 8+) should be incremental changes added AFTER this baseline.

Example:
```
202510140100_gold_standard_baseline.sql (this file - do not modify)
202510150001_phase8_new_feature.sql (future changes)
202510160001_phase9_another_feature.sql (future changes)
```

## Verification

After applying, verify the baseline:

```bash
# Check users
PGPASSWORD=postgres psql -h 127.0.0.1 -p 6012 -U postgres -d postgres -c "SELECT email FROM auth.users;"

# Check orchestrations
PGPASSWORD=postgres psql -h 127.0.0.1 -p 6012 -U postgres -d postgres -c "SELECT name, version FROM public.orchestration_definitions;"

# Check workflows
PGPASSWORD=postgres psql -h 127.0.0.1 -p 6012 -U postgres -d postgres -c "SELECT name, active FROM n8n.workflow_entity;"
```

Expected output:
- 3 users
- 2 orchestration definitions
- 3 n8n workflows
- 17 agents

## Maintenance

**DO NOT MODIFY THIS FILE**

This is a snapshot baseline. For changes:
1. Create a NEW migration file dated after this one
2. Apply incremental changes in the new file
3. This file remains as the "known good state" reference

---

**Last Updated:** 2025-10-14
**Through Phase:** 7 (Dashboard APIs)
