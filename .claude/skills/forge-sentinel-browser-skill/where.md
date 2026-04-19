# Portfolio Sentinel — Where Everything Is

## Navigation
- Direct URL: `http://localhost:6201/app/agents/legal-department/sentinel`
- Sidebar: Legal Department → Portfolio Sentinel (or Sentinel)

## Dashboard Layout (PortfolioSentinelPage)

The page has 4 tabs. No job submission required — this is a monitoring dashboard.

### Tab 1: Alerts
- List of elevated signals (alerts that need attention)
- Filters: Status (new / acknowledged / resolved), Severity (critical / high / medium / low)
- Each alert row: signal summary, affected matters, severity badge, created timestamp
- Click row: expand to see full signal detail and affected portfolio items

### Tab 2: Signals
- All classified signals from all sources
- Signal type badges (regulatory change / court ruling / industry development / news)
- Impact badges (which matters/clients are affected)
- Filter by date range, practice area, source

### Tab 3: Portfolio
- Client/matter view with signal correlation
- Each matter row: matter name, client, recent signals count, risk indicator
- Click matter: see all signals linked to it

### Tab 4: Sources
- Source list: name, URL, type (RSS/webpage), last polled, status (active/error)
- **"Add Source" button** → opens modal with:
  - Name input
  - URL input
  - Source Type select (RSS / webpage)
  - Poll Interval Minutes input
  - Practice Areas multi-select
  - Button: "Add Source"
- **"Poll Now" button** on each source row — triggers an immediate ingest run

## Testing Notes

To test Sentinel end-to-end:
1. Add a test RSS source (use a known-good legal news RSS feed URL)
2. Click "Poll Now" on that source
3. Wait ~30 seconds, check Signals tab for new entries
4. Verify signals have been classified and linked to portfolio if applicable

If no sources exist, the Signals tab will be empty. This is correct behavior, not a bug.

## API Endpoints
```
GET  /agents/legal-department/sentinel/sources  (list sources)
POST /agents/legal-department/sentinel/sources  (add source)
POST /agents/legal-department/sentinel/sources/:id/poll  (poll now)
GET  /agents/legal-department/sentinel/signals  (list signals)
GET  /agents/legal-department/sentinel/alerts  (list alerts)
```
