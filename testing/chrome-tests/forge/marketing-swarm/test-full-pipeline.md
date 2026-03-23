# Marketing Swarm — Full Pipeline Test

## Prerequisites

- Auth API running on port 6100
- Forge API running on port 6200
- Forge Web running on port 6201
- Supabase running (REST 54321, Postgres 54322)
- LLM provider configured (Anthropic API key in .env.secrets)
- Test user: golfergeek@orchestratorai.io / GolferGeek123!

## Test: Execute a complete Marketing Swarm with 1 writer, 1 editor, 1 evaluator

### Step 1: Navigate and authenticate
1. Navigate to http://localhost:6201
2. If login page shown, authenticate with test credentials
3. Verify: Forge shell loads with 5 sidebar items

### Step 2: Open Marketing Swarm
1. Click "Marketing Swarm" in sidebar
2. Verify: Config form renders with Content Configuration and Content Brief sections
3. Verify: "PREVIOUS SWARMS" button visible at top

### Step 3: Configure content brief
1. Content Type: "Blog Post" (default)
2. Topic: "How AI Agents Transform Small Business Marketing"
3. Target Audience: "Small business owners and marketing managers"
4. Goal: "Educate on practical AI marketing tools"
5. Key Points: "AI is affordable for small businesses\nStart with email automation\nMeasure ROI"
6. Tone: "Professional" (default)
7. Verify: All fields populated

### Step 4: Configure agents (minimal)
1. Scroll to Agent Configuration section
2. Set Writers: 1
3. Set Editors: 1
4. Set Evaluators: 1
5. Verify: Agent count shows 3 total

### Step 5: Select LLM
1. Click "Select Model" or LLM selector
2. Choose a provider (e.g., Anthropic)
3. Choose a model (e.g., claude-sonnet-4-5-20250514)
4. Verify: Model displayed in config

### Step 6: Execute
1. Click "EXECUTE" / "START" button
2. Verify: Page transitions to execution view
3. Verify: "Live updates" indicator shows green/connected
4. Verify: Execution Progress pipeline visible with steps:
   Setup → Queue → Writing → Editing → Evaluating → Finalists → Final Eval → Ranking → Done

### Step 7: Monitor progress (SSE events)
1. Wait for Setup step to complete (highlight/checkmark)
2. Verify: Queue step activates — shows output descriptions queued
3. Verify: Writing step activates — writer(s) producing content
4. Verify: Content Outputs section shows card(s) appearing with "writing" status
5. Wait for writing to complete — cards show "draft" status

### Step 8: Editing phase
1. Verify: Editing step activates
2. Verify: Content cards update with editor feedback
3. Verify: Cards show "editing" then updated content

### Step 9: Evaluation phase
1. Verify: Evaluating step activates
2. Verify: Evaluation scores appear on cards
3. Verify: Cards show evaluator reasoning

### Step 10: Ranking and completion
1. Verify: Finalists step activates
2. Verify: Ranking step shows ordered results
3. Verify: Done step lights up
4. Verify: Final ranked content visible with scores

### Step 11: Review output
1. Click on a content card
2. Verify: Full content viewable
3. Verify: Version history accessible (if applicable)
4. Verify: Can copy/export content

### Step 12: Previous swarms
1. Click back arrow or "PREVIOUS SWARMS"
2. Verify: Completed swarm appears in history
3. Click on it
4. Verify: Results load from database

## Success Criteria

- Complete pipeline executes without errors
- All 9 pipeline steps progress and complete
- At least 1 content card produced with writer output
- Editor feedback visible on card
- Evaluator score visible on card
- Final ranking shown
- Total execution time < 5 minutes for 1/1/1 config

## Failure Investigation

If SSE events are skipped:
- Check browser console for "Event skipped - no metadata.type"
- Check Forge API logs for observability emit calls
- Verify marketing-swarm.graph.ts emits typed events with `type` in metadata

If no content cards appear:
- Check if `output_updated` events are being emitted
- Verify SwarmOutputPhase2 shape matches frontend expectations

If pipeline stalls at a step:
- Check Forge API logs for LLM errors
- Verify API keys are configured
- Check if LangGraph checkpoint is stuck
