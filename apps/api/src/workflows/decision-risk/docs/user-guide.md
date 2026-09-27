# Using Decision Risk

## Start a run

1. Open **Workflows → Strategy → Decision Risk** and choose **New**.
2. Write the **proposition**: one decision, stated as something you would do.
3. Add **Context**: facts the assessors cannot guess (team size, budget,
   customers affected, what already exists, deadlines). It is optional, but
   the scores are only as specific as what you give them.
4. Choose **Assess the risk**. The run appears in the list on the left and
   keeps going if you close the page.

Not sure what to write? **About this workflow → Examples** has worked
propositions you can start from.

## Review the mitigations

When the assessments and the red team are done, the run stops and the
**Review** tab opens. Each item is one flagged dimension with a proposed
action, its effort, and the score the dimension would have if it were done.

- **Approve all** accepts every proposal as written.
- Or decide per item: **accept**, **reject** (drop it), or **modify** and
  write the action you would actually take, then **Submit item decisions**.

Nothing is recorded until you submit. Rejected items stay on the **Issues**
tab as *not addressed*, so the report shows what was left open.

## Read the result

- **Result**: the composite score, the score if every approved mitigation is
  done, the red team's adjustment, the range from the simulation, the
  mitigations and the executive summary.
- **Issues**: each flagged dimension, its severity and what your review
  decided.
- **Activity**: every step as it happened.
- **Trace**: each agent's input and output, the model it used, tokens and
  cost.

To share the result, use **Download → PDF, Word or Markdown** at the top of a
completed run.

## Scores

Scores run from 0 (no risk) to 100 (severe). A dimension is *flagged* at 60,
the red team always runs, and the *alert threshold* is 80. Your organization's
administrator can change the dimensions, their weights and prompts, and the
thresholds without a release.
