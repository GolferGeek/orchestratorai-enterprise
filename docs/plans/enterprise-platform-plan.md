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

---

## 2. The architecture, assessed

The central design is right, and it is the platform's real asset:

> **An agent is a row.** `agent_type` selects one of five family runners —
> `context`, `rag`, `api`, `external`, `media`. A new RAG agent is one row, one
> collection, some documents. No deploy.
>
> **A workflow is a graph.** LangGraph under `apps/api/src/workflows/`, with a
> row in `agents` as its descriptor.

Data for composition, code for orchestration. That split is worth protecting.

### What blurs it today

**2.1 The `agents` table is doing double duty, unevenly.** Six rows have types no
family runner can execute — four `langgraph`, one `prediction`, one `risk`.
`marketing-swarm` works only because it is special-cased by slug in
`agent-definition.service.ts` (`workflowAgentSlugs`). The other five rows are
descriptors pointing at nothing.

**2.2 The workflow catalog hardcodes a single slug.**
`workflow-catalog.controller.ts` does `if (slug !== 'marketing-swarm') throw
NotFoundException`. Adding a second workflow means editing a controller. This is
the single biggest thing blocking "add workflows too".

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

0.1 **Retire the orphan types.** `prediction` and `risk` have no runner and no
graph. Either map them onto the `api` family (they are HTTP calls to a model
service) or delete the rows. Do not leave rows that cannot execute.

0.2 **Workflow registry.** Replace the hardcoded slug check with a registry that
LangGraph workflows register into at module load. The catalog lists what is
registered; `agents` rows of type `langgraph` reference a registered graph and
are rejected at startup if the graph is missing — the same fail-closed shape as
`assertProvidersRegistered`.

0.3 **One gating concept.** Collapse `status`, `hidden` and the hardcoded sets
into `metadata.status` alone, editable by an admin. Delete
`hiddenAgentSlugs`; derive `workflowAgentSlugs` from `agent_type = 'langgraph'`.

0.4 **Separate org from scope.** Add a `global` organization row, or move scope
into its own column. Stop encoding two ideas in one array.

**Done when:** adding an agent is an INSERT, adding a workflow is a graph file
plus an INSERT, and no agent behaviour is decided by a hardcoded slug list.

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

Activate `customer-service` and `legal-department` as registered graphs or retire
them. No dormant rows left in legal.

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
3.4 Fold `extended-post-writer` into it or retire it.

### Phase 4 — Finance from zero

4.1 Collection: **Finance Policy** (expense, procurement, approval thresholds).
4.2 Agents: `finance-policy` (rag), `vendor-spend` (api over the warehouse).
4.3 Workflow **`month-end-close`** — checklist → variance detection → exceptions.
4.4 Decide `us-tech-stocks` / `investment-risk-agent`: they are prediction
products, not starter-platform agents. Probably retire here.

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
