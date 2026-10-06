-- A mailbox watch can read its attachments' text (native PDF text, office
-- formats, vision/OCR for scans and images) into the event, for whoever reads
-- mail and needs what the attachment says. Opt-in: vision costs model calls.
BEGIN;
ALTER TABLE ambient.mailbox_watches ADD COLUMN extract_text boolean NOT NULL DEFAULT false;
COMMIT;
