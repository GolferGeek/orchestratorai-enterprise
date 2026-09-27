# Workflow intention

Fill this in before writing code, in `efforts/` (the effort file for the
workflow). A reviewer signs it off; the build then follows
`docs/architecture/workflows.md`. Keep answers short. An answer you cannot
give is a question to settle first, not a blank to skip.

## 1. The job

- **Who uses it, and in which org(s)?**
- **What do they have when they start?** The exact start input: fields, limits,
  uploads. This becomes `parseStartInput`.
- **What do they have when it ends?** The result a person reads, and the report
  it exports, if any.
- **What would they do without it, and how long does that take?** This is the
  bar the result has to clear.
- **One simple case and one hard case**, written as real inputs. They become
  `docs/showcase/` and the pilot spec's fixtures. Their expected outcomes come
  from a person, not from the workflow's own mocks.

## 2. The steps

A table, one row per step, in order:

| Step (node) | Work unit pattern | Agent(s) and role | Reads | Writes | Can fail how |
|---|---|---|---|---|---|

- Patterns: `solo`, `panel` (fail_all / allow_partial and why), `red_blue`,
  `arbitrated`, `summarizer`, `human`, or plain code.
- For each model step, what is **judgment** (the model) and what is
  **arithmetic** (code, unit-tested)?
- Branches: which pure function decides each, from which state.

## 3. People in the loop

- Each gate: what the person sees, the decisions allowed (approve, reject,
  per-item modify, answer), and what **reject** does.
- Who answers: the run's owner, anyone in the org (`accessControl`), or a
  system run's reviewers.

## 4. Planes and data

Which of these it uses, and for what. Anything not on the list is a plane
change and needs its own decision.

| Plane | Token | Used for |
|---|---|---|
| Database | `DATABASE_SERVICE` | |
| LLM (by role) | `WorkflowLlmClient` → `LLM_SERVICE` | |
| Observability | `OBSERVABILITY_SERVICE` | (automatic for work units) |
| Storage | `MEDIA_STORAGE_PROVIDER` | uploads |
| Checkpointer | `CHECKPOINT_SAVER` | (automatic) |
| Work routing | `WORK_TASK_SINK` | (automatic for gates) |
| Config | `CONFIG_PROVIDER_SERVICE` | |
| Document extraction | `DOCUMENT_EXTRACTION_ROUTER` | |
| RAG | `RAG_STORAGE_SERVICE` | |

- New tables (schema, owner `postgres`, `jsonb` for lists) and which org-editable
  content lives in them (prompts, weights, thresholds).
- Data classification (`public` / `internal` / `confidential` / `restricted`)
  and anything that must not reach a hosted model.

## 5. Quality

- **Issues:** which steps raise ledger issues, their keys, and what settles them.
- **Restart points:** after which units a re-run makes sense, and where it
  resumes.
- **Trace review:** the reviewer agent (the generic `workflow-trace-reviewer`,
  or a domain one) and the `reviewer` model role.
- **Ambient:** can a trigger start it? With what fixed input?

## 6. Reviewer checklist

- [ ] The start input is strict and every field is needed.
- [ ] Every model step is a work unit with an agent contract; no direct LLM
      call; models by role only.
- [ ] Numbers that matter are computed in code and tested.
- [ ] Every gate declares reject; nothing in a gate node must not repeat.
- [ ] Every path ends (completed, failed with a reason, canceled, waiting).
- [ ] No fallbacks: a missing or malformed output fails the run.
- [ ] The two showcase cases are real, and the hard one is actually hard.
- [ ] Docs, export, restart points and a reviewer are planned, not "later".
- [ ] Cost: model calls per run × the chosen models is acceptable.
