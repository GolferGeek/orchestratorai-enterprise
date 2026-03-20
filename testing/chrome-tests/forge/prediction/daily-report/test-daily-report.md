# Daily Report

## Route
`/app/prediction/daily-report`

## Level 1 — Page Loads
- [ ] Navigate to /app/prediction/daily-report
- [ ] Page renders
- [ ] No console errors

## Level 2 — Functions Render
- [ ] "Run Daily Report" button visible
- [ ] Report list/history visible (or empty state)
- [ ] Report format options (Markdown, JSON, HTML)

## Level 3 — Functional Testing

### Run Report
- [ ] Click "Run Daily Report" triggers report generation
- [ ] Loading/progress indicator shows
- [ ] Report completes (or shows error if no data)
- [ ] Generated report appears in list

### View Reports
- [ ] Report list shows recent runs with timestamps
- [ ] Click report opens detail view
- [ ] Recommendations section visible
- [ ] Market analysis section visible

### Download Artifacts
- [ ] Download as Markdown works
- [ ] Download as JSON works
- [ ] Download as HTML works

### Recommendation Decisions
- [ ] Each recommendation has approve/reject/apply/escalate options
- [ ] Click decision updates status
- [ ] Decision history tracked

## Cron Job Needed
- [ ] **TODO: Daily report should run automatically via Pulse cron trigger**
- [ ] Trigger: once per day (e.g., 6 AM)
- [ ] Action: call predictor agent with `daily-reports.run`

## Results
_Last run: not yet executed_
