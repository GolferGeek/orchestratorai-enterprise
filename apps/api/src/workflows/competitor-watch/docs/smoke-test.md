# Competitor Watch smoke test

1. In Marketing, open Competitor Watch. **Pages we follow** lists PostHog,
   Plausible and Linear.
2. Start **The last 90 days**. Within about two minutes it completes. Check:
   - Every page shows **compared** with an archive date, or **failed** with a
     reason (the others still ran).
   - **Trace** has `classify-changes` with one Jev check per change.
   - Material changes show before and after text; the noise count is shown.
3. Start **Since the last run**: pages are compared with step 2's copies and
   (the same day) report no material changes, without a model call.
