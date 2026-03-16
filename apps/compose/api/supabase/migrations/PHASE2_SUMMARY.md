# Phase 2 Migrations - Summary

## Files Created

### Migration Files (6 files)
1. **20260109000012_prediction_analysts.sql** (2.6 KB)
   - analysts table (multi-perspective analysts with scope hierarchy)
   - analyst_overrides table (per-universe/target overrides)
   - analyst_assessments table (assessment records)

2. **20260109000013_prediction_learnings.sql** (3.1 KB)
   - learnings table (accumulated insights with scope hierarchy)
   - learning_queue table (AI suggestions for HITL review)

3. **20260109000014_prediction_review_queue.sql** (2.8 KB)
   - review_queue table (HITL for moderate confidence signals)
   - source_crawls table (crawl history tracking)
   - source_seen_items table (deduplication tracking)

4. **20260109000015_prediction_helper_functions.sql** (3.5 KB)
   - get_active_analysts() - Returns analysts with effective weights
   - get_active_learnings() - Returns applicable learnings
   - increment_learning_application() - Updates learning usage counters
   - get_analyst_effective_settings() - Returns effective settings for analyst

5. **20260109000016_prediction_seed_analysts.sql** (4.2 KB)
   - Seeds 15 analysts across all domains:
     - 1 runner-level (Base Analyst)
     - 3 stocks domain (Technical Tina, Fundamental Fred, Sentiment Sally)
     - 4 crypto domain (On-Chain Otto, DeFi Diana, Crypto Sentiment Sam, Regulatory Rachel)
     - 3 elections domain (Polling Paul, Modeling Mike, Ground Game Gina)
     - 4 polymarket domain (Probability Pete, News Nancy, Contrarian Carl, Resolution Rick)

6. **20260109000017_prediction_analysts_rls.sql** (3.9 KB)
   - RLS policies for all 8 new tables
   - Service role full access
   - Authenticated read based on org access
   - Review queue update policies for HITL

### Support Files (4 files)
1. **apply_phase2_migrations.sh** (1.2 KB)
   - Bash script to apply all migrations in order
   - Includes verification steps
   - Error handling

2. **verify_phase2_migrations.sql** (6.8 KB)
   - Comprehensive verification script
   - 10 verification checks
   - Summary report

3. **PHASE2_README.md** (7.1 KB)
   - Complete documentation
   - Migration details
   - Application instructions
   - Verification steps
   - Architecture overview
   - Rollback instructions

4. **PHASE2_SUMMARY.md** (this file)
   - Quick reference summary
   - File listing
   - Key metrics
   - Quick start guide

## Key Metrics

### Database Objects Created
- **Tables**: 8
- **Indexes**: ~60 (including GIN indexes for JSONB)
- **Functions**: 4
- **Triggers**: 4 (updated_at)
- **RLS Policies**: ~16
- **Seeded Analysts**: 15

### Table Sizes (estimated)
- analysts: 15 rows initially (domain analysts)
- analyst_overrides: 0 rows initially (created as needed)
- analyst_assessments: 0 rows initially (grows with assessments)
- learnings: 0 rows initially (accumulated over time)
- learning_queue: 0 rows initially (AI suggestions)
- review_queue: 0 rows initially (moderate confidence signals)
- source_crawls: 0 rows initially (crawl history)
- source_seen_items: 0 rows initially (deduplication)

## Quick Start

### 1. Apply Migrations
```bash
cd /Users/golfergeek/projects/orchAI/orchestrator-ai-v2/apps/api/supabase/migrations
chmod +x apply_phase2_migrations.sh
./apply_phase2_migrations.sh
```

### 2. Verify Application
```bash
docker exec supabase_db_api-dev psql -U postgres -d postgres -f /Users/golfergeek/projects/orchAI/orchestrator-ai-v2/apps/api/supabase/migrations/verify_phase2_migrations.sql
```

### 3. Test Helper Functions
```sql
-- Get analysts for a target
SELECT * FROM prediction.get_active_analysts('target-uuid-here');

-- Get learnings for a target
SELECT * FROM prediction.get_active_learnings('target-uuid-here');

-- Check seeded analysts
SELECT scope_level, domain, COUNT(*)
FROM prediction.analysts
GROUP BY scope_level, domain;
```

## Key Features

### Analyst System
- **Multi-perspective**: Each signal assessed by multiple specialized analysts
- **Scope hierarchy**: runner → domain → universe → target
- **Weight-based ensemble**: 0.00-2.00 weights for balanced assessment
- **LLM tier support**: gold/silver/bronze instructions for cost optimization
- **Learning integration**: Analysts accumulate patterns over time
- **A2A support**: Can register external agents as analysts

