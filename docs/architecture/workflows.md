# How workflows are coded

A workflow is a **LangGraph endpoint in code**. It is not an agent, it has no
row in `agents`, and nothing about it is discovered from the database except its
*configuration*.

    an agent    = a row, fully defined by that row, run by one of five family runners
    a workflow  = a graph in code that registers itself, and nothing else

`decision-risk` is the reference implementation. Read it alongside this.

---

## 1. Why LangGraph and not a service

The temptation is always to write a workflow as a NestJS service with a long
method: load, call the model, call it again, aggregate, return. That is what
`risk-runner` was — 124 files of services, repositories and a task router — and
it is why nobody could say what it did without reading all of it.

A graph makes four things true that a service does not:

- **The shape is visible.** `addNode`/`addConditionalEdges` is the whole control
  flow in twenty lines. Branching lives in one place instead of scattered
  across `if` statements in five services.
- **A step is testable alone.** A node is `(state) => Partial<state>`. No graph,
  no Nest container.
- **Runs are resumable.** `PostgresCheckpointerService` persists state per
  `thread_id`, which is how HITL pauses work at all.
- **Routing is a pure function.** `shouldDebate(state)` is tested with an object
  literal. A service buries that decision inside the method that acts on it.

Use LangChain primitives (`@langchain/core` messages, tools) *inside* a node
where they help. Do not build the workflow itself out of chains — a chain
cannot branch, pause or be resumed.

## 2. Layout

```
apps/api/src/workflows/<name>/
  <name>.graph.ts        the graph, and its pure routing functions
  <name>.state.ts        Annotation.Root extending HitlBaseStateAnnotation
  <name>.service.ts      compiles the graph once, invokes it, shapes the result
  <name>.controller.ts   HTTP surface; guards; passes ExecutionContext through
  <name>.module.ts       providers + registry.register()
  <name>-store.service.ts  all database access for this workflow
  nodes/
    <step>.node.ts       one exported create<Step>Node(deps) factory each
  __tests__/
  brief.md               what it is for, in prose, for whoever inherits it
```

## 3. The rules

**Nodes are factories.** `createAssessDimensionsNode({ llm, store, logger })`
returns the node function. Dependencies are arguments, never imports and never
`@Injectable` on the node itself. This is what makes a node testable with three
fakes and no container.

**State extends `HitlBaseStateAnnotation`.** It carries the ExecutionContext
capsule whole. Nodes read `state.executionContext.orgSlug` — they never
reconstruct a context, never destructure it into the state root, and never
mutate it. Do not use the deprecated `BaseStateAnnotation`.

**`conversationId` is the thread id.** `{ configurable: { thread_id:
context.conversationId } }`. Nothing else.

**LLM calls go through `LLMHttpClientService`.** It is badly named — it injects
`LLM_SERVICE` in-process, no HTTP hop — and it is how a workflow inherits the
PII boundary, usage recording and cost attribution described in
`llm-boundary.md`. A node that constructs its own client silently opts out of
all three. Give every call a `callerName`; it is what makes the LLM admin
readable.

**Arithmetic is code, models are for judgment.** Ask a model to assess one
dimension. Do not ask it to "weigh everything and give an overall score" — it
produces a number nobody can reconstruct. `compositeOf()` is a weighted mean
over weights from the database, and it is unit-tested.

**Parse strictly, never default.** A model that returns unreadable output stops
the run. `parseJsonResponse` strips code fences — that is normal handling — and
then throws with the raw text if there is no JSON. Substituting a default would
produce a result that looks complete and is wrong, which is the exact failure
CLAUDE.md rule 2 forbids. Bound-check every number the prompt asked to be
bounded.

**`Promise.all`, not `allSettled`, for a fan-out whose results are aggregated.**
If one branch of a radar fails, the composite is wrong. Fail the run.

**Domain content lives in the database.** Prompts, weights, thresholds and which
steps are enabled belong in tables, not in the graph. `decision-risk` reads its
ten dimension prompts from `risk.dimension_contexts` and its debate framing from
`risk.debate_contexts`; pointing it at another scope changes the assessment with
no deploy. This is the difference between a product and a starter platform.

**Registration is the whole cost of adding one.**

```ts
export class DecisionRiskModule implements OnModuleInit {
  constructor(private readonly registry: WorkflowRegistry) {}
  onModuleInit(): void {
    this.registry.register({
      slug: 'decision-risk',
      name: 'Decision Risk',
      description: '…',
      organizationSlugs: ['corporate'],
    });
  }
}
```

No row, no slug constant, no controller edit.

## 4. What to test

Test the pure functions directly — routing predicates, aggregation, parsing,
clamps. `decision-risk.logic.spec.ts` covers all of them in 18 tests with no
database and no model, and it is the file that would catch a real regression.

Do not write a test that mocks every node and asserts the graph called them in
order. It restates `addEdge` and breaks whenever the shape changes legitimately.

## 5. Known gaps

- **Run history is not generalised.** The catalog answers *whether* a workflow
  exists from the registry, but where its runs are stored is still each
  workflow's own tables. `decision-risk` writes to `risk.*`, `marketing-swarm`
  to `marketing.*`. The third workflow should force a shared shape.
- **No HITL checkpoint in `decision-risk` yet.** The state supports it and the
  checkpointer exists. An arbiter that wants to move a score more than the
  clamp allows is the obvious place to ask a human.
