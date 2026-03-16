-- =============================================================================
-- ADD RISK AGENT TYPE AND REGISTER INVESTMENT RISK AGENT
-- =============================================================================
-- This migration:
-- 1. Adds 'risk' to the allowed agent_type values
-- 2. Registers the investment-risk-agent in public.agents
-- 3. Creates a default scope for the investment risk agent
-- 4. Creates default dimensions for risk analysis
--
-- Created: 2026-01-16
-- =============================================================================

-- =============================================================================
-- STEP 1: Add 'risk' to allowed agent_type values
-- =============================================================================
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_agent_type_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_agent_type_check
  CHECK (agent_type = ANY (ARRAY['context', 'api', 'external', 'rag-runner', 'orchestrator', 'media', 'langgraph', 'prediction', 'risk']::text[]));

-- =============================================================================
-- STEP 2: Register Investment Risk Agent
-- =============================================================================
INSERT INTO public.agents (
    slug,
    organization_slug,
    name,
    description,
    version,
    agent_type,
    department,
    tags,
    io_schema,
    capabilities,
    context,
    endpoint,
    llm_config,
    metadata,
    created_at,
    updated_at
)
VALUES (
    'investment-risk-agent',
    ARRAY['finance']::TEXT[],
    'Investment Risk Analyzer',
    'Multi-dimensional risk analysis agent that provides comprehensive risk assessments for investment portfolios using Risk Radar analysis, Red Team/Blue Team debate, and continuous learning from outcomes.',
    '1.0.0',
    'risk',
    'finance',
    ARRAY['risk', 'investment', 'analysis', 'portfolio', 'risk-radar', 'debate', 'learning']::TEXT[],
    '{
        "input": {
            "type": "object",
            "properties": {
                "subjectId": {
                    "type": "string",
                    "description": "ID of the investment subject to analyze"
                },
                "scopeId": {
                    "type": "string",
                    "description": "ID of the risk scope to use"
                },
                "mode": {
                    "type": "string",
                    "enum": ["dashboard", "analyze", "debate", "learn"],
                    "description": "Operation mode"
                }
            }
        },
        "output": {
            "type": "object",
            "properties": {
                "success": { "type": "boolean" },
                "compositeScore": { "type": "object" },
                "assessments": { "type": "array" },
                "debates": { "type": "array" }
            }
        }
    }'::JSONB,
    ARRAY['risk-analysis', 'multi-dimension-scoring', 'adversarial-debate', 'learning-loop', 'portfolio-assessment']::TEXT[],
    '{"markdown": "# Investment Risk Analyzer\n\nA multi-dimensional risk analysis agent that provides comprehensive risk assessments.\n\n## Features\n- **Risk Radar**: Parallel analysis across multiple risk dimensions\n- **Red Team/Blue Team**: Adversarial debate for balanced assessment\n- **Learning Loop**: Continuous improvement from outcome tracking\n- **Custom Dimensions**: Table-driven, configurable risk factors\n\n## Risk Dimensions\n- Market Risk: Price volatility, market conditions\n- Credit Risk: Counterparty and default risk\n- Liquidity Risk: Market depth, trading volume\n- Operational Risk: Business and execution risks\n- Regulatory Risk: Compliance and legal risks\n- Concentration Risk: Portfolio diversification\n\n## Analysis Process\n1. Parallel dimension analysis with specialized prompts\n2. Weighted score aggregation\n3. Optional adversarial debate for high-risk scores\n4. Learning from actual outcomes"}'::JSONB,
    '{"url": "http://localhost:3000/api/v1/risk/agents/investment-risk-agent"}'::JSONB,
    '{"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.3}'::JSONB,
    '{
        "runner": "risk-analyzer",
        "hasCustomUI": true,
        "customUIComponent": "investment-risk-dashboard",
        "executionCapabilities": {
            "canConverse": false,
            "canPlan": false,
            "canBuild": false,
            "requiresHumanGate": false,
            "isDashboard": true
        },
        "runnerConfig": {
            "runner": "risk-analyzer",
            "analysisIntervalMs": 1800000,
            "debateThreshold": 0.7,
            "alertThreshold": 0.8
        }
    }'::JSONB,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    agent_type = EXCLUDED.agent_type,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- =============================================================================
