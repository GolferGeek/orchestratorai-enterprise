# Contextual Help System

## Intention

Add contextual written help across OrchestratorAI Enterprise so every important public page, admin surface, workflow, agent surface, RAG page, settings page, ambient automation page, and secure-conversation page can explain itself in place.

The first version treats written help as the primary artifact. Optional Loom URLs can be added later, but missing video should not appear as an unfinished state to the user.

## User Need

OrchestratorAI Enterprise is large enough that most users will not understand the system by clicking around. A user on an important page should be able to click Help and quickly understand what the page is for, when to use it, what to look at first, and how it fits into the larger platform.

## Scope

- Create a reusable in-app help component.
- Add a central help catalog with route mappings, titles, read time, audience, key points, written help content, and optional Loom URL fields.
- Mount the help component once at the application root so route-specific help appears across public and authenticated pages.
- Track the effort and help inventory in `docs/efforts/current/contextual-help-system/`.
- Keep the implementation data-driven so additional pages or Loom URLs do not require page-by-page component edits.

## Out of Scope

- Recording Loom videos as a prerequisite.
- Hosting video assets outside Loom.
- Building a CMS for guide management.
- Building the separate OrchestratorAI Legal help system.

## Success Criteria

- Important routes show a guide button when a catalog entry exists.
- Clicking Help opens a modal with a complete written guide for the current function.
- Missing Loom URLs are invisible to end users.
- The help inventory clearly lists the proposed help set and where each guide appears.
