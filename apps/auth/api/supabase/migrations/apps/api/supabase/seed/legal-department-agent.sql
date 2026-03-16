-- ================================================
-- Department AI Agent Registration
-- ================================================

INSERT INTO public.agents (
  slug,
  organization_slug,
  name,
  description,
  agent_type,
  department,
  capabilities,
  context,
  io_schema,
  metadata
) VALUES (
  'legal-department',
  ARRAY['legal'],
  'Department AI',
  'Multi-agent legal document analysis system. Processes contracts, NDAs, MSAs using CLO routing, specialist agents, and synthesis. Supports multimodal input (PDF, DOCX, images, scanned documents) with OCR fallback.',
  'langgraph',
  'legal',
  ARRAY['legal-analysis', 'contract-review', 'nda-analysis', 'multimodal-input', 'document-extraction', 'risk-assessment'],
  'Department AI agent for analyzing legal documents with multi-agent collaboration.',
  '{
    "input": {
      "task": "string",
      "documentType": "string",
      "documents": "array"
    },
    "output": {
      "taskId": "string",
      "status": "string",
      "findings": "object"
    }
  }'::jsonb,
  '{
    "multiAgentArchitecture": {
      "cloAgent": {"role": "Chief Legal Officer"},
      "specialists": ["contract", "compliance", "ip", "privacy"]
    },
    "documentProcessing": {
      "formats": ["pdf", "docx", "png", "jpg"],
      "extraction": ["pdf_text", "vision_model", "ocr"]
    },
    "storage": {"bucket": "legal-documents"}
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = now();

SELECT 'Department AI agent registered successfully' AS status;
