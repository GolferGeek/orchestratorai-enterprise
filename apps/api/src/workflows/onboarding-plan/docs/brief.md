# New Hire Onboarding

**Record a new hire and their onboarding plan starts itself.**

When HR records a new hire, the plan starts on its own. A planner drafts the
first week, the 30/60/90-day plan and every account, device and access the
hire needs, following your HR policy library. The hiring manager approves the
requests, and each one becomes a task for the team that owns it.

## How it works

1. **Hire recorded.** A new row in HR's new hires starts the run (an ambient
   database trigger). You can also start one here with the hire's details.
2. **Policy.** The facts that apply (onboarding steps, benefits enrollment,
   required trainings, equipment and remote work) are read from the
   `hr-policy` knowledge base.
3. **Draft.** The onboarding planner writes a welcome, days 1 to 5, the
   30/60/90-day outcomes and the requests, each with an owner and a deadline.
4. **Approve.** The manager keeps, drops or rewords each request.
5. **Tasks.** Each approved request is created as a task for its owner once,
   even if the run is retried.

## Why it helps

Nothing is forgotten before day one, every plan follows the same policy, and
the manager spends two minutes approving instead of an afternoon writing.
