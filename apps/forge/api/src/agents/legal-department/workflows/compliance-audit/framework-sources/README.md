# Framework Regulatory Text Sources

This directory contains representative excerpts of regulatory framework text
for the Compliance Audit workflow's RAG collections.

## Files

- `gdpr-articles.md` — Key GDPR articles (data protection principles, rights, obligations)
- `hipaa-rules.md` — Key HIPAA rules (Privacy, Security, Breach Notification)
- `sox-sections.md` — Key SOX sections (302, 404, 409, 802, 906)

## Usage

These files are ingested into the framework RAG collections via the seed script:
```bash
npx ts-node src/agents/legal-department/workflows/compliance-audit/seed-frameworks.ts
```

## Production Note

For production deployments, replace these excerpts with the complete regulatory
text from primary sources. The excerpts here cover the most commonly referenced
provisions and are sufficient for development and demonstration.
