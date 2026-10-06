-- The company-knowledge agent (OAN 1): answers "tell me about your company"
-- from the caller's own organization's `company-knowledge` collection (what
-- the company does, its prices, its hours). It is a `global` RAG agent, so
-- every organization has it and each answers from its own collection. The
-- starter ships no collection; an organization loads its documents with
-- scripts/seed-org-rag.mjs or the RAG admin.

INSERT INTO public.agents (
  slug, organization_slug, name, description, version, agent_type, department,
  tags, io_schema, capabilities, context, endpoint, llm_config, metadata, require_local_model
) VALUES (
  'company-knowledge',
  ARRAY['global'],
  'Company Knowledge',
  'Answers questions about your company (what it does, its prices, its hours) from your company-knowledge documents, with citations.',
  '1.0.0',
  'rag',
  'general',
  ARRAY['company', 'knowledge', 'faq', 'rag'],
  '{"input": {"type": "object", "required": ["question"], "properties": {"question": {"type": "string", "description": "The question about the company"}}}, "output": {"type": "object", "required": ["message"], "properties": {"message": {"type": "string", "description": "The answer with document citations"}, "sources": {"type": "array", "items": {"type": "object", "properties": {"score": {"type": "number"}, "excerpt": {"type": "string"}, "section": {"type": "string"}, "document_id": {"type": "string"}}}}}}}'::jsonb,
  ARRAY['company-faq', 'pricing-lookup', 'hours-lookup', 'citation-support'],
  'You answer questions about this company: what it does, its products and prices, its hours and how to reach it. Use only the company''s documents in the knowledge base, and cite the document you used. If the documents do not answer the question, say so plainly and suggest contacting the company; never guess a price, a date or an opening time.',
  NULL,
  '{"maxTokens": 2000, "temperature": 0.2}'::jsonb,
  '{"status": "active", "rag_config": {"top_k": 5, "collection_slug": "company-knowledge", "no_access_message": "I do not have access to this company''s knowledge base.", "no_results_message": "I could not find that in the company''s documents. Please contact the company directly.", "similarity_threshold": 0.3}}'::jsonb,
  false
);
