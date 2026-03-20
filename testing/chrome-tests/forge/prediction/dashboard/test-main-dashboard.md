# Prediction Dashboard — Main Hub

## Route
`/app/prediction/dashboard`

## Prerequisites
- Forge Web on 6201, Forge API on 6200, Auth on 6100
- Logged in, navigate to Predictor agent (finance org, us-tech-stocks agent)

## Level 1 — Page Loads
- [ ] Navigate to /app/prediction/dashboard
- [ ] Page renders without blank screen
- [ ] No console errors
- [ ] Sidebar shows Predictor nav items

## Level 2 — Functions Render
- [ ] Stats header displays (total predictions, active, win rate, etc.)
- [ ] Predictions tab shows prediction groups (or "No Predictions" message)
- [ ] Quick-nav buttons visible: Trading Dashboard, Manage Portfolios, Daily Report
- [ ] Training section buttons: Learnings, Analysts, Missed Opportunities, Learning Queue, Test Lab
- [ ] Activity feed section visible

## Level 3 — Functional Testing

### Predictions Display
- [ ] Predictions load from API (check console log for API response)
- [ ] Prediction groups show target symbol, direction, confidence
- [ ] Click prediction group expands details
- [ ] Analyst ensemble visible in expanded view
- [ ] Click individual prediction navigates to detail page

### Navigation
- [ ] Click "Trading Dashboard" navigates to /app/prediction/trading
- [ ] Click "Manage Portfolios" navigates to /app/prediction/portfolios
- [ ] Click "Daily Report" navigates to /app/prediction/daily-report
- [ ] Click "Learnings" navigates to /app/prediction/learnings
- [ ] Click "Analysts" navigates to /app/prediction/analysts

### Universe Filter
- [ ] Universe dropdown shows available universes
- [ ] Selecting universe filters predictions to that universe
- [ ] "All Universes" option shows all predictions

### Agents Tab
- [ ] Switch to Agents tab
- [ ] Agent cards display
- [ ] Agent status visible

## Known Issues
- Universe handler was using `context.agentSlug` ('predictor') instead of data-level slug ('us-tech-stocks') — fixed 2026-03-19
- Prediction type interface had stale fields — fixed 2026-03-19

## Results
_Last run: not yet executed_
