# Database Relationships Debug Guide

## Table Relationships

### 1. `agent_conversations` (Conversations)
- **Primary Key**: `id`
- **Fields**: `user_id`, `agent_name`, `agent_type`, `created_at`, `metadata`
- **Purpose**: Represents a conversation session with an agent

### 2. `tasks` (Tasks)
- **Primary Key**: `id`
- **Foreign Keys**: 
  - `agent_conversation_id` → `agent_conversations.id`
  - `user_id` → `users.id`
- **Fields**: `method`, `prompt`, `status`, `response`, `metadata`
- **Purpose**: Individual tasks executed within a conversation

### 3. `deliverables` (Deliverables)
- **Primary Key**: `id`
- **Foreign Keys**:
  - `conversation_id` → `agent_conversations.id` (nullable)
  - `task_id` → `tasks.id` (nullable)
  - `user_id` → `users.id`
- **Fields**: `title`, `type`, `agent_name`, `metadata`
- **Purpose**: Outputs/results from tasks or conversations

### 4. `deliverable_versions` (Versions)
- **Primary Key**: `id`
- **Foreign Keys**:
  - `deliverable_id` → `deliverables.id`
  - `task_id` → `tasks.id` (nullable)
- **Fields**: `version_number`, `format`, `content`, `is_current_version`, `metadata`
- **Purpose**: Version history for deliverables

## Relationship Flow

```
agent_conversations (1) ──→ (many) tasks
    │                          │
    │                          │
    └──→ (many) deliverables ←─┘
              │
              └──→ (many) deliverable_versions
```

## Simple vs Complex Conversations

### Simple Conversations (e.g., video/image generation)
- **Pattern**: Conversation → Task → Deliverable → Version
- **Characteristics**:
  - Usually one task per conversation
  - One deliverable per task
  - Straightforward relationship chain

### Complex Conversations (e.g., Marketing Swarm, CAD Agent)
- **Pattern**: Conversation → Many Tasks → Many Deliverables → Many Versions
- **Characteristics**:
  - Multiple tasks per conversation (swarm has many agents)
  - Multiple deliverables per conversation
  - Deliverables may reference specific tasks
  - Versions track changes over time

## Debug Endpoint Usage

Call `GET /api/deliverables/debug/all` to see:

1. **relationships**: Array of conversation objects with nested:
   - `conversation`: The conversation record
   - `tasks`: All tasks for this conversation
   - `deliverables`: All deliverables for this conversation (with nested versions)
   - `versions`: All versions for deliverables in this conversation

2. **summary**: Aggregated statistics:
   - Total counts for each table
   - Grouped by `user_id` (to spot mismatches)
   - Grouped by `agent_name` (to compare simple vs complex)

## Common Issues to Check

1. **User ID Mismatch**: 
   - Check if deliverables have different `user_id` than the querying user
   - Look at `summary.byUserId` to see all user IDs

2. **Missing Conversation Links**:
   - Check if deliverables have `conversation_id` set
   - Complex conversations should have `conversation_id` populated

3. **Task Relationships**:
   - Verify `task_id` in deliverables matches actual tasks
   - Check if versions reference correct tasks

4. **Agent Name Consistency**:
   - Verify `agent_name` in deliverables matches conversation `agent_name`
   - Check `summary.byAgent` for distribution
