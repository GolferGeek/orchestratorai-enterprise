# OrchestratorAI Enterprise: from demo to starter platform

**Status:** plan, 2026-09-22. Written to be executed by another agent.
**Audience:** whoever picks up development next. Read §2 before writing code.

---

## 1. Where we actually are

Measured against the **deployed** database (`supabase_db_orchestratorai-enterprise`,
port 6011 — not the dev one on 54322; see §7.1, this trips people up).

**Agents — 18 rows, 10 active**

| Org | Active | Dormant |
|---|---|---|
| global | `general-assistant` (context), `image-generator` (media) | `video-generator` |
| legal | `legal-contracts`, `legal-estate`, `legal-intake`, `legal-litigation`, `legal-policies` (all rag) | `customer-service`, `legal-department` (langgraph) |
| human-resources | `hr-assistant` (rag) | `hr-assistant-langgraph` (api) |
| marketing | `marketing-swarm` (langgraph), `infographic-agent` (media) | `extended-post-writer` (langgraph) |
| finance | — | `us-tech-stocks` (prediction), `investment-risk-agent` (risk) |
| engineering | — | `cad-agent` (langgraph) |

**Knowledge — 17 collections, 160 documents**

- **legal** is deep: 5 practice collections, plus **GDPR (20), HIPAA (12), SOX (11)**,
  Document Onboarding (33), Sentinel Portfolio (33).
- **human-resources** has a real HR Policy Knowledge Base (35).
- **marketing, finance, engineering** have only an empty `Document Onboarding`
  shell each.

**Workflows — one.** `marketing-swarm`, code under `apps/api/src/workflows/`.

The honest summary: **two verticals are nearly real** (legal, HR), one has a
showpiece workflow but no knowledge (marketing), and one is empty (finance).
The compliance frameworks are the most under-used asset in the system — GDPR,
HIPAA and SOX are loaded and nothing reads them.

### 1.1 What is already built and not switched on

Surveying the dormant rows turned up more than expected. Three of them are not
dead ideas — they are working systems that lost their wiring.

**`customer-service` — built, loaded, and live right now.** A complete nine-node
LangGraph (`classify_intent`, `answer_question`, `explain_pricing`, `offer_demo`,
`provide_contact`, `redirect`, …) with its own controller at `/customer-service`
(`config`, `session`, `converse`, `save`). `CustomerServiceModule` is imported by
`agents.module.ts`, and the deployed API answers `/api/customer-service/config`
with 200 today. Only its *agent row* is disabled — which is exactly the residue
problem in §2.1, because the workflow never needed a row. **Nothing to build;
it needs surfacing.**

**`risk-runner` — 120 files in history, and its data is still live.** Not in this
repo; it is in `orchestr8r-ai/orchestrator-ai@main` under
`apps/api/src/risk-runner/`. Services include dimension analysis, correlation,
Monte Carlo simulation, historical replay, article classification, executive
summaries, alerting, learning — and a **debate** service where assessments are
argued rather than asserted.

The `risk` schema in the deployed database is populated:

| | | | |
|---|---|---|---|
| assessments 36 | composite_scores 246 | score_history 246 | dimensions 18 |
| subjects 11 | heatmap_data 66 | debates 3 | alerts 3 |

Scoring across Credit, Liquidity, Market, Operational, Regulatory,
Concentration, Correlation, Geopolitical, Valuation, Market Sentiment and more.

**`prediction` — 55 tables** in the same database, behind `us-tech-stocks`.

This reframes Phase 4. Finance is not an empty vertical to build from scratch;
it is a sophisticated engine to reconnect. See §4 Phase 4.

---

## 2. The architecture, assessed

The central design is right, and it is the platform's real asset:

> **An agent is a row**, fully defined by that row. `agent_type` selects one of
> five family runners — `context`, `rag`, `api`, `external`, `media`. A new RAG
> agent is one row, one collection, some documents. No deploy.
>
> **A workflow is a LangGraph endpoint, and nothing else.** It lives in code
> under `apps/api/src/workflows/`. It has **no row in `agents`**.

Data for composition, code for orchestration, and no overlap between them.
Agents are not workflows; a workflow is not an agent with a different type.

### What blurs it today

**2.1 Workflows are currently defined by agent rows, which is backwards.**
`AgentDefinitionService.listWorkflows()` queries the **`agents` table**, filtered
by a hardcoded slug set (`workflowAgentSlugs = {marketing-swarm}`). So the
workflow catalog is sourced from agent data, and `marketing-swarm` exists as an
agent row that no family runner can execute.

This is sediment, not design: the `langgraph` rows predate the idea of workflows,
when everything was an agent. Six rows now have types no runner can execute —
four `langgraph`, one `prediction`, one `risk`.

The fix is separation, not a tighter coupling: **workflows should be listed from
code and have no presence in `agents` at all.**

**2.2 The workflow catalog also hardcodes a single slug.**
`workflow-catalog.controller.ts` does `if (slug !== 'marketing-swarm') throw
NotFoundException`. Between this and 2.1, adding a second workflow means editing
a controller *and* inserting an agent row for something that is not an agent.

