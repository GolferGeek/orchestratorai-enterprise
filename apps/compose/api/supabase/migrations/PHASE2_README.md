# Prediction System - Phase 2 Migrations

## Overview

Phase 2 adds the analyst system, learning system, review queue, and source tracking to the prediction system.

## Migrations

### 1. `20260109000012_prediction_analysts.sql`
Creates analyst system for multi-perspective signal assessment:
- **analysts**: Multi-perspective analysts with scope hierarchy (runner → domain → universe → target)
- **analyst_overrides**: Per-universe/target weight and tier overrides
- **analyst_assessments**: Individual assessment records from analysts

**Key Features:**
- Scope hierarchy allows analysts at different levels (global, domain-specific, universe-specific, target-specific)
- Tier instructions for gold/silver/bronze LLM tiers
- Weight-based ensemble system (0.00-2.00)
- Learned patterns accumulation
- Optional A2A agent registration

### 2. `20260109000013_prediction_learnings.sql`
Creates learning system for accumulating insights:
- **learnings**: Accumulated insights and patterns from evaluations
- **learning_queue**: AI-suggested learnings pending human review (HITL)

**Key Features:**
- Learning types: rule, pattern, weight_adjustment, threshold, avoid
- Scope hierarchy (same as analysts)
- Effectiveness tracking (times_applied, times_helpful)
- Versioning and superseding
- AI suggestions with confidence scores

### 3. `20260109000014_prediction_review_queue.sql`
Creates review queue and source tracking:
- **review_queue**: HITL review for signals with moderate confidence
- **source_crawls**: Crawl history and performance tracking
- **source_seen_items**: Deduplication tracking for source items

**Key Features:**
- Human-in-the-loop for moderate confidence signals
- Learning creation from human reviews
- Crawl performance and error tracking
- SHA-256 content hashing for deduplication

### 4. `20260109000015_prediction_helper_functions.sql`
Creates helper functions:
- **get_active_analysts()**: Returns analysts with effective weights for a target
- **get_active_learnings()**: Returns learnings applicable to a target
- **increment_learning_application()**: Increments learning usage counters
- **get_analyst_effective_settings()**: Returns effective settings for specific analyst

**Key Features:**
- Scope hierarchy resolution
- Override application (target > universe > default)
- Performance optimized with indexes

### 5. `20260109000016_prediction_seed_analysts.sql`
Seeds system and domain analysts:
- **1 runner-level analyst**: Base Analyst (balanced, objective)
- **3 stocks domain analysts**: Technical Tina, Fundamental Fred, Sentiment Sally
- **4 crypto domain analysts**: On-Chain Otto, DeFi Diana, Crypto Sentiment Sam, Regulatory Rachel
- **3 elections domain analysts**: Polling Paul, Modeling Mike, Ground Game Gina
- **4 polymarket domain analysts**: Probability Pete, News Nancy, Contrarian Carl, Resolution Rick

**Total: 15 analysts**

### 6. `20260109000017_prediction_analysts_rls.sql`
Adds RLS policies for all Phase 2 tables:
- Service role has full access
- Authenticated users can read based on org access
- Review queues allow authenticated updates for HITL

## Application

### Option 1: Using the script
```bash
cd /Users/golfergeek/projects/orchAI/orchestrator-ai-v2/apps/api/supabase/migrations
chmod +x apply_phase2_migrations.sh
./apply_phase2_migrations.sh
```

### Option 2: Manual application
```bash
docker exec -i supabase_db_api-dev psql -U postgres -d postgres < /path/to/20260109000012_prediction_analysts.sql
docker exec -i supabase_db_api-dev psql -U postgres -d postgres < /path/to/20260109000013_prediction_learnings.sql
docker exec -i supabase_db_api-dev psql -U postgres -d postgres < /path/to/20260109000014_prediction_review_queue.sql
docker exec -i supabase_db_api-dev psql -U postgres -d postgres < /path/to/20260109000015_prediction_helper_functions.sql
docker exec -i supabase_db_api-dev psql -U postgres -d postgres < /path/to/20260109000016_prediction_seed_analysts.sql
docker exec -i supabase_db_api-dev psql -U postgres -d postgres < /path/to/20260109000017_prediction_analysts_rls.sql
```

## Verification

After applying migrations, verify:

### 1. Check tables created
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'prediction'
  AND table_name IN (
    'analysts',
    'analyst_overrides',
    'analyst_assessments',
    'learnings',
    'learning_queue',
    'review_queue',
    'source_crawls',
    'source_seen_items'
  )
ORDER BY table_name;
```

Should return 8 tables.

### 2. Check analyst count
```sql
SELECT
  scope_level,
  domain,
  COUNT(*) as count
