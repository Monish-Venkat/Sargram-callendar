# SARGAM Daily Task Log — Setup

This app uses Supabase for both authentication and the database. Clerk is no
longer required.

## Configure Supabase

1. In Supabase SQL Editor, run [`supabase-schema.sql`](supabase-schema.sql)
   once for a new project. If the schema already exists, run only
   [`supabase-native-auth-fix.sql`](supabase-native-auth-fix.sql) instead.
2. In **Authentication → Providers → Email**, enable Email login.
3. In **Authentication → URL Configuration**, add your local URL (for example
   `http://localhost:5173`) and production URL as redirect URLs.

## Configure the frontend

Copy `.env.local.example` to `.env.local` and set:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Run `npm install` and `npm run dev`.

## Initial Core Team account

The initial invite is already registered for `monishvenkat2005@gmail.com` as
`core`. On the app sign-in page, select **Create your account** and register
with that exact email. Confirm the email if Supabase requests it, then sign in.
The app redeems the invite automatically and gives the account Core Team access.

## Adding other people

Core Team members can use **Manage Team** to invite event heads, other core
members, and teachers. Invitees create an account with the same email address
that was invited.
