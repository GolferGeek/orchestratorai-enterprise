# Watching a mailbox

A mailbox watch reads a Gmail or Google Workspace mailbox on a schedule. Each
new message raises a named ambient event, for example `order.email`. A trigger
on that event starts an agent or a workflow.

The watcher only reads. It never marks a message read, moves it or deletes it,
so the people who use the mailbox see it exactly as before.

The code is in `apps/api/src/ambient/mailboxes/` and the table is
`ambient.mailbox_watches`.

## What an event carries

| Field | What |
|---|---|
| `channel`, `provider`, `mailbox` | `mail`, `gmail`, the watched address |
| `messageId`, `threadId` | Gmail's ids |
| `from`, `to`, `subject`, `receivedAt` | from the message headers |
| `body` | the text body (an HTML-only message is turned into text), at most 100,000 characters |
| `attachments` | each attachment taken in: `{ bucket, path, filename, mimeType }` |
| `skippedAttachments` | each one not taken in, with the reason: a type that isn't a document type (PDF, Word, text, Markdown, CSV, PNG, JPEG), or larger than 25 MB |
| `bucket`, `path`, `filename` | the first attachment taken in, so a trigger with `documentFromEvent` hands it to the run |

A message raises its event once. The event's dedupe key is
`gmail:<mailbox>:<message id>`.

When a watch is created, its cursor (`checked_after`) starts at the creation
time, so older mail is not raised. Each poll searches from one minute before
the cursor, and the dedupe key absorbs the overlap.

## Setting one up

1. **Google Cloud project** (once per organization):
   - Enable the Gmail API.
   - Create an OAuth client of type "Web application". For a Workspace
     company, make it an Internal app.
   - The only scope it needs is `https://www.googleapis.com/auth/gmail.readonly`.
2. **A refresh token for the mailbox:**
   - Sign in as the mailbox (for example `order@neuromics.com`) and grant the
     read-only scope to the client. The OAuth Playground works for this:
     choose "Use your own OAuth credentials" and enter the client.
   - Keep the refresh token. A "Connect mailbox" button in admin will replace
     this step later.
3. **Store the credentials** as an admin of the organization. Send
   `x-organization-slug: <org>` and use `PUT /api/admin/credentials/<type>/<key>`
   with `{ "value": "..." }`:
   - `google/client_id`
   - `google/client_secret`
   - `gmail/<credential key>`, for example `gmail/order-mailbox`, holding the
     refresh token

   They are stored encrypted (`CREDENTIALS_ENCRYPTION_KEY`).
4. **Create the watch:**
   ```
   POST /api/ambient/mailbox-watches
   { "mailbox": "order@neuromics.com", "credentialKey": "order-mailbox",
     "event": "order.email", "query": "in:inbox", "schedule": "*/5 * * * *" }
   ```
   `query` is any Gmail search, for example
   `to:order@neuromics.com has:attachment`. `schedule` is a cron expression.
5. **Add a trigger** with source type `event` on `order.email`, the same as
   for any pushed event.
6. **Check it:** `POST /api/ambient/mailbox-watches/<id>/poll` reads the
   mailbox now and answers `{ found, raised, alreadySeen }`.

## When it fails

A poll that fails records the reason on the watch (`last_error`, shown by
`GET /api/ambient/mailbox-watches`) and tries again on the next schedule.
Typical reasons:
- Google refused the refresh token (revoked, or the password changed).
- The credential signs in as another address than the watch's `mailbox`.
- A credential is missing.

A message whose attachment cannot be fetched stops the cursor at that message,
so nothing after it is skipped silently. Each poll retries it until the cause
is fixed.
