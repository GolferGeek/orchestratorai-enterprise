-- =============================================================================
-- UPDATE RISK TEST DATA WITH REALISTIC VALUES
-- =============================================================================
-- Migration to update the placeholder 50% test scores to realistic varied values
-- This enables proper testing of:
--   - Risk score color coding (green < 50, yellow 50-70, red > 70)
--   - Red/Blue Team debate triggering (threshold: 70%)
--   - Alert generation (threshold: 80%)
-- =============================================================================

-- First, get subject IDs dynamically (in case UUIDs differ between environments)
DO $$
DECLARE
    v_microsoft_id UUID;
    v_apple_id UUID;
    v_tesla_id UUID;
    v_scope_id UUID;
BEGIN
    -- Get the scope ID
    SELECT id INTO v_scope_id FROM risk.scopes WHERE domain = 'investment' LIMIT 1;

    IF v_scope_id IS NULL THEN
        RAISE NOTICE 'No investment scope found - skipping test data update';
        RETURN;
    END IF;

    -- Get subject IDs by name
    SELECT id INTO v_microsoft_id FROM risk.subjects WHERE name ILIKE '%Microsoft%' AND scope_id = v_scope_id LIMIT 1;
    SELECT id INTO v_apple_id FROM risk.subjects WHERE name ILIKE '%Apple%' AND scope_id = v_scope_id LIMIT 1;
    SELECT id INTO v_tesla_id FROM risk.subjects WHERE name ILIKE '%Tesla%' AND scope_id = v_scope_id LIMIT 1;

    -- Update Microsoft Corporation - Low Risk (45%)
    -- Stable blue-chip company with good fundamentals
    IF v_microsoft_id IS NOT NULL THEN
        UPDATE risk.composite_scores
        SET overall_score = 45,
            confidence = 0.85,
            dimension_scores = jsonb_build_object(
                'credit-risk', 35,
                'market-risk', 48,
                'liquidity-risk', 25,
                'regulatory-risk', 55,
                'operational-risk', 42,
                'concentration-risk', 65
            )
        WHERE subject_id = v_microsoft_id AND status = 'active';

        RAISE NOTICE 'Updated Microsoft Corporation: overall_score=45, confidence=0.85';
    END IF;

    -- Update Apple Inc. - Moderate Risk (65%)
    -- Good company but some supply chain and regulatory concerns
    IF v_apple_id IS NOT NULL THEN
        UPDATE risk.composite_scores
        SET overall_score = 65,
            confidence = 0.78,
            dimension_scores = jsonb_build_object(
                'credit-risk', 55,
                'market-risk', 72,
                'liquidity-risk', 48,
                'regulatory-risk', 68,
                'operational-risk', 75,
                'concentration-risk', 72
            )
        WHERE subject_id = v_apple_id AND status = 'active';

        RAISE NOTICE 'Updated Apple Inc.: overall_score=65, confidence=0.78';
    END IF;

    -- Update Tesla Inc. - High Risk (78%)
    -- Volatile stock with regulatory, market, and operational concerns
    -- This score is above the debate threshold (70%) to trigger Red/Blue Team debate
    IF v_tesla_id IS NOT NULL THEN
        UPDATE risk.composite_scores
        SET overall_score = 78,
            confidence = 0.72,
            dimension_scores = jsonb_build_object(
                'credit-risk', 82,
                'market-risk', 88,
                'liquidity-risk', 65,
                'regulatory-risk', 75,
                'operational-risk', 85,
                'concentration-risk', 73
            )
        WHERE subject_id = v_tesla_id AND status = 'active';

        RAISE NOTICE 'Updated Tesla Inc.: overall_score=78, confidence=0.72';
    END IF;

    -- Mark any duplicate/superseded scores
    -- Keep only the most recent active score per subject
    UPDATE risk.composite_scores cs1
    SET status = 'superseded'
    WHERE status = 'active'
    AND EXISTS (
        SELECT 1 FROM risk.composite_scores cs2
        WHERE cs2.subject_id = cs1.subject_id
        AND cs2.status = 'active'
        AND cs2.created_at > cs1.created_at
    );

    RAISE NOTICE '================================================';
    RAISE NOTICE 'Risk test data updated with realistic values:';
    RAISE NOTICE '  - Microsoft Corporation: 45%% (low risk)';
    RAISE NOTICE '  - Apple Inc.: 65%% (moderate risk)';
    RAISE NOTICE '  - Tesla Inc.: 78%% (high risk - debate eligible)';
    RAISE NOTICE '================================================';
END $$;

-- =============================================================================
-- UPDATE ASSESSMENTS WITH REALISTIC VALUES
-- =============================================================================

