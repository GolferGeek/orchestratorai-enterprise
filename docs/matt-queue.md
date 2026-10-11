# Matt's queue

Everything waiting on Matt in this project, **most important first**. Deadlines come first, then items blocking other work, then the rest.

- **Matt:** say "give me your top issue" (or "the next one") and you get the first item that is not yet Answered. Answer it in a line.
- **Status** (every item has one):
  - **Waiting**: in the queue, not yet asked.
  - **Asked (date)**: put to Matt.
  - **Answered (date)**: Matt replied; his answer is written in the item, word for word.
  - **Processed**: acted on. Move the item to `docs/matt-queue-archive.md` (newest first) and renumber the queue.
- **Agents:** when you need Matt to decide or do something, add it here with **Status: Waiting**, in priority order, in the format below. Never leave an ask only in chat: Matt reads in bursts, runs several agents at once, and doesn't carry context between messages. After his answer:
  1. set Answered with his words;
  2. act on it and record the decision where this project keeps decisions;
  3. set Processed and move the item to the archive.
- **Format** (each item must read cold, with no shorthand from earlier conversations, and no PR numbers or internal names as the explanation):
  - title (with a deadline if any);
  - **Status**;
  - **What** (plain words);
  - **Why it matters**;
  - **Options**, if more than one;
  - **Recommendation**;
  - **Reply** (the exact words to say);
  - **Answer** (added when Answered).
- **grokbot** reads this file (and the same file in Matt's other projects) to answer "what are my top issues?". It lists items that are Waiting or Asked.

## 1. Jev on Ollama: keep the full retirement of orchestratorai-jev, or bring Jev back with Ollama as one selectable option?
- **Status:** Asked 2026-10-11
- **What:** Two records about Jev and Ollama disagree. On 2026-10-01 you said Ollama's local decision models should be added to orchestratorai-jev as one selectable backend (the first choice, beside hosted Jev and the DGX Spark), and that "Ollama replaces nothing". Then, after Ollama's Clef models came out, the workspace effort "Retire orchestratorai-jev" (started 2026-10-03) records you choosing to retire the whole Jev repo instead: each product calls Ollama's Clef models directly through a small copied client, set by configuration so it can later point at hosted Jev on OpenRouter. Much of that is already done: the Studio's Ollama was upgraded and Clef pulled, orchestratorai-jev is archived on GitHub and gone from the workspace, and the enterprise and divinr.ai changes were made on branches. Still open in that effort: orchestratorai-local's coaching guard and Jev Lab, orchestratorai-pi's client, removing the old jev-mcp service and settings from this laptop, and some stale docs. Coding Manager's brief of 2026-10-11 still describes the 2026-10-01 "add, don't replace" version, so agents are getting both instructions.
- **Why it matters:** Until you say which one stands, no agent should finish the retirement (removing services, settings and the last Jev code), and none should rebuild Jev with Ollama as an option either. The open steps sit still, and the two notes will keep contradicting each other in future briefs.
- **Options:** (a) The retirement stands: finish the open steps of the retirement effort and treat the 2026-10-01 "add Ollama as an option" note as replaced. (b) Go back to the 2026-10-01 plan: un-archive orchestratorai-jev and offer Ollama as one selectable backend beside hosted Jev and the Spark. (c) Keep the retirement, but give each product a setting to choose between Ollama's Clef and hosted Jev on OpenRouter (the retirement effort already plans for this as a configuration change, once OpenRouter's API is published).
- **Recommendation:** (a), or (c) if you want the choice to be visible. The retirement is mostly done, it matches your later decision on 2026-10-04, and its design already keeps the backend a configuration choice, which is the part of the 2026-10-01 wish that still matters. Going back would mean restoring an archived repo.
- **Reply:** "Retirement stands, finish it" or "Go back to Ollama as an option in Jev" or "Keep the retirement, add a backend setting per product"

## 2. Which effort should the next small first PR come from?
- **Status:** Asked 2026-10-11
- **What:** You approved (2026-10-11) starting one current effort with a small first PR that needs no deploy and no decision from you first. None of the five current efforts has a step like that today:
  - *Image and video models through OpenRouter* (enterprise): every planned step is done, deployed and checked live, including the video agent. Nothing is left in its plan.
  - *A general admin for every workflow, and the marketing swarm on the runtime* (enterprise): every planned step is done and live. Its "next ideas" (must-pass facets for editors, a model picker for writers) are new features, and enterprise is frozen as v3.
  - *Ambient push and A2A agents* and *Keep enterprise and its client copies in step*: their remaining work continues in the Neuromics copy, which agents are not to touch unless you ask.
  - *Retire orchestratorai-jev*: excluded until you answer the item above, "Jev on Ollama: keep the full retirement of orchestratorai-jev, or bring Jev back with Ollama as one selectable option?".

  A read-only review of the enterprise image path found one small, real weakness: when OpenRouter's reply doesn't say what type of image it sent, the code labels it PNG. For the infographic agent, which asks for SVG, that would store the drawing as a broken PNG. The live runs on 2026-10-01 stored and served correctly, so OpenRouter does seem to send the type today. The same review found that the code that sends image requests to OpenRouter, and the backend that turns the reply into a stored image, have almost no tests.
- **Why it matters:** The next agent needs a starting point that fits your rules: the enterprise freeze, no Neuromics work unless you ask, and no deploys.
- **Options:** (a) Wait for the Jev answer. If the retirement stands, the first PR is its next step in orchestratorai-local: switch the coaching guard to the copied decision client. (b) Make an exception to the enterprise freeze for one small PR: remove the PNG guess (use the format the agent asked for, or refuse the image clearly) and add tests for the image request and reply. It would not be deployed until you say so. (c) Start a future effort instead, for example "Clear stale docs and scripts found during the skills review" (enterprise and local, docs only) or "Pi as a real downloadable Mac app" (orchestratorai-pi).
- **Recommendation:** (a) if the retirement stands, because it finishes work already mostly done. Otherwise (c), the stale docs and scripts, which carries the least risk. Take (b) only if you plan to record the infographic agent, since it guards against a failure no one has seen yet.
- **Reply:** "Next PR: the Jev retirement step in local" or "Next PR: the enterprise image-type fix" or "Next PR: start <effort name>"
