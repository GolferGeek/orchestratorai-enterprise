# Orchestrator AI - Core Platform Schema

## Database: Supabase PostgreSQL (Core Platform)

**Schema:** public  
**Domain:** Core Platform Operations  
**Purpose:** User management, task orchestration, agent coordination, conversations

---

## Core Tables

### public.users

**Purpose:** User profile and application data

```sql
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(255),
  role VARCHAR(50),
  roles JSONB DEFAULT '["user"]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  namespace_access JSONB NOT NULL DEFAULT '["my-org"]'::jsonb,
  status TEXT DEFAULT 'active',
  organization_slug TEXT
);

-- Indexes
CREATE UNIQUE INDEX users_email_key ON users(email);
CREATE INDEX idx_users_email ON users(email);
```

### public.agent_conversations

**Purpose:** Agent conversation sessions and coordination

```sql
CREATE TABLE public.agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_name TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  ended_at TIMESTAMP WITH TIME ZONE,
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  primary_work_product_type TEXT,
  primary_work_product_id UUID
);
```

### public.tasks

**Purpose:** Task execution and agent coordination

```sql
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_conversation_id UUID,
  user_id UUID NOT NULL,
  method TEXT NOT NULL,
  prompt TEXT NOT NULL,
  params JSONB DEFAULT '{}',
  response TEXT,
  response_metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  progress_message TEXT,
  evaluation JSONB DEFAULT '{}',
  llm_metadata JSONB DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  error_data JSONB,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  timeout_seconds INTEGER DEFAULT 300,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  deliverable_type TEXT DEFAULT 'text',
  deliverable_metadata JSONB DEFAULT '{}'
);
```

-- NOTE: agents table does not exist in current database
-- Agent information is handled through configuration files

### public.projects

**Purpose:** Multi-step project coordination and management

```sql
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  name TEXT,
  description TEXT,
  plan_json JSONB,
  status TEXT DEFAULT 'planning',
  current_step_id TEXT,
  error_details JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  parent_project_id UUID,
  hierarchy_level INTEGER DEFAULT 0,
  subproject_count INTEGER DEFAULT 0
);
```

### public.deliverables

**Purpose:** Task deliverables and outputs

```sql
CREATE TABLE public.deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  task_id UUID,
  project_step_id UUID,
  metadata JSONB DEFAULT '{}',
  agent_name VARCHAR
);
```

### public.deliverable_versions

**Purpose:** Version control for deliverable content

```sql
CREATE TABLE public.deliverable_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deliverable_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  content TEXT,
  format VARCHAR,
  is_current_version BOOLEAN DEFAULT false,
  created_by_type VARCHAR DEFAULT 'ai_response',
  task_id UUID,
  metadata JSONB DEFAULT '{}',
  file_attachments JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### public.project_steps

**Purpose:** Individual steps within project execution

```sql
CREATE TABLE public.project_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  step_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  step_name TEXT NOT NULL,
  agent_name TEXT,
  prompt TEXT,
  dependencies TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  result JSONB,
  error_details JSONB,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
```

---

## Indexes and Performance

### Primary Indexes

- All tables have UUID primary keys with btree indexes
- Foreign key columns automatically indexed

### Additional Indexes

```sql
-- Conversations by user and recent activity
CREATE INDEX idx_conversations_user_recent ON public.conversations(user_id, last_message_at DESC);

-- Messages by conversation chronological
CREATE INDEX idx_messages_conversation_time ON public.messages(conversation_id, created_at);

-- Tasks by user and status
CREATE INDEX idx_tasks_user_status ON public.tasks(user_id, status, created_at DESC);

-- Active agents lookup
CREATE INDEX idx_agents_active ON public.agents(status) WHERE status = 'active';
```

---

## Common Query Patterns

### User's Recent Conversations

```sql
SELECT c.*, COUNT(m.id) as message_count
FROM conversations c
LEFT JOIN messages m ON c.id = m.conversation_id
WHERE c.user_id = $1 AND c.status = 'active'
GROUP BY c.id
ORDER BY c.last_message_at DESC
LIMIT 10;
```

### Active Tasks for User

```sql
SELECT t.*, c.title as conversation_title
FROM tasks t
LEFT JOIN conversations c ON t.conversation_id = c.id
WHERE t.user_id = $1 AND t.status IN ('pending', 'in_progress')
ORDER BY t.priority, t.created_at;
```

### Agent Activity Summary

```sql
SELECT agent_name, COUNT(*) as task_count,
       COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
FROM tasks
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY agent_name
ORDER BY task_count DESC;
```

### Project Progress

```sql
SELECT p.*,
       COUNT(t.id) as total_tasks,
       COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
       COUNT(d.id) as deliverable_count
FROM projects p
LEFT JOIN tasks t ON p.id = t.metadata->>'project_id'::UUID
LEFT JOIN deliverables d ON p.id = d.project_id
WHERE p.user_id = $1
GROUP BY p.id
ORDER BY p.created_at DESC;
```

---

## Data Relationships

### Core Relationships

- `users` → `conversations` (1:many)
- `conversations` → `messages` (1:many)
- `users` → `tasks` (1:many)
- `conversations` → `tasks` (1:many)
- `users` → `projects` (1:many)
- `projects` → `deliverables` (1:many)
- `tasks` → `deliverables` (1:many)

### Agent Coordination

- Tasks can be assigned to agents (via `agent_name`)
- Conversations track which agent is active
- Projects can specify orchestrator agents

---

## SQL Generation Guidelines

### Table Aliases

- `u` = users
- `c` = conversations
- `m` = messages
- `t` = tasks
- `a` = agents
- `p` = projects
- `d` = deliverables

### Performance Notes

- Always use LIMIT clauses for large result sets
- Use appropriate indexes for WHERE clauses
- JOIN conversations and messages carefully (can be large tables)
- Filter by user_id early in queries for multi-tenant security

### Common WHERE Patterns

- User isolation: `WHERE user_id = $1`
- Active records: `WHERE status = 'active'`
- Recent activity: `WHERE created_at >= NOW() - INTERVAL '7 days'`
- Agent filtering: `WHERE agent_name = $1` or `WHERE agent_type = $1`
