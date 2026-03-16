# Database Relationships & Join Patterns

## Overview

This document defines the relationships between tables across both Core Platform and KPI domains, along with common join patterns for complex queries.

---

## Core Domain Relationships

### User-Centric Relationships

```
users (1) ←→ (many) conversations
users (1) ←→ (many) tasks
users (1) ←→ (many) projects
```

### Conversation Flow

```
conversations (1) ←→ (many) messages
conversations (1) ←→ (many) tasks
```

### Project Structure

```
projects (1) ←→ (many) deliverables
tasks (1) ←→ (many) deliverables
```

---

## KPI Domain Relationships

### Company Hierarchy

```
companies (1) ←→ (many) departments
```

### Metrics & Goals Structure

```
departments (1) ←→ (many) kpi_goals
departments (1) ←→ (many) kpi_data
kpi_metrics (1) ←→ (many) kpi_goals
kpi_metrics (1) ←→ (many) kpi_data
```

### Complete KPI Flow

```
companies → departments → kpi_goals ← kpi_metrics
                      ↓              ↙
                   kpi_data ←-------
```

---

## Cross-Domain Relationships

### Task-Project Integration

Tasks can reference projects via metadata:

```json
{
  "project_id": "uuid",
  "project_phase": "analysis",
  "orchestrator": "marketing_manager"
}
```

### Agent-Task Coordination

```sql
-- Tasks assigned to specific agents
SELECT * FROM tasks WHERE agent_name = 'metrics_agent';

-- Agent performance tracking
SELECT agent_name, COUNT(*) as tasks_completed
FROM tasks
WHERE status = 'completed'
GROUP BY agent_name;
```

---

## Common Join Patterns

### 1. User Dashboard Queries

```sql
-- User's active conversations with recent messages
SELECT c.id, c.title, c.agent_name,
       m.content as last_message,
       m.created_at as last_message_time
FROM conversations c
JOIN users u ON c.user_id = u.id
LEFT JOIN LATERAL (
  SELECT content, created_at
  FROM messages
  WHERE conversation_id = c.id
  ORDER BY created_at DESC
  LIMIT 1
) m ON true
WHERE u.id = $1 AND c.status = 'active'
ORDER BY m.created_at DESC NULLS LAST;
```

### 2. Company Revenue Analysis

```sql
-- Complete company revenue breakdown
SELECT c.name as company,
       c.industry,
       d.name as department,
       km.name as metric,
       SUM(kd.value) as total_value,
       COUNT(kd.id) as data_points,
       MIN(kd.date_recorded) as earliest_date,
       MAX(kd.date_recorded) as latest_date
FROM company.companies c
JOIN company.departments d ON c.id = d.company_id
JOIN company.kpi_data kd ON d.id = kd.department_id
JOIN company.kpi_metrics km ON kd.metric_id = km.id
WHERE km.metric_type = 'financial'
  AND kd.date_recorded >= CURRENT_DATE - INTERVAL '1 year'
GROUP BY c.id, c.name, c.industry, d.id, d.name, km.id, km.name
ORDER BY c.name, total_value DESC;
```

### 3. Performance vs Goals Analysis

```sql
-- Department performance against targets
SELECT c.name as company,
       d.name as department,
       km.name as metric,
       kg.target_value,
       AVG(kd.value) as actual_avg,
       (AVG(kd.value) / kg.target_value * 100) as performance_percentage,
       CASE
         WHEN AVG(kd.value) >= kg.target_value THEN 'Exceeding'
         WHEN AVG(kd.value) >= kg.target_value * 0.9 THEN 'Near Target'
         ELSE 'Below Target'
       END as status
FROM company.companies c
JOIN company.departments d ON c.id = d.company_id
JOIN company.kpi_goals kg ON d.id = kg.department_id
JOIN company.kpi_metrics km ON kg.metric_id = km.id
JOIN company.kpi_data kd ON d.id = kd.department_id AND km.id = kd.metric_id
WHERE kg.period_start <= CURRENT_DATE
  AND kg.period_end >= CURRENT_DATE
  AND kd.date_recorded BETWEEN kg.period_start AND kg.period_end
GROUP BY c.id, c.name, d.id, d.name, km.id, km.name, kg.target_value
ORDER BY performance_percentage DESC;
```

### 4. Agent Activity & Task Correlation

```sql
-- Agent performance with task outcomes
SELECT t.agent_name,
       t.agent_type,
       COUNT(*) as total_tasks,
       COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
       COUNT(CASE WHEN t.status = 'failed' THEN 1 END) as failed_tasks,
       AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at))/60) as avg_completion_minutes,
       COUNT(DISTINCT t.user_id) as unique_users_served
FROM tasks t
WHERE t.created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND t.agent_name IS NOT NULL
GROUP BY t.agent_name, t.agent_type
ORDER BY completed_tasks DESC;
```

