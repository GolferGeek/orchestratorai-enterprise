-- =============================================================================
-- ADD LEGAL METADATA FIELDS TO DOCUMENT EXTRACTIONS
-- =============================================================================
-- Phase 3 of Legal Department AI M1
-- Adds legal-specific metadata fields for contract analysis and document processing
-- Created: 2026-01-07
-- =============================================================================

-- Add legal metadata columns to law.document_extractions
ALTER TABLE law.document_extractions
    -- Document classification
    ADD COLUMN document_type TEXT CHECK (document_type IN (
        'contract',          -- General contract
        'nda',              -- Non-disclosure agreement
        'msa',              -- Master services agreement
        'sow',              -- Statement of work
        'employment',       -- Employment agreement
        'lease',            -- Real estate lease
        'license',          -- License agreement
        'pleading',         -- Court pleading
        'motion',           -- Court motion
        'brief',            -- Legal brief
        'correspondence',   -- Legal correspondence
        'memo',             -- Legal memo
        'policy',           -- Company policy
        'compliance',       -- Compliance document
        'regulatory',       -- Regulatory filing
        'other',            -- Other legal document
        'unknown'           -- Unable to classify
    )),
    ADD COLUMN document_type_confidence DECIMAL(5,4) CHECK (
        document_type_confidence >= 0 AND document_type_confidence <= 1
    ),

    -- Document structure
    ADD COLUMN detected_sections JSONB,
    /*
    Example structure:
    [
        {
            "title": "Definitions",
            "page": 1,
            "startOffset": 0,
            "endOffset": 1234,
            "subsections": ["Confidential Information", "Disclosing Party"]
        },
        {
            "title": "Term and Termination",
            "page": 3,
            "startOffset": 5678,
            "endOffset": 7890,
            "subsections": ["Initial Term", "Renewal", "Termination for Cause"]
        }
    ]
    */

    -- Signatures
    ADD COLUMN has_signatures BOOLEAN DEFAULT false,
    ADD COLUMN signature_blocks JSONB,
    /*
    Example structure:
    [
        {
            "party": "Company A",
            "signerName": "John Doe",
            "signerTitle": "CEO",
            "dateSigned": "2024-01-15",
            "page": 10,
            "isSigned": true,
            "confidence": 0.95
        },
        {
            "party": "Company B",
            "signerName": "Jane Smith",
            "signerTitle": "VP Legal",
            "dateSigned": "2024-01-16",
            "page": 10,
            "isSigned": true,
            "confidence": 0.92
        }
    ]
    */

    -- Dates
    ADD COLUMN extracted_dates JSONB,
    /*
    Example structure:
    [
        {
            "type": "effective_date",
            "date": "2024-01-01",
            "text": "effective as of January 1, 2024",
            "page": 1,
            "confidence": 0.98
        },
        {
            "type": "expiration_date",
            "date": "2027-01-01",
            "text": "expires on January 1, 2027",
            "page": 2,
            "confidence": 0.95
        },
        {
            "type": "notice_period",
            "days": 30,
            "text": "30 days written notice",
            "page": 5,
            "confidence": 0.90
        }
    ]
    */

    -- Parties
    ADD COLUMN extracted_parties JSONB,
    /*
    Example structure:
    [
        {
            "name": "Acme Corporation",
            "type": "company",
            "role": "disclosing_party",
            "jurisdiction": "Delaware",
            "firstMention": 1,
            "confidence": 0.97
        },
        {
            "name": "TechStart Inc.",
            "type": "company",
            "role": "receiving_party",
            "jurisdiction": "California",
            "firstMention": 1,
            "confidence": 0.96
        }
    ]
    */

    -- Overall extraction quality
    ADD COLUMN extraction_confidence DECIMAL(5,4) CHECK (
        extraction_confidence >= 0 AND extraction_confidence <= 1
    ),

    -- Financial terms
    ADD COLUMN extracted_amounts JSONB,
    /*
    Example structure:
    [
        {
            "type": "total_value",
            "amount": 500000,
            "currency": "USD",
            "text": "$500,000",
            "page": 2,
            "confidence": 0.99
        },
        {
            "type": "liability_cap",
            "amount": 1000000,
            "currency": "USD",
            "text": "one million dollars ($1,000,000)",
            "page": 7,
            "confidence": 0.95
        }
    ]
    */

    -- Legal clauses detected
    ADD COLUMN detected_clauses JSONB,
    /*
    Example structure:
    [
        {
            "type": "indemnification",
            "title": "Indemnification",
            "page": 8,
            "severity": "high",
            "isMutual": true,
            "summary": "Mutual indemnification for third-party claims"
        },
        {
            "type": "limitation_of_liability",
            "title": "Limitation of Liability",
            "page": 9,
            "severity": "high",
            "cap": 1000000,
            "exclusions": ["gross negligence", "willful misconduct"]
        }
    ]
    */

    -- Jurisdiction and governing law
    ADD COLUMN extracted_jurisdiction JSONB,
    /*
    Example structure:
    {
        "governingLaw": "Delaware",
        "venue": "Delaware Court of Chancery",
        "arbitration": false,
        "page": 11,
        "confidence": 0.94
    }
    */

    -- Document language
    ADD COLUMN document_language TEXT DEFAULT 'en',
    ADD COLUMN language_confidence DECIMAL(5,4) CHECK (
        language_confidence >= 0 AND language_confidence <= 1
    ),

    -- Redaction tracking
    ADD COLUMN has_redactions BOOLEAN DEFAULT false,
    ADD COLUMN redaction_regions JSONB;
    /*
    Example structure:
    [
        {
            "page": 3,
            "type": "pii",
            "reason": "social_security_number",
            "boundingBox": {"x": 100, "y": 200, "width": 150, "height": 20}
        },
        {
            "page": 5,
            "type": "confidential",
            "reason": "trade_secret",
            "boundingBox": {"x": 50, "y": 300, "width": 400, "height": 100}
        }
    ]
    */

