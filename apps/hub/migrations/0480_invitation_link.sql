-- The invitation's accept token, sealed with TOKEN_ENC_KEY, so Studio can show the link on the
-- pending invitation row (copy / resend) for as long as the invitation waits. Lookups still go
-- through token_hash; NULL for invitations made before this column (Resend makes a new link).
ALTER TABLE invitations ADD COLUMN token_sealed TEXT;
