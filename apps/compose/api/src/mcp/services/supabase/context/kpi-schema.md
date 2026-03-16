# Orchestrator AI - KPI & Analytics Schema

## Database: Supabase PostgreSQL (KPI Domain)

**Schema:** public  
**Domain:** KPI & Analytics  
**Purpose:** Business metrics, performance tracking, company analytics

---

## Primary KPI Metrics — Detailed Definitions

Below is a curated set of primary KPIs with definitions, how to filter them in SQL, and typical aggregations. The data lives in `kpi_data` (values over time) joined to `kpi_metrics` (definitions). Join path for most analyses:

`companies → departments → kpi_data ↔ kpi_metrics`

General SQL filter pattern for a metric (use substring for resilience):

`WHERE km.name ILIKE '%Revenue%'  -- example for Revenue`

1. Revenue

- Definition: Total recognized revenue over a period.
- Filter: `km.name LIKE '%revenue%'`
- Aggregate: `SUM(kd.value)`
- Example:

```sql
SELECT d.name AS department, SUM(kd.value) AS total_revenue
FROM company.departments d
JOIN company.kpi_data kd ON d.id = kd.department_id
JOIN company.kpi_metrics km ON kd.metric_id = km.id
WHERE km.name ILIKE '%Revenue%'
  AND kd.date_recorded >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY d.id, d.name
ORDER BY total_revenue DESC;
```

2. Cost of Goods Sold (COGS)

- Definition: Direct costs attributable to goods/services sold.
- Filter: `km.name ILIKE '%cogs%' OR km.name ILIKE '%cost of goods%'`
- Aggregate: `SUM(kd.value)`

3. Gross Profit (Derived)

- Definition: Revenue − COGS.
- Approach: Compute revenue and COGS separately, then subtract.
- Example:

```sql
WITH r AS (
  SELECT d.id AS dept_id, SUM(kd.value) AS revenue
  FROM company.departments d
  JOIN company.kpi_data kd ON d.id = kd.department_id
  JOIN company.kpi_metrics km ON kd.metric_id = km.id
  WHERE km.name LIKE '%revenue%'
  GROUP BY d.id
), c AS (
  SELECT d.id AS dept_id, SUM(kd.value) AS cogs
  FROM company.departments d
  JOIN company.kpi_data kd ON d.id = kd.department_id
  JOIN company.kpi_metrics km ON kd.metric_id = km.id
  WHERE km.name ILIKE '%cogs%' OR km.name ILIKE '%cost of goods%'
  GROUP BY d.id
)
SELECT d.name AS department, (r.revenue - c.cogs) AS gross_profit
FROM company.departments d
LEFT JOIN r ON r.dept_id = d.id
LEFT JOIN c ON c.dept_id = d.id
ORDER BY gross_profit DESC;
```

4. Gross Margin % (Derived)

- Definition: (Gross Profit ÷ Revenue) × 100.
- Note: Guard against division by zero; compute after deriving Revenue and COGS.

5. Operating Expenses (OPEX)

- Definition: Operating expenses excluding COGS.
- Filter: `km.name ILIKE '%operating expense%' OR km.name ILIKE '%opex%'`
- Aggregate: `SUM(kd.value)`

6. Net Profit (Derived)

- Definition: Revenue − COGS − OPEX.
- Approach: Derive via separate aggregates and subtract.

7. CAC (Customer Acquisition Cost)

- Definition: Cost to acquire one customer; often computed as Marketing/Sales spend ÷ new customers.
- Filter: `km.name ILIKE '%cac%' OR km.name ILIKE '%acquisition cost%'`
- Aggregate: `AVG(kd.value)` or `SUM(kd.value)` per period depending on how recorded.

8. LTV (Customer Lifetime Value)

- Definition: Estimated total value from a customer over their lifetime.
- Filter: `km.name ILIKE '%ltv%' OR km.name ILIKE '%lifetime value%'`
- Aggregate: `AVG(kd.value)` or `SUM(kd.value)` across cohorts.

9. Churn Rate %

- Definition: Percentage of customers lost in a period.
- Filter: `km.name ILIKE '%churn%'`
- Aggregate: `AVG(kd.value)` (values typically stored as percentage points).

10. Retention Rate %

- Definition: Percentage of customers retained in a period.
- Filter: `km.name ILIKE '%retention%'`
- Aggregate: `AVG(kd.value)`.

11. NPS (Net Promoter Score)

- Definition: Customer loyalty index typically ranging −100 to +100.
- Filter: `km.name ILIKE '%nps%' OR km.name ILIKE '%net promoter%'`
- Aggregate: `AVG(kd.value)`.

12. Tasks Completed (Operational)

- Definition: Total tasks completed (operational throughput metric).
- Filter: `km.name ILIKE '%tasks completed%'`
- Aggregate: `SUM(kd.value)`

Notes

- Use `LIKE`/`ILIKE` for resilient name matching when metric naming varies; prefer the canonical patterns above.
- Always constrain date ranges (`kd.date_recorded`) and limit result size.
- For derived metrics, compute component aggregates first using CTEs.

---