DO $$
DECLARE
    v_microsoft_id UUID;
    v_apple_id UUID;
    v_tesla_id UUID;
    v_scope_id UUID;
    v_dim_credit UUID;
    v_dim_market UUID;
    v_dim_liquidity UUID;
    v_dim_regulatory UUID;
    v_dim_operational UUID;
    v_dim_concentration UUID;
BEGIN
    -- Get the scope ID
    SELECT id INTO v_scope_id FROM risk.scopes WHERE domain = 'investment' LIMIT 1;

    IF v_scope_id IS NULL THEN
        RAISE NOTICE 'No investment scope found - skipping assessment update';
        RETURN;
    END IF;

    -- Get subject IDs
    SELECT id INTO v_microsoft_id FROM risk.subjects WHERE name ILIKE '%Microsoft%' AND scope_id = v_scope_id LIMIT 1;
    SELECT id INTO v_apple_id FROM risk.subjects WHERE name ILIKE '%Apple%' AND scope_id = v_scope_id LIMIT 1;
    SELECT id INTO v_tesla_id FROM risk.subjects WHERE name ILIKE '%Tesla%' AND scope_id = v_scope_id LIMIT 1;

    -- Get dimension IDs
    SELECT id INTO v_dim_credit FROM risk.dimensions WHERE slug = 'credit-risk' AND scope_id = v_scope_id;
    SELECT id INTO v_dim_market FROM risk.dimensions WHERE slug = 'market-risk' AND scope_id = v_scope_id;
    SELECT id INTO v_dim_liquidity FROM risk.dimensions WHERE slug = 'liquidity-risk' AND scope_id = v_scope_id;
    SELECT id INTO v_dim_regulatory FROM risk.dimensions WHERE slug = 'regulatory-risk' AND scope_id = v_scope_id;
    SELECT id INTO v_dim_operational FROM risk.dimensions WHERE slug = 'operational-risk' AND scope_id = v_scope_id;
    SELECT id INTO v_dim_concentration FROM risk.dimensions WHERE slug = 'concentration-risk' AND scope_id = v_scope_id;

    -- Delete duplicate assessments (keep most recent per subject-dimension)
    DELETE FROM risk.assessments a1
    WHERE EXISTS (
        SELECT 1 FROM risk.assessments a2
        WHERE a2.subject_id = a1.subject_id
        AND a2.dimension_id = a1.dimension_id
        AND a2.created_at > a1.created_at
    );

    RAISE NOTICE 'Cleaned up duplicate assessments';

    -- Update Microsoft assessments (low risk: 45%)
    IF v_microsoft_id IS NOT NULL THEN
        UPDATE risk.assessments SET score = 35, confidence = 0.88,
            reasoning = 'Strong credit profile with AAA-rated debt, diversified revenue streams, and consistent cash flow generation.'
        WHERE subject_id = v_microsoft_id AND dimension_id = v_dim_credit;

        UPDATE risk.assessments SET score = 48, confidence = 0.82,
            reasoning = 'Moderate market risk due to tech sector volatility, but strong fundamentals provide stability.'
        WHERE subject_id = v_microsoft_id AND dimension_id = v_dim_market;

        UPDATE risk.assessments SET score = 25, confidence = 0.92,
            reasoning = 'Excellent liquidity with $100B+ cash reserves and strong operating cash flows.'
        WHERE subject_id = v_microsoft_id AND dimension_id = v_dim_liquidity;

        UPDATE risk.assessments SET score = 55, confidence = 0.75,
            reasoning = 'Facing ongoing antitrust scrutiny in multiple jurisdictions, but historically managed regulatory challenges well.'
        WHERE subject_id = v_microsoft_id AND dimension_id = v_dim_regulatory;

        UPDATE risk.assessments SET score = 42, confidence = 0.85,
            reasoning = 'Mature operational processes with some cloud service concentration risk.'
        WHERE subject_id = v_microsoft_id AND dimension_id = v_dim_operational;

        UPDATE risk.assessments SET score = 65, confidence = 0.78,
            reasoning = 'Significant concentration in cloud services (Azure) and enterprise software segments.'
        WHERE subject_id = v_microsoft_id AND dimension_id = v_dim_concentration;

        RAISE NOTICE 'Updated Microsoft assessments';
    END IF;

    -- Update Apple assessments (moderate risk: 65%)
    IF v_apple_id IS NOT NULL THEN
        UPDATE risk.assessments SET score = 55, confidence = 0.80,
            reasoning = 'Solid credit profile but heavy reliance on iPhone revenue creates concentration risk.'
        WHERE subject_id = v_apple_id AND dimension_id = v_dim_credit;

        UPDATE risk.assessments SET score = 72, confidence = 0.75,
            reasoning = 'High market risk due to premium pricing strategy and competitive smartphone market.'
        WHERE subject_id = v_apple_id AND dimension_id = v_dim_market;

        UPDATE risk.assessments SET score = 48, confidence = 0.82,
            reasoning = 'Good liquidity but significant capital allocation to buybacks reduces cash reserves.'
        WHERE subject_id = v_apple_id AND dimension_id = v_dim_liquidity;

        UPDATE risk.assessments SET score = 68, confidence = 0.72,
            reasoning = 'Elevated regulatory risk from App Store antitrust cases in US, EU, and other markets.'
        WHERE subject_id = v_apple_id AND dimension_id = v_dim_regulatory;

        UPDATE risk.assessments SET score = 75, confidence = 0.70,
            reasoning = 'Supply chain concentration in China presents significant operational risk.'
        WHERE subject_id = v_apple_id AND dimension_id = v_dim_operational;

        UPDATE risk.assessments SET score = 72, confidence = 0.78,
            reasoning = 'Heavy concentration in iPhone revenue (50%+ of total) and services ecosystem.'
        WHERE subject_id = v_apple_id AND dimension_id = v_dim_concentration;

        RAISE NOTICE 'Updated Apple assessments';
    END IF;

    -- Update Tesla assessments (high risk: 78%)
    IF v_tesla_id IS NOT NULL THEN
        UPDATE risk.assessments SET score = 82, confidence = 0.68,
            reasoning = 'Higher credit risk due to capital-intensive growth strategy and volatile earnings.'
        WHERE subject_id = v_tesla_id AND dimension_id = v_dim_credit;

        UPDATE risk.assessments SET score = 88, confidence = 0.72,
            reasoning = 'Very high market risk from EV competition, price wars, and CEO-related volatility.'
        WHERE subject_id = v_tesla_id AND dimension_id = v_dim_market;

        UPDATE risk.assessments SET score = 65, confidence = 0.75,
            reasoning = 'Moderate liquidity concerns with significant CapEx requirements for new factories.'
        WHERE subject_id = v_tesla_id AND dimension_id = v_dim_liquidity;

        UPDATE risk.assessments SET score = 75, confidence = 0.70,
            reasoning = 'Regulatory risk from autonomous driving scrutiny and EV credit policy changes.'
        WHERE subject_id = v_tesla_id AND dimension_id = v_dim_regulatory;

        UPDATE risk.assessments SET score = 85, confidence = 0.65,
            reasoning = 'High operational risk from rapid expansion, quality issues, and key person dependency.'
        WHERE subject_id = v_tesla_id AND dimension_id = v_dim_operational;

        UPDATE risk.assessments SET score = 73, confidence = 0.72,
            reasoning = 'Concentration in automotive segment, though energy storage growing.'
        WHERE subject_id = v_tesla_id AND dimension_id = v_dim_concentration;

        RAISE NOTICE 'Updated Tesla assessments';
    END IF;
