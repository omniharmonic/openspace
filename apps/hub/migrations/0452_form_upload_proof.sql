-- Form upload reservations pass Turnstile (`verified = 1`, a "root"), or carry proof from a root
-- of the same submit (`proof_of` = the root's id; never a proof themselves, capped at the form's
-- other file fields, valid only within the root's 10 minutes). A submission naming an upload of a
-- root counts as verified once (the root is then `verified = 2`, consumed).
ALTER TABLE form_uploads ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE form_uploads ADD COLUMN proof_of TEXT;
