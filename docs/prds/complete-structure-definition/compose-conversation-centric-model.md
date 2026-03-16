# Compose Conversation-Centric Model

## Purpose

Define the simplified persistence and response model for Compose.

## Core Decision

Compose should treat **conversation as the primary persisted unit**.

The system should not automatically create separate task and deliverable abstractions for every agent invocation.

## Why

The old generalized platform model carried too much machinery:

- `converse`
- `plan`
- `build`
- tasks
- deliverables
- extra execution objects

For Compose, this is usually more framework than product value.

What the user actually needs most of the time is:

- send something to an agent
- get back typed output
- keep that output in the conversation
- decide whether to save or export it

## Simplified Execution Model

Compose should prefer:

- one invocation model
- one response envelope
- one declared output type

Examples of output types:

- `text`
- `markdown`
- `json`
- `image`
- `video`
- `audio`

That is enough for:

- UI rendering
- chaining between Compose agents
- user editing for text-like outputs
- optional persistence when explicitly requested

## Persistence Model

The architectural rule should be:

- keep the conversation
- keep messages inside the conversation
- let outputs live as message content or structured message attachments
- avoid creating extra state records unless clearly justified

The implementation may use:

- message rows
- structured JSON content
- conversation-linked payload blobs

The exact storage format is secondary to the architectural decision.

## Tasks

Tasks should become optional, not universal.

A task record is only justified when:

- an operation is long-running enough to require async tracking
- progress/resume behavior is actually needed
- background execution must survive process boundaries

Most Compose invocations should not create tasks automatically.

Legacy task-oriented tables should not remain in place indefinitely just because they once supported the old framework model.

## Deliverables

Deliverables should become optional, not universal.

A deliverable is only justified when:

- the output is a real artifact that benefits from durable storage
- the user explicitly chooses to save/export it
- a family such as media generation needs managed artifact persistence

Most Compose invocations should not create deliverables automatically.

Legacy deliverable-oriented tables should not remain in place indefinitely just because they once supported the old framework model.

## Legacy Table Removal

Compose should not keep the old generalized persistence tables around as architectural baggage once the simplified model is in place.

The intended direction is to remove the old framework-era tables that centered Compose around managed workflow state instead of conversation and typed outputs.

That includes removal of legacy tables such as:

- `tasks`
- `deliverables`
- `plans`
- `versions`

If any replacement async tracking or artifact persistence is needed, it should be introduced intentionally for the specific capability that needs it rather than preserving the old generalized table model.

## UI Implication

The UI should treat outputs simply:

- render `text`
- render and optionally edit `markdown`
- render and optionally inspect `json`
- preview `image`, `video`, or `audio`

The frontend should not need to understand backend mode semantics in order to render results.

Instead, rendering should be driven by typed output:

- `text` -> render as normal conversation text
- `markdown` -> render preview mode with a `See Markdown` or edit toggle
- `json` -> render a friendly table/tree/card view with a `See JSON` toggle
- `image` -> render an image preview
- `video` -> render a video player
- `audio` -> render an audio player

This keeps the frontend simple and avoids leaking backend execution distinctions into the UI.

If the user wants to keep something, the UI can offer:

- save
- export
- promote to artifact

This is much simpler than assuming the backend must pre-model all future user intentions.

## Architectural Consequence

Compose should move from:

- mode-heavy execution
- automatic task/deliverable creation
- generalized state objects
- legacy generalized persistence tables

to:

- typed outputs
- conversation-centric persistence
- optional artifact and async tracking only when actually needed

## Success Criteria

- Compose conversation is the default persistence model
- most runs do not create extra task or deliverable records
- old framework-era tables such as `tasks`, `deliverables`, `plans`, and `versions` are removed rather than preserved by inertia
- outputs are typed and easy for the UI to render
- persistence beyond the conversation is explicit and intentional