**2.3 Three ways to hide an agent**, two of them requiring a deploy:
`metadata.status`, `metadata.hidden`, and the hardcoded `hiddenAgentSlugs` /
`workflowAgentSlugs` sets. An operator cannot see or change two of the three.

**2.4 `global` is not an organization.** It appears in
`agents.organization_slug` arrays and is resolved by a fallback query, but there
is no row for it in `organizations`. Orgs and scopes are being expressed in one
field.

Fix these four and the sentence in §2 becomes *literally* true rather than
aspirationally true. That is Phase 0, and everything else is easier afterwards.

---

## 3. Organizations

Six real orgs exist plus `*`. `building` and `engineering` are vestigial —
`building` has nothing, `engineering` has one dormant `cad-agent`.

**Proposal: four product verticals**, each of which must ship with agents,
workflows and knowledge, and each of which is a plausible customer demo:

| Org | Why it earns a slot |
|---|---|
| **legal** | Deepest content. Compliance frameworks make it the flagship. |
| **human-resources** | Real policy corpus already loaded; fastest second vertical. |
| **marketing** | The swarm is the best demo we have; needs knowledge behind it. |
| **finance** | The vertical every buyer asks about. Currently empty. |

`engineering` and `building` become either demo fixtures or are retired — not
half-populated verticals. `global` becomes a proper scope concept, distinct from
the org list (§4.1).

---

## 4. The work

### Phase 0 — Make the model literally true

*Nothing else should start before this. Each item removes a special case.*

0.1 **Get non-agents out of the `agents` table.** The five `langgraph` rows are
workflows and belong in code; `prediction` and `risk` are neither agent nor
workflow. Remove them. After this, every row in `agents` has a type a family
runner can execute — the table means one thing again.

0.2 **Workflow registry, in code.** LangGraph workflows register themselves at
module load with slug, name, description and org scope.
`WorkflowCatalogController` lists the registry. `listWorkflows()` and both
hardcoded slug sets are deleted from `AgentDefinitionService`, which stops
knowing that workflows exist at all. Adding a workflow becomes: write the graph,
register it. No row, no controller edit.

0.3 **One gating concept.** With 0.1 and 0.2 done, `hiddenAgentSlugs` and
`workflowAgentSlugs` have nothing left to hide, so delete them. `metadata.status`
becomes the single admin-editable control; drop `metadata.hidden` too.

0.4 **Separate org from scope.** Add a `global` organization row, or move scope
into its own column. Stop encoding two ideas in one array.

**Done when:** adding an agent is an INSERT and nothing else; adding a workflow
is a graph file and nothing else; the two concepts share no storage and no code
path; and no behaviour anywhere is decided by a hardcoded slug list.

### Phase 1a — Switch on what already works

Before building anything, two things need only wiring:

1a.1 **Register `customer-service` in the workflow catalog** (needs 0.2). It is
running today and invisible.

1a.2 **Decide its surface.** It was built to answer pricing, offer demos and
capture contacts — i.e. for a public-facing page, not the internal console.
Putting it on the homepage is a product decision, not an engineering one.

### Phase 1 — Legal as the exemplar

Legal has the content; it needs the orchestration. All three of these existed in
the pre-2026-03 codebase and can be reintroduced as registered workflows:

1.1 **`contract-review`** — intake → clause extraction → risk flags → summary.
Reads `Law Contracts`. The demo everyone understands.

1.2 **`compliance-audit`** — document + framework → gap analysis → findings.
Reads GDPR / HIPAA / SOX. **This is the highest-value unused asset in the
system.**

1.3 **`discovery-triage`** — bulk documents → relevance/privilege classification.
Reads `Law Litigation`.

`customer-service` and `legal-department` are `langgraph` rows removed by 0.1.
If either is worth keeping, it comes back as a registered workflow in code — not
as an agent row.

### Phase 2 — Human resources

2.1 Activate the policy corpus properly: `benefits-qa` and `onboarding-buddy`
(rag agents over the existing 35 documents).
2.2 Workflow **`onboarding-sequence`** — checklist → doc generation → task hand-off.
2.3 Resolve `hr-assistant-langgraph` (type `api`, dormant): convert or retire.

### Phase 3 — Marketing gets knowledge

Marketing has the best workflow and no corpus, which is backwards.

3.1 Collection: **Brand & Voice** (guidelines, tone, positioning, past campaigns).
3.2 Agents: `brand-voice-guardian` (rag), `competitor-brief` (rag).
3.3 Workflow **`launch-campaign`** — brief → channel plan → drafts → review gate.
3.3b **Social presence** — LinkedIn and Twitter/X post generation and scheduling
is wanted here rather than in a separate system. The swarm already does
multi-agent drafting; this is a channel adapter plus a review gate, not a new
engine.
3.4 `extended-post-writer` is removed by 0.1; fold its behaviour into
`launch-campaign` if it is worth keeping.

### Phase 4 — Finance: recover the risk engine

