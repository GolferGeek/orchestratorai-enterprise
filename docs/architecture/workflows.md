# How workflows are built

A workflow is a **LangGraph graph in code** that runs on the shared workflow
runtime. It is not an agent: an agent is a database row run by one of five
family runners, and a workflow is code that registers itself.

`apps/api/src/workflows/decision-risk/` is the reference implementation. Read
it alongside this.

## 1. The runtime in one picture

```
web (kit)  ──POST /workflows/invoke──▶  WorkflowInvokeController ──▶ WorkflowRunLauncher
   ▲          {action: start|review.submit|…}   (validated A2A)          │ conversation row,
   │                                                                      ▼ models snapshot
   │  GET /workflows/:slug/runs/:id (…/trace, /issues, /export, …)   workflows.runs (queued)
   │  + live stream (stream token)                                        │
   │                                                              WorkflowWorkerService
   │                                                     (lease, heartbeat, retries, cancel)
   │                                                                      │
   └──────────── events, progress, result ◀── your handler ──▶ your LangGraph graph
                                                                  nodes → WorkUnitService
                                                                  (solo, panel, red/blue,
                                                                   arbitrated, human gate)
```

- `workflows.runs.id` **is** the `conversationId`, the LangGraph `thread_id`,
  and the `llm_usage.conversation_id`. One id joins the run, its checkpoints,
  its trace, its cost and its events.
- `start` returns at once with `{runId, status: 'queued'}`. The worker runs
  the graph. The browser follows the stream and reads the run. Nothing waits
  on an HTTP request.
- The worker only claims slugs it has a handler for. A runtime workflow
  without a handler fails boot.

## 2. The files of one workflow

```
apps/api/src/workflows/<slug>/
  <slug>.module.ts        registers the catalog entry, handler, exporter
  <slug>.handler.ts       start / resume / retry / restart → graph.invoke; the run result
  <slug>.graph.ts         the graph and its pure routing functions
  <slug>.state.ts         Annotation.Root: executionContext, modelProfile, runInstruction, …
  <slug>.exporter.ts      completed run → ExportDocument (if it produces a report)
  nodes/<step>.node.ts    one create<Step>Node(deps) factory each; run-context.ts for scopeOf()
  __tests__/              logic spec, exporter spec, one real-Postgres pilot spec
  docs/brief.md           H1 title, then what it does and why it helps
  docs/user-guide.md      how a person uses it, with the labels the UI shows
  docs/smoke-test.md      a three-minute manual check after a deploy
  docs/showcase/<case>/case.json   {title, summary, input}: worked examples
  DESIGN.md               (optional) notes for whoever maintains it
apps/web/src/modules/workflows/views/<slug>/
  <Slug>Page.vue          new-run form + WorkflowRunView from the kit
  <Slug>Result.vue        how its result renders
```

Agents and model roles are data. They are seeded by a migration into
`workflows.agent_definitions` and linked in `agent_definition_links`. Each
org picks models per role in `workflows.model_profiles`.

## 3. Registering

```ts
this.handlers.register(createDecisionRiskHandler(graph, this.restarts));
this.exporters.register(decisionRiskExporter);
this.registry.register({
  slug: 'decision-risk', name: 'Decision Risk', description: '…',
  organizationSlugs: ['corporate'], icon: 'shield', defaultGroup: 'Strategy',
  defaultLifecycle: 'dev', hitl: true, dataClassification: 'confidential',
  entryPoint: {
    kind: 'runtime',
    maxAttempts: 2,
    modelRoles: ['analyst', 'red_team', 'writer'],   // each needs an org profile to start
    accessControl: { mode: 'owner' },                  // or 'org', or an allowlist
    parseStartInput,                                   // strict; throw WorkflowInputError
    runTitle,
    restartPoints: { 'assess-dimensions': { resumeAt: 'aggregate' }, … },
  },
});
```

The catalog, the nav, per-org enablement and lifecycle all come from this
entry. Nothing else is edited to add a workflow.

## 4. The rules

**The context is the capsule.** The web creates the ExecutionContext and it
travels whole in state. Nodes pass `scopeOf(state)` (the context, the model
profile, and a restart instruction) to work units. Never rebuild, spread or
extend a context in the backend. The only exception is Ambient's
`createSystemTriggeredContext`, whose runs belong to the system user
(NIL_UUID).

