# Admin Chrome Tests

## Test Levels

### Level 1 — Page Loads
Navigate to each page, verify it renders without console errors.

### Level 2 — Functions Render
Verify tables, forms, buttons, and data render correctly on each page.

### Level 3 — Full Functional Testing
CRUD operations, edge cases, error handling, cross-page flows.

## Admin Functions (17 pages)

| # | Function | Route | Test Dir |
|---|----------|-------|----------|
| 1 | Login | /login | shared/ |
| 2 | Organizations | /app/admin/organizations | organizations/ |
| 3 | User Management | /app/admin/users | users/ |
| 4 | Roles & Permissions | /app/admin/roles | roles/ |
| 5 | Entitlements | /app/admin/entitlements | entitlements/ |
| 6 | System Config | /app/admin/system | system-config/ |
| 7 | LLM Usage | /app/admin/llm/usage | llm-analytics/ |
| 8 | LLM Models | /app/admin/llm/models | llm-analytics/ |
| 9 | LLM Costs | /app/admin/llm/costs | llm-analytics/ |
| 10 | RAG Collections | /app/admin/rag | rag-management/ |
| 11 | Agent Registry | /app/admin/agents | agent-registry/ |
| 12 | Observability Dashboard | /app/admin/observability | observability/ |
| 13 | Observability Events | /app/admin/observability/events | observability/ |
| 14 | Crawler Sources | /app/admin/crawler | crawler/ |
| 15 | MCP Servers | /app/admin/mcp | mcp-servers/ |
| 16 | Database Admin | /app/admin/database | database/ |
| 17 | System Health | /app/admin/system/health | system-health/ |

## How to Run
Tell Claude Code: "Run the admin chrome test at testing/chrome-tests/admin/{folder}/test-{name}.md"

## Results
Each test file contains a Results section updated after execution with:
- PASS/FAIL status
- Console errors found
- Screenshots (if captured)
- Date of last run
