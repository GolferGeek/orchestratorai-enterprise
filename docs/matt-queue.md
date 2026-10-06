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

## 1. Create a Google Cloud OAuth client in the OrchestratorAI Workspace (to test the mailbox reader)

- **Status:** Asked (2026-10-06)
- **What:** The Gmail mailbox reader (watched mailboxes) is live on
  enterprise but has only been tested against a fake mailbox. To prove it on
  a real one, we use a test mailbox in OrchestratorAI's own Google Workspace
  (Matt, 2026-10-06: "if it is just a test... no problem"). Neuromics' own
  mailbox can be used too, "as long as it is not stored anywhere in here"
  (Matt): that test runs in the Neuromics copy, with its credentials only in
  the copy's database, never in enterprise. For the OrchestratorAI test,
  Matt does the Google console part:
  1. console.cloud.google.com, signed in as an orchestratorai.io admin: new
     project "OrchestratorAI mailbox test".
  2. APIs & Services > Library: enable the **Gmail API**.
  3. OAuth consent screen: User type **Internal**; app name "OrchestratorAI";
     add the scope `https://www.googleapis.com/auth/gmail.readonly`.
  4. Credentials > Create credentials > OAuth client ID > **Web application**;
     Authorized redirect URI:
     `https://enterprise.orchestratorai.io/api/ambient/mailbox-oauth/callback`.
  5. Pick (or create) a test mailbox, e.g. `test@orchestratorai.io`, and send
     it an email with a PDF attached.
  6. Give Claude the client ID and client secret by pasting them into a
     session (Claude stores them encrypted as the corporate org's
     google/client_id and google/client_secret and never writes them to a
     file or mail), plus the test address.
- **Why it matters:** proves the mailbox reader end to end before Neuromics
  connects order@neuromics.com in its own project.
- **Recommendation:** do it; about ten minutes in the Google console.
- **Reply:** the client ID, the client secret and the test address.

## 2. Start the module system in enterprise now, or later?

- **Status:** Asked (2026-10-06)
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
