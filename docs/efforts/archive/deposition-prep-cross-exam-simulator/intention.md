# Intention: Deposition Prep & Cross-Examination Simulator

## Priority: #8 of 10 Legal Workflows

## What

A litigator preparing for a deposition uploads: the case facts (or connects to a Persistent Case Team if one exists), the deposition topics, the witness's background and prior statements, and any relevant documents. The Legal Department produces three outputs:

1. **Preparation outline** — a structured guide for the deposing attorney: key questions organized by topic, document references to confront the witness with, traps to set (leading question sequences designed to lock the witness into positions), and areas where the witness is likely to be evasive.

2. **Predicted cross-examination** — if the lawyer's own witness is being deposed, a list of the most likely cross-examination questions the opposing counsel will ask, organized by topic, with suggested answer frameworks and danger zones to avoid.

3. **Interactive simulation** — an adversarial agent plays opposing counsel and conducts a simulated cross-examination. The lawyer (or their witness) responds to questions in real time. The system scores each exchange for evasion risk, consistency with prior statements, and potential damage to the case. After the simulation, a debrief report identifies the weakest moments and provides coaching.

The user clicks "Prep a Deposition" in the Legal Department workspace, provides the case context and witness details, and selects which outputs they want. The preparation outline and predicted cross-exam are generated as async jobs. The interactive simulation is a **live session** — the first workflow that requires real-time back-and-forth interaction rather than async job processing.

## Why

### The practice gap

Deposition preparation is one of the highest-skill activities in litigation. A well-prepared witness wins cases; a poorly prepared witness loses them. The standard prep process:

1. The attorney spends 8-20 hours reviewing case documents and crafting questions (for deposing) or anticipated questions (for defending)
2. A practice session with the witness (2-4 hours), where the attorney plays opposing counsel
3. Refinement based on the practice session

The bottleneck: the attorney playing opposing counsel during practice can only simulate their own prediction of what the other side will ask. They're limited by their own imagination and knowledge. An adversarial agent with access to the full case record and the ability to research the other side's likely strategy can produce a more comprehensive and surprising cross-examination.

### The wow factor

