# Decision Risk: design notes

For developers. The user-facing brief, guide and examples are in `docs/`.

**"We are thinking about doing something. What is the risk?"**

State a proposition in plain language — acquire this company, sign this vendor,
enter this market, restructure this team. The workflow returns a score, the
argument behind it, and what you would do about it.

## Why it is not the old risk agent

The engine this runs on came from `risk-runner`, which scored investment
portfolios. Inspecting the schema showed the engine was never really about
investments: scopes carry a `domain`, dimensions are per-scope and weighted,
subjects are `identifier`/`name`/`subject_type`. The investment coupling was two
rows and their dimension sets.

So this is the same engine asked a better question. A portfolio score is worth
little to most buyers. "Should we do this, and what would go wrong" is a
question every executive has, in every department — which is why it lives in the
corporate org rather than in finance.

## The flow

1. **load_scope** — find this org's `decision` scope, its dimensions and their
   prompts. Identify the proposition by a hash of its text, so re-asking the
   same question accumulates history rather than starting over.
2. **assess_dimensions** — ten dimensions assess it *in parallel and
   independently*, each with its own prompt. They do not see each other, so they
   cannot converge on a shared story. The spread between them is information.
3. **aggregate** — weighted mean. Deterministic, reconstructable, tested.
4. **red_team**: blue defends, red attacks, an arbiter rules, and all three
   are stored in full. By default it runs whenever the scope enables it
   (`redTeam.mode: 'above-threshold'` saves the calls). The adjustment is
   capped at 25 points: one debate refines a score, it does not replace the
   radar.
5. **propose_mitigations**: for each flagged dimension, the highest-value
   action actually available, and what the dimension would score if it were
   done. Each flagged dimension is also an issue on the run's ledger.
6. **review_mitigations**: a person approves, drops or rewrites each
   proposal (a human gate). Only approved mitigations are recorded, and the
   residual composite is recomputed from them with the same arithmetic, so
   "72 before, 48 after" is checkable. The decision settles each ledger issue.
7. **monte_carlo**: a seeded simulation over the dimension scores and
   confidences, giving an 80% interval and the chance of reaching the alert
   threshold. The same run always gives the same numbers.
8. **executive_summary**: narrates the run. Cites only numbers already
   computed; it never re-judges.

## What a customer changes without a deploy

- **Dimensions** — add, remove, reweight (`risk.dimensions`; active weights must
  sum to 1.0 within the scope).
- **Prompts** — every dimension's question and the blue/red/arbiter framing are
  rows, versioned (`risk.dimension_contexts`, `risk.debate_contexts`).
- **Thresholds** — when a dimension is flagged, when a debate is worth running,
  when an alert fires (`risk.scopes.thresholds` and `analysis_config`).
- **Whole domains** — a second scope with different dimensions is an INSERT. The
  investment scopes still exist and still work, which is what proves it.

## Seeded configuration

Migration `20260922230000` creates the `corporate` org, `risk.mitigations`, and a
`decision` scope with ten dimensions: execution (0.13), financial (0.13),
regulatory (0.12), security & privacy (0.12), legal (0.11), operational (0.10),
dependency & vendor (0.08), people & capability (0.08), reputational (0.07),
competitive (0.06).

It also fixes `risk.validate_dimension_weights()`, which summed weights across
*every* scope and so forbade a second domain outright.
