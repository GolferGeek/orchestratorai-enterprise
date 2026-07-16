# Audit Exceptions

**Last updated**: 2026-07-16

## Accepted Until Vertex AI Is Enabled

`npm audit` currently reports the following moderate finding chain:

```text
@google-cloud/vertexai@1.12.0
  -> google-auth-library@9.15.1
  -> gaxios@6.7.1
  -> uuid@9.0.1
```

Advisory:

- `GHSA-w5hq-g745-h8pq` — `uuid` missing buffer bounds check in v3/v5/v6 when `buf` is provided.

Disposition:

- Accepted for the starter platform while Vertex AI is not a required client capability.
- Address when a client wants Vertex AI enabled, or earlier if upstream publishes a compatible fixed dependency chain.
- Do not force a transitive major-version override without proving `npm ls` is valid and the Vertex plane tests pass. A scoped override to newer `google-auth-library` was tested on 2026-07-16 and left npm with an invalid dependency tree.

Verification command:

```bash
npm run audit:accepted
```

That command fails on any unaccepted audit finding and only allows the two known transitive findings:

- `gaxios` at `node_modules/gaxios`
- `uuid` at `node_modules/gaxios/node_modules/uuid`