FROM prediction.analysts
GROUP BY scope_level, domain
ORDER BY scope_level, domain;
```

Expected:
- runner: 1
- domain (crypto): 4
- domain (elections): 3
- domain (polymarket): 4
- domain (stocks): 3

**Total: 15 analysts**

### 3. Test helper functions
```sql
-- Get active analysts for a target (replace UUID with actual target_id)
SELECT * FROM prediction.get_active_analysts('00000000-0000-0000-0000-000000000000'::uuid);

-- Get active learnings for a target
SELECT * FROM prediction.get_active_learnings('00000000-0000-0000-0000-000000000000'::uuid);
```

### 4. Check RLS policies
```sql
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'prediction'
  AND tablename IN (
    'analysts',
    'analyst_overrides',
    'analyst_assessments',
    'learnings',
    'learning_queue',
    'review_queue',
    'source_crawls',
    'source_seen_items'
  )
ORDER BY tablename, policyname;
```

Should return policies for all 8 tables.

## Dependencies

### Required Tables (Phase 1)
- prediction.universes
- prediction.targets
- prediction.sources
- prediction.signals
- prediction.predictors
- prediction.predictions
- prediction.evaluations
- prediction.missed_opportunities

### Required Functions (Phase 1)
- prediction.set_updated_at()
- prediction.user_has_org_access()

## Scope Hierarchy

Both analysts and learnings use a scope hierarchy:

1. **runner** (global) - Applies to all organizations, domains, universes, targets
2. **domain** (stocks, crypto, elections, polymarket) - Applies to all universes/targets in that domain
3. **universe** - Applies to all targets in that universe
4. **target** - Applies only to that specific target

When retrieving analysts or learnings, the system considers all applicable scopes and applies overrides in priority order (target > universe > domain > runner).

## Analyst System Architecture

### Multi-Perspective Assessment
- Each signal is assessed by multiple analysts
- Each analyst has a specific perspective (technical, fundamental, sentiment, etc.)
- Analysts provide direction, confidence, and reasoning
- Assessments are weighted and ensembled

### LLM Tier Support
- Each analyst has instructions for gold/silver/bronze tiers
- Tier can be overridden at universe or target level
- Allows cost optimization while maintaining quality

### Learning Integration
- Analysts accumulate learned patterns over time
- Learnings are injected into analyst assessments
- Effectiveness is tracked (times_applied, times_helpful)

## Learning System Architecture

### Learning Types
- **rule**: Explicit rules to follow
- **pattern**: Recognized patterns with success rates
- **weight_adjustment**: Dynamic analyst weight adjustments
- **threshold**: Parameter adjustments (min_predictors, etc.)
- **avoid**: Patterns to avoid

### AI-Assisted Learning
- System suggests learnings from evaluations
- Human reviews suggestions in learning_queue
- Approved learnings become active
- Rejected learnings are tracked for future reference

### Versioning
- Learnings can be superseded by improved versions
- Version history maintained
- Old versions kept for historical analysis

## Review Queue (HITL)

### When Signals Enter Review Queue
- Moderate confidence (typically 0.40-0.70)
- Conflicting analyst assessments
- Edge cases or unusual patterns

### Human Review Process
1. Human reviews AI assessment
2. Can approve, reject, or modify
3. If modified, can adjust direction and strength
4. Can flag for learning creation

### Learning Creation
- Reviewer can mark review for learning creation
- System suggests learning based on human feedback
- Goes to learning_queue for final approval

## Next Steps

After applying Phase 2 migrations:

1. **Phase 3**: Implement analyst assessment services
2. **Phase 4**: Implement learning system services
3. **Phase 5**: Implement review queue UI and APIs
4. **Phase 6**: Integrate with source crawlers

## Rollback

To rollback Phase 2 migrations:

```sql
-- Drop in reverse order
DROP TABLE IF EXISTS prediction.source_seen_items CASCADE;
DROP TABLE IF EXISTS prediction.source_crawls CASCADE;
DROP TABLE IF EXISTS prediction.review_queue CASCADE;
DROP TABLE IF EXISTS prediction.learning_queue CASCADE;
DROP TABLE IF EXISTS prediction.learnings CASCADE;
DROP TABLE IF EXISTS prediction.analyst_assessments CASCADE;
DROP TABLE IF EXISTS prediction.analyst_overrides CASCADE;
DROP TABLE IF EXISTS prediction.analysts CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS prediction.get_active_analysts(UUID, TEXT);
DROP FUNCTION IF EXISTS prediction.get_active_learnings(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS prediction.increment_learning_application(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS prediction.get_analyst_effective_settings(UUID, UUID, TEXT);
```

## Notes

- All tables use `prediction` schema (singular), not `predictions`
- All timestamps are `TIMESTAMPTZ` for timezone awareness
- All foreign keys have appropriate `ON DELETE` actions
- GIN indexes added for JSONB columns
- Indexes added for all foreign keys and commonly queried columns
- RLS policies follow org access patterns from Phase 1
- Helper functions are optimized for performance with proper indexing
