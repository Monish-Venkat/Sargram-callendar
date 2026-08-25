# SARGAM Daily Task Log — Setup Guide

A calendar app where each of the 21 event heads logs their daily work, the
4 core team members can see and log their own work AND view every event
head's log, and the teacher in-charge can view everything (read-only).

Stack: React + Vite, Convex (database + backend functions), Clerk (auth/login).

---

## 0. Prerequisites
- Node.js 18+
- A free Clerk account: https://clerk.com
- A free Convex account: https://convex.dev

---

## 1. Install dependencies
```bash
cd sargam-task-tracker
npm install
```

## 2. Create the Clerk application
1. Go to the Clerk dashboard → **Create application**.
2. Under **Email, Phone, Username**, keep Email + Password (or add Google
   sign-in if you'd rather each event head log in with their own Gmail).
3. Copy the **Publishable key** — you'll need it in step 5.
4. Go to **JWT Templates** → **New template** → choose the **Convex**
   preset (Clerk ships this preset by name). Save it. Note the **Issuer /
   Frontend API URL** shown there (looks like
   `https://your-app-name.clerk.accounts.dev`).

## 3. Create the Convex project
```bash
npx convex dev
```
- Log in / create a Convex account when prompted.
- It will create a new Convex project and print a deployment URL like
  `https://happy-badger-123.convex.cloud` — copy it.
- **Leave this command running** in its own terminal — it deploys your
  `convex/` functions live as you edit them.

## 4. Connect Convex to Clerk
In a second terminal:
```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://your-app-name.clerk.accounts.dev"
```
(Use the Issuer URL from step 2.4.)

## 5. Set frontend environment variables
```bash
cp .env.local.example .env.local
```
Edit `.env.local`:
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...      # from step 2.3
VITE_CONVEX_URL=https://happy-badger-123.convex.cloud   # from step 3
```

## 6. Run the app locally
```bash
npm run dev
```
Open the printed localhost URL. You'll see the Clerk sign-in screen.

---

## 7. Bootstrap the very first core member (one-time, via Convex dashboard)

Nobody can use the app until their email is pre-registered with a role —
and since nobody exists yet, there's no one logged in to grant that access
from inside the app. So the *first* person has to be added manually, once:

**Convex Dashboard → your project → Functions → `members:addInvite` → Run function**, with:
```json
{ "email": "monishvenkat2005@gmail.com", "name": "Monish Venkat", "role": "core" }
```

That's the only entry you need to add from the dashboard. Everything else
happens in the app from here on.

## 8. Add everyone else from inside the app

1. Have `monishvenkat2005@gmail.com` sign in at the app URL with Clerk.
   They land on the dashboard with a **"Manage Team"** tab (visible only
   to core members).
2. Open **Manage Team** → **Events / Departments** → add each
   department/event (e.g. "Battle of Bands", "Robotics", "Dance").
3. In the same screen, use **Add a member** to add:
   - the other 3 core members (role: Core Team)
   - all 21 event heads (role: Event Head, pick their event/department
     from the dropdown you just populated)
   - the teacher in-charge (role: Teacher In-charge)
4. Each person just needs to sign in with Clerk using the exact email you
   entered — their role, permissions, and (for event heads) their event
   name are applied automatically the moment they log in.

Any of the 4 core members — not just the first one — can add or remove
people and events from **Manage Team** at any time during the fest, so
you're not stuck going through one person.

---

## 8. How access works (reference)
| Role | Can edit | Can view |
|---|---|---|
| Event Head | own calendar only | own calendar only |
| Core Team | own calendar | own + all 21 event heads' + other core |
| Teacher In-charge | nothing (read-only) | all core + all event heads |

This is enforced **on the server** in `convex/taskLogs.ts`, not just hidden
in the UI — so an event head can't view another event head's log even by
tampering with the frontend.

---

## 9. Deploy to production
1. `npx convex deploy` — deploys your Convex functions to production and
   gives you a production URL.
2. Push this repo to GitHub, then deploy the frontend on **Vercel** or
   **Netlify**: set the build command to `npm run build`, output dir
   `dist`, and add the production `VITE_CLERK_PUBLISHABLE_KEY` (use your
   Clerk **production** instance key) and `VITE_CONVEX_URL` (the prod
   Convex URL) as environment variables there.
3. In Clerk, switch to your **production** instance and re-do the JWT
   template + issuer domain steps (steps 2.4 and 4) for prod, since dev
   and prod Clerk instances have different URLs.

---

## Notes / easy extensions later
- Want an in-app admin screen instead of the Convex dashboard for adding
  people? `members.addInvite` and `members.listInvites` already exist —
  just build a small form for core members that calls them.
- Want event heads to also see a read-only feed of what other event heads
  are doing (not just core/teacher)? Change the filter in
  `members.listViewableMembers` from `role === "event_head" → [member]` to
  return everyone.
- Want to export all logs to Excel before submission to the teacher
  in-charge? That's a good follow-up ask — happy to add a CSV/Excel export
  button once the app is live and full of real data.
