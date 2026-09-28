-- Watched storage folders (effort: ambient push and A2A agents, Phase 4).
-- A file that lands in a watched bucket folder raises a named ambient event
-- (e.g. invoice.received): the same event an A2A partner can push, so the
-- same triggers answer both. The storage watcher follows storage.objects
-- inserts through the database change stream, so the table joins the
-- realtime publication.
BEGIN;

CREATE TABLE ambient.storage_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug text NOT NULL,
  bucket text NOT NULL CHECK (length(bucket) BETWEEN 1 AND 63),
  -- A folder inside the bucket ('' is the whole bucket); a file matches when its path starts with it.
  prefix text NOT NULL DEFAULT '' CHECK (prefix = '' OR prefix ~ '^[^/].*/$'),
  event text NOT NULL CHECK (event ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_slug, bucket, prefix, event)
);
ALTER TABLE ambient.storage_watches OWNER TO postgres;
CREATE INDEX ambient_storage_watches_bucket_idx ON ambient.storage_watches (bucket) WHERE enabled;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'storage' AND tablename = 'objects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE storage.objects;
  END IF;
END $$;

COMMIT;