## KPI Tables

### company.companies

**Purpose:** Company information and business details

```sql
CREATE TABLE company.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL, -- Company name (NOT company_name!)
  industry VARCHAR(255),
  founded_year INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### company.departments

**Purpose:** Organizational structure and department management

```sql
CREATE TABLE company.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  name VARCHAR(255) NOT NULL,
  head_of_department VARCHAR(255),
  budget NUMERIC,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);
```

### company.kpi_metrics

**Purpose:** Key performance indicator definitions and metadata

```sql
CREATE TABLE company.kpi_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  unit VARCHAR(255),
  metric_type VARCHAR(255),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);
```

### company.kpi_goals

**Purpose:** Target values and goals for each metric by department

```sql
CREATE TABLE company.kpi_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID,
  metric_id UUID,
  target_value NUMERIC,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);
```

### company.kpi_data

**Purpose:** Historical performance data and actual measurements

```sql
CREATE TABLE company.kpi_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID,
  metric_id UUID,
  value NUMERIC,
  date_recorded DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);
```

---

## Indexes and Performance

### Primary Indexes

- All tables have UUID primary keys
- Foreign keys automatically indexed

### Additional Indexes

```sql
-- KPI data by department and date (most common query)
CREATE INDEX idx_kpi_data_dept_date ON company.kpi_data(department_id, date_recorded DESC);

-- KPI data by metric and date (for metric analysis)
CREATE INDEX idx_kpi_data_metric_date ON company.kpi_data(metric_id, date_recorded DESC);

-- Company lookup by name
CREATE INDEX idx_companies_name ON company.companies(name);

-- Departments by company
CREATE INDEX idx_departments_company ON company.departments(company_id, name);

-- Active metrics
CREATE INDEX idx_kpi_metrics_active ON company.kpi_metrics(is_active, metric_type) WHERE is_active = true;

-- Current goals
CREATE INDEX idx_kpi_goals_current ON company.kpi_goals(department_id, metric_id, period_start, period_end);
```

---

## Canonical KPI Metrics Catalog (Use These Names)

The `kpi_metrics.name` column should use the following canonical names. When generating SQL for top-line amounts, interpret "sales" as the canonical metric "Revenue" and prefer case-insensitive substring matching with:

`km.name ILIKE '%Revenue%'`

Important:

- Do NOT use any `'%sales%'` filters; always map to revenue.
- Prefer `ILIKE '%Revenue%'` for resilience across naming variants and case.

| Name                      | metric_type | unit     | Description                                 | Notes                             |
| ------------------------- | ----------- | -------- | ------------------------------------------- | --------------------------------- |
| Revenue                   | financial   | currency | Total recognized revenue                    | Prefer this over any "sales" term |
| Cost of Goods Sold (COGS) | financial   | currency | Direct costs attributable to goods/services |                                   |
| Gross Profit              | financial   | currency | Revenue - COGS                              | Derived                           |
| Gross Margin %            | financial   | percent  | Gross Profit / Revenue                      | Derived                           |
| Operating Expenses        | financial   | currency | Operating expenses (OPEX)                   |                                   |
| Net Profit                | financial   | currency | Profit after all expenses                   |                                   |
| Net Margin %              | financial   | percent  | Net Profit / Revenue                        | Derived                           |
| ARR                       | financial   | currency | Annual Recurring Revenue                    | Subscription businesses           |
| MRR                       | financial   | currency | Monthly Recurring Revenue                   | Subscription businesses           |
| ARPU                      | financial   | currency | Average Revenue Per User                    | Subscription businesses           |
| CAC                       | customer    | currency | Customer Acquisition Cost                   |                                   |
| LTV                       | customer    | currency | Customer Lifetime Value                     |                                   |
| LTV/CAC Ratio             | customer    | ratio    | Health of acquisition efficiency            | Derived                           |
| Churn Rate %              | customer    | percent  | Percentage of customers lost                |                                   |
| Retention Rate %          | customer    | percent  | Percentage of customers retained            |                                   |
| NPS                       | customer    | index    | Net Promoter Score                          | -100 to +100                      |
| CSAT %                    | customer    | percent  | Customer Satisfaction Score                 |                                   |
| DAU                       | product     | count    | Daily Active Users                          |                                   |
| WAU                       | product     | count    | Weekly Active Users                         |                                   |
| MAU                       | product     | count    | Monthly Active Users                        |                                   |
| Feature Adoption %        | product     | percent  | Users adopting a feature                    |                                   |
| Tasks Completed           | operational | count    | Number of tasks completed                   |                                   |
| On-Time Delivery %        | operational | percent  | Deliveries completed on time                |                                   |
| Avg Resolution Minutes    | operational | minutes  | Average resolution time                     |                                   |
| Bug Count                 | operational | count    | Number of defects reported                  |                                   |
| SLA Breach Count          | operational | count    | Number of SLA breaches                      |                                   |

Quick check of available metrics:

```sql
SELECT name, metric_type, unit, description
FROM company.kpi_metrics
ORDER BY metric_type, name;
```

---

## Common Query Patterns

### Revenue by Company (Total)

```sql
SELECT c.name as company,
       SUM(kd.value) as total_revenue
