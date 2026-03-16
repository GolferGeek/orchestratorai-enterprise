# SQL Query Patterns & Examples

## Overview

Common SQL patterns, optimizations, and examples for the Orchestrator AI database schema.

---

## Core Platform Patterns

### User Management Queries

#### Active User Summary

```sql
SELECT u.id, u.email, u.full_name,
       u.last_login,
       COUNT(DISTINCT c.id) as conversation_count,
       COUNT(DISTINCT t.id) as task_count,
       MAX(c.last_message_at) as last_activity
FROM users u
LEFT JOIN conversations c ON u.id = c.user_id AND c.status = 'active'
LEFT JOIN tasks t ON u.id = t.user_id AND t.status IN ('pending', 'in_progress')
WHERE u.is_active = true
GROUP BY u.id, u.email, u.full_name, u.last_login
ORDER BY last_activity DESC NULLS LAST
LIMIT 50;
```

#### User Activity Heatmap

```sql
SELECT DATE_TRUNC('day', m.created_at) as activity_date,
       COUNT(*) as message_count,
       COUNT(DISTINCT m.conversation_id) as active_conversations,
       COUNT(DISTINCT m.user_id) as active_users
FROM messages m
WHERE m.created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND m.role = 'user'
GROUP BY DATE_TRUNC('day', m.created_at)
ORDER BY activity_date;
```

### Conversation Analysis

#### Long-Running Conversations

```sql
SELECT c.id, c.title, c.agent_name,
       u.email as user_email,
       COUNT(m.id) as message_count,
       EXTRACT(EPOCH FROM (c.last_message_at - c.created_at))/3600 as duration_hours,
       c.created_at, c.last_message_at
FROM conversations c
JOIN users u ON c.user_id = u.id
JOIN messages m ON c.id = m.conversation_id
WHERE c.status = 'active'
  AND c.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY c.id, c.title, c.agent_name, u.email, c.created_at, c.last_message_at
HAVING COUNT(m.id) > 10 OR EXTRACT(EPOCH FROM (c.last_message_at - c.created_at))/3600 > 24
ORDER BY duration_hours DESC;
```

#### Agent Conversation Distribution

```sql
SELECT c.agent_name, c.agent_type,
       COUNT(*) as total_conversations,
       COUNT(CASE WHEN c.status = 'active' THEN 1 END) as active_conversations,
       AVG(message_counts.msg_count) as avg_messages_per_conversation,
       MAX(c.last_message_at) as most_recent_activity
FROM conversations c
LEFT JOIN (
  SELECT conversation_id, COUNT(*) as msg_count
  FROM messages
  GROUP BY conversation_id
) message_counts ON c.id = message_counts.conversation_id
WHERE c.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY c.agent_name, c.agent_type
ORDER BY total_conversations DESC;
```

### Task Management Patterns

#### Task Queue by Priority

```sql
SELECT t.id, t.title, t.priority, t.status,
       t.agent_name, t.agent_type,
       u.email as assigned_user,
       EXTRACT(EPOCH FROM (NOW() - t.created_at))/3600 as age_hours,
       c.title as conversation_context
FROM tasks t
JOIN users u ON t.user_id = u.id
LEFT JOIN conversations c ON t.conversation_id = c.id
WHERE t.status IN ('pending', 'in_progress')
ORDER BY
  CASE t.priority
    WHEN 'high' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 3
  END,
  t.created_at
LIMIT 20;
```

#### Agent Performance Metrics

```sql
SELECT t.agent_name,
       COUNT(*) as total_tasks,
       COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
       COUNT(CASE WHEN t.status = 'failed' THEN 1 END) as failed_tasks,
       ROUND(
         COUNT(CASE WHEN t.status = 'completed' THEN 1 END)::NUMERIC /
         COUNT(*)::NUMERIC * 100, 2
       ) as success_rate_pct,
       AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at))/60) as avg_completion_minutes,
       COUNT(DISTINCT t.user_id) as unique_users_served
FROM tasks t
WHERE t.created_at >= CURRENT_DATE - INTERVAL '7 days'
  AND t.agent_name IS NOT NULL
GROUP BY t.agent_name
HAVING COUNT(*) >= 5
ORDER BY success_rate_pct DESC, avg_completion_minutes ASC;
```

