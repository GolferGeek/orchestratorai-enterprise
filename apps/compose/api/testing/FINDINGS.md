# Blog Post Agent Testing Findings

## Problem Summary
Frontend was getting 404 errors when trying to call the blog post agent.

## Root Causes Identified

### 1. Agent Type Mismatch in Database
- **Database had**: `blog_post_writer` with `type: 'function'`
- **Should be**: `blog_post_writer` with `type: 'context'`
- **Fixed**: Updated database, agent registry now shows correct type

### 2. Two Different Blog Post Agents

#### Demo Context Agent (File-based)
- **Name**: `blog_post`
- **Type**: `marketing`
- **Namespace**: `demo`
- **Service Class**: `BlogPostService` (extends ContextAgentBaseService)
- **Location**: `apps/api/src/agents/demo/marketing/blog_post/`
- **URL Pattern**: `/agents/marketing/blog_post/tasks`
- **Auth**: JWT (Bearer token)
- **Status**: ✅ **WORKING**

#### Database Context Agent (User-created)
- **Name**: `blog_post_writer`
- **Type**: `context` (was incorrectly `function`)
- **Namespace**: `my-org`
- **Service Class**: None (database-defined)
- **Location**: Supabase `agents` table
- **URL Pattern**: Should be `/agents/my-org/blog_post_writer/tasks` but routing not implemented
- **Auth**: JWT (Bearer token)
- **Status**: ❌ **NOT WORKING** - backend doesn't route org-namespaced context agents

## Backend Routing Architecture

### DynamicAgentsController (`/agents/:agentType/:agentName/tasks`)
- Handles file-system discovered agents
- Uses JWT authentication
- Looks up agents by type + name
- **Works for**: Demo agents like `blog_post`

### Agent2AgentController (`/agents/:orgSlug/:agentSlug/tasks`)
- Handles A2A protocol agents
- Uses API Key authentication
- Looks up agents in registry by org + slug
- **Works for**: External agents, not database context agents with JWT

### Missing Pattern
- Database context agents with org namespace (`my-org/blog_post_writer`)
- Need JWT auth (not API key)
- Current architecture doesn't support this combination

## Solutions

### Option 1: Use Demo Agent (Recommended for Now)
```
URL: /agents/marketing/blog_post/tasks
Auth: Bearer token
Name: blog_post (not blog_post_writer)
Type: marketing (not context)
```

### Option 2: Fix Backend Routing (Architecture Change)
- Extend DynamicAgentsController to handle org-namespaced context agents
- OR create new controller specifically for database context agents with JWT
- Requires backend architecture changes

### Option 3: Use API Key Auth for Database Agents
- Keep current routing
- Generate API keys for database agents
- Frontend uses API key instead of JWT
- Breaks user-level permission model

## Test Results

### ✅ Working: Demo Context Agent
```bash
POST /agents/marketing/blog_post/tasks
Authorization: Bearer <jwt_token>
Status: 200 OK
Response: Full blog post generated successfully
```

### ❌ Not Working: Database Context Agent
```bash
POST /agents/my-org/blog_post_writer/tasks  
Authorization: Bearer <jwt_token>
Status: 404 Not Found
Error: "Agent not found"
```

## Recommendations

1. **Short-term**: Use demo `blog_post` agent (`/agents/marketing/blog_post/tasks`)
2. **Medium-term**: Implement proper routing for org-namespaced context agents
3. **Long-term**: Unify agent registration and routing patterns

## Frontend Changes Made

Updated `apps/web/src/services/tasksService.ts` to:
- Add comprehensive logging of agent routing decisions
- Attempt org-based routing for `context` type agents with namespaces
- Fall back to type-based routing for file-system agents

## Files Modified

- `apps/web/src/services/tasksService.ts` - Enhanced routing logic and logging
- `apps/api/testing/fix-blog-post-writer-type.js` - Script to fix database agent type
- Various test scripts to validate different routing patterns

