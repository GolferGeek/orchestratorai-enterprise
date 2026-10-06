-- Watched mailboxes: a new message in a watched mailbox raises the watch's
-- named ambient event (e.g. order.email), pushed like any other, with the
-- message's sender, subject, text and stored attachments. The mailbox watcher
-- polls each enabled watch on its schedule through the provider's API (Gmail
-- first, read-only: it never marks, moves or deletes a message), reading only
-- messages newer than `checked_after`. The event's dedupe key is the message
-- id, so a message raises one event.
--
-- Credentials come from the organization's encrypted credentials:
-- google/client_id, google/client_secret, and gmail/<credential_key> (the
-- mailbox's refresh token).
BEGIN;

CREATE TABLE ambient.mailbox_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug text NOT NULL REFERENCES public.organizations(slug) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('gmail')),
  -- The address the credential must sign in as (checked before reading).
  mailbox text NOT NULL CHECK (mailbox ~ '^[^@\s]+@[^@\s]+$'),
  credential_key text NOT NULL CHECK (credential_key ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'),
  -- The provider's search, e.g. 'in:inbox' or 'to:order@acme.example has:attachment'.
  query text NOT NULL DEFAULT 'in:inbox' CHECK (length(query) BETWEEN 1 AND 500),
  -- Cron expression for the poll.
  schedule text NOT NULL DEFAULT '*/5 * * * *',
  event text NOT NULL CHECK (event ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  enabled boolean NOT NULL DEFAULT true,
  -- Messages received at or before this were handled (starts at creation: no backfill).
  checked_after timestamptz NOT NULL DEFAULT now(),
  last_polled_at timestamptz,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_slug, mailbox, query, event)
);
ALTER TABLE ambient.mailbox_watches OWNER TO postgres;
ALTER TABLE ambient.mailbox_watches ENABLE ROW LEVEL SECURITY;
CREATE INDEX ambient_mailbox_watches_enabled_idx ON ambient.mailbox_watches (org_slug) WHERE enabled;

COMMIT;
