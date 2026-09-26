# The LLM boundary: the call is trivial, the layer around it is the product

**Read this before adding an LLM provider, a provider plane, or anything that
talks to a model.** This document exists because the rule below has been broken
twice, both times silently, and both times it cost real protection in
production.

## The rule

Everything that matters happens **before and after** the provider call. The
call itself is a dumb HTTP request.

```
before:  pseudonymize → pattern-redact → (policy may refuse outright)
CALL:    openai | anthropic | google | grok | ollama | ollama-cloud |
         openrouter | azure_foundry | vertex_ai
after:   un-redact → un-pseudonymize → usage/cost/metadata recorded
```

A vendor is a **backend**. `BaseLLMService` has exactly one abstract method —
`generateResponse` — and hands down usage recording, cost, metadata, retries
and error handling. A backend implements the call and nothing else.

This is why adding a vendor is cheap and why the guarantees hold uniformly: the
privacy logic is written once, in `PiiBoundaryService`, and applied once, in
`LLMGenerationService`. No vendor file contains any of it.

## What a new provider looks like

1. A class extending `BaseLLMService` implementing `generateResponse`. Optional
   `generateImage` / `generateVideo` / `pollVideoStatus` if the vendor supports
   them — capability is discovered by their presence, never by adding the
   vendor to a list somewhere.
2. One line in `LLMServiceFactory.providerMap`.
3. One entry in the `SupportedProvider` union.
4. A row in `llm_providers` — `llm_usage.provider_name` is a foreign key onto
   it, so without one the backend cannot record usage. The factory refuses to
   boot if you forget, which is deliberate: that failure is swallowed twice on
   the way out, so the model call would succeed and only the accounting row
   would vanish.

That is the whole job. If you are writing more than that, stop — you are
probably adding it at the wrong layer.

Vertex AI is Google Cloud — a different *service* from Google's public Gemini
API registered as `google`, even though both serve Gemini models. That is why
the service is recorded rather than inferred from a model id: `gemini-2.0-flash`
is reachable both ways and the id cannot tell you which one ran or billed.

## What NOT to do

**Do not add a provider as an `LLM_PROVIDER` plane.** `LLM_PROVIDER` selects the
*stack*, not the vendor. The vendor is chosen per request via
`ExecutionContext.provider`. A new plane sits *beside* the before/after layer
instead of beneath it, which silently removes every guarantee.

The plane factory in `packages/planes/llm/llm.module.ts` now **refuses to
start** on any value other than `fine_control`, precisely so this cannot happen
again quietly.

## How this went wrong, twice

Worth reading, because neither failure produced an error.

### 1. OpenRouter as a parallel stack (Feb 2026 → Sep 2026)

The provider-plane abstraction landed 2026-02-23. OpenRouter, Azure Foundry,
Vertex AI and the two-tier service were registered as alternatives *to*
`fine_control` rather than as backends *under* it. `LLM_PROVIDER=openrouter`
therefore replaced the entire box containing the boundary.

Consequences, all silent:

- **No PII protection at all** on any non-`fine_control` setting. The Studio ran
  `LLM_PROVIDER=openrouter`, so every chat message went to the vendor raw —
  no pseudonymization, no redaction, no showstopper block.
- **No usage rows.** Being a parallel stack, `OpenRouterLLMService` had to grow
  its own usage recording, and it wrote to observability events instead of
  `llm_usage`. The LLM usage admin had therefore only ever shown local Ollama
  traffic; no commercial call appeared, with no cost or token accounting.

Nothing failed. The metadata even recorded `blocked: true` on requests that
were sent anyway.

### 2. The two entry points drifting apart

`LLMGenerationService` had the pipeline inlined separately in
`generateResponse` and `generateUnifiedResponse`. The unified path — the one
the chat runner uses for every text-only message — lost its redaction stage and
reversed only pseudonyms. Anything the dictionary missed reached the vendor
unredacted.

Both paths now call the same `PiiBoundaryService`, and
`__tests__/llm-boundary.spec.ts` runs identical assertions against both, plus
against every vendor the factory can return.

## The invariants, and where they are enforced

| Invariant | Enforced by |
|---|---|
| Pseudonymize before redact, outbound | `PiiBoundaryService.apply` + spec |
| Un-redact before un-pseudonymize, inbound | `PiiBoundaryService.reverse` + spec |
| Showstopper PII never reaches a vendor | `pipeline.blocked` short-circuit + spec |
| Local providers bypass entirely | `PiiBoundaryService.isLocalProvider` |
| `ollama-cloud` is *external*, not local | same — it is a hosted service |
| The badge summary carries no values | `buildPrivacySummary` + spec |
| Every vendor gets the same treatment | boundary sits above `LLMServiceFactory` |
| No plane can bypass the boundary | `llm.module.ts` fails closed |
| Every backend can record usage | `assertProvidersRegistered` at startup |

## Per-role models in workflows (the one sanctioned exception)

A workflow's steps may each use a different model (an org picks, per
workflow, which provider/model each role gets: `workflows.model_profiles`).
Those calls do **not** take the model from `ExecutionContext.provider/model`.
`WorkflowLlmClient.callForRole` passes the role's provider and model
explicitly to `generateUnifiedResponse`, and the context rides along whole
and unchanged. Everything above still applies, because the call goes through
the same boundary: PII handling, the sovereign check (against the explicit
provider), usage recording and observability.

- The run snapshots the org's profiles for its roles at start (`runs.model_profile`);
  a role with no profile refuses the start. There is no default model.
- Never build a new context with the role's model, and never spread or
  mutate the context to change it. That is the failure this exception
  replaces.
- The model that answered and its `llm_usage.run_id` are recorded on the
  participant row, so traces join usage exactly.

## Smells that mean the rule is being broken

- A vendor file importing `PIIService`, `DictionaryPseudonymizerService` or
  `PatternRedactionService` to *use* them. (Backends receive these to pass to
  `BaseLLMService`; they must not call them.)
- A vendor file writing usage rows itself.
- A hardcoded list of provider names anywhere outside
  `LLMServiceFactory.providerMap`. Capability belongs to the backend.
- A new `case` in the `LLM_PROVIDER` switch.

## Still outstanding

- **The `simplified` two-tier plane** is the last parallel stack. It refuses to
  start rather than run unprotected; porting it is the same recipe above.
- **`AzureFoundryLLMService` and `VertexAILLMService`** — the old plane classes —
  still exist because the `simplified` adapters wrap them. They are no longer
  reachable as planes and should go when `simplified` does.
- **Image and video prompts are not sanitized.** `LLMImageService` and
  `LLMVideoService` dispatch through the factory correctly, but the
  before/after layer only wraps text generation today. Prompts are user
  content and can carry PII.
