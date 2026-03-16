-- =============================================================================
-- Rename Policies Assistant to Confidentiality Assistant
-- =============================================================================
-- The law-firm-policies-attributed collection only contains confidentiality
-- documents, so the agent name should reflect this specialization.
-- =============================================================================

-- Update agent name and description
UPDATE public.agents
SET 
    name = 'Confidentiality Assistant',
    description = 'Answers questions about client confidentiality policies with proper citations [FP-001, Section 2.1].',
    context = 'You are a Confidentiality Assistant. Answer questions about client confidentiality policies using the knowledge base. Always cite sources using document ID and section (e.g., [FP-001, Article II]).',
    updated_at = NOW()
WHERE slug = 'legal-policies-agent';

-- Log the update
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    IF updated_count > 0 THEN
        RAISE NOTICE 'Updated legal-policies-agent: Policies Assistant → Confidentiality Assistant';
    ELSE
        RAISE WARNING 'No agent found with slug legal-policies-agent';
    END IF;
END $$;