---

## KPI & Analytics Patterns

### Revenue Analysis

Note on metric selection:

- Map any "sales" phrasing to the canonical metric "Revenue".
- Prefer `km.name ILIKE '%Revenue%'` (not any `'%sales%'` filter).

#### Company Revenue Rankings

```sql
SELECT c.name as company,
       c.industry,
       SUM(kd.value) as total_revenue,
       COUNT(DISTINCT d.id) as department_count,
       COUNT(kd.id) as data_points,
       MIN(kd.date_recorded) as earliest_data,
       MAX(kd.date_recorded) as latest_data,
       RANK() OVER (ORDER BY SUM(kd.value) DESC) as revenue_rank
FROM company.companies c
JOIN company.departments d ON c.id = d.company_id
JOIN company.kpi_data kd ON d.id = kd.department_id
JOIN company.kpi_metrics km ON kd.metric_id = km.id
WHERE km.name = 'Revenue'
  AND kd.date_recorded >= CURRENT_DATE - INTERVAL '1 year'
GROUP BY c.id, c.name, c.industry
ORDER BY total_revenue DESC
LIMIT 10;
```

#### Monthly Revenue Trends with Growth

```sql
SELECT c.name as company,
       DATE_TRUNC('month', kd.date_recorded) as month,
       SUM(kd.value) as monthly_revenue,
       LAG(SUM(kd.value)) OVER (
         PARTITION BY c.id
         ORDER BY DATE_TRUNC('month', kd.date_recorded)
       ) as previous_month,
       CASE
         WHEN LAG(SUM(kd.value)) OVER (
           PARTITION BY c.id
           ORDER BY DATE_TRUNC('month', kd.date_recorded)
         ) > 0 THEN
           ROUND(
             ((SUM(kd.value) / LAG(SUM(kd.value)) OVER (
               PARTITION BY c.id
               ORDER BY DATE_TRUNC('month', kd.date_recorded)
             )) - 1) * 100, 2
           )
         ELSE NULL
       END as month_over_month_growth_pct
FROM company.companies c
JOIN company.departments d ON c.id = d.company_id
JOIN company.kpi_data kd ON d.id = kd.department_id
JOIN company.kpi_metrics km ON kd.metric_id = km.id
WHERE km.name = 'Revenue'
  AND kd.date_recorded >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY c.id, c.name, DATE_TRUNC('month', kd.date_recorded)
ORDER BY c.name, month;
```

### Performance vs Goals Analysis

#### Department Goal Achievement

```sql
SELECT c.name as company,
       d.name as department,
       km.name as metric,
       km.unit,
       kg.target_value as goal,
       ROUND(AVG(kd.value), 2) as actual_avg,
       ROUND((AVG(kd.value) / kg.target_value * 100), 1) as achievement_pct,
       CASE
         WHEN AVG(kd.value) >= kg.target_value * 1.1 THEN '🏆 Exceeding (+10%)'
         WHEN AVG(kd.value) >= kg.target_value THEN '✅ Meeting Goal'
         WHEN AVG(kd.value) >= kg.target_value * 0.9 THEN '⚠️ Near Target (-10%)'
         ELSE '❌ Below Target'
       END as performance_status,
       COUNT(kd.id) as data_points
FROM company.companies c
JOIN company.departments d ON c.id = d.company_id
JOIN company.kpi_goals kg ON d.id = kg.department_id
JOIN company.kpi_metrics km ON kg.metric_id = km.id
JOIN company.kpi_data kd ON d.id = kd.department_id AND km.id = kd.metric_id
WHERE kg.period_start <= CURRENT_DATE
  AND kg.period_end >= CURRENT_DATE
  AND kd.date_recorded BETWEEN kg.period_start AND kg.period_end
GROUP BY c.id, c.name, d.id, d.name, km.id, km.name, km.unit, kg.target_value
ORDER BY achievement_pct DESC;
```

