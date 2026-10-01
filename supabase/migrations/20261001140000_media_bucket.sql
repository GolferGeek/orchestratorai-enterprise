-- The storage bucket generated media is kept in (MEDIA_STORAGE_BUCKET=media).
-- It never existed on the Studio, so every image or video an agent made was
-- generated and then failed to upload ("Bucket not found"): found on
-- 2026-10-01 running the media agents live after the move to OpenRouter.
-- Private: assets are served through the API's /assets route, which only
-- streams objects that have an asset record, sandboxed and nosniff.
BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;
