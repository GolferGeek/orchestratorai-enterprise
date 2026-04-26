# Portfolio Sentinel — Pass/Fail Expectations

## Flow 1: Page Load
**PASS**: `/app/agents/legal-department/sentinel` loads. `PortfolioSentinelPage` renders with 4 tabs: Alerts, Signals, Portfolio, Sources. No console errors.
**FAIL**: Blank screen → P0. Redirect to login → P0. Tabs missing → P1.

## Flow 2: Empty State (No Sources)
**PASS**: If no sources configured, Signals tab shows empty state message (not blank white box, not error). Sources tab shows "No sources" empty state. This is correct behavior.
**FAIL**: Empty state causes console error → P1. Empty state renders as blank white box → P2.

## Flow 3: Add a Source
**PASS**: "Add Source" button opens source modal. Name, URL, type, poll interval, practice areas are all accessible and valid. Submitting creates the source. New source appears in Sources tab list.
**FAIL**: Modal doesn't open → P1. Form missing fields → P1. Source doesn't appear after add → P1.

## Flow 4: Poll a Source
**PASS**: "Poll Now" button on a source row triggers an ingest run. After ~30s, Signals tab shows new entries from that source. Signals have type badges and created timestamps.
**FAIL**: "Poll Now" does nothing → P1. Signals don't appear after polling → P1 (pipeline broken).

## Flow 5: Signal Classification
**PASS**: Ingested signals have classification labels (regulatory / court ruling / industry / news). Severity assigned. Portfolio linking shows if any matters are affected.
**FAIL**: Signals have no classification → P2. All signals show same type → P2.

## Flow 6: Alert Generation
**PASS**: High-impact signals appear in the Alerts tab. Alert shows affected matter, severity badge, source.
**FAIL**: Alerts tab empty even with high-severity signals → P1.

## Flow 7: Tab Filtering
**PASS**: Status and severity filters in Alerts tab correctly filter the list. Date range filter in Signals tab works.
**FAIL**: Filters don't update the list → P2.

## Regression Checklist
- [ ] Page loads with 4 tabs
- [ ] Add source works
- [ ] Poll now triggers ingest and signals appear
- [ ] Alerts tab shows high-severity signals
