# Decision Risk smoke test

Run after a deploy that touches the workflow runtime or decision risk. Takes
about three minutes and a few cents on OpenRouter.

1. Sign in as a corporate user (or a super-admin with **corporate** picked).
2. **About this workflow → Examples → Berlin office → Use this example**, then
   **Assess the risk**.
3. Within about two minutes the run stops on **Review** with one item per
   flagged dimension. The **Issues** tab shows the same dimensions as
   *identified*.
4. Reject one item, rewrite another, **Submit item decisions**.
5. The run completes. Check:
   - **Result** has a composite and a residual score, and the mitigations
     omit the rejected one and show your rewrite.
   - **Issues**: the rejected dimension is *not addressed*, the rest
     *accepted* with their mitigation.
   - **Trace** lists assess-dimensions, red-team, propose-mitigations,
     consolidate-mitigations, review-mitigations and executive-summary, all completed.
   - **Download → PDF** opens a report with the same numbers.
6. **Admin → Observability** shows the run's events, and **Admin → LLM
   Usage** has its model calls under the run's conversation id.

A run that fails shows its reason on the page; the trace names the step.
