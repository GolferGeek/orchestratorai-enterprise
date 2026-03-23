# Hierarchical Chrome Browser Test Plan

## Philosophy

Depth-first, not breadth-first. Pick one feature, make it work end-to-end, then move to the next. Every test failure is investigated and fixed — both frontend and backend — before moving on.

## Test Structure

```
Product
  └── Feature/Capability
        └── Test Case (functional, end-to-end)
              └── Steps (click, verify, fix if broken)
```

---

## 1. Forge (port 6201 / API 6200)

### 1.1 Marketing Swarm

**Goal:** Run a complete content generation pipeline with 1 writer, 1 editor, 1 evaluator. Produce a finished blog post.

| # | Test | Expected | Status |
|---|------|----------|--------|
| 1.1.1 | Load Marketing Swarm page | Config form renders with Content Type, Brief fields | |
| 1.1.2 | Fill content brief | Topic, Audience, Goal, Key Points, Tone all editable | |
| 1.1.3 | Configure agents: 1 writer, 1 editor, 1 evaluator | Agent config section shows 3 agents | |
| 1.1.4 | Select LLM provider/model | LLM selector works, model selected | |
| 1.1.5 | Execute swarm | POST /invoke/stream succeeds, taskId returned | |
| 1.1.6 | SSE progress events flow | Pipeline steps light up: Setup → Queue → Writing → Editing → Evaluating | |
| 1.1.7 | Content cards appear | Writer output card(s) appear in Content Outputs section | |
| 1.1.8 | Editing completes | Editor feedback appears on cards | |
| 1.1.9 | Evaluation completes | Evaluator scores appear, ranking shown | |
| 1.1.10 | Final output | Done step lights up, ranked results visible, can view/copy content | |
| 1.1.11 | Previous Swarms | Click PREVIOUS SWARMS, see the completed run | |

**Known issues to fix:**
- SSE events have `hook_event_type` but no `metadata.type` — frontend skips them
- Need to trace: LangGraph graph nodes → observability events → SSE → frontend handler

### 1.2 Legal Department

**Goal:** Submit a legal question, get multi-specialist analysis with HITL approval.

| # | Test | Expected | Status |
|---|------|----------|--------|
| 1.2.1 | Load Legal Department page | Chat input, SEND button render | |
| 1.2.2 | Submit a legal question | POST /invoke succeeds (not 404 — agent-registry fix) | |
| 1.2.3 | Streaming response | SSE events show specialist analysis flowing | |
| 1.2.4 | HITL approval dialog | If workflow has approval step, modal appears | |
| 1.2.5 | Final response | Complete legal analysis rendered in chat | |

### 1.3 CAD Agent

**Goal:** Describe a part, get OpenSCAD code and 3D preview.

| # | Test | Expected | Status |
|---|------|----------|--------|
| 1.3.1 | Load CAD Agent page | Landing with NEW CAD REQUEST button | PASS |
| 1.3.2 | Click NEW CAD REQUEST | Form/input appears | |
| 1.3.3 | Describe a part | "Create a simple bracket with two mounting holes" | |
| 1.3.4 | Submit request | POST /invoke succeeds | |
| 1.3.5 | OpenSCAD code generated | Code viewer shows generated OpenSCAD | |
| 1.3.6 | 3D preview renders | Three.js or STL viewer shows the model | |
| 1.3.7 | Export options | STEP/STL/GLTF download buttons work | |

### 1.4 Risk Dashboard

**Goal:** View risk analysis data, add a subject, trigger analysis.

| # | Test | Expected | Status |
|---|------|----------|--------|
| 1.4.1 | Load Risk Dashboard | Stats, tabs, subjects panel render | PASS |
| 1.4.2 | Add a subject | Click "+ Add Subject", fill form, save | |
| 1.4.3 | Trigger analysis | Select subject, click analyze | |
| 1.4.4 | View results | Dimensions, scores, debates tabs show data | |
| 1.4.5 | Analytics tab | Charts/visualizations render | |

### 1.5 Predictor

**Goal:** View prediction dashboard, manage portfolios, see predictions.

| # | Test | Expected | Status |
|---|------|----------|--------|
| 1.5.1 | Load Predictor Dashboard | Tabs, filters, navigation render | PASS |
| 1.5.2 | Select org context | Switch from global (*) to specific org | |
| 1.5.3 | View predictions | Prediction cards/table loads | |
| 1.5.4 | Manage Portfolios | Portfolio list, create new | |
| 1.5.5 | Trading Dashboard | Trading view renders | |
| 1.5.6 | Daily Report | Report view renders | |

---

## 2. Compose (port 6301 / API 6300)

### 2.1 Context Agent (Simple Chat)

| # | Test | Expected | Status |
|---|------|----------|--------|
| 2.1.1 | Load agent list | Available agents displayed | |
| 2.1.2 | Select context agent | Chat view opens | |
| 2.1.3 | Send message | POST /invoke/stream, response streams back | |
| 2.1.4 | Conversation persists | Messages visible on reload | |

### 2.2 RAG Agent

| # | Test | Expected | Status |
|---|------|----------|--------|
| 2.2.1 | Upload document | Document ingested, embeddings created | |
| 2.2.2 | Ask question about document | RAG retrieval + LLM response | |

---

## 3. Admin (port 6101 / API 6150)

### 3.1 Organizations

| # | Test | Expected | Status |
|---|------|----------|--------|
| 3.1.1 | View org list | 6 orgs displayed | PASS |
| 3.1.2 | Create org | New org form, save | |
| 3.1.3 | Edit org | Modify settings | |

### 3.2 Users / Roles / Entitlements

| # | Test | Expected | Status |
|---|------|----------|--------|
| 3.2.1 | View users | User list loads | |
| 3.2.2 | View roles | Role definitions load | |
| 3.2.3 | View entitlements | Product entitlements per org | |

### 3.3 LLM Analytics / Agent Registry

| # | Test | Expected | Status |
|---|------|----------|--------|
| 3.3.1 | LLM Usage page | Usage data or empty state | |
| 3.3.2 | Agent Registry | All registered agents listed | |
| 3.3.3 | System Health | All product statuses shown | |

---

## 4. Pulse (port 6501 / API 6500)

### 4.1 Dashboard

| # | Test | Expected | Status |
|---|------|----------|--------|
| 4.1.1 | View dashboard | Stats, listeners, triggers | PASS |
| 4.1.2 | Trigger fires | Recent trigger executions visible | PASS |

### 4.2 Triggers / Executions

| # | Test | Expected | Status |
|---|------|----------|--------|
| 4.2.1 | View triggers | Trigger list loads | |
| 4.2.2 | View executions | Execution history with status | |

---

## 5. Bridge (port 6601 / API 6600)

### 5.1 Registry / Security

| # | Test | Expected | Status |
|---|------|----------|--------|
| 5.1.1 | Registry page | External agent registry loads | |
| 5.1.2 | Security page | Signing, rate limiting status | |
| 5.1.3 | Scenarios | Training scenarios render | |

---

## Execution Order

1. **Forge > Marketing Swarm** (1.1) — Fix SSE event mapping, get full pipeline working
2. **Forge > Legal Department** (1.2) — Fix invoke integration
3. **Forge > CAD Agent** (1.3) — Test full generation pipeline
4. **Forge > Risk Dashboard** (1.4) — Test CRUD + analysis
5. **Forge > Predictor** (1.5) — Test with org context
6. **Admin** (3) — Test all management pages
7. **Compose** (2) — Test agent conversations
8. **Pulse** (4) — Test trigger management
9. **Bridge** (5) — Test external A2A
