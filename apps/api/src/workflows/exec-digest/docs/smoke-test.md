# Weekly Exec Digest smoke test

1. In Corporate, start a digest for all departments, week ending today.
2. It completes in under a minute. Check:
   - **Result** has a card for each department and company totals that add
     up to the cards.
   - A department with no activity says so; no card invents activity.
   - **Trace** shows `summarize-departments` (one call per department) and
     `compose-digest`.
   - **Download → PDF** shows the same numbers.
3. **Ambient → Triggers** lists "Weekly exec digest", enabled, Fridays 16:00.
