-- Form file uploads (PRD §5.2 "Form … file upload", P4). Files live in the UPLOADS R2 bucket under
-- form-uploads/<site>/<id>, never in a site's repository; the inbox shows signed download links.
-- pending → uploaded (bytes stored) → attached (to a submission). Unattached uploads expire.
CREATE TABLE form_uploads (
  id            TEXT PRIMARY KEY,           -- upl_…
  site_id       TEXT NOT NULL,
  form_id       TEXT NOT NULL,
  field         TEXT NOT NULL,
  name          TEXT NOT NULL,              -- the visitor's file name (display only)
  type          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  submission_id TEXT,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL
);
CREATE INDEX form_uploads_site ON form_uploads(site_id, status);
CREATE INDEX form_uploads_submission ON form_uploads(submission_id);
