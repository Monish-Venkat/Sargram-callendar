-- Run this once in Supabase SQL Editor after the account is created and email-confirmed.
-- It directly activates the verified Supabase Auth user as the initial Core Team member.

INSERT INTO public.members (clerk_id, email, name, role, event_name)
SELECT id::TEXT, LOWER(email), 'Monish', 'core', NULL
FROM auth.users
WHERE LOWER(email) = 'monishvenkat2005@gmail.com'
ON CONFLICT (email) DO UPDATE
SET
  clerk_id = EXCLUDED.clerk_id,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  event_name = EXCLUDED.event_name,
  updated_at = NOW();

DELETE FROM public.invites
WHERE LOWER(email) = 'monishvenkat2005@gmail.com';

SELECT email, name, role
FROM public.members
WHERE LOWER(email) = 'monishvenkat2005@gmail.com';
