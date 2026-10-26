-- Form upload reservations pass Turnstile (or carry proof from an earlier verified reservation of
-- the same form); a submission naming a verified upload counts as verified (its token was spent on
-- the reservation).
ALTER TABLE form_uploads ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
