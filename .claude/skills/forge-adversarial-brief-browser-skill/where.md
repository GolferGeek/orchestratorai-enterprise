# Brief Stress Test — Where Everything Is

## Navigation
- Direct URL: `http://localhost:6201/app/agents/legal-department/adversarial-brief`
- Sidebar: Legal Department → Brief Stress Test (or Adversarial Brief)

## Submitting a Job

**Modal**: `AdversarialBriefCreateModal`

Form fields:
- **File upload** — accepts `.txt`, `.md`, `.pdf`, `.docx` (the legal brief to stress-test)
- **Instructions** textarea — optional guidance (e.g., "focus on patent law sections")
- **Max Rounds** number input — 1–10 (how many debate rounds before forced convergence)
- **Severity Threshold** number input — 1–10 (attack severity score below which convergence fires)
- **Button**: "Stress-Test"

## Job Activity List
Standard `JobActivityList` — shows status, model badge, created timestamp. Click row to open detail.

Status flow: `queued` → `processing` → `awaiting_review` → `processing` → `completed`

## HITL Review Modal

**Component**: `AdversarialBriefReviewModal` (NOT the shared LegalJobReviewModal)

The modal shows:
- **Ranked attack list** — each Red Team finding with severity score (1–10), category, description
- **Blue Team counter** — whether the defense successfully countered this attack
- **Per-recommendation checkboxes**: Accept (include in fortification) or Reject (discard)
- **Decision buttons**: "Approve" (fortify with accepted items) or "Reject All" (no fortification)

## Results View

**Modal**: `AdversarialBriefDetailModal`

Sections (no tabs):
- **`DebateRound.vue`** — one card per round showing: Blue Team arguments, Red Team attacks, Judge score
- **`FortificationDiff.vue`** — shows the original brief text vs. the fortified brief (diff view) for each accepted recommendation

## SSE Stages (StageLadder)

| Stage | Label |
|-------|-------|
| `brief_analysis` | Analyzing Brief |
| `blue_team_orchestrator` | Blue Team |
| `red_team_orchestrator` | Red Team |
| `judge_scoring` | Judge Scoring |
| `convergence_check` | Checking Convergence |
| `synthesis` | Synthesizing |
| `hitl_checkpoint` | Awaiting Review |
| `fortification` | Fortifying |
| `report_generation` | Generating Report |

## API Endpoints
```
POST /agents/legal-department/invoke  (multipart with file + context)
GET  /agents/legal-department/jobs?orgSlug=big-ideas
POST /agents/legal-department/jobs/:id/review
GET  /agents/legal-department/jobs/:id/stream
```