#### Top/Bottom Performers by Metric

```sql
WITH metric_performance AS (
  SELECT d.name as department,
         c.name as company,
         km.name as metric,
         AVG(kd.value) as avg_value,
         RANK() OVER (PARTITION BY km.id ORDER BY AVG(kd.value) DESC) as rank_desc,
         RANK() OVER (PARTITION BY km.id ORDER BY AVG(kd.value) ASC) as rank_asc
  FROM company.departments d
  JOIN companies c ON d.company_id = c.id
  JOIN company.kpi_data kd ON d.id = kd.department_id
  JOIN company.kpi_metrics km ON kd.metric_id = km.id
  WHERE kd.date_recorded >= CURRENT_DATE - INTERVAL '3 months'
    AND km.is_active = true
  GROUP BY d.id, d.name, c.name, km.id, km.name
)
SELECT department, company, metric,
       ROUND(avg_value, 2) as average_value,
       CASE
         WHEN rank_desc <= 3 THEN 'Top Performer'
         WHEN rank_asc <= 3 THEN 'Needs Improvement'
       END as performance_category
FROM metric_performance
WHERE rank_desc <= 3 OR rank_asc <= 3
ORDER BY metric, rank_desc;
```

### Departmental Analysis

#### Department Budget vs Performance

```sql
SELECT c.name as company,
       d.name as department,
       d.budget as department_budget,
       d.employee_count,
       COUNT(DISTINCT km.id) as metrics_tracked,
       AVG(
         CASE WHEN km.metric_type = 'financial'
         THEN kd.value
         END
       ) as avg_financial_performance,
       SUM(
         CASE WHEN km.name = 'Revenue'
         THEN kd.value
         ELSE 0
         END
       ) as total_revenue,
       CASE
         WHEN d.budget > 0 THEN
           ROUND((SUM(CASE WHEN km.name = 'Revenue' THEN kd.value ELSE 0 END) / d.budget), 2)
         ELSE NULL
       END as revenue_to_budget_ratio
FROM company.companies c
JOIN company.departments d ON c.id = d.company_id
LEFT JOIN company.kpi_data kd ON d.id = kd.department_id
LEFT JOIN company.kpi_metrics km ON kd.metric_id = km.id
WHERE kd.date_recorded >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY c.id, c.name, d.id, d.name, d.budget, d.employee_count
HAVING COUNT(DISTINCT km.id) > 0
ORDER BY revenue_to_budget_ratio DESC NULLS LAST;
```

---

## Advanced Query Patterns

### Time-Series Analysis

#### Rolling Averages

```sql
SELECT c.name as company,
       kd.date_recorded,
       kd.value as daily_revenue,
       AVG(kd.value) OVER (
         PARTITION BY c.id
         ORDER BY kd.date_recorded
         ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
       ) as seven_day_avg,
       AVG(kd.value) OVER (
         PARTITION BY c.id
         ORDER BY kd.date_recorded
         ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
       ) as thirty_day_avg
FROM company.companies c
JOIN company.departments d ON c.id = d.company_id
JOIN company.kpi_data kd ON d.id = kd.department_id
JOIN company.kpi_metrics km ON kd.metric_id = km.id
WHERE km.name = 'Revenue'
  AND kd.date_recorded >= CURRENT_DATE - INTERVAL '3 months'
  AND c.name = 'TechCorp' -- Filter to specific company
ORDER BY c.name, kd.date_recorded;
```

#### Seasonal Patterns

