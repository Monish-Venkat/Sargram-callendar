-- Run only after creating the Supabase Auth account for this email.
-- Confirms the account when the verification email was not received.

UPDATE auth.users
SET
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE email = 'monishvenkat2005@gmail.com'
RETURNING email, email_confirmed_at;
