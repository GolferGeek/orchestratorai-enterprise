# Help Inventory

This effort is help-first. Written articles live in `apps/web/src/shared/help-guides/helpGuides.ts`; optional Loom embed URLs can be added later per guide.

| ID | Title | Location | Route(s) | Read Time | Status |
|---|---|---|---|---|---|
| landing-overview | What OrchestratorAI Enterprise Is | Public home page | `/` | 3 min read | Published |
| landing-features | Platform Features Tour | Public features page | `/features` | 3 min read | Published |
| landing-whats-possible | What You Can Build With It | Public what is possible page | `/whats-possible` | 3 min read | Published |
| landing-pricing | How Pricing Should Be Understood | Public pricing page | `/pricing` | 2 min read | Published |
| landing-about | About the Platform Architecture | Public about page | `/about` | 3 min read | Published |
| landing-videos | Using the Learning Library | Public learning page | `/videos` | 1 min read | Published |
| app-dashboard | Command Dashboard Orientation | Authenticated dashboard | `/app/dashboard` | 3 min read | Published |
| agents-list | What Agents Are | Agents list | `/app/agents` | 4 min read | Published |
| agent-conversation | Working With an Agent Conversation | Agent conversation page | `/app/agents/:agentSlug/conversation` | 4 min read | Published |
| agents-pipeline | Agent Types and Build Pipeline | Agent pipeline builder | `/app/agents/pipeline` | 4 min read | Published |
| workflow-marketing-swarm | Marketing Swarm Workflow | Marketing Swarm workflow | `/app/workflows/marketing-swarm` | 4 min read | Published |
| ambient-dashboard | Ambient Automation Dashboard | Ambient dashboard | `/app/ambient` | 4 min read | Published |
| ambient-listeners | Ambient Listeners | Ambient listeners | `/app/ambient/listeners` | 3 min read | Published |
| ambient-workflows | Ambient Workflows | Ambient workflows | `/app/ambient/workflows` | 3 min read | Published |
| ambient-triggers | Ambient Triggers | Ambient triggers | `/app/ambient/triggers` | 4 min read | Published |
| ambient-executions | Ambient Executions | Ambient executions | `/app/ambient/executions` | 4 min read | Published |
| ambient-scenarios | Ambient Scenarios | Ambient scenarios | `/app/ambient/scenarios`, `/app/ambient/scenarios/:id` | 3 min read | Published |
| ambient-stream | Ambient Event Stream | Ambient event stream | `/app/ambient/stream` | 3 min read | Published |
| secure-conversations-overview | Secure Conversations Overview | Secure Conversations overview | `/app/secure-conversations` | 4 min read | Published |
| secure-conversations-registry | External Agent Registry | Secure Conversations registry | `/app/secure-conversations/registry`, `/app/secure-conversations/registry/agents/:id` | 4 min read | Published |
| secure-conversations-inbound | Inbound A2A Messages | Secure Conversations inbound | `/app/secure-conversations/inbound` | 3 min read | Published |
| secure-conversations-outbound | Outbound A2A Messages | Secure Conversations outbound | `/app/secure-conversations/outbound` | 4 min read | Published |
| secure-conversations-security | Secure Conversation Security | Secure Conversations security | `/app/secure-conversations/security` | 4 min read | Published |
| secure-conversations-observability | A2A Observability | Secure Conversations observability pages | `/app/secure-conversations/observability`, `/app/secure-conversations/observability/topology`, `/app/secure-conversations/observability/timeline`, `/app/secure-conversations/observability/metrics`, `/app/secure-conversations/observability/audit` | 4 min read | Published |
| secure-conversations-tools | Protocol Tools and Demos | Secure Conversations scenarios, demo, matrix, compare, and settings | `/app/secure-conversations/scenarios`, `/app/secure-conversations/demo`, `/app/secure-conversations/matrix`, `/app/secure-conversations/protocol-compare`, `/app/secure-conversations/settings` | 3 min read | Published |
| admin-organizations | Managing Organizations | Admin organizations | `/app/admin/organizations` | 4 min read | Published |
| admin-users | Managing Users | Admin users | `/app/admin/users` | 5 min read | Published |
| admin-roles | Roles and Permissions | Admin roles | `/app/admin/roles` | 4 min read | Published |
| admin-entitlements | Entitlements and Product Access | Admin entitlements | `/app/admin/entitlements` | 4 min read | Published |
| admin-agent-registry | Admin Agent Registry | Admin agent registry and detail | `/app/admin/agents`, `/app/admin/agents/:slug` | 4 min read | Published |
| rag-collections | RAG Collections | RAG collections | `/app/rag/collections` | 4 min read | Published |
| rag-collection-detail | RAG Collection Detail | RAG collection detail | `/app/rag/collections/:id` | 5 min read | Published |
| settings-health | System Health | Settings system health | `/app/settings/system/health` | 3 min read | Published |
| settings-system-config | System Configuration | Settings system config | `/app/settings/system` | 4 min read | Published |
| settings-llm | LLM Usage, Models, and Costs | Settings LLM pages | `/app/settings/llm/usage`, `/app/settings/llm/models`, `/app/settings/llm/costs` | 5 min read | Published |
| settings-observability | Platform Observability | Settings observability dashboard and events | `/app/settings/observability`, `/app/settings/observability/events` | 4 min read | Published |
| settings-infrastructure | MCP Servers and Database Settings | Settings infrastructure pages | `/app/settings/mcp`, `/app/settings/database` | 5 min read | Published |

## Writing Notes

- Keep each help article focused on the page the user is already on.
- Explain what the function is, when to use it, what to check first, and how it fits into the platform.
- When a page is operational or administrative, explain the consequence of changing things.
- If a video is added later, it should support the article, not replace it.
