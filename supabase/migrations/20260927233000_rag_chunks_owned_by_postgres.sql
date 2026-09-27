-- rag_data.rag_document_chunks belonged to supabase_admin with no grant to
-- postgres (the API's role), so every document uploaded through the API
-- failed at "insert chunks". The only application table left in that state.
ALTER TABLE rag_data.rag_document_chunks OWNER TO postgres;