Not from zero. §1.1 found a 120-file risk system in history whose **data is still
live** in the deployed database — 36 assessments, 246 composite scores, 18
dimensions, 11 subjects, 3 debates.

4.1 **Assess what still fits.** The risk-runner predates the provider-plane
refactor, so it will reference services that have moved. Port it against the
current `LLM_SERVICE` contract — which also means it gets the PII boundary it
never had.

4.2 **Bring it back as workflows, not agents.** `risk-analysis`,
`risk-evaluation`, `risk-alert`, `risk-learning` are LangGraph-shaped:
graphs in code, registered, no rows.

4.3 **The debate service is the differentiator.** Assessments that are argued
between positions rather than asserted by one model is a genuinely unusual
capability, and it pairs naturally with Jev (§5) — Jev types the verdict the
debate produces.

4.4 Only then the ordinary finance agents: `finance-policy` (rag over a policy
collection that still needs writing), `vendor-spend` (api).

4.5 `us-tech-stocks` sits on 55 `prediction` tables. Decide separately whether
prediction is part of this product or its own; do not half-recover it.

### Phase 5 — Jev as the quality layer

This is the differentiator, and the funding story. See §5.

### Phase 6 — Starter-platform packaging

6.1 **Seed packs** — per-org bundles (agents + workflows + starter documents) that
install into a fresh deployment, so a new customer starts with four working
verticals instead of an empty table.
6.2 Make `migrate-deployed.sh` carry seed packs the same way it carries schema.
6.3 A `demo` org that exercises every family runner, for smoke-testing a deploy.

---

## 5. What we get from Jev

Jev produces **typed decisions against rubrics**, with a local ensemble. Applied
here it is not another agent — it is the layer that makes agent output
*defensible*, which is what an enterprise buyer is actually paying for.

**5.1 Output gating.** Before a response returns, Jev scores it against a rubric:
grounded in retrieved context? on-policy? hallucination risk? A failing verdict
escalates, regenerates, or routes to a human instead of shipping a confident
wrong answer.

**5.2 RAG grounding.** Every RAG answer gets a typed verdict on whether it
actually used its retrieved chunks. This is the single most common enterprise
objection to RAG and we would have a measured answer.

**5.3 Workflow gates.** Inside a LangGraph workflow, Jev decides branches —
"is this contract clause high-risk?", "does this finding meet the SOX
threshold?" — as a typed decision rather than a prompt returning prose.

**5.4 Regression harness.** Labeled examples per agent turn quality into
something that can fail a build. Agents stop silently degrading.

**5.5 The pairing that matters.** We already emit a **privacy summary** on every
LLM call — what was pseudonymized, what was redacted, whether it was blocked,
which service it went to. Add a **Jev verdict** and each call carries both *what
we protected* and *how good the answer was*.

> Per-call, auditable: **this left the building sanitized, and this is how
> confident we are in what came back.**

Nobody is packaging both. That is the funding narrative, and it is mostly built —
the privacy half shipped this week; Jev is the other half.

---

## 6. Sequencing and why

Phase 0 first because every later phase adds rows and graphs, and doing that on
top of four special cases multiplies them. It is roughly a week and it makes
everything after it mechanical.

Then **legal (1) before HR (2) before marketing (3) before finance (4)** —
strictly by how much content already exists, so each phase is the cheapest
remaining. Legal is orchestration over a loaded corpus; finance is a corpus from
scratch.

Jev (5) can start in parallel with Phase 2 — it needs one real workflow to gate,
which Phase 1 delivers.

Packaging (6) last, because you cannot package what is not yet stable.

---

## 7. Notes for whoever develops this

**7.1 Two databases, inverted names.** The container named
`supabase_db_orchestratorai-**local**` (54322) is the **dev** database. The one
named `supabase_db_orchestratorai-**enterprise**` (6011) is what the **deployed**
site reads. Both repos' `config.toml` say `project_id = orchestratorai-local`,
which is why the naming misleads. Survey and seed against **6011** for anything
about the live product. This has already caused one wrong architectural read and
one nearly-destructive revert.

**7.2 Migrations.** `scripts/migrate-deployed.sh` resolves its target from the
compose config and refuses to run if it cannot prove the match. Use it. Do not
use `supabase migration up` — it targets 54322 and its history table is empty.

**7.3 The LLM boundary is load-bearing.** Read
`docs/architecture/llm-boundary.md` before touching anything that calls a model.
Agents and workflows get PII protection for free by going through `LLM_SERVICE`;
nothing should call a vendor directly.

**7.4 Seed content is real work.** "Add a finance collection" means sourcing or
writing documents worth retrieving. Budget for it; a RAG agent over three thin
documents demos worse than no agent at all.

**7.5 Dormant rows are a smell.** Eight of eighteen agents are disabled. Every
phase above ends with "activate or retire" deliberately — the end state has no
row that cannot run.

**7.6 Do not put workflows in the `agents` table.** It was done before the
workflow concept existed and it is the source of most of Phase 0. An agent is a
row; a workflow is a LangGraph endpoint. They do not share storage.
