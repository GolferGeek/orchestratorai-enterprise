# Decision Risk

**"We are thinking about doing something. What is the risk?"**

State a proposition in plain language: acquire this company, sign this vendor,
enter this market, restructure this team. You get a risk score, the argument
behind it, and what you would do about it, in about two minutes.

## How it works

1. **Ten independent assessments.** Execution, financial, regulatory, security
   and privacy, legal, operational, dependency and vendor, people and
   capability, reputational, and competitive risk each score the proposition
   from 0 (no risk) to 100 (severe), without seeing each other. Where they
   disagree is information.
2. **A red team.** One agent attacks the combined score, one defends it, and
   an arbiter rules. The score can move by at most 25 points.
3. **Mitigations for you to review.** Every dimension at or above the flagged
   threshold gets the single highest-value action and the score it would
   leave. You approve, drop or rewrite each one before anything is recorded.
4. **The picture after mitigation.** The residual score is recomputed from
   what you approved, and a simulation gives the range the score could fall
   in and the chance it reaches the alert threshold.
5. **An executive summary**, written only from the numbers above.

## What you get

- A composite score and a residual score you can check by hand: both are
  weighted means of the dimension scores.
- Every flagged dimension tracked as an issue, marked accepted or not
  addressed by your review.
- A full trace: every agent's input, output, model and cost.
- A report to download as PDF, Word or Markdown.

## Good propositions

Name one action, its scale and its timing, and give the context: "Open a second office in Berlin next quarter to serve EU clients",
with the team size, the revenue at stake and what is not in place yet. Vague
propositions get vague scores.
