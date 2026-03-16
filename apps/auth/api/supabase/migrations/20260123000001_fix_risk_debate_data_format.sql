-- =============================================================================
-- FIX RISK DEBATE DATA FORMAT
-- =============================================================================
-- Updates the Bitcoin debate to match the UI expected format and adds
-- a Tesla debate to demonstrate all debate functionality.
--
-- The UI (SubjectDetailPanel.vue) expects:
-- - blueAssessment: { strengthScore, arguments[], mitigatingFactors[] }
-- - redChallenges: { riskScore, challenges[], hiddenRisks[] }
-- - arbiterSynthesis: { summary, recommendation, keyTakeaways[] }
-- =============================================================================

-- First, update the Bitcoin debate to match expected format
DO $$
DECLARE
    v_btc_id UUID;
    v_scope_id UUID;
BEGIN
    -- Get the scope ID
    SELECT id INTO v_scope_id FROM risk.scopes WHERE domain = 'investment' LIMIT 1;

    IF v_scope_id IS NULL THEN
        RAISE NOTICE 'No investment scope found - skipping debate update';
        RETURN;
    END IF;

    -- Get Bitcoin subject ID
    SELECT id INTO v_btc_id FROM risk.subjects WHERE identifier = 'BTC' AND scope_id = v_scope_id LIMIT 1;

    IF v_btc_id IS NOT NULL THEN
        -- Update the existing Bitcoin debate with proper format
        UPDATE risk.debates
        SET
            blue_assessment = '{
                "strengthScore": 0.72,
                "arguments": [
                    "Network hash rate at all-time highs, extremely secure",
                    "Institutional adoption via spot ETFs accelerating",
                    "Supply dynamics favor long-term appreciation",
                    "Regulatory clarity improving in major jurisdictions"
                ],
                "mitigatingFactors": [
                    "Strong network security protects against 51% attacks",
                    "ETF approval provides regulatory legitimacy",
                    "Halving cycle creates predictable supply constraints",
                    "Growing institutional custody infrastructure"
                ],
                "summary": "Bitcoin maintains strong network security and first-mover advantage. Recent institutional adoption through ETFs provides price stability floor."
            }'::JSONB,
            red_challenges = '{
                "riskScore": 0.78,
                "challenges": [
                    "30-50% drawdowns remain common even in bull markets",
                    "ETF flows are retail-driven and could reverse rapidly",
                    "Global CBDC development could pose existential threat",
                    "Energy consumption criticism from regulators increasing"
                ],
                "hiddenRisks": [
                    "Whale concentration: Top 100 addresses hold >15% of supply",
                    "Mining centralization in specific geographic regions",
                    "Regulatory arbitrage creating legal uncertainty",
                    "Correlation with risk assets during market stress"
                ]
            }'::JSONB,
            arbiter_synthesis = '{
                "summary": "Red Team raises valid concerns about volatility and concentration risks that warrant a modest upward adjustment to risk score. While institutional adoption is positive, structural volatility remains.",
                "recommendation": "Maintain cautious position sizing. Consider implementing systematic rebalancing to manage volatility. Monitor whale wallet movements for early warning signals.",
                "keyTakeaways": [
                    "ETF narrative is positive but execution risk remains",
                    "Regulatory trajectory improving but not fully resolved",
                    "Volatility is a structural feature, not temporary",
                    "+3 point adjustment reflects legitimate concerns"
                ],
                "scoreAdjustment": 3,
                "finalScore": 75
            }'::JSONB
        WHERE subject_id = v_btc_id;

        RAISE NOTICE 'Updated Bitcoin debate with UI-compatible format';
    END IF;
END $$;

-- Add Tesla debate (high risk subject at 78%)
DO $$
DECLARE
    v_tsla_id UUID;
    v_tsla_score_id UUID;
    v_scope_id UUID;
    v_existing_debate_count INT;
