# Chrome Browser Tests

Hierarchical end-to-end browser tests for OrchestratorAI Enterprise.
Each test is a markdown file with step-by-step instructions that can be executed
by Claude Code's Chrome browser automation.

## Structure

```
chrome-tests/
  forge/                      ← Complex agent dashboards (port 6201 / API 6200)
    marketing-swarm/           ← LangGraph content pipeline
    legal-department/          ← Multi-specialist legal analysis
    cad-agent/                 ← AI-powered CAD generation
    risk-dashboard/            ← Risk analysis dashboard
    predictor/                 ← Prediction pipeline dashboard
  compose/                    ← Simple composable agents (port 6301 / API 6300)
    context-agent/             ← Simple LLM chat
    rag-agent/                 ← RAG retrieval + LLM
  flow/                       ← Productivity (port 6901 / API 6900)
    tasks/                     ← Task management
    syncfocus/                 ← Pomodoro timer
    kanban/                    ← Kanban board
    sprints/                   ← Sprint planning
  admin/                      ← Platform administration (port 6101 / API 6150)
    organizations/             ← Org management
    users/                     ← User management
    roles/                     ← Role management
    entitlements/              ← Product entitlements
    llm-analytics/             ← LLM usage tracking
    agent-registry/            ← Agent discovery
    system-health/             ← Product health status
  pulse/                      ← Internal automation (port 6501 / API 6500)
    dashboard/                 ← Listener/trigger stats
    triggers/                  ← Trigger management
    executions/                ← Execution history
    listeners/                 ← Listener status
  bridge/                     ← External A2A (port 6601 / API 6600)
    registry/                  ← External agent registry
    inbound/                   ← Inbound A2A
    outbound/                  ← Outbound A2A
    security/                  ← Signing, rate limiting
    scenarios/                 ← Training scenarios
  command/                    ← OrchestratorAI home (port 6102)
    landing/                   ← Public landing pages
    login/                     ← Authentication flow
    dashboard/                 ← Product launcher
    sso/                       ← Cross-product SSO
    theme/                     ← Dark/light theme
```

## How to Run

Each test file is a self-contained markdown document with:
- **Prerequisites** (which services must be running)
- **Steps** (numbered actions with expected outcomes)
- **Verification** (what success looks like)

Tests are designed to be executed by Claude Code with Chrome browser automation.
Run them with: "Execute the Chrome test at testing/chrome-tests/forge/marketing-swarm/test-full-pipeline.md"

## Execution Order

Start with Forge (most complex), work outward:
1. Forge > Marketing Swarm (LangGraph + SSE + content generation)
2. Forge > Legal Department (LangGraph + HITL)
3. Forge > CAD Agent (LangGraph + 3D)
4. Forge > Risk Dashboard (data dashboard)
5. Forge > Predictor (data dashboard)
6. Admin (management CRUD)
7. Compose (simple agent conversations)
8. Flow (productivity features)
9. Pulse (automation monitoring)
10. Bridge (external A2A)