```sql
SELECT EXTRACT(QUARTER FROM kd.date_recorded) as quarter,
       AVG(kd.value) as avg_quarterly_revenue,
       STDDEV(kd.value) as revenue_stddev,
       COUNT(*) as data_points,
       MIN(kd.value) as min_revenue,
       MAX(kd.value) as max_revenue
FROM company.kpi_data kd
JOIN company.kpi_metrics km ON kd.metric_id = km.id
WHERE km.name = 'Revenue'
  AND kd.date_recorded >= CURRENT_DATE - INTERVAL '2 years'
GROUP BY EXTRACT(QUARTER FROM kd.date_recorded)
ORDER BY quarter;
```

### Cross-Domain Analytics

#### User Engagement with KPI Requests

```sql
SELECT u.email,
       COUNT(DISTINCT c.id) as kpi_conversations,
       COUNT(DISTINCT
         CASE WHEN t.agent_name LIKE '%metrics%' THEN t.id END
       ) as metrics_tasks,
       MAX(c.last_message_at) as last_kpi_request,
       ARRAY_AGG(DISTINCT c.agent_name) as agents_used,
       AVG(
         EXTRACT(EPOCH FROM (c.last_message_at - c.created_at))/60
       ) as avg_session_minutes
FROM users u
JOIN conversations c ON u.id = c.user_id
LEFT JOIN tasks t ON c.id = t.conversation_id
WHERE c.agent_type LIKE '%analytics%'
   OR c.agent_type LIKE '%metrics%'
   OR t.agent_name LIKE '%metrics%'
GROUP BY u.id, u.email
HAVING COUNT(DISTINCT c.id) >= 1
ORDER BY kpi_conversations DESC, last_kpi_request DESC;
```

---

## Query Optimization Guidelines

### Performance Best Practices

1. **Filter Early and Often**

```sql
-- ✅ GOOD: Filter before joining
WHERE kd.date_recorded >= CURRENT_DATE - INTERVAL '1 year'
  AND km.is_active = true
```

2. **Use Appropriate Limits**

```sql
-- ✅ GOOD: Always limit large result sets
ORDER BY total_revenue DESC
LIMIT 10;
```

3. **Leverage Indexes**

```sql
-- ✅ GOOD: Use indexed columns in WHERE clauses
WHERE c.status = 'active'
  AND kd.date_recorded >= CURRENT_DATE - INTERVAL '6 months'
```

4. **Aggregate Efficiently**

```sql
-- ✅ GOOD: GROUP BY primary keys when possible
GROUP BY c.id, c.name  -- Instead of just c.name
```

### Common Query Anti-Patterns

```sql
-- ❌ BAD: No date filtering on large tables
SELECT * FROM company.kpi_data;

-- ❌ BAD: SELECT * with joins
SELECT * FROM company.companies c JOIN company.departments d ON c.id = d.company_id;

-- ❌ BAD: No LIMIT on potentially large results
SELECT c.name, SUM(kd.value) FROM company.companies c
JOIN company.departments d ON c.id = d.company_id
JOIN company.kpi_data kd ON d.id = kd.department_id;

-- ❌ BAD: Inefficient subqueries
SELECT * FROM company.companies WHERE id IN (
  SELECT company_id FROM company.departments WHERE budget > 100000
);
```

### Recommended Alternatives

```sql
-- ✅ GOOD: Proper date filtering
SELECT * FROM company.kpi_data WHERE date_recorded >= CURRENT_DATE - INTERVAL '1 month';

-- ✅ GOOD: Specific column selection
SELECT c.name, d.name, d.budget FROM company.companies c
JOIN company.departments d ON c.id = d.company_id;

-- ✅ GOOD: Limited results with ordering
SELECT c.name, SUM(kd.value) as total_revenue FROM company.companies c
JOIN company.departments d ON c.id = d.company_id
JOIN company.kpi_data kd ON d.id = kd.department_id
WHERE kd.date_recorded >= CURRENT_DATE - INTERVAL '1 year'
GROUP BY c.id, c.name
ORDER BY total_revenue DESC
LIMIT 10;

-- ✅ GOOD: Efficient joins instead of subqueries
SELECT DISTINCT c.* FROM company.companies c
JOIN company.departments d ON c.id = d.company_id
WHERE d.budget > 100000;
```
