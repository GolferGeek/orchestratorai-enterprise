# Matt's queue: archive

Processed items moved out of `docs/matt-queue.md`, newest first. Each keeps its question, Matt's answer and the date.

## 2. Start the module system in enterprise now, or later?

- **Status:** Processed
- **What:** The Neuromics copy reorganized its features into modules: each
  feature (customer service, the marketing swarm, the media agents, Neuromics'
  order intake and fulfillment) lives in `modules/<name>/` with its own
  screens, API code, database schema and manifest. It added a scaffolder
  (`npm run module:new`), checks that keep modules from reaching into each
  other, and a Settings > Modules page that turns modules on and off while
  the platform runs. Enterprise does not have any of this; its features sit
  directly in `apps/api/src` and `apps/web/src`.
- **Why it matters:** Until enterprise has the same layout, every sync to a
  client copy has to translate paths by hand (it did today, for customer
  service). It is also the base for the planned "starter plus modules"
  product (`efforts/future/enterprise-v4-core-and-modules.md`). It is a large
  restructuring: about ten commits from the copy, moving enterprise's own
  features into modules too.
- **Options:**
  1. Start now: bring the module plumbing up, then move enterprise's features
     into modules one at a time, deploying after each.
  2. Later: keep translating paths at each sync until then.
- **Recommendation:** 1. The copy has already proven the format, and the
  path translation gets more expensive with every sync.
- **Reply:** "start the module system" or "later".
- **Answer** (2026-10-07): "Neuromics version is very strong with modules, etc. What it doesn't have is the existing workflows, but those existing workflows are a different technology, one that we don't want to move forward with. All we're really doing is showing that. What we could do is just continue with Neuromics for a while and then spend a weekend converting that to our Orchestrator AI starter."
  Taken as: neither. Enterprise is frozen as v3 (live fixes only, no module system, no new features). All platform work continues in `orchestratorai-neuromics`; when Neuromics settles, the copy is converted to the OrchestratorAI starter. Recorded in `~/projects/orchestratorai/efforts/current/enterprise-client-sync.md`.

## 1. Vertex AI image generation: build it, or stop advertising it?

- **Status:** Processed
- **What:** The Vertex AI backend says it can generate images, but it never could: it called an SDK method (`getImageGenerationModel`) that `@google-cloud/vertexai` doesn't have, so every image request failed with a confusing TypeError. That surfaced on 2026-10-01 while cleaning up lint; it now fails with a clear "not implemented" message. Separately, Google deprecated that SDK, with removal due 2026-06-24 (already past).
- **Why it matters:** Anyone choosing Vertex for images gets an error. Nothing uses Vertex today (GCP is parked), so nothing is broken in practice.
- **Options:**
  - (a) Build Vertex images (Imagen) on Google's current SDK, `@google/genai`, and move the Vertex backend's text calls to it at the same time.
  - (b) Drop image generation from the Vertex backend so it stops claiming it.
  - (c) Leave it until the GCP work resumes.
- **Recommendation:** (c), and do (a) as part of the GCP effort, since that's when Vertex matters.
- **Reply:** "Build it", "Drop it", or "Leave it for GCP".
- **Answer** (2026-10-01): "vertex requires a weird google setup on the machine, including some sort of auth keys, i think. you should leave it and don't include them on this machine. the only thing we should have on this machine is the openai versions. there are other ones we can go grab too. that decision was made a year ago and i'm sure there are other image models we can use. we should probably think about that especially since we're using openrouter" Taken as: leave Vertex as it is and never configure it on the Studio; image models beyond OpenAI are a new effort (efforts/future/openrouter-image-models.md).

## 2. Remove 12 stopped containers left from the old multi-app stack

- **Status:** Processed
- **What:** Every deploy warns about 12 orphan containers (admin, auth, bridge, command, compose, forge and pulse api/web). All are stopped: 6 exited six weeks ago, 6 were never started. The running bitcoind and lnd containers are not among them.
- **Why it matters:** It's clutter in every deploy log. Removing them changes nothing that runs, but it can't be undone (the images stay).
- **Recommendation:** Remove them (`docker compose up --remove-orphans` on the next deploy).
- **Reply:** "Remove them" or "Leave them".
- **Answer** (2026-10-01): same reply. A full backup was taken first (~/backups/orchestratorai-enterprise/20261001-101235-full: pg_dumpall of every database with roles, all storage files, .env, .env.secrets, supabase config), then the 12 stopped containers were removed with docker rm.

## 1. A real outside A2A partner: where does it run?

- **Status:** Processed
- **What:** The last open A2A item is a partner we didn't write: run an official A2A sample agent (Python, A2A v1.0) and have Invoice Review call it partway through a run, as a vendor check. The Gatehouse only calls partners at public https addresses (it refuses localhost and private networks, on purpose). So the sample needs a public address, not just a port on the Studio.
- **Why it matters:** It proves the Gatehouse works with A2A software we didn't write, and fills the Outbound page with real calls. One limit: an official sample can't call *into* us, because our callers sign each call with their own key, which the samples don't do. The call into us stays with our own test partner.
- **Options:**
  - (a) Serve the sample on the Studio behind its own public path or subdomain (an nginx route and DNS/tunnel entry, e.g. `partner.orchestratorai.io`).
  - (b) Use a public A2A agent someone else runs (like CarGene), with a vendor-check-like task instead of an exact fit. Nothing new to host.
  - (c) Skip the outside partner for now.
- **Recommendation:** (a). It's the realistic demo, a sample we control end to end, and it costs one route.
- **Reply:** "Host it on the Studio", "Use a public agent", or "Skip it".
- **Answer** (2026-10-01): "i think you are probably okay with partner.orchestratorai.io. i thought we were going to use that japanese thing but we can create one here. it's fine and i think we can get rid of those leftover containers. i don't care if we lose it but now might be a good time to do a supabase backup with everything in it" Taken as (a): host a partner at partner.orchestratorai.io. Recorded in efforts/current/ambient-push-and-a2a-agents.md, Phase 5b.

## 1. A2A pages: move the Secure Conversations pages onto the Gatehouse?

- **Status:** Processed
- **What:** The app has A2A pages under Secure Conversations (Registry, Inbound A2A, Outbound A2A, Security, Observability). They run on an older A2A system that is separate from the Gatehouse. That system uses its own message format, not the A2A standard, and one shared secret instead of per-caller keys. Its tables have never held a row, and on the Studio it accepts no calls. The Gatehouse, where all the working A2A now lives (A2A agents, callers and their keys, tasks, replies to callers, storage watches), has no page at all.
- **Why it matters:** As things stand, the pages an admin would open for A2A show an empty system, and the live one can only be managed with SQL. There's no way to remove a caller or an A2A agent.
- **Options:**
  - (a) Rebuild the Secure Conversations A2A pages on the Gatehouse, and retire the old backend, keeping the pieces worth reusing (the URL safety check, the message log, the circuit breaker).
  - (b) Leave Secure Conversations as it is and add a separate Gatehouse page.
- **Recommendation:** (a). It leaves one A2A system with one set of pages. Two systems side by side, one of them empty, would confuse anyone using the demo.
- **Reply:** "Rebuild on the Gatehouse" or "Separate page".
- **Answer** (2026-10-01): "i see. go ahead and line up all the things you mentioned (the gatehouse page, everything) and work your way through those." Taken as (a): rebuild on the Gatehouse. Recorded in efforts/current/ambient-push-and-a2a-agents.md, Phase 6.
