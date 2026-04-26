# Portfolio Sentinel — Test Cases

## Test SN-1: Page Load and 4 Tabs
Navigate to `/app/agents/legal-department/sentinel`. Verify: page loads, 4 tabs visible: Alerts, Signals, Portfolio, Sources. No console errors.

## Test SN-2: Empty State (No Sources)
With no sources configured: verify Signals, Alerts, Portfolio tabs show empty state messages (not blank white boxes, not errors). Sources tab shows "No sources" empty state.

## Test SN-3: Add an RSS Source
Click "Add Source". Fill in: name ("Legal News Test"), a valid RSS feed URL (e.g., a law-focused RSS feed), type = RSS, poll interval = 60 minutes, practice area = litigation. Click "Add Source". Verify: source appears in Sources tab list with status "active".

## Test SN-4: Poll Now
Click "Poll Now" on the test source. Verify: an ingest run triggers (source status changes to "polling" or similar). Wait ~30s. Click Signals tab. Verify: new signal entries appear from the RSS feed.

## Test SN-5: Signal Classification
In Signals tab, verify: signals from the RSS feed have type badges (regulatory / court ruling / industry / news). Each signal has a created timestamp. Content is readable (not raw XML or JSON).

## Test SN-6: Alert Generation
If any signal was classified as high-severity: verify it appears in the Alerts tab with a severity badge.

## Test SN-7: Portfolio Tab
Verify: Portfolio tab loads with client/matter list (or empty state if no matters). If matters exist: verify signal counts are visible per matter.

## Test SN-8: Tab Filters
In Alerts tab: test status filter (new/acknowledged/resolved). In Signals tab: test date range filter. Verify: filters change the visible list correctly.

## Regression Checklist
- [ ] SN-1: Page loads with 4 tabs
- [ ] SN-3: Add source works
- [ ] SN-4: Poll Now triggers ingest + signals appear
- [ ] SN-5: Signals have classification labels
