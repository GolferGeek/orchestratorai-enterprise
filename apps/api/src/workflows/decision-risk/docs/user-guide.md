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

## Run it again from a step

On a finished run, open **Trace** and choose **Restart from here** on a step.
A new run keeps everything up to the end of that step and runs the rest again,
with your organization's current models. The original run is not changed.

- Restart after **propose-mitigations** to consolidate the same proposals again (for example with an instruction).
- Restart after **consolidate-mitigations** to review the same proposals again.
- Restart after **review-mitigations** to rewrite only the summary.
- Restart after **assess-dimensions** or **red-team** to redo everything after
  the scores.

You can add an **instruction for the agents**, such as "Weigh regulatory
timing heavily". Every agent in the new run receives it. The new run links back
to the one it came from.

## Ask for a review

If a step's output looks wrong, open **Trace** and choose **Review this step**,
or open an agent's call and choose **Review this call**. You can say what looks
wrong. The workflow's reviewer agent reads the step's inputs, outputs and
instructions, then lists its concerns and recommends changes to the prompt, the
model or the workflow.

- **Request this improvement** sends a recommendation to your organization's
  administrators (**Admin → Workflows → Improvement requests**).
- When the reviewer suggests re-running with a better instruction, **Re-run
  this step with this instruction** starts a new run that repeats the reviewed
  step (and everything after it) with that instruction.

## Scores

Scores run from 0 (no risk) to 100 (severe). A dimension is *flagged* at 60,
the red team always runs, and the *alert threshold* is 80. Your organization's
administrator can change the dimensions, their weights and prompts, and the
thresholds without a release.