BEGIN
    -- Get the scope ID
    SELECT id INTO v_scope_id FROM risk.scopes WHERE domain = 'investment' LIMIT 1;

    IF v_scope_id IS NULL THEN
        RAISE NOTICE 'No investment scope found - skipping Tesla debate creation';
        RETURN;
    END IF;

    -- Get Tesla subject ID
    SELECT id INTO v_tsla_id FROM risk.subjects WHERE identifier = 'TSLA' AND scope_id = v_scope_id LIMIT 1;
    SELECT id INTO v_tsla_score_id FROM risk.composite_scores WHERE subject_id = v_tsla_id AND status = 'active' LIMIT 1;

    IF v_tsla_id IS NULL THEN
        RAISE NOTICE 'Tesla subject not found - skipping debate creation';
        RETURN;
    END IF;

    -- Check if debate already exists
    SELECT COUNT(*) INTO v_existing_debate_count FROM risk.debates WHERE subject_id = v_tsla_id;

    IF v_existing_debate_count = 0 THEN
        INSERT INTO risk.debates (
            subject_id,
            composite_score_id,
            original_score,
            final_score,
            score_adjustment,
            status,
            blue_assessment,
            red_challenges,
            arbiter_synthesis,
            transcript,
            completed_at,
            is_test
        ) VALUES (
            v_tsla_id,
            v_tsla_score_id,
            78,
            82,
            4,
            'completed',
            '{
                "strengthScore": 0.65,
                "arguments": [
                    "Leading position in EV market with strong brand recognition",
                    "Energy storage and solar segments provide diversification",
                    "Full Self-Driving technology potential creates massive optionality",
                    "Manufacturing efficiency improvements through gigafactory scaling",
                    "Strong cash position with improving free cash flow"
                ],
                "mitigatingFactors": [
                    "Brand loyalty creates pricing power even in competitive market",
                    "Vertical integration reduces supply chain dependencies",
                    "Supercharger network provides competitive moat",
                    "Insurance and services revenue growing steadily"
                ],
                "summary": "Tesla maintains market leadership in EVs with significant optionality from FSD and energy segments. Manufacturing scale advantages continue to improve margins."
            }'::JSONB,
            '{
                "riskScore": 0.85,
                "challenges": [
                    "Extreme valuation multiples require continued hypergrowth",
                    "EV competition intensifying from legacy automakers and Chinese rivals",
                    "FSD regulatory approval timeline highly uncertain",
                    "CEO involvement in multiple ventures creates distraction risk",
                    "Price wars eroding automotive margins significantly"
                ],
                "hiddenRisks": [
                    "Key person dependency on Elon Musk for strategy and brand",
                    "Twitter/X acquisition creating reputational spillover risks",
                    "China revenue concentration amid geopolitical tensions",
                    "Quality control issues and recall frequency concerning",
                    "Autopilot litigation risk from ongoing NHTSA investigations"
                ]
            }'::JSONB,
            '{
                "summary": "Red Team identifies significant operational and governance risks that outweigh Blue Team''s growth narrative. Key person risk and competitive pressures warrant upward adjustment.",
                "recommendation": "Reduce position size or implement protective strategies. Monitor margin trends closely as indicator of competitive position. Set stop-loss at key technical levels.",
                "keyTakeaways": [
                    "Growth potential is real but priced into current valuation",
                    "Key person risk is underappreciated by market",
                    "Margin compression likely to continue near-term",
                    "FSD monetization timeline remains highly speculative",
                    "+4 point adjustment reflects elevated governance risk"
                ],
                "scoreAdjustment": 4,
                "finalScore": 82
            }'::JSONB,
            '[
                {"role": "blue", "content": "Tesla''s position in the EV market remains dominant with 50%+ US market share...", "timestamp": "2026-01-20T14:00:00Z"},
                {"role": "red", "content": "Market share is declining as competition intensifies. BYD already surpassed Tesla globally...", "timestamp": "2026-01-20T14:02:00Z"},
                {"role": "blue", "content": "Manufacturing efficiency gives Tesla 20%+ gross margin advantage versus competitors...", "timestamp": "2026-01-20T14:04:00Z"},
                {"role": "red", "content": "Margins are compressing rapidly due to price cuts. Q4 automotive gross margin hit multi-year lows...", "timestamp": "2026-01-20T14:06:00Z"},
                {"role": "blue", "content": "FSD represents a trillion-dollar opportunity with regulatory approval expected...", "timestamp": "2026-01-20T14:08:00Z"},
                {"role": "red", "content": "FSD has been ''coming soon'' for years. Waymo and Cruise have actual robotaxi operations...", "timestamp": "2026-01-20T14:10:00Z"},
                {"role": "arbiter", "content": "After careful analysis, the Red Team''s concerns about competitive dynamics and governance risk merit a +4 adjustment to the overall risk score...", "timestamp": "2026-01-20T14:12:00Z"}
            ]'::JSONB,
            NOW() - INTERVAL '3 days',
            FALSE
        );

        -- Update the composite score to reflect the debate
        UPDATE risk.composite_scores
        SET
            debate_adjustment = 4,
            overall_score = 82
        WHERE id = v_tsla_score_id;

        RAISE NOTICE 'Created Tesla debate with full Red Team/Blue Team analysis';
    ELSE
        RAISE NOTICE 'Tesla debate already exists - skipping creation';
    END IF;