The interactive simulation is the second high-impact demo moment (after Adversarial Brief #3). A lawyer sits down, the AI plays opposing counsel, and asks probing questions — following up on weak answers, confronting with documents, setting traps. Watching this happen in real time is deeply impressive and immediately understandable. Every litigator who sees it wants it.

### The patterns it combines

This workflow is a synthesis of patterns from earlier workflows:

- **Adversarial agents from #3** — the simulated opposing counsel is the same adversarial pattern, adapted from brief-level arguments to question-level interrogation
- **Recursive research from #2** — generating the preparation outline requires researching the legal theories the other side might pursue, finding precedent for cross-examination strategies, and identifying document confrontation opportunities
- **The debate viewer from #3** — the simulation UI reuses the split-panel debate viewer, adapted for Q&A format instead of argument/counter-argument

### The new pattern it introduces

**Interactive real-time agent session** — the first workflow where the human is in a live back-and-forth with an adversarial agent, rather than reviewing async results. This pattern is reused by:
- Monte Carlo Trial (#9) — interactive elements of the simulated trial
- Persistent Case Team (#10) — the partner can query the case team in real time

The technical difference from async jobs: the interactive simulation holds a live graph execution with the human's responses feeding back into the graph at each step, rather than a job that runs to completion with HITL gates at predefined points.

## The shape of the thing

### Output 1: Preparation outline (async job)

A new graph — `deposition-prep.graph.ts`:

1. **Case analysis node** — ingests the case facts, witness background, and relevant documents. Identifies:
   - Key themes the deposing attorney should pursue
   - Inconsistencies in the witness's prior statements or documents
   - Legal theories that the witness's testimony could support or undermine
   - Documents that should be used as exhibits during the deposition

2. **Question generation node** — for each theme, generates:
   - Open-ended questions (to get the witness talking)
   - Follow-up questions (to pin down specifics)
   - Confrontation sequences (present a document, then ask about inconsistencies)
   - Trap sequences (lock the witness into a position, then confront with contradicting evidence)
   - Each question is tagged with its strategic purpose and the expected witness response

3. **Research node** — uses the recursive research pattern from #2 to:
   - Find deposition strategies from case law in similar disputes
   - Identify common evasion tactics for this witness type (corporate officer, expert witness, fact witness)
   - Research the opposing counsel's known deposition style (if the opposing attorney is identified)

4. **Synthesis node** — produces the preparation outline:
   - Questions organized by topic, in recommended order
   - Document exhibit list with suggested timing
   - Red flags to watch for in the witness's responses
   - Fallback questions if the witness is uncooperative

### Output 2: Predicted cross-examination (async job)

Same graph, different mode:

1. **Opposing perspective node** — models the opposing counsel's strategy:
   - What are they trying to prove with this deposition?
   - What prior statements or documents do they have to work with?
   - What are the witness's vulnerabilities?

2. **Cross-examination generation node** — generates the most likely questions the opposing counsel will ask:
   - Opening questions (rapport-building, establishing basics)
   - Core questions (the substance they're after)
   - Confrontation questions (documents and prior statements they'll use)
   - Trap questions (designed to get admissions or lock in positions)
   - Each question includes the likely follow-up if the witness gives a weak answer

3. **Answer coaching node** — for each predicted question:
   - Suggested answer framework (not a script — a framework)
   - Danger zones (what NOT to say)
   - How to handle the follow-up if the witness stumbles
   - When to say "I don't recall" vs. when that's dangerous

### Output 3: Interactive cross-examination simulation (live session)

A new graph type — `cross-exam-simulation.graph.ts` — that supports **interactive human-in-the-loop at every step**, not just at predefined HITL gates.

**The simulation loop:**

1. **Opposing counsel agent** generates a question based on:
   - The simulation's strategic goals (from the case analysis)
   - The witness's responses so far
   - The documents available for confrontation
   - The current line of questioning (maintaining coherent topic flow)

2. **The human responds** — typing their answer as they would in a real deposition. The graph pauses via `interrupt()` and waits for the human input.

3. **Scoring agent** evaluates the response:
   - **Evasion score** (0-10): did the witness avoid the question?
   - **Consistency score** (0-10): does the answer match prior statements?
   - **Damage score** (0-10): how much did this answer hurt the case?
   - **Coaching note**: a brief note on what to improve (shown after the simulation, not during — to avoid breaking the flow)

4. **Opposing counsel agent** decides the next move:
   - Follow up on the same topic (if the answer was evasive or opened a new avenue)
   - Move to the next topic (if the answer was solid and there's nothing more to get)
   - Confront with a document (if the answer contradicts something in the record)
   - Attempt to impeach (if the answer contradicts a prior statement)

5. **Repeat** for 20-50 questions (configurable), or until the opposing counsel agent exhausts its topics.

**Post-simulation debrief:**

After the simulation ends, a debrief node produces:
- Transcript with per-answer scores
- The 5 weakest moments (highest damage scores)
- Patterns in the witness's responses (habitual evasion, over-explaining, volunteering information)
- Specific coaching recommendations
- Comparison to the predicted cross-examination (how well did the practice match the prediction?)

### Frontend: Deposition workspace

Three views in the deposition prep detail panel:

1. **Preparation Outline** — structured document view with expandable question sections, document exhibit references, and strategic notes.

2. **Predicted Cross-Exam** — question list with answer coaching. Expandable per question to show danger zones and follow-up handling.

3. **Simulation** — the live session:
   - Top: the opposing counsel agent's question
   - Middle: the human's response input (text area)
   - Bottom: (after simulation) the scoring and coaching overlay
   - Side: the running transcript with color-coded scores
   
   Reuses the `DebateViewer.vue` component from #3, adapted for Q&A format instead of argument/counter-argument.

### Technical: interactive graph execution

The simulation graph differs from all previous workflows in that the human input happens at **every step**, not at predefined checkpoints. This requires:

- **Per-question interrupt/resume** — the graph interrupts after each question, waits for the human's answer, and resumes with the answer as input to the next node
- **Session state** — the full simulation state (all questions, all answers, all scores) persists in the LangGraph checkpoint so the session can survive page refreshes, network interruptions, etc.
- **Real-time SSE** — the opposing counsel's question streams token-by-token as it's generated (using the LLM streaming support)
- **No timeout pressure** — the graph waits indefinitely for the human's response. There's no timer.

This is architecturally similar to the existing HITL implementation, but with a much faster interrupt/resume cycle (every 30-60 seconds instead of once per job). The checkpoint persistence layer must handle this frequency without degradation.

## Constraints

- **The simulation is practice, not prediction.** The debrief report must include a disclaimer that the simulation reflects one possible cross-examination, not a guarantee of what will happen. The opposing counsel agent is strong but not omniscient.
- **No recording of witness responses for discovery purposes.** The simulation is attorney work product. The system must be clear that simulation transcripts are privileged and should not be produced in discovery.
- **ExecutionContext is the capsule.** The preparation outline and predicted cross-exam are separate jobs with separate conversationIds. The simulation is a third job with its own conversationId.
- **Interactive graph execution respects Ollama concurrency.** On sovereign hardware, only one simulation can run at a time (the opposing counsel agent needs the LLM for each question).
- **No fallbacks on question generation.** If the opposing counsel agent can't generate a good question (context overflow, model failure), the simulation pauses with an error rather than asking a weak question.

## Out of scope

- **Video/voice simulation.** The simulation is text-based. Voice simulation (for practicing verbal responses) and video (for practicing demeanor) are future enhancements that require media processing capabilities.
- **Multi-witness preparation.** Preparing for depositions of multiple witnesses in the same matter with coordinated strategy. Future enhancement — connects naturally to Persistent Case Team (#10).
- **Opposing counsel profiling.** Modeling a specific opposing attorney's known style based on their prior depositions. Future ML feature.
- **Auto-generated deposition notices.** Drafting the formal deposition notice and subpoena. A document generation task, not an analysis workflow.

## Dependencies

- Adversarial Brief (#3) — adversarial agent pattern, debate viewer component, role isolation techniques
- Legal Research (#2) — recursive research for strategy generation and case law research
- Legal Department async workspace (completed)
- Legal Department HITL (completed — but per-question interrupt is a more granular use)
- LLM streaming support (existing)

## Estimated scope

Medium-large. 3-4 weeks. The preparation outline and predicted cross-exam are straightforward graph builds using established patterns. The interactive simulation is the harder piece — per-question interrupt/resume at high frequency, the scoring agent, and the simulation UI.

## Why this goes eighth

- Second high-impact demo moment — the interactive simulation is viscerally impressive.
- Combines patterns from #2 (research) and #3 (adversarial) in a new domain.
- Introduces interactive real-time agent sessions — the pattern #9 and #10 both need.
- High value for litigators — the segment most willing to pay for legal AI.
- By this point, the adversarial pattern is battle-tested from #3, and the research pattern is mature from #2, so the risk is in the simulation UX, not the underlying AI patterns.