-- STEP 3: Create default scope for the investment risk agent
-- =============================================================================
INSERT INTO risk.scopes (
    organization_slug,
    agent_slug,
    name,
    domain,
    description,
    llm_config,
    thresholds,
    analysis_config,
    is_active
)
VALUES (
    'finance',
    'investment-risk-agent',
    'Investment Portfolio Risk',
    'investment',
    'Comprehensive risk analysis scope for investment portfolios including stocks, crypto, and other financial instruments.',
    '{"provider": "anthropic", "model": "claude-sonnet-4-20250514", "temperature": 0.3}'::jsonb,
    '{"alertThreshold": 0.8, "debateThreshold": 0.7, "staleDays": 7}'::jsonb,
    '{"riskRadar": {"enabled": true, "parallelDimensions": true}, "debate": {"enabled": true, "autoTrigger": true}, "learning": {"enabled": true, "autoApprove": false}}'::jsonb,
    true
)
ON CONFLICT DO NOTHING
RETURNING id;

-- =============================================================================
-- STEP 4: Create default risk dimensions
-- =============================================================================
DO $$
DECLARE
    v_scope_id UUID;
BEGIN
    -- Get the scope ID
    SELECT id INTO v_scope_id FROM risk.scopes
    WHERE agent_slug = 'investment-risk-agent' AND organization_slug = 'finance'
    LIMIT 1;

    IF v_scope_id IS NULL THEN
        RAISE EXCEPTION 'Failed to find scope for investment-risk-agent';
    END IF;

    -- Market Risk Dimension
    INSERT INTO risk.dimensions (scope_id, slug, name, description, weight, is_active)
    VALUES (
        v_scope_id,
        'market-risk',
        'Market Risk',
        'Assessment of price volatility, market conditions, and systematic risk exposure.',
        0.25,
        true
    )
    ON CONFLICT (scope_id, slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        weight = EXCLUDED.weight,
        updated_at = NOW();

    -- Credit Risk Dimension
    INSERT INTO risk.dimensions (scope_id, slug, name, description, weight, is_active)
    VALUES (
        v_scope_id,
        'credit-risk',
        'Credit Risk',
        'Assessment of counterparty risk, default probability, and credit quality.',
        0.20,
        true
    )
    ON CONFLICT (scope_id, slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        weight = EXCLUDED.weight,
        updated_at = NOW();

    -- Liquidity Risk Dimension
    INSERT INTO risk.dimensions (scope_id, slug, name, description, weight, is_active)
    VALUES (
        v_scope_id,
        'liquidity-risk',
        'Liquidity Risk',
        'Assessment of market depth, trading volume, and ability to exit positions.',
        0.15,
        true
    )
    ON CONFLICT (scope_id, slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        weight = EXCLUDED.weight,
        updated_at = NOW();

    -- Operational Risk Dimension
    INSERT INTO risk.dimensions (scope_id, slug, name, description, weight, is_active)
    VALUES (
        v_scope_id,
        'operational-risk',
        'Operational Risk',
        'Assessment of business execution, management quality, and operational stability.',
        0.15,
        true
    )
    ON CONFLICT (scope_id, slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        weight = EXCLUDED.weight,
        updated_at = NOW();

    -- Regulatory Risk Dimension
    INSERT INTO risk.dimensions (scope_id, slug, name, description, weight, is_active)
    VALUES (
        v_scope_id,
        'regulatory-risk',
        'Regulatory Risk',
        'Assessment of compliance requirements, legal exposure, and regulatory environment.',
        0.15,
        true
    )
    ON CONFLICT (scope_id, slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        weight = EXCLUDED.weight,
        updated_at = NOW();

    -- Concentration Risk Dimension
    INSERT INTO risk.dimensions (scope_id, slug, name, description, weight, is_active)
    VALUES (
        v_scope_id,
        'concentration-risk',
        'Concentration Risk',
        'Assessment of portfolio diversification, sector exposure, and correlation risks.',
        0.10,
        true
    )
    ON CONFLICT (scope_id, slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        weight = EXCLUDED.weight,
        updated_at = NOW();

    RAISE NOTICE 'Created 6 risk dimensions for investment-risk-agent';
END $$;

-- =============================================================================
-- STEP 5: Create dimension contexts (analysis prompts)
-- =============================================================================
DO $$
DECLARE
    v_dimension_id UUID;
BEGIN
    -- Market Risk Context
    SELECT id INTO v_dimension_id FROM risk.dimensions
    WHERE slug = 'market-risk'
    AND scope_id = (SELECT id FROM risk.scopes WHERE agent_slug = 'investment-risk-agent' LIMIT 1);

    IF v_dimension_id IS NOT NULL THEN
        INSERT INTO risk.dimension_contexts (dimension_id, version, system_prompt, output_schema, is_active)
        VALUES (
            v_dimension_id,
            1,
            'Analyze the market risk for the given investment subject. Consider:
1. Historical price volatility (30-day, 90-day, 1-year)
2. Beta relative to market benchmark
3. Current market sentiment and momentum
4. Macro-economic factors affecting this asset class
5. Recent significant price movements and their causes

Provide a risk score from 0 (lowest risk) to 1 (highest risk) with detailed reasoning.',
            '{"type": "object", "properties": {"score": {"type": "number"}, "confidence": {"type": "number"}, "signals": {"type": "array"}, "reasoning": {"type": "string"}}}'::jsonb,
            true
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- Credit Risk Context
    SELECT id INTO v_dimension_id FROM risk.dimensions
    WHERE slug = 'credit-risk'
    AND scope_id = (SELECT id FROM risk.scopes WHERE agent_slug = 'investment-risk-agent' LIMIT 1);

    IF v_dimension_id IS NOT NULL THEN
        INSERT INTO risk.dimension_contexts (dimension_id, version, system_prompt, output_schema, is_active)
        VALUES (
            v_dimension_id,
            1,
            'Analyze the credit risk for the given investment subject. Consider:
1. Credit ratings from major agencies (if applicable)
2. Debt-to-equity ratio and leverage
3. Interest coverage ratio
4. Counterparty exposure and default probability
5. Financial health indicators and trends

Provide a risk score from 0 (lowest risk) to 1 (highest risk) with detailed reasoning.',
            '{"type": "object", "properties": {"score": {"type": "number"}, "confidence": {"type": "number"}, "signals": {"type": "array"}, "reasoning": {"type": "string"}}}'::jsonb,
            true
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- Liquidity Risk Context
    SELECT id INTO v_dimension_id FROM risk.dimensions
    WHERE slug = 'liquidity-risk'
    AND scope_id = (SELECT id FROM risk.scopes WHERE agent_slug = 'investment-risk-agent' LIMIT 1);

    IF v_dimension_id IS NOT NULL THEN
        INSERT INTO risk.dimension_contexts (dimension_id, version, system_prompt, output_schema, is_active)
        VALUES (
            v_dimension_id,
            1,
            'Analyze the liquidity risk for the given investment subject. Consider:
1. Average daily trading volume
2. Bid-ask spreads
3. Market depth at various price levels
4. Position size relative to daily volume
5. Historical liquidity during stress periods

Provide a risk score from 0 (lowest risk) to 1 (highest risk) with detailed reasoning.',
            '{"type": "object", "properties": {"score": {"type": "number"}, "confidence": {"type": "number"}, "signals": {"type": "array"}, "reasoning": {"type": "string"}}}'::jsonb,
            true
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- Operational Risk Context
    SELECT id INTO v_dimension_id FROM risk.dimensions
    WHERE slug = 'operational-risk'
    AND scope_id = (SELECT id FROM risk.scopes WHERE agent_slug = 'investment-risk-agent' LIMIT 1);

    IF v_dimension_id IS NOT NULL THEN
        INSERT INTO risk.dimension_contexts (dimension_id, version, system_prompt, output_schema, is_active)
        VALUES (
            v_dimension_id,
            1,
            'Analyze the operational risk for the given investment subject. Consider:
1. Management quality and track record
2. Corporate governance practices
3. Business model sustainability
4. Technology and infrastructure risks
5. Key person dependencies

Provide a risk score from 0 (lowest risk) to 1 (highest risk) with detailed reasoning.',
            '{"type": "object", "properties": {"score": {"type": "number"}, "confidence": {"type": "number"}, "signals": {"type": "array"}, "reasoning": {"type": "string"}}}'::jsonb,
            true
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- Regulatory Risk Context
    SELECT id INTO v_dimension_id FROM risk.dimensions
    WHERE slug = 'regulatory-risk'
    AND scope_id = (SELECT id FROM risk.scopes WHERE agent_slug = 'investment-risk-agent' LIMIT 1);

    IF v_dimension_id IS NOT NULL THEN
        INSERT INTO risk.dimension_contexts (dimension_id, version, system_prompt, output_schema, is_active)
        VALUES (
            v_dimension_id,
            1,
            'Analyze the regulatory risk for the given investment subject. Consider:
1. Current regulatory environment
2. Pending legislation or regulatory changes
3. Compliance history and issues
4. Cross-jurisdictional regulatory exposure
5. Industry-specific regulatory trends

Provide a risk score from 0 (lowest risk) to 1 (highest risk) with detailed reasoning.',
            '{"type": "object", "properties": {"score": {"type": "number"}, "confidence": {"type": "number"}, "signals": {"type": "array"}, "reasoning": {"type": "string"}}}'::jsonb,
            true
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- Concentration Risk Context
    SELECT id INTO v_dimension_id FROM risk.dimensions
    WHERE slug = 'concentration-risk'
    AND scope_id = (SELECT id FROM risk.scopes WHERE agent_slug = 'investment-risk-agent' LIMIT 1);

    IF v_dimension_id IS NOT NULL THEN
        INSERT INTO risk.dimension_contexts (dimension_id, version, system_prompt, output_schema, is_active)
        VALUES (
            v_dimension_id,
            1,
            'Analyze the concentration risk for the given investment subject. Consider:
1. Sector and industry concentration
2. Geographic concentration
3. Correlation with other portfolio holdings
4. Customer/revenue concentration (for companies)
5. Factor exposure concentration

Provide a risk score from 0 (lowest risk) to 1 (highest risk) with detailed reasoning.',
            '{"type": "object", "properties": {"score": {"type": "number"}, "confidence": {"type": "number"}, "signals": {"type": "array"}, "reasoning": {"type": "string"}}}'::jsonb,
            true
        )
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE 'Created dimension contexts (analysis prompts) for all dimensions';
END $$;

-- =============================================================================
-- STEP 6: Create debate contexts for Red Team/Blue Team
-- =============================================================================
DO $$
DECLARE
    v_scope_id UUID;
BEGIN
    -- Get the scope ID
    SELECT id INTO v_scope_id FROM risk.scopes
    WHERE agent_slug = 'investment-risk-agent' AND organization_slug = 'finance'
    LIMIT 1;

    IF v_scope_id IS NOT NULL THEN
        -- Blue Team (Risk Defense) Context
        INSERT INTO risk.debate_contexts (scope_id, role, system_prompt, is_active)
        VALUES (
            v_scope_id,
            'blue',
            'You are the Blue Team analyst defending the investment thesis. Your role is to:
1. Present the bull case for this investment
2. Highlight strengths and positive indicators
3. Explain why current risks are manageable or mitigated
4. Identify catalysts that could improve the risk profile
5. Challenge overly pessimistic risk assessments

Be rigorous but fair. Acknowledge legitimate risks while presenting counterarguments.',
            true
        )
        ON CONFLICT DO NOTHING;

        -- Red Team (Risk Challenge) Context
        INSERT INTO risk.debate_contexts (scope_id, role, system_prompt, is_active)
        VALUES (
            v_scope_id,
            'red',
            'You are the Red Team analyst challenging the investment. Your role is to:
1. Present the bear case for this investment
2. Identify hidden or underappreciated risks
3. Challenge assumptions in the risk assessment
4. Explore tail risk scenarios
5. Highlight historical precedents for failure

Be rigorous and thorough. Your job is to stress-test the investment thesis.',
            true
        )
        ON CONFLICT DO NOTHING;

        -- Arbiter (Synthesis) Context
        INSERT INTO risk.debate_contexts (scope_id, role, system_prompt, is_active)
        VALUES (
            v_scope_id,
            'arbiter',
            'You are the Arbiter synthesizing the Blue Team and Red Team analyses. Your role is to:
1. Evaluate the strength of arguments from both sides
2. Identify which risks are genuinely concerning vs overstated
3. Assess which positive factors are reliable vs optimistic
4. Provide a balanced, final risk assessment
5. Recommend any adjustments to the composite risk score

Be objective and data-driven. Your synthesis should reflect a fair weighting of both perspectives.',
            true
        )
        ON CONFLICT DO NOTHING;

        RAISE NOTICE 'Created debate contexts (Blue Team, Red Team, Arbiter) for scope';
    END IF;
END $$;

-- =============================================================================
-- Verification
-- =============================================================================
DO $$
DECLARE
    v_agent_exists BOOLEAN;
    v_scope_count INTEGER;
    v_dimension_count INTEGER;
    v_context_count INTEGER;
    v_debate_context_count INTEGER;
BEGIN
    -- Check agent exists
    SELECT EXISTS(SELECT 1 FROM public.agents WHERE slug = 'investment-risk-agent' AND agent_type = 'risk')
    INTO v_agent_exists;

    -- Count scopes
    SELECT COUNT(*) INTO v_scope_count
    FROM risk.scopes
    WHERE agent_slug = 'investment-risk-agent';

    -- Count dimensions
    SELECT COUNT(*) INTO v_dimension_count
    FROM risk.dimensions d
    JOIN risk.scopes s ON d.scope_id = s.id
    WHERE s.agent_slug = 'investment-risk-agent';

    -- Count dimension contexts
    SELECT COUNT(*) INTO v_context_count
    FROM risk.dimension_contexts dc
    JOIN risk.dimensions d ON dc.dimension_id = d.id
    JOIN risk.scopes s ON d.scope_id = s.id
    WHERE s.agent_slug = 'investment-risk-agent';

    -- Count debate contexts
    SELECT COUNT(*) INTO v_debate_context_count
    FROM risk.debate_contexts dbc
    JOIN risk.scopes s ON dbc.scope_id = s.id
    WHERE s.agent_slug = 'investment-risk-agent';

    IF NOT v_agent_exists THEN
        RAISE EXCEPTION 'investment-risk-agent was not created with risk type';
    END IF;

    IF v_scope_count = 0 THEN
        RAISE EXCEPTION 'No scopes were created for investment-risk-agent';
    END IF;

    IF v_dimension_count < 6 THEN
        RAISE EXCEPTION 'Expected 6 dimensions, found %', v_dimension_count;
    END IF;

    RAISE NOTICE '================================================';
    RAISE NOTICE 'Migration completed successfully';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Agent: investment-risk-agent (type: risk)';
    RAISE NOTICE 'Scopes created: %', v_scope_count;
    RAISE NOTICE 'Dimensions created: %', v_dimension_count;
    RAISE NOTICE 'Dimension contexts: %', v_context_count;
    RAISE NOTICE 'Debate contexts: %', v_debate_context_count;
    RAISE NOTICE '================================================';
END $$;
