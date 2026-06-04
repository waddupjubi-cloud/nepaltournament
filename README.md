# Tournament Players

Tournament Players is a static HTML, CSS, and vanilla JavaScript esports platform backed by Supabase Auth, PostgreSQL, Realtime, and Storage.

## What Is Included

- User login, registration, email OTP verification, and session handling.
- Separate staff login for Superadmin, Admin, and Moderator roles.
- User feed, profile editing, player appeals, teams, team chat, tournaments, live brackets, and staff dashboard.
- Supabase schema with RLS policies for profiles, teams, tournaments, matches, notifications, messages, support tickets, and audit logs.
- Light theme and dark theme with `localStorage` persistence.

## 1. Create Supabase Project

1. Go to Supabase and create a free project.
2. Open SQL Editor.
3. Run [supabase/schema.sql](supabase/schema.sql).
4. In Authentication settings, enable email confirmations.
5. In Storage, create a public bucket named `team-logos`.
6. Create the first Auth user manually:
   - Email: `bzumarhajn2@gmail.com`
   - Password: `#Batman007`
   - Mark email as confirmed.
7. Run [supabase/seed.sql](supabase/seed.sql).

If you already created the old `super@tournament.com` account, run this instead:

[supabase/change-superadmin-credentials.sql](supabase/change-superadmin-credentials.sql)

## 2. Configure Frontend

Edit [js/config.js](js/config.js):

```js
window.TP_CONFIG = {
  SUPABASE_URL: "https://your-project.supabase.co",
  SUPABASE_ANON_KEY: "your-anon-key",
  SITE_URL: window.location.origin
};
```

You can find both values in Supabase Project Settings > API.

## 3. Run Locally

Because this is a static site, you can open [index.html](index.html) directly. For smoother auth redirects, run a tiny local static server:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

## 4. Login Flow

- Normal users use [index.html](index.html).
- Staff users use [staff.html](staff.html).
- The same account can have a user role and a staff role.
- Staff can open the dashboard from [dashboard.html](dashboard.html), then switch to user view.

## 5. Important Limitations

This project intentionally has no custom backend. That keeps hosting simple, but it means password resets, changing Auth email, and setting Auth custom claims must be done through Supabase’s dashboard or Edge Functions if you add them later. The app uses `profiles.staff_role` and RLS helper functions for authorization.

## 6. Import Demo Teams And Staff

Demo data lives in:

- [data/demo-users.json](data/demo-users.json)
- [data/demo-teams.json](data/demo-teams.json)
- [data/demo-feed-posts.json](data/demo-feed-posts.json)

This creates:

- 3 admins: UserAdmin, PlayerAdmin, TournamentAdmin
- 3 moderators: UserMod, PlayerMod, TournamentMod
- 8 approved teams
- 64 player accounts, with each team having EXP, JG, GD, MD, RM, Coach, SB1, and SB2 roles

To import it locally, you need a Supabase backend key. Do not put this key in `js/config.js`.

PowerShell:

```powershell
npm install
$env:SUPABASE_URL='https://your-project.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='your-secret-or-service-role-key'
npm run import:demo
```

For automatic import after pushing to GitHub, add these repository secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Then the workflow in [.github/workflows/import-demo-data.yml](.github/workflows/import-demo-data.yml) can import demo data when files in `data/` change.

## 7. Enable Full Dashboard CRUD

If you already ran the original schema, run this one-time SQL patch in Supabase SQL Editor:

[supabase/dashboard-crud-policies.sql](supabase/dashboard-crud-policies.sql)

Also run the realtime patch:

[supabase/enable-realtime.sql](supabase/enable-realtime.sql)

If team deletion fails in Player Management, run:

[supabase/fix-team-delete.sql](supabase/fix-team-delete.sql)

For the separate Broadcasts dashboard module, run:

[supabase/broadcast-management.sql](supabase/broadcast-management.sql)

Broadcast permissions:

- Superadmin can create, edit, pin, unpin, order, and delete broadcasts.
- Superadmin broadcasts can only be deleted by Superadmin.
- Admin broadcasts can be deleted by Admins or Superadmin.
- Moderator broadcasts can be deleted by their author, Superadmin, or any department Admin.
- Only five broadcasts can be pinned at once, using pin order 1 to 5.

This unlocks the upgraded dashboard permissions:

- Superadmin can manage all departments and delete non-superadmin profiles.
- UserAdmin can approve player appeals and assign UserMod.
- PlayerAdmin can manage teams and assign PlayerMod.
- TournamentAdmin can manage tournaments and assign TournamentMod.
- Moderators get department-specific update tools without admin promotion powers.

## 8. Deploy Superadmin Auth Tools

Creating or deleting real Supabase Auth users with passwords cannot be done safely from browser JavaScript. The dashboard calls this Edge Function instead:

[supabase/functions/admin-users/index.ts](supabase/functions/admin-users/index.ts)

Deploy it with the Supabase CLI:

```powershell
npx supabase login
npx supabase functions deploy admin-users --project-ref zxrqfnrfshnvrnvuujmz --use-api
```

If the dashboard says `Failed to send a request to the Edge Function`, the function is not deployed yet. In the current project, the endpoint should be:

```text
https://zxrqfnrfshnvrnvuujmz.supabase.co/functions/v1/admin-users
```

On this Windows project, use `npx supabase` instead of plain `supabase` unless you installed the CLI globally.

For GitHub auto-deploy, add this repository secret:

- `SUPABASE_ACCESS_TOKEN`

Then [.github/workflows/deploy-supabase-functions.yml](.github/workflows/deploy-supabase-functions.yml) can deploy the function when `supabase/functions/**` changes.

## File Map

- `index.html`, `staff.html`: auth interfaces.
- `feed.html`, `profile.html`: user experience.
- `teams.html`, `create-team.html`, `team.html`: team workflows.
- `tournaments.html`, `tournament.html`: tournament browsing and brackets.
- `dashboard.html`: role-based staff dashboard.
- `css/styles.css`, `css/bracket.css`: themes, responsive layout, bracket UI.
- `js/*.js`: Supabase client, auth, pages, notifications, messages, bracket generation.
- `data/*.json`: demo users, teams, and feed posts.
- `scripts/import-demo-data.mjs`: imports demo JSON into Supabase.
- `supabase/functions/admin-users`: Superadmin-only Auth user creation/deletion/password reset.
- `supabase/schema.sql`, `supabase/seed.sql`: database setup.
