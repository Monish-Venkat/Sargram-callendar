-- Run this in Supabase SQL Editor to create or restore the initial Core Team invite.
-- Safe to run again: it updates the existing invite if one is already present.

INSERT INTO public.invites (email, name, role, event_name)
VALUES ('monishvenkat2005@gmail.com', 'Monish', 'core', NULL)
ON CONFLICT (email) DO UPDATE
SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  event_name = EXCLUDED.event_name;

-- Verify the invite:
SELECT email, name, role, event_name
FROM public.invites
WHERE email = 'monishvenkat2005@gmail.com';
