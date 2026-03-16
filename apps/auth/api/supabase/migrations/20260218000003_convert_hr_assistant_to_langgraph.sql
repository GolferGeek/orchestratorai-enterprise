-- Migration: Convert hr-assistant to LangGraph
-- Creates hr-assistant-langgraph agent entry pointing to the LangGraph conversion

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
  metadata
) VALUES (
  'hr-assistant-langgraph',
  ARRAY['human-resources'],
  'HR Assistant (LangGraph)',
  'LangGraph conversion of HR Assistant. Answers questions about human resources policies, employee benefits, workplace guidelines, and company handbooks using the knowledge base.',
  '1.0.0',
  'api',
  'human-resources',
  ARRAY['hr', 'policy', 'benefits', 'employee', 'handbook', 'rag', 'langgraph', 'converted'],
  '{
    "input": {
      "type": "object",
      "required": ["question"],
      "properties": {
        "question": {
          "type": "string",
          "description": "The HR policy-related question to answer"
        }
      }
    },
    "output": {
      "type": "object",
      "required": ["message"],
      "properties": {
        "message": {
          "type": "string",
          "description": "The answer with document citations"
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "score": { "type": "number" },
              "excerpt": { "type": "string" },
              "section": { "type": "string" },
              "document_id": { "type": "string" }
            }
          }
        }
      }
    }
  }'::JSONB,
  ARRAY['policy-lookup', 'benefits-inquiry', 'handbook-reference', 'citation-support'],
  'You are an HR Assistant. Answer questions about human resources policies, employee benefits, workplace guidelines, and company handbooks using the knowledge base. Always cite the source document when providing information. Be helpful and clear, but remind users to consult HR directly for sensitive or case-specific matters.',
  '{"url": "http://localhost:6200/conversions/hr-assistant/execute", "method": "POST", "timeout": 120000}'::JSONB,
  NULL,
  '{"provider": "langgraph", "convertedFrom": "hr-assistant", "originalType": "rag-runner", "features": ["stateful", "checkpointing", "rag-retrieval"]}'::JSONB
)
ON CONFLICT (slug) DO UPDATE SET
  updated_at = NOW();