**Every model call is a work unit.** `WorkUnitService.runSolo | runPanel |
runRedBlue | runArbitrated | runSummarizer` calls agent definitions by slug. Each one gets
the agent's strict input/output contract, a model by role
(`callForRole`), a traced participant, usage rows and events. A node never
calls an LLM directly. Framing (per-call instructions from your own data,
such as one dimension's prompt) goes in `framing`. The agent contract is
unchanged by it.

**Every human step is a gate.** `units.runHuman(scope, {slug, gate, round,
payload})` pauses the run (`awaiting_review`) and creates a work task. It
resumes with the person's decision. Declare what reject does. Do nothing in
a gate node that must not repeat: the node re-runs on resume.

**Arithmetic is code; models judge.** Composites, thresholds, simulations and
residuals are pure functions with unit tests. A model is never asked to
"weigh everything and give a score".

**Parse strictly; never default.** A missing or malformed output fails the
run with the raw text (`AgentOutputError`). A panel that feeds an aggregate
is `fail_all`. Use `allow_partial` only when a subset is honestly useful,
and say so in the result.

**Findings go on the issue ledger.** `ledger.raise(scope, stage, issues)`
replaces a stage's issues; `ledger.move(scope, changes, actor)` records each
status change with its reason. People see them on the Issues tab, and
exports include them.

**Domain content lives in tables.** Prompts, weights and thresholds are rows
an org can change without a deploy. Decision Risk reads its dimensions and
debate framing from `risk.*`.

**Every path ends.** Completed, failed (with the reason), canceled or waiting
for a person. No fallbacks, no swallowed errors, no `any`.

## 5. What the runtime gives you (and the kit shows)

| Capability | API | Web kit |
|---|---|---|
| Live progress | worker events + stream token | `useWorkflowRun`, Activity tab |
| Human gates | `review.submit` / `answer.submit` / `finish` | `ReviewPanel` (approve, per-item accept/reject/modify) |
| Trace | `GET …/trace`, `…/trace/participants/:id` | Trace tab |
| Issues | `GET …/issues` | Issues tab |
| Export | `GET …/export?format=md\|docx\|pdf` (exporter) | `ExportMenu` |
| Brief, docs, examples | `GET /workflows/:slug/brief`, `/docs/:name` | `BriefModal` |
| Restart from a step | `restart` (restartPoints, checkpoint fork) | "Restart from here" |
| Trace review | `trace.review`, `improvement.request` | "Review this step" |
| Ambient launch | trigger `action_config.workflowSlug` + `input` (+ `inputFromEvent` paths such as `new.id`; `condition` on dotted paths) | runs appear in the org's list |

Actions on an existing run are authorized by the run's access rule. A person
in the org can answer a system run's review. The web opens a run with the
viewer's own context (`useWorkflowRun.open(slug, runId, org, userId)`).

## 6. Restart

A restart is a new run (a new conversation) that branches from a finished
run **after** a work unit. The runtime finds that boundary in the parent's
LangGraph checkpoint history, not in its final result. It forks the new
thread with the new run's context, current models and instruction, and
copies the issue ledger as it stood at the checkpoint. Declare a
`restartPoints` entry per unit whose output is a sensible place to continue,
naming the graph node that follows it. A restart "before" a unit is a restart
after the unit before it.

## 7. Testing

- **Logic spec:** routing predicates, aggregation, clamps, per-item decisions,
  the exporter. No database, no model.
- **Pilot spec** (`__tests__/<slug>.pilot.integration.spec.ts`,
  `HUMAN_REVIEW_TEST_DATABASE_URL`): the real tables, checkpointer and worker,
  with a scripted model that gives each agent a valid answer. It covers a
  real pause and resume, the ledger, restarts, a trace review, and an ambient
  launch. It runs under a random slug so the live worker never claims it.
- **Kit and page specs** in `apps/web` for anything the workflow renders.
- **Live:** `npm run deploy:studio`, then one real run in the browser
  (Playwright) with screenshots, checked against `docs/smoke-test.md`.

Do not write a test that mocks every node and asserts the graph called them
in order. It restates `addEdge`.

## 8. Migrations

`scripts/migrate-deployed.sh` runs as `supabase_admin`, and the API connects
as `postgres`. Every table, schema and sequence you create needs `OWNER TO
postgres`, or the API gets "permission denied" at runtime. The database
plane's query builder JSON-encodes arrays, so list columns are `jsonb`, not
`text[]`; a guard spec checks the workflows schema. Several writes that must
agree go in `db.transaction(tx => …)`.

## 9. Definition of done

- Registered once (entry point, handler, exporter if it reports), with a page
  and a result view; lifecycle set per org.
- Every mutation through `POST /workflows/invoke`; reads with JWT + RBAC org.
- The context passed whole; models only by role; planes only.
- Every model step a work unit; every human step a gate with declared reject
  behavior.
- Terminal status on every path; no fallbacks.
- `docs/` complete (brief, user guide, smoke test, two examples, one simple
  and one hard, that the workflow's own parser accepts); export if it
  produces a document; restart points declared; a reviewer linked.
- Specs as in §7, and one live run checked in the browser.

Start from `docs/workflow-factory/intention-template.md`.
