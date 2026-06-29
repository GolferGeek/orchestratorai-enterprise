# Security Policy

OrchestratorAI Enterprise includes authentication, RBAC, RAG, workflow orchestration, and provider integration code. Please treat security issues as sensitive.

## Reporting a Vulnerability

If you find a vulnerability, do not open a public issue with exploit details. Instead, contact the repository owner directly with:

- A concise description of the issue.
- Affected files, endpoints, or workflows.
- Reproduction steps.
- Impact and suggested remediation, if known.

## Sensitive Data

Do not include any of the following in issues, discussions, pull requests, or screenshots:

- API keys, service role keys, JWT secrets, OAuth secrets, or webhook secrets.
- Real customer data or privileged documents.
- Production database dumps.
- Private keys, wallet keys, or signing material.
- Access tokens, refresh tokens, or browser session cookies.

## Local Development

Use `.env` for non-secret local configuration and `.env.secrets` for local secrets. Do not commit `.env.secrets`.

The sample RAG documents in `docs/RAG-filler/` are intended for local development and demos.
