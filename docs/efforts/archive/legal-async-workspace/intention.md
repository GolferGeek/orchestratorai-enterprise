# Intention: Legal Department Async Workspace on Local Models

## What

Reframe the Legal Department from a synchronous "press Send and watch one document analyze" chat experience into a **departmental workspace** built on a **durable async job queue** that runs equally well against local Ollama models on a single Mac Studio and against cloud LLMs.

The user opens the Legal Department and lands in a workspace. The home view is an **activity list** of every document, brief, matter, or memo the department is currently working on or has worked on, scoped to the user's organization. A sidebar exposes the department's **capabilities** (start a new document analysis, start a new brief stress-test, open a case team, configure portfolio watchers, browse the department's knowledge collections). Starting any of these queues a job and returns the user immediately to the activity list, where the new job appears at the top with a live status badge. Clicking any job opens its detail panel and live-streams its observability events from the moment the user attached, with full backfill of every event the job has emitted to date — whether the job is currently running or finished three days ago.

The first capability ships as **Document Onboarding**, which is the existing 8-specialist Legal Department LangGraph workflow run as an async job rather than a synchronous SSE-held HTTP request. It must run end-to-end on `gemma4:e4b` on the local Mac Studio without timeout pressure. The other capabilities (Adversarial Brief Stress-Testing, Persistent Case Team, Portfolio Sentinel) are out of scope for this effort but the workspace, the job queue, the per-capability sidebar slot, and the activity-list-as-home pattern must be designed so they can be added as drop-in capabilities later without redesigning navigation or replumbing the queue.

## Why

### The current pain
The synchronous SSE-held invoke model is fighting the hardware and the workflow simultaneously:

- **Local LLMs are throughput-bound, not latency-bound.** A Mac Studio runs Ollama as effectively single-stream. A multi-specialist legal workflow that fans out 8 LLM calls in `Promise.all` against a single-stream backend serializes inside the daemon and any call at the back of the queue blows past the 300-second per-call timeout. Today the workflow can only complete on documents simple enough that the CLO routes to a single specialist, which is the only reason we got an end-to-end success on the test NDA.
- **The user is held hostage by one document.** While a document analyzes, the UI is a single chat pane staring at SSE events. You cannot queue a second document, you cannot walk away and come back, you cannot recover the result if your tab dies, and you cannot see the history of what the department has done. The product feels like a chatbot that takes legal documents, not like a department.
- **The conversation metaphor is the wrong frame.** A "Legal Department" is not a single thread of chat. It is an organization with capabilities, ongoing work, accumulated knowledge, and a shared activity log. Forcing all of that through one chat window is why the surface feels small.

### The unlock
Five things become possible when we restructure as an async job queue inside a workspace:

1. **No more timeout pressure.** A job runs as long as it runs. The 300-second per-LLM-call ceiling stops being a wall we have to engineer around. The chunking work that was "necessary to survive" becomes "useful for quality and observability" instead of a blocker.
2. **Queue multiple documents.** Drop in twelve contracts at 10 PM, walk away, find twelve completed reports at 7 AM. This is the demo that sells the product.
3. **Live and historical viewing become the same thing.** Because every observability event is persisted to `public.observability_events` and tagged with the job's `conversationId`, opening any job — whether it is currently running or finished three days ago — produces the same experience: the full event history streams in immediately, and if the job is still running, live events keep flowing on top. The user sees exactly what the department did, when it did it, and how long each step took. This is the same architecture the admin observability panel already uses; the user-level job detail panel is a filtered view of the same stream.
4. **Capabilities compose.** Adding the Brief Stress-Testing workflow becomes a new sidebar entry, a new modal, a new `job_type`, and a new worker handler. Same activity feed, same job detail panel, same observability story. The workspace pattern absorbs every future capability without any UI replumbing.
5. **The architecture aligns with the platform thesis.** The platform's pillars — durable state via the database plane, decoupled event streams via the observability plane, sovereign local LLMs via the LLM plane, agent-to-agent communication via Bridge, ambient automation via Pulse — all converge on this shape. Async jobs persisted to per-agent schemas, with events flowing through the observability plane, executed by workers that respect per-provider concurrency: this is what every advanced workflow on the roadmap (Sentinel, Persistent Case Team, Adversarial Stress-Testing, Monte Carlo Trial) is going to need anyway. We are building the foundation once.

### The deeper architectural reason
ExecutionContext was designed to be a **capsule** that flows through the system, identifying who is doing what and why. The conversationId field is exactly the right primary key for "one job's worth of work" — it threads through every LLM call, every observability event, every checkpoint. We have been treating conversationId as a chat session identifier; in the new model it is the **job identifier**, and the existing observability event stream is already keyed on it. Every piece of plumbing we need is already in place. We are not adding architecture; we are recognizing what the architecture was always for.

## The shape of the thing

### Workspace layout
A new top-level Vue view, `LegalDepartmentWorkspace.vue`, replaces `LegalDepartmentConversation.vue` as the entry point for the Legal Department agent.

Layout:
- **Left sidebar — Capabilities.** A list of what the department can do. For this effort, only "Onboard a Document" is wired up, but the sidebar is structured so future entries (Brief Stress-Test, Case Team, Portfolio Watch, Department Knowledge) drop into the same column. Each entry is a button that opens a modal for that capability's input form. There is no per-capability "tab" — the workspace is the activity feed, and capabilities are how you create new activity.
- **Main pane — Activity feed.** A table of jobs scoped to the current org, ordered by `queued_at desc`. Columns: type icon, title (e.g. document filename), status badge (queued / processing / completed / failed), current step (when processing), model, started, duration. The activity feed is the home of the workspace.
- **Right side panel (or inline expansion) — Job detail.** Clicking a row opens a panel that shows the job's full observability event history (from the database) and, if still processing, subscribes to the live SSE stream filtered by `conversationId`. Buffered events from the existing ReplaySubject and historical events from the database are merged and rendered in chronological order. When the job is complete, the panel includes the final report rendering (the existing Legal Department report markdown view, repurposed).

The **conversation chat window goes away** as the entry surface for Legal Department. It may live on as an internal widget elsewhere (asking the department a question without a document) but the workspace, not the chat, is the front door.

### Job queue
A new in-process job queue lives inside the Forge API, scoped per-agent.

- **Storage:** a per-agent `agent_jobs` table inside that agent's own Postgres schema. For this effort: `legal.agent_jobs` inside a new `legal` schema. (The `marketing_swarm` schema already exists for Marketing Swarm; Legal needs the same separation. Each agent owns its own data, its own row-level security boundary, its own migrations.)
- **Row shape:**
  - Identity: `id uuid pk`, `org_slug text`, `user_id uuid`, `conversation_id uuid` (the durable thread key linking to observability events)
  - Classification: `agent_slug text` ('legal-department'), `job_type text` ('document-analysis' for now), `provider text`, `model text`
  - State: `status text` (queued | processing | completed | failed), `current_step text`, `progress int`, `last_message text`, `error text`
  - Payload: `input jsonb` (the original invoke payload, including the document), `result jsonb` (the final structured output and the rendered report markdown)
  - Timing: `queued_at`, `started_at`, `completed_at`
  - Indexes: `(org_slug, status)`, `(conversation_id)`, `(queued_at desc)`
- **Worker:** a single in-process worker service in the Forge API that pulls queued jobs in order, runs the existing LangGraph workflow against them, and updates the row at every major transition (queued → processing → step transitions → completed/failed). Concurrency is configured per-provider:
  - `OLLAMA_MAX_CONCURRENT=1` (a Mac Studio cannot meaningfully parallelize Ollama calls)
  - `ANTHROPIC_MAX_CONCURRENT=10` (cloud providers can fan out)
  - Configurable via env vars at startup; the worker simply enforces them.
- **No new event plumbing.** The worker calls the same `ObservabilityService.emit()` the existing graph already calls, which pushes events into the same RxJS ReplaySubject the existing `/observability/stream` SSE controller already reads from, and which already get persisted to the same `public.observability_events` table that already exists. Every event is already tagged with the `conversationId` we use as the job's thread key. The only thing missing is the ability for a frontend to query the durable history of an old job — that's a new endpoint, not new infrastructure.

### How "live and historical are the same thing" actually works
The key design move:

1. **At enqueue time**, the API generates a fresh `conversation_id` for the job and stores it on the row. This is the durable handle the user will use forever to refer to "that document analysis."
2. **The worker runs the LangGraph workflow** with an `ExecutionContext` whose `conversationId` is that handle. Every observability event the graph emits — from document text extraction through metadata extraction through specialist analysis through synthesis through report generation — is tagged with that conversationId and lands in both the in-memory ReplaySubject (for live SSE) and the `public.observability_events` table (for durable history).
3. **When the user opens a job's detail panel**, the frontend does two things in sequence:
   - **`GET /legal-department/jobs/:id/events`** — fetches every persisted observability event for that conversationId from `public.observability_events`, ordered by timestamp. Renders them all immediately.
   - **`GET /observability/stream?conversationId={conversationId}`** — opens the existing SSE stream filtered by conversationId. Buffered events from the ReplaySubject are sent immediately on connect (and the frontend de-duplicates against what it already pulled from the historical fetch). Live events flow as the worker emits them.
4. **If the job is already completed**, the SSE stream still works — it just yields the buffered events and no new ones. The frontend renders the same panel either way.
5. **If the user closes the panel, walks away for an hour, and reopens it**, the historical fetch picks up everything that happened in the meantime. No state lost. No reconnection logic needed.

This is the core unlock and it costs almost nothing to build, because every piece already exists. We're connecting plumbing, not laying it.

### The bench harness updates with the architecture
The current `docs/efforts/current/bench/run.sh` is a synchronous curl that holds an SSE connection. It needs to evolve in lockstep with the architecture so we can keep iterating on Ollama models while we build:

- `./run.sh <model>` becomes: POST a job to `/legal-department/jobs`, get back a `jobId` and `conversationId`, then attach to `GET /observability/stream?conversationId=X` and tail until a `completed` or `failed` event, then GET the final result and print it.
- This proves the entire async path end-to-end via curl, no UI required, and it's the same path the eventual frontend will use.

## Constraints

- **No fallbacks. No cheating.** When a node fails on a local model the fix is to restructure the node, not to suppress the error or fall back to a different code path. When a worker job fails the row goes to `failed` with the real error and the SSE event log shows exactly where it died.
- **ExecutionContext is the capsule.** The job's conversationId IS the job identity from the worker through every LLM call and every observability event. No cherry-picking, no per-step IDs, no parallel state.
- **Per-agent schema isolation.** Legal Department's jobs table lives in the `legal` schema. Marketing Swarm's lives in `marketing_swarm`. A Postgres role scoped to one agent can never see the other's data. This is non-negotiable for sovereign deployments where different practice groups (litigation vs. M&A vs. employment) may eventually have different access boundaries.
- **Database plane only.** No direct Supabase calls from the Legal Department code. All persistence goes through the planes.
- **Observability plane only.** No new SSE endpoints, no new in-memory event buses, no new streaming infrastructure. The existing ReplaySubject + database + `/observability/stream` controller is the only event channel.
- **Provider-aware concurrency.** The worker MUST respect per-provider concurrency limits. Ollama max-concurrent must default to 1 unless explicitly overridden. Parallel execution of LangGraph nodes against single-stream providers is forbidden.
- **Backwards compatibility during the build.** The existing `/invoke/stream` synchronous endpoint and the existing `LegalDepartmentConversation.vue` keep working until the new workspace lands. The bench harness is the bridge: as soon as the async path is wired, the bench harness uses it, and we keep validating models against the new path while the old UI still functions.
- **The eight specialists are not rewritten in this effort.** The orchestrator's sequential-on-Ollama fix already shipped and the existing graph already runs end-to-end on `gemma4:e4b`. The async queue removes the timeout pressure that made chunking urgent. Chunking remains a worthwhile *quality* improvement (better observability per sub-step, more deterministic structured output, easier per-node model tiering) and is captured in `docs/efforts/future/legal-department-upgrades.md`, but it is not a precondition for this effort. The default model strategy is "`gemma4:e4b` for everything, escalate only on demonstrated context overflow."
- **End-to-end success criterion:** the user can drop a multi-specialist document (e.g. an MSA, an employment agreement) into the workspace, see it appear in the activity feed as `queued`, transition to `processing` with live progress events streaming into the detail panel, complete with a full final report visible in the panel, AND a different user in the same org can refresh and see the same job in their feed and open the same detail panel and see the full event history replayed from the database — all running against `gemma4:e4b` on the local Ollama daemon, no cloud LLM in the loop, no SSE timeout, no held HTTP connection.

## Out of scope

- **The other Legal Department capabilities.** Brief Stress-Testing, Persistent Case Team, Portfolio Sentinel are documented as future efforts and the workspace is structured to absorb them later. No code for them in this effort beyond designing the sidebar slot.
- **Per-specialist chunking.** Documented in `docs/efforts/future/legal-department-upgrades.md` and can land later as a quality pass. Not blocking.
- **Cancellation.** No cancel button on running jobs. Future polish.
- **Cross-user job filtering.** The activity feed shows all jobs for the org. A "mine vs. all" filter is future polish.
- **Org-scoped permission enforcement on the SSE stream.** The existing controller comments admit `admin:audit` is documented but not enforced. We rely on conversationId being a server-generated UUID for now and add proper RbacGuard scoping in a separate hardening pass.
- **Generalizing the workspace pattern to other agents.** Marketing Swarm and CAD Agent should eventually use the same workspace pattern. Not in this effort. We build the Legal Department workspace concretely; extracting `AgentWorkspace.vue` as a reusable frame is a follow-up refactor.
- **Job retention and cleanup.** Keep all rows forever for now. A retention policy is a future hardening item.
- **Token-level streaming inside individual LLM calls.** The observability events emit at node-transition granularity, not token granularity. Adding token streams is a future enhancement that lives at the LLM plane level, not in this effort.
- **Replacing the existing `/invoke/stream` endpoint.** Keep it functional throughout this effort so the existing UI and any other consumers do not break. Deprecation happens after the workspace is in production use.

## Target models

The async architecture removes the timeout pressure entirely, so model selection is no longer constrained by "which model fits in 300 seconds." The new constraint is much narrower: **does the work fit in the model's context window?** Speed and quality are no longer the limiting factors — `gemma4:e4b` is genuinely capable and runs at roughly 100 tokens/sec on the Mac Studio, which is a quality-per-speed ratio that justifies using it as the **default model for almost everything**.

The principle: **start with `gemma4:e4b` everywhere. Escalate only for a specific, demonstrated reason — and the only reason that matters in practice is context-window overflow on long documents.**

- **`gemma4:e4b` — the default for all nodes.** Routing. Classification. Metadata extraction. Every specialist. Synthesis. Report generation. Validated end-to-end at ~89s total wallclock on the test NDA, with output quality that produced a structured contract analysis, executive summary, risk matrix, and recommendations. There is no reason to assume a bigger model is needed for any given node until we have evidence that e4b actually fails on it.
- **`gemma4:26b` (mixture of experts) — escalation for long documents only.** When a node legitimately needs to ingest a document longer than e4b's context window can hold, 26b is the escalation target. MoE means the active parameter count per token is a fraction of the total, so the speed-to-capability ratio is excellent — it's the right "I need more context" model rather than a slow penalty for needing more capacity. Used only when the whole-document path overflows e4b's context.
- **`gemma4:31b` — reserved.** Top-quality reasoning, used only if both e4b AND 26b fail on a specific node. Not part of the default plan; held in reserve for cases where evidence proves we need it.

### Per-node model tier — start state

| Node category | Default model | Escalation trigger |
|---|---|---|
| Routing / classification | `gemma4:e4b` | None expected |
| Metadata extraction | `gemma4:e4b` | Long-document context overflow → `gemma4:26b` |
| Specialist analysis (each of 8) | `gemma4:e4b` | Long-document context overflow → `gemma4:26b` |
| Synthesis (cross-specialist integration) | `gemma4:e4b` | Quality failure on complex multi-specialist runs → `gemma4:26b`, then `gemma4:31b` |
| Report generation | `gemma4:e4b` | Same |

The model bench portion of this effort validates this start state empirically: run the full pipeline on a representative set of documents (short NDA, medium MSA, long contract), confirm `gemma4:e4b` handles each node, and only switch to 26b on the specific nodes where context overflow forces it.

Fallback / alternate models on the Mac Studio (visible to the API daemon): `qwen3:14b`, `qwen3:30b`, `qwen3:32b`, `qwen3-coder:30b`, `qwq:latest`, `qwen3-next:80b`. These get tested during the model bench pass as alternatives if a specific node fails on the entire Gemma 4 family, but they are not the default plan.

### Per-node model selection is configurable, not hardcoded

Whatever model each node uses must come from configuration — an env var, a config file, or a database table — not from a hardcoded model name in the node's code. Today the model is passed in via the ExecutionContext from the frontend, which is fine for "user picks one model for the whole job." We extend this with a per-node override mechanism so that escalation is a config change, not a code change. This is what makes it easy to start with "e4b for everything" and shift individual nodes to 26b only as evidence accumulates.

### The two-Ollama mystery — lower priority than I initially thought

The Ollama daemon at `localhost:11434` doesn't return `gemma4:26b`, `gemma4:31b`, or `gemma4:e2b` from `/api/tags` even though their manifests exist on disk. Almost certainly a daemon-version-vs-CLI-version mismatch (the running daemon is from `Ollama.app`, the CLI at `/usr/local/bin/ollama` is v0.20.0). The fix is upgrading Ollama.app and restarting the daemon.

Because the new "e4b for everything" default does not depend on 26b, this is **no longer blocking** the effort. We need 26b *eventually* for the long-document escalation case, so the fix lives inside this effort — but it's a small fix at the end of the bench phase, not a precondition. If e4b really does handle every node on every test document, 26b becomes a future-proofing nice-to-have instead of a critical path.

## Why this is the right effort to do tonight

It's the smallest thing we can build that:
- Unblocks every model on the Mac Studio for any document complexity
- Eliminates an entire class of timeout problems permanently
- Replaces a chatbot frame with a workspace frame in one stroke
- Lays the foundation for every Tier-1 future workflow on the roadmap (Sentinel, Adversarial Stress-Testing, Persistent Case Team)
- Reuses every piece of platform plumbing we already have (database plane, observability plane, LLM plane, ExecutionContext, the existing LangGraph workflow)
- Adds essentially no net-new infrastructure — just the `legal` schema, the `agent_jobs` table, a worker service, two new HTTP endpoints, one new Vue view
- Can be validated entirely via curl through the bench harness before any frontend work begins
- Is genuinely interesting demo material the moment it works