END $$;

-- =============================================================================
-- CREATE SAMPLE ALERT FOR HIGH-RISK SUBJECT
-- =============================================================================
-- Tesla is at 78% which is below the 80% alert threshold, but we'll create
-- a warning-level alert to demonstrate the feature

DO $$
DECLARE
    v_tesla_id UUID;
    v_tesla_score_id UUID;
    v_scope_id UUID;
    v_existing_alert_count INT;
BEGIN
    -- Get the scope and Tesla IDs
    SELECT id INTO v_scope_id FROM risk.scopes WHERE domain = 'investment' LIMIT 1;
    SELECT id INTO v_tesla_id FROM risk.subjects WHERE name ILIKE '%Tesla%' AND scope_id = v_scope_id LIMIT 1;
    SELECT id INTO v_tesla_score_id FROM risk.composite_scores WHERE subject_id = v_tesla_id AND status = 'active' LIMIT 1;

    IF v_tesla_id IS NULL OR v_tesla_score_id IS NULL THEN
        RAISE NOTICE 'Tesla subject or score not found - skipping alert creation';
        RETURN;
    END IF;

    -- Check if alert already exists
    SELECT COUNT(*) INTO v_existing_alert_count FROM risk.alerts WHERE subject_id = v_tesla_id;

    IF v_existing_alert_count = 0 THEN
        INSERT INTO risk.alerts (
            subject_id,
            composite_score_id,
            alert_type,
            severity,
            title,
            message,
            triggered_value,
            threshold_value,
            is_acknowledged,
            is_test
        ) VALUES (
            v_tesla_id,
            v_tesla_score_id,
            'threshold_breach',
            'warning',
            'Tesla Inc. Approaching Critical Risk Level',
            'Tesla''s composite risk score of 78% is approaching the critical threshold of 80%. Market risk (88%) and operational risk (85%) are primary contributors. Consider initiating a Red/Blue Team debate for comprehensive risk assessment.',
            78,
            80,
            FALSE,
            TRUE
        );

        RAISE NOTICE 'Created warning alert for Tesla (78%% approaching 80%% threshold)';
    ELSE
        RAISE NOTICE 'Alert already exists for Tesla - skipping creation';
    END IF;
