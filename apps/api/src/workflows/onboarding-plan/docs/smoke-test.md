# Smoke test (3 minutes)

1. Sign in as the demo user, pick **Human Resources**, open **New Hire Onboarding**.
2. **Record hire** with any details. Within 30 seconds, **Recent hires** shows **Open plan**.
3. Open it: the Trace shows the draft by `onboarding-planner`; the run waits for review.
4. Reject one request, modify another, submit. The run completes; every remaining request has a task id and the rejected one is gone.
5. **Export → PDF** opens a plan with the first week and the requests table.