### 5. Project Deliverable Summary

```sql
-- Complete project status with deliverables
SELECT p.name as project,
       p.status as project_status,
       p.progress_percentage,
       COUNT(DISTINCT t.id) as total_tasks,
       COUNT(DISTINCT d.id) as deliverable_count,
       COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
       COUNT(CASE WHEN d.status = 'final' THEN 1 END) as final_deliverables,
       ARRAY_AGG(DISTINCT d.deliverable_type) as deliverable_types
FROM projects p
LEFT JOIN tasks t ON p.id::text = t.metadata->>'project_id'
LEFT JOIN deliverables d ON p.id = d.project_id
WHERE p.user_id = $1
GROUP BY p.id, p.name, p.status, p.progress_percentage
ORDER BY p.created_at DESC;
```

---

## Advanced Join Patterns

### Temporal Analysis with Window Functions

```sql
-- Revenue trends with period-over-period comparison
SELECT c.name as company,
       DATE_TRUNC('month', kd.date_recorded) as month,
       SUM(kd.value) as monthly_revenue,
       LAG(SUM(kd.value), 1) OVER (
         PARTITION BY c.id
         ORDER BY DATE_TRUNC('month', kd.date_recorded)
       ) as previous_month_revenue,
       CASE
         WHEN LAG(SUM(kd.value), 1) OVER (
           PARTITION BY c.id
           ORDER BY DATE_TRUNC('month', kd.date_recorded)
         ) > 0 THEN
           ((SUM(kd.value) / LAG(SUM(kd.value), 1) OVER (
             PARTITION BY c.id
             ORDER BY DATE_TRUNC('month', kd.date_recorded)
           )) - 1) * 100
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

### Cross-Domain Analysis: User-Agent-KPI

```sql
-- Users who frequently request KPI analysis
SELECT u.email,
       u.full_name,
       COUNT(DISTINCT c.id) as kpi_conversations,
       COUNT(DISTINCT t.id) as kpi_tasks,
       ARRAY_AGG(DISTINCT t.agent_name) as agents_used,
       MAX(c.last_message_at) as last_kpi_request
FROM users u
JOIN conversations c ON u.id = c.user_id
JOIN tasks t ON c.id = t.conversation_id
WHERE (c.agent_type LIKE '%metrics%' OR c.agent_type LIKE '%analytics%')
   OR (t.agent_name LIKE '%metrics%' OR t.agent_name LIKE '%analytics%')
GROUP BY u.id, u.email, u.full_name
HAVING COUNT(DISTINCT c.id) >= 2
ORDER BY kpi_conversations DESC;
```

---

## Join Performance Guidelines

### Optimization Tips

1. **Always filter early**: Use WHERE clauses before JOINs when possible
2. **Use appropriate indexes**: Ensure foreign key columns are indexed
3. **Limit result sets**: Always use LIMIT unless you need all results
4. **Join order matters**: Start with most selective table

### Common Anti-Patterns to Avoid

```sql
-- ❌ BAD: Cross join without proper WHERE
SELECT * FROM company.companies, departments, kpi_data;

-- ❌ BAD: No date filtering on large kpi_data table
SELECT * FROM company.kpi_data kd JOIN company.kpi_metrics km ON kd.metric_id = km.id;

-- ❌ BAD: Missing LIMIT on potentially large result
SELECT c.*, d.*, kd.* FROM company.companies c
JOIN company.departments d ON c.id = d.company_id
JOIN company.kpi_data kd ON d.id = kd.department_id;
```

### Recommended Patterns

```sql
-- ✅ GOOD: Filter first, then join
SELECT c.name, SUM(kd.value) as revenue
FROM company.companies c
JOIN company.departments d ON c.id = d.company_id
JOIN company.kpi_data kd ON d.id = kd.department_id
JOIN company.kpi_metrics km ON kd.metric_id = km.id
WHERE km.name = 'Revenue'
  AND kd.date_recorded >= CURRENT_DATE - INTERVAL '1 year'
GROUP BY c.id, c.name
ORDER BY revenue DESC
LIMIT 10;
```

---

## Schema Evolution Considerations

### Foreign Key Constraints

All relationships use UUID foreign keys with CASCADE deletes where appropriate:

- Deleting a user cascades to conversations, tasks, projects
- Deleting a company cascades to departments
- Deleting a department cascades to kpi_goals and kpi_data

### Indexing Strategy

Foreign key columns are automatically indexed, plus additional indexes for:

- Temporal queries (date_recorded, created_at)
- Status filtering (status, is_active)
- User isolation (user_id)
- Agent coordination (agent_name, agent_type)
