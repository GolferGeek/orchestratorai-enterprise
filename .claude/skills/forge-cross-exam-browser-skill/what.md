# Cross-Exam Simulation — What It Does

## Purpose

Cross-Exam Simulation is a live, interactive practice session where a lawyer plays the role of a witness and the AI plays opposing counsel. The AI asks questions, the lawyer types answers, the AI scores each answer and decides whether to press, move on, or pivot.

## What Makes It Unique

This is not a report generator — it's a real-time interactive loop. The LangGraph graph **interrupts at every question**, waits for the human to type an answer via a form field, then scores the answer and decides next move. This is a fundamentally different HITL pattern from the approve/reject modals elsewhere.

## The Interactive Loop

```
AI asks question → lawyer types answer → AI scores
→ [if answer is weak] → AI follows up or rephrases
→ [if answer is strong] → AI moves to next topic
→ [when session ends] → debrief with scoring summary
```

The graph pauses at `question_generator` node on every question — this is a LangGraph `interrupt()` that waits for the witness answer. The answer is submitted via a dedicated `/answer` endpoint (not the standard `/review` endpoint).

## Scoring

After each answer, `answer_scorer` evaluates:
- Clarity (did the witness directly answer the question?)
- Consistency (does it contradict prior statements or deposition topics?)
- Vulnerability (does it open new attack vectors?)
- Coaching notes (what to do differently)

## Debrief

After the simulation ends, `debrief_generator` produces a session summary:
- Overall score and areas of strength/weakness
- Most dangerous moments (questions where the witness stumbled)
- Practice recommendations

## Access Path

1. Navigate to a matter → Documents tab
2. Launch Deposition Prep for a witness
3. `DepositionPrepWorkspace` opens — navigate to "Simulation" tab
4. Simulation starts from the Deposition Prep's context (same witness, case, topics)
