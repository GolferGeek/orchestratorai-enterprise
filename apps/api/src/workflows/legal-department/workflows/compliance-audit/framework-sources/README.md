# Framework Regulatory Text Sources

This directory contains regulatory framework text for the Compliance Audit
workflow's RAG collections. Each framework has its own subdirectory with
per-article/per-section files for fine-grained RAG retrieval.

## Structure

```
framework-sources/
  gdpr/                    ← 20 files, ~2,070 lines
    art-05-processing-principles.md
    art-06-lawful-basis.md
    ...
  hipaa/                   ← 12 files, ~1,734 lines
    privacy-rule-use-disclosure.md
    security-rule-admin-safeguards.md
    ...
  sox/                     ← 11 files, ~1,672 lines
    sec-302-ceo-cfo-certifications.md
    sec-404-internal-controls.md
    ...
```

Each file includes YAML-style front-matter with Document ID, Framework,
Version, Effective Date, Classification, Owner, and Related Documents
for the MetadataEnrichmentService to extract during ingestion.

## Seeding

Framework documents are automatically seeded into RAG collections on
Forge API startup (idempotent — skips already-ingested docs). Manual
re-seed via:

```
POST /legal-department/compliance-audit/seed-frameworks?orgSlug=legal
```

## Production Note

These files contain paraphrased requirement summaries sufficient for
development and demonstration. For production deployments, supplement
with the complete regulatory text from primary sources.