FROM company.companies c
JOIN company.departments d ON c.id = d.company_id
JOIN company.kpi_data kd ON d.id = kd.department_id
JOIN company.kpi_metrics km ON kd.metric_id = km.id
WHERE km.name = 'Revenue'
  AND kd.date_recorded >= CURRENT_DATE - INTERVAL '1 year'
GROUP BY c.id, c.name
ORDER BY total_revenue DESC
LIMIT 10;
```

### Department Performance vs Goals

```sql
SELECT d.name as department,
       km.name as metric,
       kg.target_value,
       AVG(kd.value) as average_actual,
       CASE
         WHEN AVG(kd.value) >= kg.target_value THEN 'Meeting Goal'
         ELSE 'Below Goal'
       END as performance_status
FROM company.departments d
JOIN company.kpi_goals kg ON d.id = kg.department_id
JOIN company.kpi_metrics km ON kg.metric_id = km.id
JOIN company.kpi_data kd ON d.id = kd.department_id AND km.id = kd.metric_id
WHERE kg.period_start <= CURRENT_DATE
  AND kg.period_end >= CURRENT_DATE
  AND kd.date_recorded >= kg.period_start
  AND kd.date_recorded <= kg.period_end
GROUP BY d.id, d.name, km.name, kg.target_value
ORDER BY d.name, km.name;
```

### Monthly Revenue Trends

```sql
SELECT DATE_TRUNC('month', kd.date_recorded) as month,
       SUM(kd.value) as monthly_revenue
FROM company.kpi_data kd
JOIN company.kpi_metrics km ON kd.metric_id = km.id
WHERE km.name = 'Revenue'
  AND kd.date_recorded >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', kd.date_recorded)
ORDER BY month;
```

### Top Performing Departments

```sql
SELECT d.name as department,
       c.name as company,
       COUNT(DISTINCT kd.metric_id) as metrics_tracked,
       AVG(kd.value) as average_performance
FROM company.departments d
JOIN company.companies c ON d.company_id = c.id
JOIN company.kpi_data kd ON d.id = kd.department_id
WHERE kd.date_recorded >= CURRENT_DATE - INTERVAL '3 months'
GROUP BY d.id, d.name, c.name
HAVING COUNT(DISTINCT kd.metric_id) >= 3
ORDER BY average_performance DESC
LIMIT 5;
```

### Metric Definitions by Category

```sql
SELECT metric_type,
       COUNT(*) as metric_count,
       STRING_AGG(name, ', ') as metrics
FROM company.kpi_metrics
WHERE is_active = true
GROUP BY metric_type
ORDER BY metric_count DESC;
```

---

## Data Relationships

### Core Relationships

- `companies` → `departments` (1:many)
- `departments` → `kpi_goals` (1:many)
- `departments` → `kpi_data` (1:many)
- `kpi_metrics` → `kpi_goals` (1:many)
- `kpi_metrics` → `kpi_data` (1:many)

### Key Join Patterns

- Company → Department → KPI Data (for company-level metrics)
- Metric → Goals + Data (for performance vs target analysis)
- Department → Goals + Data + Metrics (for department dashboards)

---

## Critical Schema Notes

### ⚠️ IMPORTANT: Column Names

- Companies table uses `name` column, **NOT** `company_name`
- Always reference `companies.name` in queries
- Revenue data is in `kpi_data` table, not directly in companies
- **Companies table does NOT have a status column**
- **Many optional columns in context examples don't exist in actual database**

### Metric Name Standards

Common metric names in the database include those listed in the Canonical KPI Metrics Catalog above.

Naming standards:

- Use exact canonical names in filters (e.g., `km.name = 'Revenue'`).
- Do NOT use "Sales" as a metric; map such requests to "Revenue".

### Date Handling

- `kpi_data.date_recorded` is DATE type (no time)
- Use `>=` and `<=` for date range queries
- `created_at`/`updated_at` are TIMESTAMP WITH TIME ZONE

---

## SQL Generation Guidelines

### Table Aliases

- `c` = companies
- `d` = departments
- `km` = kpi_metrics
- `kg` = kpi_goals
- `kd` = kpi_data

### Performance Notes

- Always use LIMIT clauses to prevent large result sets
- Filter by date ranges early in WHERE clauses
- Use appropriate GROUP BY for aggregations
- Join companies → departments → kpi_data for company-level metrics

### Common WHERE Patterns

- Recent data: `WHERE date_recorded >= CURRENT_DATE - INTERVAL '6 months'`
- Revenue queries: `WHERE km.name = 'Revenue'`
- Financial metrics: `WHERE km.metric_type = 'financial'`
- USD values: `WHERE km.unit = 'USD'`
- **Note: No status columns exist in any KPI tables**

### Aggregation Patterns

- Total revenue: `SUM(kd.value)`
- Average performance: `AVG(kd.value)`
- Monthly grouping: `DATE_TRUNC('month', kd.date_recorded)`
- Performance vs goals: `AVG(kd.value) >= kg.target_value`