### Learning System
- **AI-assisted**: System suggests learnings from evaluations
- **HITL review**: Humans approve/reject AI suggestions
- **Effectiveness tracking**: times_applied and times_helpful metrics
- **Versioning**: Learnings can be superseded by improved versions
- **Scope hierarchy**: Same as analysts for flexible application
- **Multiple types**: rule, pattern, weight_adjustment, threshold, avoid

### Review Queue (HITL)
- **Moderate confidence**: Signals in confidence range 0.40-0.70
- **Human review**: Approve, reject, or modify AI assessments
- **Learning creation**: Flag reviews for learning extraction
- **Quality control**: Ensures high-quality predictors

### Source Tracking
- **Crawl history**: Performance and error tracking
- **Deduplication**: SHA-256 content hashing
- **Retry logic**: Automatic retry with exponential backoff
- **Metrics**: items_found, items_new, signals_created

## Architecture Highlights

### Scope Hierarchy
Both analysts and learnings use a 4-level scope hierarchy:
1. **runner** (global): Applies everywhere
2. **domain** (stocks, crypto, elections, polymarket): Domain-specific
3. **universe**: Universe-specific
4. **target**: Target-specific

The helper functions resolve the hierarchy and apply overrides correctly.

### Weight System
- **Default weight**: Set at analyst creation (0.00-2.00)
- **Universe override**: Can override for entire universe
- **Target override**: Can override for specific target
- **Priority**: target > universe > default

### LLM Tier System
- **gold**: Comprehensive analysis, highest quality, highest cost
- **silver**: Standard analysis, balanced quality/cost
- **bronze**: Quick analysis, lowest cost

Instructions tailored per analyst and tier.

## Next Steps

After applying Phase 2 migrations:

1. **Phase 3**: Implement analyst assessment services
   - AssessmentService for running analysts
   - Ensemble service for combining assessments
   - Assessment caching and optimization

2. **Phase 4**: Implement learning system services
   - LearningService for applying learnings
   - LearningQueueService for AI suggestions
   - LearningEvaluationService for effectiveness tracking

3. **Phase 5**: Implement review queue UI and APIs
   - ReviewQueueController for HITL endpoints
   - ReviewQueueService for review logic
   - Frontend components for human review

4. **Phase 6**: Integrate with source crawlers
   - SourceCrawlerService for automated crawling
   - Deduplication service
   - Crawl scheduling and retry logic

## Dependencies

### Phase 1 Tables Required
- prediction.universes
- prediction.targets
- prediction.sources
- prediction.signals
- prediction.predictors
- prediction.predictions
- prediction.evaluations
- prediction.missed_opportunities

### Phase 1 Functions Required
- prediction.set_updated_at()
- prediction.user_has_org_access()

## Migration Details

### Migration Order (CRITICAL)
Migrations MUST be applied in this order:
1. analysts (base table)
2. learnings (depends on analysts)
3. review_queue (depends on signals, predictors)
4. helper_functions (depends on analysts, learnings)
5. seed_analysts (populates analysts)
6. analysts_rls (policies for all tables)

### Rollback Order
Reverse order:
1. Drop RLS policies
2. Drop analysts data
3. Drop functions
4. Drop review_queue tables
5. Drop learning tables
6. Drop analyst tables

## Performance Considerations

### Indexes
- All foreign keys indexed
- Commonly queried columns indexed
- GIN indexes for JSONB columns
- Composite indexes for scope hierarchy

### Query Optimization
- Helper functions use CTEs for clarity
- DISTINCT ON for scope resolution
- EXISTS for RLS policies (fast)
- Proper index usage in WHERE clauses

### Caching
- Helper functions are STABLE (cacheable)
- Consider caching analyst lists
- Consider caching learning lists
- Invalidate on updates

## Security

### RLS Policies
- Service role: Full access
- Authenticated: Read based on org access
- Review queues: Update allowed for HITL
- Learning queue: Update allowed for HITL
- No public access

### Data Privacy
- All tables organization-scoped
- RLS enforced at database level
- No cross-org data leakage
- Audit trail via timestamps

## Monitoring

### Key Metrics to Track
- Analyst assessment counts
- Learning application counts
- Learning helpfulness rates
- Review queue size
- Crawl success rates
- Average assessment time
- Cost per assessment (by tier)

### Health Checks
- Review queue not backing up
- Learning queue being processed
- Crawls completing successfully
- No stale assessments
- Analyst weights balanced

## Support

For issues or questions:
1. Check PHASE2_README.md for detailed documentation
2. Run verify_phase2_migrations.sql to check status
3. Review migration files for schema details
4. Check logs for error messages

## Version History

- **2026-01-09**: Phase 2 initial release
  - 8 tables created
  - 4 helper functions
  - 15 analysts seeded
  - 16 RLS policies
  - Comprehensive documentation