-- Add comments for new columns
COMMENT ON COLUMN law.document_extractions.document_type IS 'Classified document type (contract, pleading, correspondence, etc.)';
COMMENT ON COLUMN law.document_extractions.document_type_confidence IS 'Confidence score for document type classification (0-1)';
COMMENT ON COLUMN law.document_extractions.detected_sections IS 'JSON array of detected document sections with titles, pages, and offsets';
COMMENT ON COLUMN law.document_extractions.has_signatures IS 'Whether signature blocks were detected in the document';
COMMENT ON COLUMN law.document_extractions.signature_blocks IS 'JSON array of extracted signature information (party, signer, date, page)';
COMMENT ON COLUMN law.document_extractions.extracted_dates IS 'JSON array of extracted dates with types (effective, expiration, notice periods)';
COMMENT ON COLUMN law.document_extractions.extracted_parties IS 'JSON array of extracted party information (name, role, jurisdiction)';
COMMENT ON COLUMN law.document_extractions.extraction_confidence IS 'Overall confidence score for legal metadata extraction (0-1)';
COMMENT ON COLUMN law.document_extractions.extracted_amounts IS 'JSON array of extracted financial amounts (total value, liability caps, etc.)';
COMMENT ON COLUMN law.document_extractions.detected_clauses IS 'JSON array of detected legal clauses (indemnification, liability, etc.)';
COMMENT ON COLUMN law.document_extractions.extracted_jurisdiction IS 'JSON object with governing law, venue, and arbitration information';
COMMENT ON COLUMN law.document_extractions.document_language IS 'Detected document language (ISO 639-1 code)';
COMMENT ON COLUMN law.document_extractions.language_confidence IS 'Confidence score for language detection (0-1)';
COMMENT ON COLUMN law.document_extractions.has_redactions IS 'Whether redactions were detected or applied';
COMMENT ON COLUMN law.document_extractions.redaction_regions IS 'JSON array of redacted regions with page, type, and bounding boxes';

-- Create indexes for common queries
CREATE INDEX idx_document_extractions_document_type ON law.document_extractions(document_type) WHERE document_type IS NOT NULL;
CREATE INDEX idx_document_extractions_has_signatures ON law.document_extractions(has_signatures) WHERE has_signatures = true;
CREATE INDEX idx_document_extractions_language ON law.document_extractions(document_language);
CREATE INDEX idx_document_extractions_has_redactions ON law.document_extractions(has_redactions) WHERE has_redactions = true;

-- Create GIN indexes for JSONB columns to enable efficient querying
CREATE INDEX idx_document_extractions_sections_gin ON law.document_extractions USING GIN (detected_sections);
CREATE INDEX idx_document_extractions_parties_gin ON law.document_extractions USING GIN (extracted_parties);
CREATE INDEX idx_document_extractions_dates_gin ON law.document_extractions USING GIN (extracted_dates);
CREATE INDEX idx_document_extractions_amounts_gin ON law.document_extractions USING GIN (extracted_amounts);
CREATE INDEX idx_document_extractions_clauses_gin ON law.document_extractions USING GIN (detected_clauses);

-- =============================================================================
-- LOG SUCCESS
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Legal metadata fields added to law.document_extractions';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'New columns added:';
    RAISE NOTICE '  - document_type (classification with confidence)';
    RAISE NOTICE '  - detected_sections (document structure)';
    RAISE NOTICE '  - signature_blocks (signature extraction)';
    RAISE NOTICE '  - extracted_dates (effective, expiration, notice periods)';
    RAISE NOTICE '  - extracted_parties (party names and roles)';
    RAISE NOTICE '  - extracted_amounts (financial terms)';
    RAISE NOTICE '  - detected_clauses (legal clauses)';
    RAISE NOTICE '  - extracted_jurisdiction (governing law and venue)';
    RAISE NOTICE '  - document_language (language detection)';
    RAISE NOTICE '  - redaction_regions (PII and confidential redactions)';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Indexes created for efficient querying';
    RAISE NOTICE '  - B-tree indexes on type, signatures, language, redactions';
    RAISE NOTICE '  - GIN indexes on JSONB columns for deep querying';
    RAISE NOTICE '================================================';
END $$;