END $$;

-- Add Solana debate (high risk crypto at 76%)
DO $$
DECLARE
    v_sol_id UUID;
    v_sol_score_id UUID;
    v_scope_id UUID;
    v_existing_debate_count INT;
BEGIN
    -- Get the scope ID
    SELECT id INTO v_scope_id FROM risk.scopes WHERE domain = 'investment' LIMIT 1;

    IF v_scope_id IS NULL THEN
        RETURN;
    END IF;

    -- Get Solana subject ID
    SELECT id INTO v_sol_id FROM risk.subjects WHERE identifier = 'SOL' AND scope_id = v_scope_id LIMIT 1;
    SELECT id INTO v_sol_score_id FROM risk.composite_scores WHERE subject_id = v_sol_id AND status = 'active' LIMIT 1;

    IF v_sol_id IS NULL THEN
        RETURN;
    END IF;

    -- Check if debate already exists
    SELECT COUNT(*) INTO v_existing_debate_count FROM risk.debates WHERE subject_id = v_sol_id;

    IF v_existing_debate_count = 0 THEN
        INSERT INTO risk.debates (
            subject_id,
            composite_score_id,
            original_score,
            final_score,
            score_adjustment,
            status,
            blue_assessment,
            red_challenges,
            arbiter_synthesis,
            transcript,
            completed_at,
            is_test
        ) VALUES (
            v_sol_id,
            v_sol_score_id,
            76,
            79,
            3,
            'completed',
            '{
                "strengthScore": 0.60,
                "arguments": [
                    "Fastest major blockchain with 65,000+ TPS capability",
                    "Strong developer ecosystem with growing DeFi and NFT activity",
                    "Low transaction costs make it attractive for retail users",
                    "Firedancer client diversity improving network resilience",
                    "Recovery from FTX collapse demonstrates ecosystem strength"
                ],
                "mitigatingFactors": [
                    "Network upgrades have reduced outage frequency",
                    "Institutional custody now available through major providers",
                    "Growing mobile-first strategy with Saga phone",
                    "Strong venture backing provides runway"
                ],
                "summary": "Solana offers compelling performance advantages with improving network stability. The ecosystem has demonstrated resilience following the FTX collapse."
            }'::JSONB,
            '{
                "riskScore": 0.82,
                "challenges": [
                    "History of 7+ network outages in 2022 raises reliability concerns",
                    "Strong association with failed FTX/Alameda ecosystem",
                    "Validator concentration creates centralization risk",
                    "Token unlock schedule creates persistent sell pressure",
                    "Competition from alternative L1s and Ethereum L2s intensifying"
                ],
                "hiddenRisks": [
                    "Solana Labs maintains outsized influence on protocol",
                    "MEV extraction creating poor user experience",
                    "State growth rate threatening long-term decentralization",
                    "Regulatory classification uncertainty as potential security",
                    "Key developer departures following market downturn"
                ]
            }'::JSONB,
            '{
                "summary": "While Solana shows technical promise and ecosystem resilience, operational history and centralization concerns justify a modest upward risk adjustment.",
                "recommendation": "Position sizing should account for elevated volatility. Monitor network stability metrics and validator set changes. Consider hedging with SOL puts during major events.",
                "keyTakeaways": [
                    "Technical performance is strong but reliability track record concerning",
                    "FTX contagion has passed but reputational overhang remains",
                    "Centralization risk is structural, not just temporary",
                    "+3 point adjustment for operational and concentration risks"
                ],
                "scoreAdjustment": 3,
                "finalScore": 79
            }'::JSONB,
            '[
                {"role": "blue", "content": "Solana''s 65,000 TPS makes it the fastest major blockchain...", "timestamp": "2026-01-19T09:00:00Z"},
                {"role": "red", "content": "Speed is meaningless without reliability. The network had 7 outages in 2022...", "timestamp": "2026-01-19T09:02:00Z"},
                {"role": "blue", "content": "Firedancer client is addressing network stability concerns...", "timestamp": "2026-01-19T09:04:00Z"},
                {"role": "red", "content": "Firedancer has been delayed multiple times. Meanwhile, validators remain highly concentrated...", "timestamp": "2026-01-19T09:06:00Z"},
                {"role": "arbiter", "content": "Solana''s technical merits are offset by operational concerns. A +3 adjustment appropriately reflects these risks...", "timestamp": "2026-01-19T09:08:00Z"}
            ]'::JSONB,
            NOW() - INTERVAL '4 days',
            FALSE
        );

        -- Update the composite score to reflect the debate
        UPDATE risk.composite_scores
        SET
            debate_adjustment = 3,
            overall_score = 79
        WHERE id = v_sol_score_id;

        RAISE NOTICE 'Created Solana debate';
    END IF;
