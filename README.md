# Tournament Players

Tournament Players is a static HTML, CSS, and vanilla JavaScript esports platform backed by Supabase Auth, PostgreSQL, Realtime, and Storage.

## What Is Included

- User login, registration, email OTP verification, and session handling.
- Separate staff login for Superadmin, Admin, and Moderator roles.
- User feed, profile editing, player appeals, teams, team chat, tournaments, live brackets, and staff dashboard.
- Tournament team leaders request tickets; tournament staff approve tickets, track pending/approved/rejected counts, and the MLBB tie sheet fills the first playable phase automatically.
- Supabase schema with RLS policies for profiles, teams, tournaments, matches, notifications, messages, support tickets, and audit logs.
- Light theme and dark theme with `localStorage` persistence.

## 1. Create Supabase Project

1. Go to Supabase and create a free project.
2. Open SQL Editor.
3. Run [supabase/schema.sql](supabase/schema.sql).
4. In Authentication settings, enable email confirmations.
5. In Storage, create a public bucket named `team-logos`.
6. Create the first Auth user manually:
   - Email: `bzumaharjan2@gmail.com`
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

Before deploying, run the project-wide validation:

```powershell
npm run check
```

This verifies every HTML page, local asset reference, metadata block, manifest, and JavaScript file.

## 4. Login Flow

- Normal users use [index.html](index.html).
- Staff users use [staff.html](staff.html).
- Login accepts either email or the generated lowercase username, such as `biju1`.
- The same account can have a user role, player roles, and multiple staff permissions.
- Staff can open the dashboard from [dashboard.html](dashboard.html), then switch to user view.

## 5. Important Limitations

This project is mostly static frontend code. Real Auth user creation and password updates go through the `admin-users` Supabase Edge Function. Authorization uses `profiles.staff_role` for backward compatibility plus `profiles.staff_roles` for multiple staff permissions.

## 6. Import Temporary Staff

Temporary seed JSON lives in:

- [data/temp-users.json](data/temp-users.json)
- [data/temp-teams.json](data/temp-teams.json)
- [data/temp-feed-posts.json](data/temp-feed-posts.json)

This creates:

- 3 admins: UserAdmin, PlayerAdmin, TournamentAdmin
- 3 moderators: UserMod, PlayerMod, TournamentMod
- No regular users, players, or teams. They were intentionally removed while the management workflow is being prepared.

To import the staff-only seed locally, you need a Supabase backend key. Do not put this key in `js/config.js`.

To remove nonstaff accounts from an existing Supabase project, carefully review and run [supabase/remove-nonstaff-users.sql](supabase/remove-nonstaff-users.sql) in the Supabase SQL Editor. It preserves accounts with a superadmin, admin, or moderator staff role and is intentionally destructive.

PowerShell:

```powershell
npm install
$env:SUPABASE_URL='https://your-project.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='your-secret-or-service-role-key'
npm run import:temp
```

For automatic import after pushing to GitHub, add these repository secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Then the workflow in [.github/workflows/import-temp-data.yml](.github/workflows/import-temp-data.yml) can import temporary JSON seed data when files in `data/` change.

## 7. Enable Full Dashboard CRUD

If you already ran the original schema, run this one-time SQL patch in Supabase SQL Editor:

[supabase/tournament-role-format.sql](supabase/tournament-role-format.sql)

For richer player flip-card fields like favorite hero, motto, tagline, likes, dislikes, and favorite quote, run:

[supabase/player-profile-details.sql](supabase/player-profile-details.sql)

Then run the upgraded dashboard CRUD policies:

[supabase/dashboard-crud-policies.sql](supabase/dashboard-crud-policies.sql)

Also run the realtime patch:

[supabase/enable-realtime.sql](supabase/enable-realtime.sql)

For username login on an existing database, run:

[supabase/username-login.sql](supabase/username-login.sql)

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
- PlayerAdmin can manage teams, delete teams, assign PlayerMod, and update player roles such as EXP, JG, GD, MD, RM, Coach, SB1, SB2, or Multirole.
- TournamentAdmin/TournamentMod can review tournament ticket requests and generate/update the MLBB tie sheet from approved tickets.
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

If user deletion still fails in Supabase because of stale foreign keys, run [supabase/fix-user-delete-cascades.sql](supabase/fix-user-delete-cascades.sql) and [supabase/fix-feed-broadcast-schema.sql](supabase/fix-feed-broadcast-schema.sql) in the SQL editor before retrying.

```text
https://zxrqfnrfshnvrnvuujmz.supabase.co/functions/v1/admin-users
```

On this Windows project, use `npx supabase` instead of plain `supabase` unless you installed the CLI globally.

If the deployed function says `permission denied for table profiles`, run [supabase/fix-service-role-grants.sql](supabase/fix-service-role-grants.sql) in the Supabase SQL editor.

For GitHub auto-deploy, add this repository secret:

- `SUPABASE_ACCESS_TOKEN`

Then [.github/workflows/deploy-supabase-functions.yml](.github/workflows/deploy-supabase-functions.yml) can deploy the function when `supabase/functions/**` changes.

## File Map

- `index.html`, `staff.html`: auth interfaces.
- `feed.html`, `profile.html`, `alerts.html`, `messages.html`: user experience.
- `teams.html`, `create-team.html`, `team.html`: team workflows.
- `tournaments.html`, `tournament.html`: tournament browsing and brackets.
- `dashboard.html`, `broadcasts.html`, `user-management.html`, `player-management.html`, `tournament-management.html`, `audit-logs.html`: role-based staff dashboard pages.
- `css/styles.css`, `css/bracket.css`: themes, responsive layout, bracket UI.
- `js/*.js`: Supabase client, auth, pages, notifications, messages, bracket generation.
- `assets/favicon.svg`, `site.webmanifest`, `robots.txt`: brand icon, install metadata, and crawler rules.
- `scripts/validate-project.mjs`: zero-dependency project validation used by `npm run check`.
- `data/*.json`: temporary seed users, teams, and feed posts.
- `scripts/import-temp-data.mjs`: imports temporary JSON into Supabase.
- `supabase/functions/admin-users`: Superadmin-only Auth user creation/deletion/password reset.
- `supabase/schema.sql`, `supabase/seed.sql`: database setup.
- `supabase/remove-nonstaff-users.sql`: destructive one-time cleanup that keeps staff accounts only.
- `UPDATES.md`: dated product and engineering update log.