END $$;

-- =============================================================================
-- CREATE SAMPLE LEARNING ENTRIES
-- =============================================================================

-- Create approved learning in learnings table
DO $$
DECLARE
    v_scope_id UUID;
    v_existing_learning_count INT;
BEGIN
    SELECT id INTO v_scope_id FROM risk.scopes WHERE domain = 'investment' LIMIT 1;

    IF v_scope_id IS NULL THEN
        RAISE NOTICE 'No investment scope found - skipping learning creation';
        RETURN;
    END IF;

    -- Check if learning already exists
    SELECT COUNT(*) INTO v_existing_learning_count FROM risk.learnings WHERE scope_id = v_scope_id;

    IF v_existing_learning_count = 0 THEN
        INSERT INTO risk.learnings (
            scope_id,
            scope_level,
            domain,
            learning_type,
            title,
            description,
            source_type,
            effectiveness_score,
            status,
            is_test
        ) VALUES (
            v_scope_id,
            'scope',
            'investment',
            'pattern',
            'Tech Sector Regulatory Risk Correlation',
            'Analysis identified a pattern where regulatory risk scores for tech companies tend to move together during major antitrust enforcement periods. Consider adjusting correlation weights in portfolio risk models.',
            'ai_suggested',
            0.70,
            'active',
            TRUE
        );

        RAISE NOTICE 'Created sample learning entry';
    ELSE
        RAISE NOTICE 'Learning already exists - skipping creation';
    END IF;
END $$;

-- Create pending learning in learning_queue for UI display
DO $$
DECLARE
    v_scope_id UUID;
    v_existing_queue_count INT;
BEGIN
    SELECT id INTO v_scope_id FROM risk.scopes WHERE domain = 'investment' LIMIT 1;

    IF v_scope_id IS NULL THEN
        RAISE NOTICE 'No investment scope found - skipping learning queue creation';
        RETURN;
    END IF;

    -- Check if queue entry already exists
    SELECT COUNT(*) INTO v_existing_queue_count FROM risk.learning_queue WHERE scope_id = v_scope_id AND status = 'pending';

    IF v_existing_queue_count = 0 THEN
        INSERT INTO risk.learning_queue (
            scope_id,
            suggested_scope_level,
            suggested_learning_type,
            suggested_title,
            suggested_description,
            ai_reasoning,
            ai_confidence,
            status,
            is_test
        ) VALUES (
            v_scope_id,
            'scope',
            'pattern',
            'Tech Sector Regulatory Risk Correlation',
            'Analysis identified a pattern where regulatory risk scores for tech companies tend to move together during major antitrust enforcement periods. Consider adjusting correlation weights in portfolio risk models.',
            'Correlation analysis of regulatory risk scores across Apple, Microsoft, and Tesla showed strong co-movement during antitrust news cycles. Pearson correlation coefficient of 0.87 observed.',
            0.85,
            'pending',
            FALSE  -- Set to FALSE so it shows in UI (API excludes is_test=true by default)
        );

        RAISE NOTICE 'Created pending learning queue entry';
    ELSE
        RAISE NOTICE 'Learning queue entry already exists - skipping creation';
    END IF;
END $$;

-- =============================================================================
-- VERIFY UPDATES
-- =============================================================================

DO $$
DECLARE
    rec RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'MIGRATION COMPLETE - SUMMARY';
    RAISE NOTICE '================================================';

    RAISE NOTICE '';
    RAISE NOTICE 'Composite Scores:';
    FOR rec IN
        SELECT s.name, cs.overall_score, cs.confidence, cs.status
        FROM risk.subjects s
        JOIN risk.composite_scores cs ON s.id = cs.subject_id
        WHERE cs.status = 'active'
        ORDER BY cs.overall_score DESC
    LOOP
        RAISE NOTICE '  %: %%% (confidence: %)',
            rec.name, rec.overall_score, rec.confidence;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE 'Assessments per Subject:';
    FOR rec IN
        SELECT s.name, COUNT(a.id) as assessment_count, AVG(a.score)::INT as avg_score
        FROM risk.subjects s
        LEFT JOIN risk.assessments a ON s.id = a.subject_id
        GROUP BY s.name
        ORDER BY s.name
    LOOP
        RAISE NOTICE '  %: % assessments (avg score: %)',
            rec.name, rec.assessment_count, rec.avg_score;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE 'Alerts: %', (SELECT COUNT(*) FROM risk.alerts);
    RAISE NOTICE 'Learnings: %', (SELECT COUNT(*) FROM risk.learnings);
    RAISE NOTICE 'Debates: %', (SELECT COUNT(*) FROM risk.debates);
    RAISE NOTICE '';
    RAISE NOTICE '================================================';
END $$;