END $$;

-- Verify the updates
DO $$
DECLARE
    rec RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'RISK DEBATE DATA UPDATE COMPLETE';
    RAISE NOTICE '================================================';

    RAISE NOTICE '';
    RAISE NOTICE 'Debates with proper format:';
    FOR rec IN
        SELECT
            s.identifier,
            s.name,
            d.original_score,
            d.final_score,
            d.score_adjustment,
            d.status,
            d.blue_assessment->>'strengthScore' as blue_strength,
            jsonb_array_length(d.blue_assessment->'arguments') as blue_args_count,
            d.red_challenges->>'riskScore' as red_score,
            jsonb_array_length(d.red_challenges->'challenges') as red_challenges_count,
            d.arbiter_synthesis->>'summary' IS NOT NULL as has_arbiter_summary
        FROM risk.debates d
        JOIN risk.subjects s ON d.subject_id = s.id
        WHERE d.is_test = false
        ORDER BY d.created_at DESC
    LOOP
        RAISE NOTICE '  % (%): % -> % (adj: %)',
            rec.name, rec.identifier, rec.original_score, rec.final_score, rec.score_adjustment;
        RAISE NOTICE '    Blue: strength=%, args=%',
            rec.blue_strength, rec.blue_args_count;
        RAISE NOTICE '    Red: score=%, challenges=%',
            rec.red_score, rec.red_challenges_count;
        RAISE NOTICE '    Arbiter summary: %',
            rec.has_arbiter_summary;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '================================================';
END $$;
